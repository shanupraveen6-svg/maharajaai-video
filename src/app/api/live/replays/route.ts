import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket, isRealFirebaseAvailable } from '@/lib/firebase/admin';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';
import {
  TAMIL_SHOWROOM_NAMES,
  TAMIL_GENTS_NAMES,
  TAMIL_LADIES_NAMES,
  getAssignedTvName,
  getTamilCustomerName,
} from '@/lib/maharaja/names';
import { getVideoFormat, getVideoPlaybackProfile, isSupportedVideoPath } from '@/lib/maharaja/video-playback';
import { verifyOperatorRequest } from '@/lib/auth/operator';

const FALLBACK_NAME = 'Maharaja Guest';
const MAX_PAGE_ITEMS = 200;
const REMOVED_TV_NAMES = new Set(['செந்தில்', 'senthil', 'கீர்த்தனா', 'keerthana']);
const TV_LOCALITY = 'தஞ்சாவூர்';

function getMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanLimit(value: string | null): number {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_PAGE_ITEMS);
}

function cleanOffset(value: string | null): number {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.floor(parsed), 0);
}

function cleanDisplayText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 48);
  return cleaned || fallback;
}

function cleanTvName(value: unknown, fallback: string): string {
  const cleaned = cleanDisplayText(value, fallback);
  return REMOVED_TV_NAMES.has(cleaned.toLocaleLowerCase()) ? fallback : cleaned;
}

function stableId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function buildReplayId(videoId: string, sessionId: string) {
  return `replay_${videoId || sessionId}`;
}

function selectedStoragePath(video: any): string {
  return String(video.liveStoragePath || video.storagePath || '');
}

function isPlayableVideo(video: any): boolean {
  const storagePath = selectedStoragePath(video);
  const contentType = String(video.contentType || '');
  return isSupportedVideoPath(storagePath) || contentType.startsWith('video/');
}

function stableSessionId(storagePath: string): string {
  const match = storagePath.match(/sessions\/([^/]+)\//);
  return match?.[1] || `stored_${stableId(storagePath).slice(0, 12)}`;
}

export async function GET(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized TV session.' }, { status: 401 });
    }

    const limit = cleanLimit(req.nextUrl.searchParams.get('limit'));
    const offset = cleanOffset(req.nextUrl.searchParams.get('offset'));
    const includeUnpublished = req.nextUrl.searchParams.get('includeUnpublished') === '1';
    const db = getDb();

    if (db) {
      const [videosSnapshot, queueSnapshot, catalogSnapshot] = await Promise.all([
        db.collection('videos').orderBy('createdAt', 'desc').get(),
        db.collection('liveQueue').where('screenId', '==', 'maharaja-main').limit(1000).get(),
        db.collection('videoCatalog').get(),
      ]);

      const completedQueueByVideoId = new Map<string, any>();
      queueSnapshot.docs
        .map((doc: any) => ({ id: doc.id, ...doc.data() }))
        .filter((item: any) => item.videoId && item.status === 'completed')
        .sort((a: any, b: any) => getMillis(b.completedAt || b.createdAt) - getMillis(a.completedAt || a.createdAt))
        .forEach((item: any) => {
          if (!completedQueueByVideoId.has(item.videoId)) completedQueueByVideoId.set(item.videoId, item);
        });

      const catalogByPath = new Map<string, any>();
      catalogSnapshot.docs.forEach((doc: any) => {
        const value = { id: doc.id, ...doc.data() };
        if (value.storagePath) catalogByPath.set(value.storagePath, value);
      });

      const videosByStoragePath = new Map<string, any>();
      const knownStoragePaths = new Set<string>();
      videosSnapshot.docs
        .map((doc: any) => ({ id: doc.id, ...doc.data() }))
        .filter((video: any) => video.storagePath && (!video.status || video.status === 'ready' || video.status === 'succeeded'))
        .forEach((video: any) => {
          videosByStoragePath.set(video.storagePath, video);
          knownStoragePaths.add(video.storagePath);
          if (video.liveStoragePath) knownStoragePaths.add(video.liveStoragePath);
        });

      const bucket = getStorageBucket();
      const storageDiagnostics = {
        bucket: bucket?.name || null,
        firestoreVideoRecords: videosSnapshot.size,
        totalObjects: 0,
        videoObjects: 0,
        imageObjects: 0,
        otherObjects: 0,
        scanError: null as string | null,
      };
      const existingStoragePaths = new Set<string>();
      let storageScanSucceeded = false;
      if (bucket && isRealFirebaseAvailable()) {
        try {
          const [files] = await bucket.getFiles({ prefix: '' });
          storageScanSucceeded = true;
          storageDiagnostics.totalObjects = files.length;
          for (const file of files) {
            const storagePath = String(file.name || '');
            existingStoragePaths.add(storagePath);
            const contentType = String(file.metadata?.contentType || '');
            const isVideo = isSupportedVideoPath(storagePath) || contentType.startsWith('video/');
            if (isVideo) storageDiagnostics.videoObjects += 1;
            else if (contentType.startsWith('image/')) storageDiagnostics.imageObjects += 1;
            else storageDiagnostics.otherObjects += 1;
            if (!isVideo || knownStoragePaths.has(storagePath)) continue;
            videosByStoragePath.set(storagePath, {
              id: `storage_${stableId(storagePath)}`,
              sessionId: stableSessionId(storagePath),
              storagePath,
              status: 'ready',
              createdAt: file.metadata?.timeCreated || file.metadata?.updated || new Date(0).toISOString(),
              contentType: file.metadata?.contentType || null,
            });
          }
        } catch (storageError) {
          console.warn('Storage video discovery warning:', storageError);
          storageDiagnostics.scanError = storageError instanceof Error ? storageError.message : 'Storage scan failed.';
        }
      }

      const now = Date.now();
      const readyVideos = Array.from(videosByStoragePath.values())
        .flatMap((video: any) => {
          if (!storageScanSucceeded) return [video];
          const existingPath = [video.liveStoragePath, video.storagePath]
            .map((value) => String(value || ''))
            .find((value) => existingStoragePaths.has(value));
          return existingPath ? [{ ...video, liveStoragePath: existingPath, storagePath: existingPath }] : [];
        })
        .filter(isPlayableVideo)
        .filter((video: any) => includeUnpublished || (
          video.showroomConsent === true
          && getMillis(video.expiresAt) > now
        ))
        .sort((a: any, b: any) => getMillis(b.createdAt) - getMillis(a.createdAt));

      const usedNames = new Set(
        Array.from(catalogByPath.values())
          .map((item) => item.displayName)
          .filter((name) => name && !REMOVED_TV_NAMES.has(String(name).toLocaleLowerCase()))
      );
      const pendingCatalogWrites: Array<{ id: string; data: Record<string, unknown> }> = [];

      const preparedVideos = readyVideos.map((video: any, index: number) => {
        const storagePath = selectedStoragePath(video);
        const catalog = catalogByPath.get(storagePath);
        const isMen = video.category === 'men' ||
          video.templateId === 'men' ||
          storagePath.toLowerCase().includes('men') ||
          storagePath.toLowerCase().includes('karthi') ||
          storagePath.toLowerCase().includes('kurta');
        const requiredGentsName = getAssignedTvName(video.sessionId || stableSessionId(storagePath));
        let displayName = requiredGentsName || (
          (catalog?.displayName && REMOVED_TV_NAMES.has(String(catalog.displayName).trim().toLowerCase()))
            ? undefined
            : catalog?.displayName
        );

        if (isMen && (!displayName || !TAMIL_GENTS_NAMES.includes(displayName as any))) {
          displayName = 'கார்த்திக்';
        }

        let resolvedCatalog = catalog;
        const catalogLocalityNeedsUpdate = catalog?.displayLocality !== TV_LOCALITY;
        const catalogNameNeedsUpdate = Boolean(displayName && catalog?.displayName !== displayName);
        if (!displayName || catalogLocalityNeedsUpdate || catalogNameNeedsUpdate) {
          if (!displayName) {
            displayName = isMen
              ? 'கார்த்திக்'
              : (TAMIL_LADIES_NAMES.find((name) => !usedNames.has(name)) || getTamilCustomerName(storagePath, index, 'women'));
            usedNames.add(displayName);
          }
          resolvedCatalog = {
            storagePath,
            displayName,
            displayLocality: TV_LOCALITY,
            createdAt: video.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          pendingCatalogWrites.push({
            id: stableId(storagePath),
            data: resolvedCatalog,
          });
        }
        return { ...video, catalog: resolvedCatalog, isMen };
      });

      if (pendingCatalogWrites.length) {
        try {
          for (let start = 0; start < pendingCatalogWrites.length; start += 400) {
            const batch = db.batch();
            pendingCatalogWrites.slice(start, start + 400).forEach((entry) => {
              batch.set(db.collection('videoCatalog').doc(entry.id), entry.data, { merge: true });
            });
            await batch.commit();
          }
        } catch (catalogError) {
          console.warn('Video catalogue alias persistence warning:', catalogError);
        }
      }

      const pageVideos = preparedVideos.slice(offset, offset + limit);
      const settledItems = await Promise.allSettled(
        pageVideos.map(async (video: any, pageIndex: number) => {
          const index = offset + pageIndex;
          const queueMeta = completedQueueByVideoId.get(video.id) || completedQueueByVideoId.get(`video_${video.sessionId}`);
          const storagePath = selectedStoragePath(video);
          const replayId = buildReplayId(video.id, video.sessionId);
          const profile = getVideoPlaybackProfile(video, storagePath);
          const rawName = queueMeta?.customerName || video.customerName || video.catalog?.displayName;
          const isMen = Boolean(video.isMen ||
            video.category === 'men' ||
            video.templateId === 'men' ||
            storagePath.toLowerCase().includes('men') ||
            storagePath.toLowerCase().includes('karthi') ||
            storagePath.toLowerCase().includes('kurta'));

          let customerName = isMen ? 'கார்த்திக்' : null;
          if (!customerName) {
            customerName = getAssignedTvName(video.sessionId || stableSessionId(storagePath)) || (rawName && rawName !== FALLBACK_NAME && !REMOVED_TV_NAMES.has(String(rawName).trim().toLowerCase())
              ? cleanTvName(rawName, getTamilCustomerName(storagePath, index, 'women'))
              : getTamilCustomerName(storagePath, index, 'women'));
          }

          return {
            queueId: replayId,
            reservationId: replayId,
            videoId: video.id,
            sessionId: video.sessionId || null,
            storagePath,
            videoUrl: await getSignedPlaybackUrl(storagePath),
            liveAudioUrl: profile.playbackMode === 'external'
              ? getLiveAudioTrack(replayId, queueMeta?.eventId || video.eventId)
              : null,
            customerName,
            customerLocality: TV_LOCALITY,
            createdAt: video.createdAt || null,
            format: getVideoFormat(storagePath),
            ...profile,
            source: 'replay' as const,
          };
        })
      );

      const items = settledItems.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      const failed = settledItems.length - items.length;
      if (failed) console.warn(`Replay library skipped ${failed} video(s) that could not be signed.`);

      const nextOffset = offset + pageVideos.length < readyVideos.length ? offset + pageVideos.length : null;
      return NextResponse.json({
        success: true,
        count: readyVideos.length,
        returned: items.length,
        failed,
        nextOffset,
        diagnostics: storageDiagnostics,
        items,
      });
    }

    const mockStore = getMockStore();
    const readyVideos = Array.from(mockStore.videos.values())
      .filter((video: any) => video.storagePath && isSupportedVideoPath(selectedStoragePath(video)))
      .sort((a: any, b: any) => getMillis(b.createdAt) - getMillis(a.createdAt));
    const pageVideos = readyVideos.slice(offset, offset + limit);
    const items = await Promise.all(pageVideos.map(async (video: any, pageIndex: number) => {
      const index = offset + pageIndex;
      const storagePath = selectedStoragePath(video);
      const replayId = buildReplayId(video.id, video.sessionId);
      const profile = getVideoPlaybackProfile(video, storagePath);
      return {
        queueId: replayId,
        reservationId: replayId,
        videoId: video.id,
        sessionId: video.sessionId || null,
        storagePath,
        videoUrl: await getSignedPlaybackUrl(storagePath),
        liveAudioUrl: profile.playbackMode === 'external' ? getLiveAudioTrack(replayId, video.eventId) : null,
        customerName: getAssignedTvName(video.sessionId || stableSessionId(storagePath))
          || cleanTvName(video.customerName, getTamilCustomerName(storagePath, index)),
        customerLocality: TV_LOCALITY,
        createdAt: video.createdAt || null,
        format: getVideoFormat(storagePath),
        ...profile,
        source: 'replay' as const,
      };
    }));
    const nextOffset = offset + pageVideos.length < readyVideos.length ? offset + pageVideos.length : null;
    return NextResponse.json({ success: true, count: readyVideos.length, returned: items.length, failed: 0, nextOffset, items });
  } catch (error: any) {
    console.error('Replay Library Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to load replay videos.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized operator session.' }, { status: 401 });
    }
    const body = await req.json();
    const storagePath = typeof body.storagePath === 'string' ? body.storagePath.trim() : '';
    if (!storagePath) return NextResponse.json({ success: false, error: 'A stored video path is required.' }, { status: 400 });
    const bucket = getStorageBucket();
    if (!bucket) return NextResponse.json({ success: false, error: 'Firebase Storage is unavailable.' }, { status: 503 });
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) return NextResponse.json({ success: false, error: 'Stored video was not found.' }, { status: 404 });
    if (!isSupportedVideoPath(storagePath)) {
      const [metadata] = await file.getMetadata();
      if (!String(metadata?.contentType || '').startsWith('video/')) {
        return NextResponse.json({ success: false, error: 'Stored object is not a playable video.' }, { status: 400 });
      }
    }
    return NextResponse.json({ success: true, videoUrl: await getSignedPlaybackUrl(storagePath) });
  } catch (error: any) {
    console.error('Stored Video Playback URL Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unable to open stored video.' }, { status: 500 });
  }
}

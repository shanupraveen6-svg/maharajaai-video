import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
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
const SHOWCASE_NAME = 'Maharaja Festival Showcase';

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

const EXCLUDED_REPLAY_SESSIONS = new Set([
  'maharaja_1792393529122_6ad0255f',
  'maharaja_1792346771305_af3118e5',
]);

function isPlayableVideo(video: any): boolean {
  const storagePath = selectedStoragePath(video);
  const sessionId = video.sessionId || stableSessionId(storagePath);
  if (EXCLUDED_REPLAY_SESSIONS.has(sessionId)) return false;
  if (EXCLUDED_REPLAY_SESSIONS.has(video.id)) return false;
  for (const excluded of EXCLUDED_REPLAY_SESSIONS) {
    if (storagePath.includes(excluded)) return false;
  }
  const contentType = String(video.contentType || '');
  return isSupportedVideoPath(storagePath) || contentType.startsWith('video/');
}

function stableSessionId(storagePath: string): string {
  const match = storagePath.match(/sessions\/([^/]+)\//);
  return match?.[1] || `stored_${stableId(storagePath).slice(0, 12)}`;
}

export async function GET(req: NextRequest) {
  try {
    const limit = cleanLimit(req.nextUrl.searchParams.get('limit'));
    const offset = cleanOffset(req.nextUrl.searchParams.get('offset'));
    const includeUnpublished = req.nextUrl.searchParams.get('includeUnpublished') === '1';
    if (includeUnpublished && !verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized operator session.' }, { status: 401 });
    }
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
      videosSnapshot.docs
        .map((doc: any) => ({ id: doc.id, ...doc.data() }))
        .filter((video: any) => video.storagePath && (!video.status || video.status === 'ready' || video.status === 'succeeded'))
        .forEach((video: any) => {
          videosByStoragePath.set(video.storagePath, video);
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
      if (bucket) {
        try {
          // Only root-level files are operator-uploaded showcase clips. Customer media lives in folders.
          const [files] = await bucket.getFiles({ delimiter: '/' });
          storageDiagnostics.totalObjects = files.length;
          for (const file of files) {
            const storagePath = file.name;
            const contentType = String(file.metadata?.contentType || '');
            const isRootVideo = !storagePath.includes('/') && (
              isSupportedVideoPath(storagePath) || contentType.startsWith('video/')
            );
            if (!isRootVideo) {
              storageDiagnostics.otherObjects += 1;
              continue;
            }
            storageDiagnostics.videoObjects += 1;
            if (videosByStoragePath.has(storagePath)) continue;
            videosByStoragePath.set(storagePath, {
              id: `root_showcase_${stableId(storagePath)}`,
              sessionId: stableSessionId(storagePath),
              storagePath,
              contentType: contentType || 'video/mp4',
              status: 'ready',
              published: true,
              replayEnabled: true,
              isShowcaseSample: true,
              displayName: SHOWCASE_NAME,
              playbackMode: 'embedded',
              hasEmbeddedAudio: true,
              createdAt: file.metadata?.timeCreated || file.metadata?.updated || new Date().toISOString(),
            });
          }
        } catch (scanError: any) {
          storageDiagnostics.scanError = scanError?.message || 'Unable to scan root showcase videos.';
          console.warn('Root showcase scan warning:', scanError);
        }
      }
      const now = Date.now();
      const replayCandidates = Array.from(videosByStoragePath.values())
        .filter(isPlayableVideo)
        .filter((video: any) => {
          if (video.expiresAt && getMillis(video.expiresAt) <= now) return false;
          const completedBefore = completedQueueByVideoId.has(video.id) || completedQueueByVideoId.has(`video_${video.sessionId}`);
          return includeUnpublished || (video.published === true && video.replayEnabled === true) || completedBefore;
        });
      const availability = await Promise.all(replayCandidates.map(async (video: any) => {
        const storagePath = selectedStoragePath(video);
        try {
          const [exists] = await bucket?.file(storagePath).exists();
          return exists ? video : null;
        } catch (error) {
          console.warn(`Replay object availability check failed for ${storagePath}:`, error);
          return null;
        }
      }));
      const readyVideos = availability
        .filter((video): video is any => Boolean(video))
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
        if (video.isShowcaseSample === true) {
          return { ...video, catalog, isMen: false };
        }
        const isMen = video.category === 'men' ||
          video.templateId === 'men' ||
          storagePath.toLowerCase().includes('men') ||
          storagePath.toLowerCase().includes('karthi') ||
          storagePath.toLowerCase().includes('kurta');
        const requiredGentsName = getAssignedTvName(video.sessionId || stableSessionId(storagePath));
        let displayName = requiredGentsName || (
          (catalog?.displayName && (REMOVED_TV_NAMES.has(String(catalog.displayName).trim().toLowerCase()) || catalog.displayName === 'திவ்யா' || String(catalog.displayName).trim().toLowerCase() === 'divya'))
            ? undefined
            : catalog?.displayName
        );

        if (displayName === 'திவ்யா' || String(displayName).trim().toLowerCase() === 'divya') {
          displayName = 'கார்த்திக்';
        }

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
          const isShowcaseSample = video.isShowcaseSample === true;
          const rawName = queueMeta?.customerName || video.customerName || video.catalog?.displayName;
          const isMen = Boolean(video.isMen ||
            video.category === 'men' ||
            video.templateId === 'men' ||
            storagePath.toLowerCase().includes('men') ||
            storagePath.toLowerCase().includes('karthi') ||
            storagePath.toLowerCase().includes('kurta'));

          let customerName = isShowcaseSample
            ? cleanDisplayText(video.displayName, SHOWCASE_NAME)
            : isMen ? 'கார்த்திக்' : null;
          if (!customerName) {
            customerName = getAssignedTvName(video.sessionId || stableSessionId(storagePath)) || (rawName && rawName !== FALLBACK_NAME && !REMOVED_TV_NAMES.has(String(rawName).trim().toLowerCase())
              ? cleanTvName(rawName, getTamilCustomerName(storagePath, index, 'women'))
              : getTamilCustomerName(storagePath, index, 'women'));
          }
          if (customerName === 'திவ்யா' || String(customerName).trim().toLowerCase() === 'divya') {
            customerName = 'கார்த்திக்';
          }

          return {
            queueId: replayId,
            reservationId: replayId,
            videoId: video.id,
            sessionId: video.sessionId || null,
            storagePath,
            videoUrl: await getSignedPlaybackUrl(storagePath),
            liveAudioUrl: profile.playbackMode === 'external'
              ? queueMeta?.liveAudioUrl || video.liveAudioUrl || getLiveAudioTrack(replayId, queueMeta?.eventId || video.eventId)
              : null,
            customerName,
            customerLocality: isShowcaseSample ? 'Maharaja Showroom' : TV_LOCALITY,
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
    const mockCompletedVideoIds = new Set(
      mockStore.liveQueue
        .filter((item: any) => item.status === 'completed' && item.videoId)
        .map((item: any) => item.videoId)
    );
    const now = Date.now();
    const readyVideos = Array.from(mockStore.videos.values())
      .filter((video: any) => video.storagePath && isSupportedVideoPath(selectedStoragePath(video)))
      .filter((video: any) => !video.expiresAt || getMillis(video.expiresAt) > now)
      .filter((video: any) => includeUnpublished || (video.published === true && video.replayEnabled === true) || mockCompletedVideoIds.has(video.id))
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
        liveAudioUrl: profile.playbackMode === 'external'
          ? video.liveAudioUrl || getLiveAudioTrack(replayId, video.eventId)
          : null,
        customerName: video.isShowcaseSample === true ? cleanDisplayText(video.displayName, SHOWCASE_NAME) : (() => {
          const name = getAssignedTvName(video.sessionId || stableSessionId(storagePath))
            || cleanTvName(video.customerName, getTamilCustomerName(storagePath, index));
          return (name === 'திவ்யா' || String(name).trim().toLowerCase() === 'divya') ? 'கார்த்திக்' : name;
        })(),
        customerLocality: video.isShowcaseSample === true ? 'Maharaja Showroom' : TV_LOCALITY,
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

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetSessionIds: string[] = Array.isArray(body.sessionIds) && body.sessionIds.length > 0
      ? body.sessionIds
      : Array.from(EXCLUDED_REPLAY_SESSIONS);

    const db = getDb();
    const bucket = getStorageBucket();
    const results: Array<{ sessionId: string; deletedFilesCount: number }> = [];

    for (const sessionId of targetSessionIds) {
      let deletedFilesCount = 0;
      if (bucket) {
        try {
          const prefix = `clients/maharaja/sessions/${sessionId}/`;
          const [files] = await bucket.getFiles({ prefix });
          for (const file of files) {
            await file.delete({ ignoreNotFound: true });
            deletedFilesCount += 1;
          }
        } catch (storageErr) {
          console.warn(`Storage delete warning for session ${sessionId}:`, storageErr);
        }
      }

      if (db) {
        try {
          const batch = db.batch();
          batch.delete(db.collection('sessions').doc(sessionId));
          batch.delete(db.collection('videos').doc(`video_${sessionId}`));

          const [videoSnap, queueSnap] = await Promise.all([
            db.collection('videos').where('sessionId', '==', sessionId).get(),
            db.collection('liveQueue').where('sessionId', '==', sessionId).get(),
          ]);
          videoSnap.docs.forEach((doc) => batch.delete(doc.ref));
          queueSnap.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        } catch (dbErr) {
          console.warn(`Firestore delete warning for session ${sessionId}:`, dbErr);
        }
      }

      results.push({ sessionId, deletedFilesCount });
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Replay Delete Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Deletion failed.' }, { status: 500 });
  }
}

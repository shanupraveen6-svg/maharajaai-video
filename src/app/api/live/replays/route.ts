import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';
import {
  TAMIL_GENTS_NAMES,
  TAMIL_LADIES_NAMES,
  getAssignedTvName,
  getTamilCustomerName,
} from '@/lib/maharaja/names';
import { getVideoFormat, getVideoPlaybackProfile, isSupportedVideoPath } from '@/lib/maharaja/video-playback';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { verifyTvRequest } from '@/lib/auth/display';
import { resolveStoredVideoPaths } from '@/lib/maharaja/storage-video';
import { isApprovedDemoVideoPath } from '@/lib/maharaja/tv-pool';
import { activeClientId, bindClient, liveScreenId, storagePathBelongsToActiveClient } from '@/lib/maharaja/client-context';
import { getMaharajaWorkspace, goLiveClientId, resolveRequestClientId } from '@/lib/maharaja/server';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import {
  type GoLiveEntry,
  deleteGoLiveEntriesForSessions,
  goLiveEntryFromVideo,
  goLiveLibraryImported,
  listGoLiveEntries,
  markGoLiveLibraryImported,
  saveGoLiveEntries,
  showcasePrefixesFor,
} from '@/lib/maharaja/go-live-library';

const FALLBACK_NAME = 'Guest';
const MAX_PAGE_ITEMS = 200;
const REMOVED_TV_NAMES = new Set(['செந்தில்', 'senthil', 'கீர்த்தனா', 'keerthana']);
const TV_LOCALITY = 'தஞ்சாவூர்';
const SHOWCASE_NAME = 'Festival Showcase';

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
  return String(video.resolvedStoragePath || video.liveStoragePath || video.storagePath || '');
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

/** How a store's Go Live screen names its showcase clips and where its customers are from. */
type StoreLabels = { showcaseName: string; showroomName: string; locality: string };

function storeLabels(workspace: { clientId: string; clientName: string; branch?: string }): StoreLabels {
  if (workspace.clientId === MAHARAJA_CLIENT_ID) {
    return { showcaseName: SHOWCASE_NAME, showroomName: 'Showroom', locality: TV_LOCALITY };
  }
  const name = workspace.clientName.replace(/^The\s+/i, '').trim() || 'Our store';
  const city = String(workspace.branch || '').split('·')[0].trim();
  return { showcaseName: `${name} Showcase`, showroomName: name, locality: city };
}

function showcaseEntry(storagePath: string, file: any, existing?: GoLiveEntry): GoLiveEntry {
  const nowIso = new Date().toISOString();
  return {
    ...(existing || {}),
    id: existing?.id || `showcase_${stableId(storagePath)}`,
    sessionId: existing?.sessionId || stableSessionId(storagePath),
    storagePath,
    contentType: String(file?.metadata?.contentType || '') || 'video/mp4',
    status: 'ready',
    published: true,
    replayEnabled: true,
    universalPool: true,
    isShowcaseSample: true,
    playbackMode: 'embedded',
    hasEmbeddedAudio: true,
    createdAt: existing?.createdAt || file?.metadata?.timeCreated || file?.metadata?.updated || nowIso,
    updatedAt: nowIso,
  };
}

function isShowcaseFile(file: any) {
  const storagePath = String(file?.name || '');
  const contentType = String(file?.metadata?.contentType || '');
  return isApprovedDemoVideoPath(storagePath) && storagePathBelongsToActiveClient(storagePath) &&
    (isSupportedVideoPath(storagePath) || contentType.startsWith('video/'));
}

/**
 * One-time import of a workspace's older Go Live records (kept in shared collections before each store
 * had its own library): its customer videos, its showcase clips anywhere in Storage, and the TV names
 * already given to them. After this the library alone is read.
 */
async function importOlderGoLiveRecords(db: NonNullable<ReturnType<typeof getDb>>) {
  const [videosSnapshot, catalogSnapshot] = await Promise.all([
    db.collection('videos').get(),
    db.collection('videoCatalog').get(),
  ]);
  const namesByPath = new Map<string, string>();
  catalogSnapshot.docs.forEach((doc: any) => {
    const value = doc.data();
    if (value?.storagePath && value?.displayName && storagePathBelongsToActiveClient(value.storagePath)) namesByPath.set(value.storagePath, value.displayName);
  });
  const entries = new Map<string, GoLiveEntry>();
  videosSnapshot.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((video: any) => selectedStoragePath(video) && storagePathBelongsToActiveClient(selectedStoragePath(video)) && (!video.status || ['ready', 'succeeded', 'completed'].includes(video.status)))
    .forEach((video: any) => {
      const entry = goLiveEntryFromVideo(video);
      entry.displayName = entry.displayName || namesByPath.get(selectedStoragePath(video)) || null;
      entries.set(entry.id, entry);
    });
  const bucket = getStorageBucket();
  if (bucket) {
    const [files] = activeClientId() === MAHARAJA_CLIENT_ID
      ? await bucket.getFiles()
      : await bucket.getFiles({ prefix: `clients/${activeClientId()}/` });
    const byPath = new Map(Array.from(entries.values()).map((entry) => [entry.storagePath, entry]));
    files.filter(isShowcaseFile).forEach((file: any) => {
      const entry = showcaseEntry(file.name, file, byPath.get(file.name));
      entry.displayName = entry.displayName || namesByPath.get(file.name) || null;
      entries.set(entry.id, entry);
    });
  }
  await saveGoLiveEntries(Array.from(entries.values()));
  await markGoLiveLibraryImported(db);
  return entries.size;
}

/** Showcase clips uploaded since the last refresh, from the store's showcase folders only. */
async function newShowcaseEntries(known: Map<string, GoLiveEntry>) {
  const bucket = getStorageBucket();
  if (!bucket) return [];
  const listings = await Promise.allSettled([
    ...showcasePrefixesFor().map((prefix) => bucket.getFiles({ prefix })),
    // Maharaja's original demo clips sit at the bucket root.
    ...(activeClientId() === MAHARAJA_CLIENT_ID ? [bucket.getFiles({ delimiter: '/' })] : []),
  ]);
  const fresh: GoLiveEntry[] = [];
  for (const listing of listings) {
    if (listing.status !== 'fulfilled') continue;
    for (const file of listing.value[0] as any[]) {
      if (!isShowcaseFile(file)) continue;
      const existing = known.get(file.name);
      if (existing?.isShowcaseSample === true && existing.published === true && existing.replayEnabled === true) continue;
      fresh.push(showcaseEntry(file.name, file, existing));
    }
  }
  return fresh;
}

/** The TV name of each library video: customers get a Tamil first name, showcase clips the store's showcase name. */
function resolveDisplayNames(videos: GoLiveEntry[]) {
  const usedNames = new Set(videos.map((video) => video.displayName).filter((name) => name && !REMOVED_TV_NAMES.has(String(name).toLocaleLowerCase())));
  const changed: GoLiveEntry[] = [];
  const named = videos.map((video, index) => {
    const storagePath = selectedStoragePath(video);
    if (video.isShowcaseSample === true) return { ...video, isMen: false };
    const isMen = video.category === 'men' ||
      video.templateId === 'men' ||
      storagePath.toLowerCase().includes('men') ||
      storagePath.toLowerCase().includes('karthi') ||
      storagePath.toLowerCase().includes('kurta');
    const stored = video.displayName && !REMOVED_TV_NAMES.has(String(video.displayName).trim().toLowerCase()) ? video.displayName : undefined;
    let displayName = getAssignedTvName(video.sessionId || stableSessionId(storagePath)) || stored;
    if (displayName === 'திவ்யா' || String(displayName).trim().toLowerCase() === 'divya') displayName = 'கார்த்திக்';
    if (isMen && (!displayName || !TAMIL_GENTS_NAMES.includes(displayName as any))) displayName = 'கார்த்திக்';
    if (!displayName) {
      displayName = isMen
        ? 'கார்த்திக்'
        : (TAMIL_LADIES_NAMES.find((name) => !usedNames.has(name)) || getTamilCustomerName(storagePath, index, 'women'));
      usedNames.add(displayName);
    }
    if (displayName !== video.displayName) changed.push({ ...video, displayName });
    return { ...video, displayName, isMen };
  });
  return { named, changed };
}

/**
 * The Go Live replay library for one store, read from its own library. Building it is reused for
 * REPLAY_CACHE_MS; every Go Live screen and idle TV of that store then shares one build. New Go Live
 * videos still play at once through the live queue.
 */
const REPLAY_CACHE_MS = 3 * 60 * 1000;
type ReplayLibrary = { preparedVideos: any[]; readyCount: number; completedQueueByVideoId: Map<string, any>; storageDiagnostics: Record<string, unknown> };
const replayCache = new Map<string, { builtAt: number; library: Promise<ReplayLibrary> }>();

function cachedReplayLibrary(db: NonNullable<ReturnType<typeof getDb>>, includeUnpublished: boolean) {
  const key = `${activeClientId()}:${includeUnpublished ? 'all' : 'published'}`;
  const cached = replayCache.get(key);
  if (cached && Date.now() - cached.builtAt < REPLAY_CACHE_MS) return cached.library;
  const library = buildReplayLibrary(db, includeUnpublished);
  replayCache.set(key, { builtAt: Date.now(), library });
  // A failed build is not kept, so the next request tries again.
  library.catch(() => replayCache.delete(key));
  return library;
}

/** A store's library changed (a video was removed): its screens rebuild on their next request. */
function forgetReplayLibrary() {
  for (const key of [...replayCache.keys()]) if (key.startsWith(`${activeClientId()}:`)) replayCache.delete(key);
}

function isReplayable(video: any, completedQueueByVideoId: Map<string, any>, includeUnpublished: boolean, now: number) {
  if (video.isShowcaseSample !== true && video.expiresAt && getMillis(video.expiresAt) <= now) return false;
  const completedBefore = completedQueueByVideoId.has(video.id) || completedQueueByVideoId.has(`video_${video.sessionId}`);
  return includeUnpublished || video.universalPool === true || (video.published === true && video.replayEnabled === true) || completedBefore;
}

async function buildReplayLibrary(db: NonNullable<ReturnType<typeof getDb>>, includeUnpublished: boolean): Promise<ReplayLibrary> {
  let imported = 0;
  if (!(await goLiveLibraryImported(db))) imported = await importOlderGoLiveRecords(db);
  const [entries, queueSnapshot] = await Promise.all([
    listGoLiveEntries(),
    db.collection('liveQueue').where('screenId', '==', liveScreenId()).limit(1000).get(),
  ]);

  const completedQueueByVideoId = new Map<string, any>();
  queueSnapshot.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((item: any) => item.videoId && item.status === 'completed')
    .sort((a: any, b: any) => getMillis(b.completedAt || b.createdAt) - getMillis(a.completedAt || a.createdAt))
    .forEach((item: any) => {
      if (!completedQueueByVideoId.has(item.videoId)) completedQueueByVideoId.set(item.videoId, item);
    });

  const byPath = new Map<string, GoLiveEntry>();
  entries
    .filter((entry) => selectedStoragePath(entry) && storagePathBelongsToActiveClient(selectedStoragePath(entry)))
    .forEach((entry) => { if (!byPath.has(selectedStoragePath(entry))) byPath.set(selectedStoragePath(entry), entry); });

  const storageDiagnostics = {
    bucket: getStorageBucket()?.name || null,
    libraryEntries: entries.length,
    importedOlderRecords: imported,
    newShowcaseClips: 0,
    scanError: null as string | null,
  };
  try {
    const fresh = await newShowcaseEntries(byPath);
    storageDiagnostics.newShowcaseClips = fresh.length;
    if (fresh.length) {
      await saveGoLiveEntries(fresh);
      fresh.forEach((entry) => byPath.set(entry.storagePath, entry));
    }
  } catch (scanError: any) {
    storageDiagnostics.scanError = scanError?.message || 'Unable to scan showcase videos.';
    console.warn('Showcase video scan warning:', scanError);
  }

  const now = Date.now();
  const readyVideos = Array.from(byPath.values())
    .filter(isPlayableVideo)
    .filter((video) => isReplayable(video, completedQueueByVideoId, includeUnpublished, now))
    .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
  const { named, changed } = resolveDisplayNames(readyVideos);
  if (changed.length) await saveGoLiveEntries(changed.map(({ id, displayName }) => ({ id, displayName }))).catch((error) => console.warn('Go Live name persistence warning:', error));
  return { preparedVideos: named, readyCount: readyVideos.length, completedQueueByVideoId, storageDiagnostics };
}

function replayItem(video: any, index: number, labels: StoreLabels, queueMeta: any, videoUrl: string) {
  const storagePath = selectedStoragePath(video);
  const replayId = buildReplayId(video.id, video.sessionId);
  const profile = getVideoPlaybackProfile(video, storagePath);
  const isShowcaseSample = video.isShowcaseSample === true;
  const rawName = queueMeta?.customerName || video.customerName || video.displayName;
  const isMen = Boolean(video.isMen ||
    video.category === 'men' ||
    video.templateId === 'men' ||
    storagePath.toLowerCase().includes('men') ||
    storagePath.toLowerCase().includes('karthi') ||
    storagePath.toLowerCase().includes('kurta'));

  let customerName = isShowcaseSample
    ? cleanDisplayText(video.displayName, labels.showcaseName)
    : isMen ? 'கார்த்திக்' : null;
  if (!customerName) {
    customerName = getAssignedTvName(video.sessionId || stableSessionId(storagePath)) || (rawName && rawName !== FALLBACK_NAME && !REMOVED_TV_NAMES.has(String(rawName).trim().toLowerCase())
      ? cleanTvName(rawName, getTamilCustomerName(storagePath, index, 'women'))
      : getTamilCustomerName(storagePath, index, 'women'));
  }
  if (customerName === 'திவ்யா' || String(customerName).trim().toLowerCase() === 'divya') customerName = 'கார்த்திக்';

  return {
    queueId: replayId,
    reservationId: replayId,
    videoId: video.id,
    sessionId: video.sessionId || null,
    storagePath,
    videoUrl,
    liveAudioUrl: profile.playbackMode === 'external'
      ? queueMeta?.liveAudioUrl || video.liveAudioUrl || getLiveAudioTrack(replayId, queueMeta?.eventId || video.eventId)
      : null,
    customerName,
    customerLocality: isShowcaseSample ? labels.showroomName : (video.customerLocality && activeClientId() !== MAHARAJA_CLIENT_ID ? video.customerLocality : labels.locality),
    createdAt: video.createdAt || null,
    format: getVideoFormat(storagePath),
    ...profile,
    source: 'replay' as const,
  };
}

export async function GET(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  if (!(await goLiveClientId(req)) && !await verifyTvRequest(req)) {
    return NextResponse.json({ success: false, error: 'Open this screen from the workspace Go Live link.' }, { status: 401 });
  }
  try {
    const limit = cleanLimit(req.nextUrl.searchParams.get('limit'));
    const offset = cleanOffset(req.nextUrl.searchParams.get('offset'));
    const includeUnpublished = req.nextUrl.searchParams.get('includeUnpublished') === '1';
    if (includeUnpublished && !verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
    }
    const labels = storeLabels(await getMaharajaWorkspace());
    const db = getDb();

    if (db) {
      const { preparedVideos, readyCount, completedQueueByVideoId, storageDiagnostics } = await cachedReplayLibrary(db, includeUnpublished);
      const bucket = getStorageBucket();
      const pageCandidates = preparedVideos.slice(offset, offset + limit);
      const pageVideos = await resolveStoredVideoPaths(bucket, pageCandidates);
      const settledItems = await Promise.allSettled(
        pageVideos.map(async (video: any, pageIndex: number) => {
          const queueMeta = completedQueueByVideoId.get(video.id) || completedQueueByVideoId.get(`video_${video.sessionId}`);
          return replayItem(video, offset + pageIndex, labels, queueMeta, await getSignedPlaybackUrl(selectedStoragePath(video)));
        })
      );

      const items = settledItems.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      const failed = pageCandidates.length - items.length;
      if (failed) console.warn(`Replay library skipped ${failed} unavailable or unplayable video(s).`);

      const nextOffset = offset + pageCandidates.length < readyCount ? offset + pageCandidates.length : null;
      return NextResponse.json({
        success: true,
        count: readyCount,
        returned: items.length,
        failed,
        nextOffset,
        diagnostics: storageDiagnostics,
        items,
      });
    }

    // Local mock backend: the workspace library plus this store's older mock records.
    const mockStore = getMockStore();
    const mockCompleted = new Map<string, any>();
    mockStore.liveQueue
      .filter((item: any) => item.status === 'completed' && item.videoId && item.screenId === liveScreenId())
      .forEach((item: any) => mockCompleted.set(item.videoId, item));
    const byId = new Map<string, any>();
    Array.from(mockStore.videos.values())
      .filter((video: any) => video.storagePath && storagePathBelongsToActiveClient(selectedStoragePath(video)))
      .forEach((video: any) => byId.set(video.id, video));
    (await listGoLiveEntries()).forEach((entry) => byId.set(entry.id, { ...(byId.get(entry.id) || {}), ...entry }));
    const now = Date.now();
    const readyVideos = Array.from(byId.values())
      .filter((video: any) => isSupportedVideoPath(selectedStoragePath(video)))
      .filter((video: any) => isReplayable(video, mockCompleted, includeUnpublished, now))
      .sort((a: any, b: any) => getMillis(b.createdAt) - getMillis(a.createdAt));
    const pageVideos = readyVideos.slice(offset, offset + limit);
    const items = await Promise.all(pageVideos.map(async (video: any, pageIndex: number) =>
      replayItem(video, offset + pageIndex, labels, mockCompleted.get(video.id), await getSignedPlaybackUrl(selectedStoragePath(video)))));
    const nextOffset = offset + pageVideos.length < readyVideos.length ? offset + pageVideos.length : null;
    return NextResponse.json({ success: true, count: readyVideos.length, returned: items.length, failed: 0, nextOffset, items });
  } catch (error: any) {
    console.error('Replay Library Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to load replay videos.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
    }
    const body = await req.json();
    const storagePath = typeof body.storagePath === 'string' ? body.storagePath.trim() : '';
    if (!storagePath) return NextResponse.json({ success: false, error: 'A stored video path is required.' }, { status: 400 });
    const bucket = getStorageBucket();
    if (!bucket) return NextResponse.json({ success: false, error: 'Storage is unavailable right now. Please try again shortly.' }, { status: 503 });
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
  bindClient(await resolveRequestClientId(req));
  // Deleting a customer's Go Live media is a staff action, limited to the signed-in workspace.
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const targetSessionIds: string[] = Array.isArray(body.sessionIds)
      ? body.sessionIds.filter((value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value))
      : [];

    const db = getDb();
    const bucket = getStorageBucket();
    const results: Array<{ sessionId: string; deletedFilesCount: number; skipped?: string }> = [];
    // A removed video must leave every Go Live screen at once.
    forgetReplayLibrary();
    const clientId = activeClientId();
    // A record belongs to this workspace when its media sits under the workspace's folder, or it says so.
    const ownsRecord = (data: any) => {
      if (!data) return false;
      if (data.clientId) return data.clientId === clientId;
      if (data.screenId) return data.screenId === liveScreenId();
      const path = String(data.storagePath || data.videoStoragePath || '');
      return Boolean(path) && storagePathBelongsToActiveClient(path);
    };

    for (const sessionId of targetSessionIds) {
      let deletedFilesCount = 0;
      if (db) {
        const sessionRef = db.collection('sessions').doc(sessionId);
        const sessionData = (await sessionRef.get()).data();
        const [videoSnap, queueSnap] = await Promise.all([
          db.collection('videos').where('sessionId', '==', sessionId).get(),
          db.collection('liveQueue').where('sessionId', '==', sessionId).get(),
        ]);
        const ownedVideos = videoSnap.docs.filter((doc) => ownsRecord(doc.data()));
        const ownedQueue = queueSnap.docs.filter((doc) => ownsRecord(doc.data()));
        const sessionOwned = sessionData ? (sessionData.clientId ? sessionData.clientId === clientId : ownedVideos.length > 0 || ownedQueue.length > 0) : false;
        if (sessionData && !sessionOwned && !ownedVideos.length && !ownedQueue.length) {
          results.push({ sessionId, deletedFilesCount: 0, skipped: 'Not a video of this store.' });
          continue;
        }
        try {
          const batch = db.batch();
          if (sessionOwned) batch.delete(sessionRef);
          ownedVideos.forEach((doc) => batch.delete(doc.ref));
          ownedQueue.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        } catch (dbErr) {
          console.warn(`Firestore delete warning for session ${sessionId}:`, dbErr);
        }
      }
      await deleteGoLiveEntriesForSessions([sessionId]).catch((libraryErr) => console.warn(`Go Live library delete warning for session ${sessionId}:`, libraryErr));
      if (bucket) {
        try {
          const prefix = `clients/${clientId}/sessions/${sessionId}/`;
          const [files] = await bucket.getFiles({ prefix });
          for (const file of files) {
            await file.delete({ ignoreNotFound: true });
            deletedFilesCount += 1;
          }
        } catch (storageErr) {
          console.warn(`Storage delete warning for session ${sessionId}:`, storageErr);
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

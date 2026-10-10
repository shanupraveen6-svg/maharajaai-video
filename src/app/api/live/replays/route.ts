import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';
import { verifyOperatorRequest } from '@/lib/auth/operator';

const FALLBACK_NAME = 'காவ்யா';
const FALLBACK_LOCALITY = 'தஞ்சாவூர்';

function getMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanLimit(value: string | null): number {
  const parsed = Number(value || 24);
  if (!Number.isFinite(parsed)) return 24;
  return Math.min(Math.max(Math.floor(parsed), 1), 40);
}

function cleanDisplayText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 48);
  return cleaned || fallback;
}

function buildReplayId(videoId: string, sessionId: string) {
  return `replay_${videoId || sessionId}`;
}

function sessionIdFromStoragePath(storagePath: string): string {
  const match = storagePath.match(/^sessions\/([^/]+)\/video\/final\.[a-z0-9]+$/i);
  return match?.[1] || storagePath.replace(/[^a-z0-9]+/gi, '_').slice(0, 64);
}

export async function GET(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized TV session.' }, { status: 401 });
    }

    const limit = cleanLimit(req.nextUrl.searchParams.get('limit'));
    const db = getDb();

    if (db) {
      const [videosSnapshot, queueSnapshot] = await Promise.all([
        db.collection('videos').get(),
        db.collection('liveQueue').where('screenId', '==', 'maharaja-main').get()
      ]);

      const completedQueueByVideoId = new Map<string, any>();
      queueSnapshot.docs
        .map((doc: any) => ({ id: doc.id, ...doc.data() }))
        .filter((item: any) => item.videoId && item.status === 'completed')
        .sort((a: any, b: any) => getMillis(b.completedAt || b.createdAt) - getMillis(a.completedAt || a.createdAt))
        .forEach((item: any) => {
          if (!completedQueueByVideoId.has(item.videoId)) {
            completedQueueByVideoId.set(item.videoId, item);
          }
        });

      const videosByStoragePath = new Map<string, any>();
      videosSnapshot.docs
        .map((doc: any) => ({ id: doc.id, ...doc.data() }))
        .filter((video: any) => video.storagePath && (!video.status || video.status === 'ready' || video.status === 'succeeded'))
        .forEach((video: any) => {
          videosByStoragePath.set(video.storagePath, video);
        });

      const bucket = getStorageBucket();
      let existingVideoStoragePaths: Set<string> | null = null;

      if (bucket) {
        const [files] = await bucket.getFiles({ prefix: 'sessions/' });
        const storageVideoPaths = files
          .map((file: any) => file.name as string)
          .filter((storagePath: string) => /^sessions\/[^/]+\/video\/final\.(mp4|webm|mov)$/i.test(storagePath));

        existingVideoStoragePaths = new Set(storageVideoPaths);

        storageVideoPaths.forEach((storagePath: string) => {
          if (!videosByStoragePath.has(storagePath)) {
            const sessionId = sessionIdFromStoragePath(storagePath);
            videosByStoragePath.set(storagePath, {
              id: `video_${sessionId}`,
              sessionId,
              storagePath,
              status: 'ready',
              createdAt: ''
            });
          }
        });
      }

      const readyVideos = Array.from(videosByStoragePath.values())
        .filter((video: any) => !existingVideoStoragePaths || existingVideoStoragePaths.has(video.storagePath))
        .sort((a: any, b: any) => getMillis(a.createdAt) - getMillis(b.createdAt));

      const items = await Promise.all(
        readyVideos.slice(0, limit).map(async (video: any) => {
          const queueMeta = completedQueueByVideoId.get(video.id) || completedQueueByVideoId.get(`video_${video.sessionId}`);
          const replayId = buildReplayId(video.id, video.sessionId);
          return {
            queueId: replayId,
            reservationId: replayId,
            videoId: video.id,
            sessionId: video.sessionId || null,
            videoUrl: await getSignedPlaybackUrl(video.storagePath),
            liveAudioUrl: queueMeta?.liveAudioUrl || getLiveAudioTrack(replayId),
            customerName: cleanDisplayText(queueMeta?.customerName, FALLBACK_NAME),
            customerLocality: cleanDisplayText(queueMeta?.customerLocality, FALLBACK_LOCALITY),
            source: 'replay'
          };
        })
      );

      return NextResponse.json({
        success: true,
        count: readyVideos.length,
        returned: items.length,
        items
      });
    }

    const mockStore = getMockStore();
    const readyVideos = Array.from(mockStore.videos.values())
      .filter((video: any) => video.storagePath && (!video.status || video.status === 'ready' || video.status === 'succeeded'))
      .sort((a: any, b: any) => getMillis(a.createdAt) - getMillis(b.createdAt));

    const items = await Promise.all(
      readyVideos.slice(0, limit).map(async (video: any) => {
        const replayId = buildReplayId(video.id, video.sessionId);
        return {
          queueId: replayId,
          reservationId: replayId,
          videoId: video.id,
          sessionId: video.sessionId || null,
          videoUrl: await getSignedPlaybackUrl(video.storagePath),
          liveAudioUrl: getLiveAudioTrack(replayId),
          customerName: FALLBACK_NAME,
          customerLocality: FALLBACK_LOCALITY,
          source: 'replay'
        };
      })
    );

    return NextResponse.json({
      success: true,
      count: readyVideos.length,
      returned: items.length,
      items
    });
  } catch (error: any) {
    console.error('Replay Library Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load replay videos.' },
      { status: 500 }
    );
  }
}

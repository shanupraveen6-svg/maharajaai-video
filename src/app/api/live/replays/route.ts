import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket, isRealFirebaseAvailable } from '@/lib/firebase/admin';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';
import { getTamilCustomerName, getTamilCustomerLocality } from '@/lib/maharaja/names';
import { verifyOperatorRequest } from '@/lib/auth/operator';

const FALLBACK_NAME = 'Maharaja Guest';
const FALLBACK_LOCALITY = 'Maharaja';

function getMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanLimit(value: string | null): number {
  const parsed = Number(value || 40);
  if (!Number.isFinite(parsed)) return 40;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
}

function cleanDisplayText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 48);
  return cleaned || fallback;
}

function buildReplayId(videoId: string, sessionId: string) {
  return `replay_${videoId || sessionId}`;
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
        db.collection('videos').orderBy('createdAt', 'desc').limit(limit).get(),
        db.collection('liveQueue').where('screenId', '==', 'maharaja-main').limit(limit * 3).get()
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

      // Also discover all videos directly from Firebase Storage bucket to play ALL stored videos
      const bucket = getStorageBucket();
      if (bucket && isRealFirebaseAvailable()) {
        try {
          const [files] = await bucket.getFiles({ prefix: '' });
          const mp4Files = files.filter((f: any) => typeof f.name === 'string' && f.name.endsWith('.mp4'));
          for (const file of mp4Files) {
            const p = file.name;
            if (!videosByStoragePath.has(p)) {
              const is9s = p.includes('live-9s') || p.includes('9s');
              const sidMatch = p.match(/sessions\/([^/]+)\//);
              const sessionId = sidMatch ? sidMatch[1] : `sess_${Math.random().toString(36).slice(2, 8)}`;
              videosByStoragePath.set(p, {
                id: `storage_${p.replace(/[^a-zA-Z0-9_]/g, '_')}`,
                sessionId,
                storagePath: p,
                liveStoragePath: is9s ? p : undefined,
                status: 'ready',
                createdAt: file.metadata?.timeCreated || new Date().toISOString(),
              });
            }
          }
        } catch (storageErr) {
          console.warn('Storage bucket direct listing warning:', storageErr);
        }
      }

      const readyVideos = Array.from(videosByStoragePath.values())
        .sort((a: any, b: any) => getMillis(b.createdAt) - getMillis(a.createdAt));

      const items = await Promise.all(
        readyVideos.slice(0, limit).map(async (video: any, index: number) => {
          const queueMeta = completedQueueByVideoId.get(video.id) || completedQueueByVideoId.get(`video_${video.sessionId}`);
          const replayId = buildReplayId(video.id, video.sessionId);

          const rawName = queueMeta?.customerName || video.customerName;
          const customerName = (rawName && rawName !== FALLBACK_NAME && rawName.trim().length > 0)
            ? cleanDisplayText(rawName, getTamilCustomerName(video.id || video.storagePath, index))
            : getTamilCustomerName(video.id || video.storagePath, index);

          const rawLocality = queueMeta?.customerLocality || video.customerLocality;
          const customerLocality = (rawLocality && rawLocality !== FALLBACK_LOCALITY && rawLocality.trim().length > 0)
            ? cleanDisplayText(rawLocality, getTamilCustomerLocality(video.id || video.storagePath, index))
            : getTamilCustomerLocality(video.id || video.storagePath, index);

          return {
            queueId: replayId,
            reservationId: replayId,
            videoId: video.id,
            sessionId: video.sessionId || null,
            videoUrl: await getSignedPlaybackUrl(video.liveStoragePath || video.storagePath),
            liveAudioUrl: getLiveAudioTrack(replayId, queueMeta?.eventId || video.eventId),
            customerName,
            customerLocality,
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
      .sort((a: any, b: any) => getMillis(b.createdAt) - getMillis(a.createdAt));

    const items = await Promise.all(
      readyVideos.slice(0, limit).map(async (video: any, index: number) => {
        const replayId = buildReplayId(video.id, video.sessionId);
        const rawName = video.customerName;
        const customerName = (rawName && rawName !== FALLBACK_NAME && rawName.trim().length > 0)
          ? cleanDisplayText(rawName, getTamilCustomerName(video.id || video.storagePath, index))
          : getTamilCustomerName(video.id || video.storagePath, index);

        const rawLocality = video.customerLocality;
        const customerLocality = (rawLocality && rawLocality !== FALLBACK_LOCALITY && rawLocality.trim().length > 0)
          ? cleanDisplayText(rawLocality, getTamilCustomerLocality(video.id || video.storagePath, index))
          : getTamilCustomerLocality(video.id || video.storagePath, index);

        return {
          queueId: replayId,
          reservationId: replayId,
          videoId: video.id,
          sessionId: video.sessionId || null,
          videoUrl: await getSignedPlaybackUrl(video.liveStoragePath || video.storagePath),
          liveAudioUrl: getLiveAudioTrack(replayId, video.eventId),
          customerName,
          customerLocality,
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

import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, generateReservationId, getSignedPlaybackUrl, MockQueueItem } from '@/lib/firebase/admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

function getMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareQueueItems(a: any, b: any): number {
  const queueDiff = Number(a.data.queueNumber || 0) - Number(b.data.queueNumber || 0);
  if (queueDiff !== 0) return queueDiff;

  const playDiff = getMillis(a.data.playAtMs || a.data.playAt) - getMillis(b.data.playAtMs || b.data.playAt);
  if (playDiff !== 0) return playDiff;

  return getMillis(a.data.createdAt) - getMillis(b.data.createdAt);
}

function isEligibleToPlay(queueData: any, nowMs: number): boolean {
  const playAtMs = getMillis(queueData.playAtMs || queueData.playAt);
  return !playAtMs || playAtMs <= nowMs;
}

// Helper for expired reservation cleanup
async function cleanupExpiredReservations(db: any) {
  try {
    const expiredCutoff = Timestamp.fromMillis(Date.now() - 30000); // 30s lease timeout
    const expiredSnapshot = await db.collection('liveQueue')
      .where('screenId', '==', 'maharaja-main')
      .where('status', '==', 'reserved')
      .where('reservedAt', '<', expiredCutoff)
      .get();

    if (!expiredSnapshot.empty) {
      const batch = db.batch();
      expiredSnapshot.forEach((doc: any) => {
        batch.update(doc.ref, {
          status: 'queued',
          reservedAt: null,
          reservedByScreenId: null,
          reservationId: null
        });
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('Expired reservation cleanup warning:', err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (db) {
      await cleanupExpiredReservations(db);

      const result = await db.runTransaction(async (transaction: any) => {
        const queueQuery = db.collection('liveQueue')
          .where('screenId', '==', 'maharaja-main')
          .where('status', '==', 'queued');

        const queueSnapshot = await transaction.get(queueQuery);
        if (queueSnapshot.empty) {
          return { status: 'idle' };
        }

        const nextQueued = queueSnapshot.docs
          .map((doc: any) => ({ doc, data: doc.data() }))
          .sort(compareQueueItems)
          .find((item: any) => isEligibleToPlay(item.data, nowMs));

        if (!nextQueued) {
          return { status: 'idle' };
        }

        const queueDoc = nextQueued.doc;
        const queueData = nextQueued.data;
        const videoDocRef = db.collection('videos').doc(queueData.videoId);
        const videoDoc = await transaction.get(videoDocRef);

        const videoData = videoDoc.exists ? videoDoc.data() : null;
        if (!videoDoc.exists || !videoData || !videoData.storagePath) {
          const failureReason = `Missing video document or storagePath for videoId: '${queueData.videoId}'`;
          console.error(`Live Queue Error: ${failureReason}`);
          transaction.update(queueDoc.ref, {
            status: 'playback_failed',
            reason: failureReason,
            failedAt: FieldValue.serverTimestamp()
          });
          return { status: 'failed', reason: failureReason };
        }

        const storagePath = videoData.storagePath;
        const reservationId = generateReservationId();

        transaction.update(queueDoc.ref, {
          status: 'reserved',
          reservedAt: FieldValue.serverTimestamp(),
          reservedByScreenId: 'maharaja-main',
          reservationId
        });

        return {
          status: 'play',
          queueId: queueDoc.id,
          queueNumber: queueData.queueNumber || null,
          reservationId,
          storagePath,
          customerName: queueData.customerName || null,
          customerLocality: queueData.customerLocality || null,
          liveAudioUrl: queueData.liveAudioUrl || null
        };
      });

      if (result.status === 'idle') {
        return NextResponse.json({ status: 'idle' });
      }

      if (result.status === 'failed') {
        return NextResponse.json({ status: 'idle', reason: result.reason });
      }

      const signedUrl = await getSignedPlaybackUrl(result.storagePath);

      return NextResponse.json({
        status: 'play',
        queueId: result.queueId,
        queueNumber: result.queueNumber || null,
        reservationId: result.reservationId,
        videoUrl: signedUrl,
        customerName: result.customerName || null,
        customerLocality: result.customerLocality || null,
        liveAudioUrl: result.liveAudioUrl || null
      });

    } else {
      // Mock Store Logic
      const mockStore = getMockStore();

      // Recover expired reservations (>30s)
      mockStore.liveQueue.forEach((item: MockQueueItem) => {
        if (item.status === 'reserved' && item.reservedAt) {
          if (Date.now() - new Date(item.reservedAt).getTime() > 30000) {
            item.status = 'queued';
            delete item.reservedAt;
            delete item.reservationId;
          }
        }
      });

      // Find first queued item where playAt <= nowMs
      const nextItem = mockStore.liveQueue
        .filter((item: MockQueueItem) => item.screenId === 'maharaja-main' && item.status === 'queued')
        .map((item: MockQueueItem) => ({ data: item }))
        .sort(compareQueueItems)
        .find((item: { data: MockQueueItem }) => isEligibleToPlay(item.data, nowMs))
        ?.data;

      if (!nextItem) {
        return NextResponse.json({ status: 'idle' });
      }

      const video = mockStore.videos.get(nextItem.videoId);
      if (!video || !video.storagePath) {
        const failureReason = `Missing mock video record or storagePath for videoId: '${nextItem.videoId}'`;
        console.error(`Live Queue Mock Error: ${failureReason}`);
        nextItem.status = 'playback_failed';
        (nextItem as any).reason = failureReason;
        return NextResponse.json({ status: 'idle', reason: failureReason });
      }

      const storagePath = video.storagePath;
      const reservationId = generateReservationId();

      nextItem.status = 'reserved';
      nextItem.reservedAt = nowIso;
      nextItem.reservedByScreenId = 'maharaja-main';
      nextItem.reservationId = reservationId;

      const signedUrl = await getSignedPlaybackUrl(storagePath);

      return NextResponse.json({
        status: 'play',
        queueId: nextItem.id,
        queueNumber: nextItem.queueNumber || null,
        reservationId,
        videoUrl: signedUrl,
        customerName: (nextItem as any).customerName || null,
        customerLocality: (nextItem as any).customerLocality || null,
        liveAudioUrl: (nextItem as any).liveAudioUrl || null
      });
    }
  } catch (error: any) {

    console.error('API Live Next Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

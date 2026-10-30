import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, generateReservationId, getSignedPlaybackUrl, getStorageBucket, type MockQueueItem } from '@/lib/firebase/admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getVideoPlaybackProfile } from '@/lib/maharaja/video-playback';
import { verifyTvRequest } from '@/lib/auth/display';
import { inspectStoredVideo } from '@/lib/maharaja/storage-video';
import { bindClient, liveScreenId } from '@/lib/maharaja/client-context';
import { goLiveClientId, resolveRequestClientId } from '@/lib/maharaja/server';

function getMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareQueueItems(a: any, b: any): number {
  const priorityDiff = Number(b.data.priority || 0) - Number(a.data.priority || 0);
  if (priorityDiff !== 0) return priorityDiff;

  const queueDiff = Number(a.data.queueNumber || 0) - Number(b.data.queueNumber || 0);
  if (queueDiff !== 0) return queueDiff;

  const playDiff = getMillis(a.data.playAtMs || a.data.playAt) - getMillis(b.data.playAtMs || b.data.playAt);
  if (playDiff !== 0) return playDiff;

  return getMillis(a.data.createdAt) - getMillis(b.data.createdAt);
}

function isEligibleToPlay(queueData: any, nowMs: number): boolean {
  const playAtMs = getMillis(queueData.playAtMs || queueData.playAt);
  const expiresAtMs = getMillis(queueData.expiresAt);
  return (!playAtMs || playAtMs <= nowMs) && (!expiresAtMs || expiresAtMs > nowMs);
}

function cleanDisplayText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 48);
  return cleaned || null;
}

const REMOVED_TV_NAMES = new Set(['செந்தில்', 'senthil', 'கீர்த்தனா', 'keerthana']);

// Helper for expired reservation cleanup
async function cleanupExpiredReservations(db: any) {
  try {
    const expiredCutoff = Timestamp.fromMillis(Date.now() - 30000); // 30s lease timeout
    const [expiredSnapshot, playingSnapshot] = await Promise.all([
      db.collection('liveQueue')
        .where('screenId', '==', liveScreenId())
        .where('status', '==', 'reserved')
        .where('reservedAt', '<', expiredCutoff)
        .get(),
      db.collection('liveQueue')
        .where('screenId', '==', liveScreenId())
        .where('status', '==', 'playing')
        .get(),
    ]);

    const stalePlaying = playingSnapshot.docs.filter((doc: any) => {
      const data = doc.data() || {};
      const activityAt = getMillis(data.lastHeartbeatAt || data.startedAt || data.updatedAt || data.reservedAt || data.createdAt);
      return activityAt > 0 && activityAt < Date.now() - 45000;
    });

    if (!expiredSnapshot.empty || stalePlaying.length > 0) {
      const batch = db.batch();
      expiredSnapshot.forEach((doc: any) => {
        batch.update(doc.ref, {
          status: 'queued',
          reservedAt: null,
          reservedByScreenId: null,
          reservationId: null
        });
      });
      stalePlaying.forEach((doc: any) => {
        batch.update(doc.ref, {
          status: 'queued',
          playAtMs: Date.now(),
          reservedAt: null,
          reservedByScreenId: null,
          reservationId: null,
          repeatPending: false,
          updatedAt: new Date().toISOString(),
        });
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('Expired reservation cleanup warning:', err);
  }
}

export async function GET(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  if (!(await goLiveClientId(req)) && !await verifyTvRequest(req)) {
    return NextResponse.json({ success: false, error: 'Open this screen from the workspace Go Live link.' }, { status: 401 });
  }
  try {
    const db = getDb();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (db) {
      await cleanupExpiredReservations(db);

      const result = await db.runTransaction(async (transaction: any) => {
        const queueQuery = db.collection('liveQueue')
          .where('screenId', '==', liveScreenId())
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

        const storagePath = videoData.liveStoragePath || videoData.storagePath;
        const reservationId = generateReservationId();

        transaction.update(queueDoc.ref, {
          status: 'reserved',
          reservedAt: FieldValue.serverTimestamp(),
          reservedByScreenId: liveScreenId(),
          reservationId
        });

        const queueCustomerName = cleanDisplayText(queueData.customerName);
        let customerName = queueCustomerName || cleanDisplayText(videoData.customerName);
        // Legacy alias rules apply only to old media without a customer-entered
        // queue name. A live customer always sees the name they typed.
        if (!queueCustomerName) {
          const isLegacyNamedMedia = Boolean(storagePath && (storagePath.toLowerCase().includes('men') || storagePath.toLowerCase().includes('karthi')));
          if (isLegacyNamedMedia || (customerName && (REMOVED_TV_NAMES.has(customerName.toLowerCase()) || customerName === 'திவ்யா' || customerName.toLowerCase() === 'divya'))) {
            customerName = 'கார்த்திக்';
          }
        }

        return {
          status: 'play',
          queueId: queueDoc.id,
          queueNumber: queueData.queueNumber || null,
          reservationId,
          timesPlayed: Number(queueData.timesPlayed || 0),
          storagePath,
          playbackProfile: getVideoPlaybackProfile(videoData, storagePath),
          customerName,
          customerLocality: cleanDisplayText(queueData.customerLocality) || cleanDisplayText(videoData.customerLocality) || 'தஞ்சாவூர்',
          liveAudioUrl: queueData.liveAudioUrl || null
        };
      });

      if (result.status === 'idle') {
        return NextResponse.json({ status: 'idle' });
      }

      if (result.status === 'failed') {
        return NextResponse.json({ status: 'idle', reason: result.reason });
      }

      if (!result.playbackProfile) {
        return NextResponse.json({ success: false, error: 'Video playback metadata is unavailable.' }, { status: 500 });
      }

      const storedVideo = await inspectStoredVideo(getStorageBucket(), result.storagePath);
      if (!storedVideo.playable) {
        await db.collection('liveQueue').doc(result.queueId).update({
          status: 'playback_failed',
          reason: `Stored video is ${storedVideo.reason}`,
          failedAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({ status: 'idle', reason: 'unplayable-video-skipped' });
      }

      const signedUrl = await getSignedPlaybackUrl(result.storagePath);

      return NextResponse.json({
        status: 'play',
        queueId: result.queueId,
        queueNumber: result.queueNumber || null,
        reservationId: result.reservationId,
        timesPlayed: result.timesPlayed,
        videoUrl: signedUrl,
        customerName: result.customerName || null,
        customerLocality: result.customerLocality || null,
        liveAudioUrl: result.playbackProfile.playbackMode === 'external' ? result.liveAudioUrl || null : null,
        ...result.playbackProfile,
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
        if (item.status === 'playing') {
          const activityAt = getMillis((item as any).lastHeartbeatAt || item.startedAt || (item as any).updatedAt || item.reservedAt || item.createdAt);
          if (activityAt > 0 && activityAt < Date.now() - 45000) {
            item.status = 'queued';
            item.playAtMs = Date.now();
            delete item.reservedAt;
            delete item.reservationId;
            delete (item as any).reservedByScreenId;
            (item as any).repeatPending = false;
            (item as any).updatedAt = nowIso;
          }
        }
      });

      // Find first queued item where playAt <= nowMs
      const nextItem = mockStore.liveQueue
        .filter((item: MockQueueItem) => item.screenId === liveScreenId() && item.status === 'queued')
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

      const storagePath = video.liveStoragePath || video.storagePath;
      const playbackProfile = getVideoPlaybackProfile(video, storagePath);
      const reservationId = generateReservationId();

      nextItem.status = 'reserved';
      nextItem.reservedAt = nowIso;
      nextItem.reservedByScreenId = liveScreenId();
      nextItem.reservationId = reservationId;

      const signedUrl = await getSignedPlaybackUrl(storagePath);

      const mockQueueName = cleanDisplayText((nextItem as any).customerName);
      let mockCustomerName = mockQueueName || cleanDisplayText((video as any).customerName);
      if (!mockQueueName) {
        const isLegacyMockMedia = Boolean(storagePath && (storagePath.toLowerCase().includes('men') || storagePath.toLowerCase().includes('karthi')));
        if (isLegacyMockMedia || (mockCustomerName && (REMOVED_TV_NAMES.has(mockCustomerName.toLowerCase()) || mockCustomerName === 'திவ்யா' || mockCustomerName.toLowerCase() === 'divya'))) {
          mockCustomerName = 'கார்த்திக்';
        }
      }

      return NextResponse.json({
        status: 'play',
        queueId: nextItem.id,
        queueNumber: nextItem.queueNumber || null,
        reservationId,
        timesPlayed: Number(nextItem.timesPlayed || 0),
        videoUrl: signedUrl,
        customerName: mockCustomerName,
        customerLocality: cleanDisplayText((nextItem as any).customerLocality) || cleanDisplayText((video as any).customerLocality) || 'தஞ்சாவூர்',
        liveAudioUrl: playbackProfile.playbackMode === 'external' ? (nextItem as any).liveAudioUrl || null : null,
        ...playbackProfile,
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

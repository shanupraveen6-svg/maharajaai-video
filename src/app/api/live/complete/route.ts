import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { logMaharajaActivity } from '@/lib/maharaja/server';
import { verifyTvRequest } from '@/lib/auth/display';

const LIVE_PLAY_COUNT = 2;

function replayMetadata(queueData: any, publishedAt: string) {
  return {
    customerName: queueData.customerName || null,
    customerLocality: queueData.customerLocality || null,
    liveAudioUrl: queueData.liveAudioUrl || null,
    displayUpdatedAt: publishedAt,
    published: true,
    replayEnabled: true,
    universalPool: true,
    publishedAt,
  };
}

export async function POST(req: NextRequest) {
  if (!await verifyTvRequest(req)) {
    return NextResponse.json({ success: false, error: 'Authenticated Maharaja TV required.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { queueId, reservationId } = body;
    const requestedPlayNumber = Number.isInteger(body.playNumber) ? Number(body.playNumber) : null;

    if (!queueId || !reservationId) {
      return NextResponse.json({ success: false, error: 'Missing queueId or reservationId' }, { status: 400 });
    }

    const db = getDb();
    const nowIso = new Date().toISOString();

    if (db) {
      const queueDocRef = db.collection('liveQueue').doc(queueId);
      const doc = await queueDocRef.get();
      if (!doc.exists || doc.data()?.reservationId !== reservationId) {
        return NextResponse.json({ success: false, error: 'Invalid or expired reservationId' }, { status: 400 });
      }

      const queueData = doc.data() || {};
      const previousPlays = Number(queueData.timesPlayed || 0);
      if (queueData.status === 'completed') {
        if (queueData.videoId) {
          await db.collection('videos').doc(queueData.videoId).set(
            replayMetadata(queueData, queueData.completedAt || nowIso),
            { merge: true },
          );
        }
        return NextResponse.json({ success: true, status: 'completed', timesPlayed: previousPlays });
      }
      const timesPlayed = requestedPlayNumber ?? previousPlays + 1;
      if (timesPlayed < 1 || timesPlayed > LIVE_PLAY_COUNT || timesPlayed > previousPlays + 1) {
        return NextResponse.json({ success: false, error: 'Invalid live play sequence.' }, { status: 409 });
      }
      if (timesPlayed <= previousPlays) {
        return NextResponse.json({ success: true, status: 'repeat', timesPlayed, playsRemaining: LIVE_PLAY_COUNT - timesPlayed });
      }
      const shouldPublish = timesPlayed >= LIVE_PLAY_COUNT;
      await queueDocRef.update(shouldPublish ? {
        status: 'completed',
        completedAt: nowIso,
        timesPlayed,
        repeatPending: false,
      } : {
        status: 'playing',
        timesPlayed,
        repeatPending: true,
        updatedAt: nowIso,
      });
      if (!shouldPublish) {
        return NextResponse.json({ success: true, status: 'repeat', timesPlayed, playsRemaining: LIVE_PLAY_COUNT - timesPlayed });
      }
      const displayMetadata = replayMetadata(queueData, nowIso);
      if (queueData.videoId) {
        await db.collection('videos').doc(queueData.videoId).set(displayMetadata, { merge: true });
      }
      if (queueData.sessionId) {
        await db.collection('sessions').doc(queueData.sessionId).set(displayMetadata, { merge: true });
      }
    } else {
      const mockStore = getMockStore();
      const item = mockStore.liveQueue.find((i) => i.id === queueId && i.reservationId === reservationId);
      if (!item) {
        return NextResponse.json({ success: false, error: 'Invalid or expired reservationId' }, { status: 400 });
      }
      const previousPlays = Number(item.timesPlayed || 0);
      if (item.status === 'completed') {
        const completedVideo = mockStore.videos.get(item.videoId);
        if (completedVideo) mockStore.videos.set(item.videoId, {
          ...completedVideo,
          ...replayMetadata(item, item.completedAt || nowIso),
        });
        return NextResponse.json({ success: true, status: 'completed', timesPlayed: previousPlays });
      }
      const timesPlayed = requestedPlayNumber ?? previousPlays + 1;
      if (timesPlayed < 1 || timesPlayed > LIVE_PLAY_COUNT || timesPlayed > previousPlays + 1) {
        return NextResponse.json({ success: false, error: 'Invalid live play sequence.' }, { status: 409 });
      }
      if (timesPlayed <= previousPlays) {
        return NextResponse.json({ success: true, status: 'repeat', timesPlayed, playsRemaining: LIVE_PLAY_COUNT - timesPlayed });
      }
      item.timesPlayed = timesPlayed;
      const shouldPublish = item.timesPlayed >= LIVE_PLAY_COUNT;
      if (!shouldPublish) {
        item.status = 'playing';
        (item as any).repeatPending = true;
        return NextResponse.json({ success: true, status: 'repeat', timesPlayed: item.timesPlayed, playsRemaining: LIVE_PLAY_COUNT - item.timesPlayed });
      }
      item.status = 'completed';
      item.completedAt = nowIso;
      (item as any).repeatPending = false;
      const displayMetadata = {
        customerName: (item as any).customerName || null,
        customerLocality: (item as any).customerLocality || null,
        liveAudioUrl: (item as any).liveAudioUrl || null,
        displayUpdatedAt: nowIso
      };
      const mockVideo = mockStore.videos.get(item.videoId);
      if (mockVideo) mockStore.videos.set(item.videoId, {
        ...mockVideo,
        ...replayMetadata(item, nowIso),
      });
      const mockSession = mockStore.sessions.get(item.sessionId);
      if (mockSession) mockStore.sessions.set(item.sessionId, { ...mockSession, ...displayMetadata });
    }

    await logMaharajaActivity('video', 'TV playback completed and replay state updated', { queueId, reservationId, stage: 'tv-replay' });
    return NextResponse.json({ success: true, status: 'completed' });
  } catch (error: any) {
    console.error('API Live Complete Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

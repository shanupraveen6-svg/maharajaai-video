import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { queueId, reservationId } = body;

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

      await queueDocRef.update({
        status: 'completed',
        completedAt: nowIso,
        timesPlayed: (doc.data()?.timesPlayed || 0) + 1
      });
      const queueData = doc.data() || {};
      const displayMetadata = {
        customerName: queueData.customerName || null,
        customerLocality: queueData.customerLocality || null,
        liveAudioUrl: queueData.liveAudioUrl || null,
        displayUpdatedAt: nowIso
      };
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
      item.status = 'completed';
      item.completedAt = nowIso;
      item.timesPlayed = (item.timesPlayed || 0) + 1;
      const displayMetadata = {
        customerName: (item as any).customerName || null,
        customerLocality: (item as any).customerLocality || null,
        liveAudioUrl: (item as any).liveAudioUrl || null,
        displayUpdatedAt: nowIso
      };
      const mockVideo = mockStore.videos.get(item.videoId);
      if (mockVideo) mockStore.videos.set(item.videoId, { ...mockVideo, ...displayMetadata });
      const mockSession = mockStore.sessions.get(item.sessionId);
      if (mockSession) mockStore.sessions.set(item.sessionId, { ...mockSession, ...displayMetadata });
    }

    return NextResponse.json({ success: true, status: 'completed' });
  } catch (error: any) {
    console.error('API Live Complete Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

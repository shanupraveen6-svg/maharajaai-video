import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';

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
      const queueDoc = await queueDocRef.get();

      if (!queueDoc.exists || queueDoc.data()?.reservationId !== reservationId) {
        return NextResponse.json({ success: false, error: 'Invalid reservation' }, { status: 400 });
      }

      await queueDocRef.update({
        status: 'playing',
        startedAt: nowIso
      });
    } else {
      const mockStore = getMockStore();
      const item = mockStore.liveQueue.find((i) => i.id === queueId && i.reservationId === reservationId);
      if (!item) {
        return NextResponse.json({ success: false, error: 'Invalid reservation' }, { status: 400 });
      }

      item.status = 'playing';
      item.startedAt = nowIso;
    }

    return NextResponse.json({ success: true, status: 'playing' });
  } catch (error: any) {
    console.error('TV Playing Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

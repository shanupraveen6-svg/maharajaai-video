import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, hashToken } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export async function POST(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Unauthorized TV session.' }, { status: 401 });
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const tokenHash = hashToken(token);
    const body = await req.json();
    const { queueId, reservationId, reason = 'Browser playback error' } = body;

    if (!queueId || !reservationId) {
      return NextResponse.json({ success: false, error: 'Missing queueId or reservationId' }, { status: 400 });
    }

    const db = getDb();
    const nowIso = new Date().toISOString();

    if (db) {
      const screenDoc = await db.collection('screens').doc('maharaja-main').get();
      if (!screenDoc.exists || screenDoc.data()?.tokenHash !== tokenHash) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }

      const queueDocRef = db.collection('liveQueue').doc(queueId);
      const queueDoc = await queueDocRef.get();

      if (!queueDoc.exists || queueDoc.data()?.reservationId !== reservationId) {
        return NextResponse.json({ success: false, error: 'Invalid reservation' }, { status: 400 });
      }

      await queueDocRef.update({
        status: 'playback_failed',
        failureReason: reason,
        failedAt: nowIso
      });
    } else {
      const mockStore = getMockStore();
      const screen = mockStore.screens.get('maharaja-main');
      if (!screen || screen.tokenHash !== tokenHash) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }

      const item = mockStore.liveQueue.find((i) => i.id === queueId && i.reservationId === reservationId);
      if (!item) {
        return NextResponse.json({ success: false, error: 'Invalid reservation' }, { status: 400 });
      }

      item.status = 'playback_failed';
      (item as any).failureReason = reason;
      (item as any).failedAt = nowIso;
    }

    return NextResponse.json({ success: true, status: 'playback_failed' });
  } catch (error: any) {
    console.error('TV Fail Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

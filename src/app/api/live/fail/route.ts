import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export async function POST(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Unauthorized TV session.' }, { status: 401 });
    const body = await req.json();
    const { queueId, reservationId, reason = 'Browser playback error' } = body;

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
      const retryCount = Number(doc.data()?.tvRetryCount || 0);
      const willRetry = retryCount < 1;
      await queueDocRef.update({
        status: willRetry ? 'queued' : 'playback_failed',
        tvRetryCount: retryCount + 1,
        reservationId: null,
        reservedAt: null,
        reservedByScreenId: null,
        failureReason: reason,
        failedAt: nowIso
      });
    } else {
      const mockStore = getMockStore();
      const item = mockStore.liveQueue.find((i) => i.id === queueId && i.reservationId === reservationId);
      if (!item) {
        return NextResponse.json({ success: false, error: 'Invalid or expired reservationId' }, { status: 400 });
      }
      const retryCount = Number((item as any).tvRetryCount || 0);
      item.status = retryCount < 1 ? 'queued' : 'playback_failed';
      (item as any).tvRetryCount = retryCount + 1;
      item.reservationId = undefined;
      item.reservedAt = undefined;
      item.reservedByScreenId = undefined;
      (item as any).failureReason = reason;
      (item as any).failedAt = nowIso;
    }

    return NextResponse.json({ success: true, status: 'retry_or_failed' });
  } catch (error: any) {
    console.error('API Live Fail Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

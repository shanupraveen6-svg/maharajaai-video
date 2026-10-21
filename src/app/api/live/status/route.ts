import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';

function getMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareQueueItems(a: any, b: any): number {
  const queueDiff = Number(a.queueNumber || 0) - Number(b.queueNumber || 0);
  if (queueDiff !== 0) return queueDiff;

  const playDiff = getMillis(a.playAtMs || a.playAt) - getMillis(b.playAtMs || b.playAt);
  if (playDiff !== 0) return playDiff;

  return getMillis(a.createdAt) - getMillis(b.createdAt);
}

async function getQueuePosition(db: any, queueId: string): Promise<number | null> {
  const snapshot = await db.collection('liveQueue')
    .where('screenId', '==', 'maharaja-main')
    .where('status', '==', 'queued')
    .get();

  const queuedItems = snapshot.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort(compareQueueItems);

  const index = queuedItems.findIndex((item: any) => item.id === queueId);
  return index >= 0 ? index + 1 : null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queueId = searchParams.get('queueId');
    const accessCode = searchParams.get('accessCode');
    const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
    if (!access.allowed && access.error !== 'This AI Video has been completed.') {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }

    if (!queueId) {
      return NextResponse.json(
        { success: false, error: 'queueId parameter is required.' },
        { status: 400 }
      );
    }

    const db = getDb();

    if (db) {
      const docRef = db.collection('liveQueue').doc(queueId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return NextResponse.json(
          { success: false, error: 'Queue item not found.' },
          { status: 404 }
        );
      }

      const data = docSnap.data() || {};
      if (data.accessCode && data.accessCode !== accessCode) {
        return NextResponse.json({ success: false, error: 'This queue item does not belong to this AI Video pass.' }, { status: 403 });
      }
      const status = data.status || 'queued';
      const queuePosition = status === 'queued' ? await getQueuePosition(db, queueId) : null;

      return NextResponse.json({
        success: true,
        queueId,
        queueNumber: data.queueNumber || null,
        queuePosition,
        peopleAhead: queuePosition ? Math.max(queuePosition - 1, 0) : null,
        status,
        timesPlayed: Number(data.timesPlayed || 0),
        repeatCount: 2,
        customerName: data.customerName || null,
        customerLocality: data.customerLocality || null,
        playAtMs: data.playAtMs || null,
        reservedAt: data.reservedAt || null,
        startedAt: data.startedAt || null,
        completedAt: data.completedAt || null
      });

    } else {
      const mockStore = getMockStore();
      const item = mockStore.liveQueue.find((q: any) => q.id === queueId);

      if (!item) {
        return NextResponse.json(
          { success: false, error: 'Queue item not found.' },
          { status: 404 }
        );
      }
      if ((item as any).accessCode && (item as any).accessCode !== accessCode) {
        return NextResponse.json({ success: false, error: 'This queue item does not belong to this AI Video pass.' }, { status: 403 });
      }

      const queuedItems = mockStore.liveQueue
        .filter((q: any) => q.screenId === 'maharaja-main' && q.status === 'queued')
        .sort(compareQueueItems);
      const queueIndex = queuedItems.findIndex((q: any) => q.id === queueId);
      const queuePosition = item.status === 'queued' && queueIndex >= 0 ? queueIndex + 1 : null;

      return NextResponse.json({
        success: true,
        queueId,
        queueNumber: item.queueNumber || null,
        queuePosition,
        peopleAhead: queuePosition ? Math.max(queuePosition - 1, 0) : null,
        status: item.status || 'queued',
        timesPlayed: Number(item.timesPlayed || 0),
        repeatCount: 2,
        customerName: (item as any).customerName || null,
        customerLocality: (item as any).customerLocality || null,
        playAtMs: item.playAtMs || null,
        reservedAt: item.reservedAt || null,
        startedAt: item.startedAt || null,
        completedAt: item.completedAt || null
      });
    }
  } catch (error: any) {
    console.error('API Live Status Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

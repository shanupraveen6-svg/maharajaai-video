import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { bindClient, liveScreenId } from '@/lib/maharaja/client-context';
import { resolveRequestClientId } from '@/lib/maharaja/server';

export async function POST(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  try {
    if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Unauthorized operator session.' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;
    const db = getDb();
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

    function isSafeToPurge(item: any): boolean {
      if (force) return true;
      if (!item.videoUrl || String(item.videoUrl).trim().length < 10) return true;
      if (item.status === 'failed' || item.status === 'expired') return true;
      const createdAtMs = new Date(item.createdAt || 0).getTime();
      const isOlderThan2Hours = Number.isFinite(createdAtMs) && createdAtMs < twoHoursAgo;
      if (item.status === 'completed' && isOlderThan2Hours) return true;
      // Stale processing/queued item older than 2 hours
      if ((item.status === 'queued' || item.status === 'reserved') && isOlderThan2Hours) return true;
      return false;
    }

    if (db) {
      const snapshot = await db.collection('liveQueue')
        .where('screenId', '==', liveScreenId())
        .get();

      let purgedCount = 0;
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.forEach((doc: any) => {
          if (isSafeToPurge(doc.data())) {
            batch.delete(doc.ref);
            purgedCount++;
          }
        });
        if (purgedCount > 0) {
          await batch.commit();
        }
      }

      return NextResponse.json({
        success: true,
        message: purgedCount > 0
          ? `Safely cleared ${purgedCount} stale/completed queue entries. Active broadcasts preserved.`
          : 'Queue is clean. No stale broadcast entries to clear.'
      });
    } else {
      const mockStore = getMockStore();
      const initialCount = mockStore.liveQueue.length;
      mockStore.liveQueue = mockStore.liveQueue.filter((item: any) => {
        if (item.screenId !== liveScreenId()) return true;
        return !isSafeToPurge(item);
      });
      const purged = initialCount - mockStore.liveQueue.length;

      return NextResponse.json({
        success: true,
        message: purged > 0
          ? `Safely cleared ${purged} stale/completed queue entries from mock queue.`
          : 'Mock queue is clean.'
      });
    }
  } catch (error: any) {
    console.error('API Live Reset Queue Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

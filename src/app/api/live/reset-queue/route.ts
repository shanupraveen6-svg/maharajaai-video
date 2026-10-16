import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export async function POST(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Unauthorized operator session.' }, { status: 401 });
    const db = getDb();

    if (db) {
      const snapshot = await db.collection('liveQueue')
        .where('screenId', '==', 'maharaja-main')
        .get();

      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.forEach((doc: any) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }

      return NextResponse.json({
        success: true,
        message: `Purged ${snapshot.size} entries from liveQueue.`
      });
    } else {
      const mockStore = getMockStore();
      const initialCount = mockStore.liveQueue.length;
      mockStore.liveQueue = mockStore.liveQueue.filter((item: any) => item.screenId !== 'maharaja-main');

      return NextResponse.json({
        success: true,
        message: `Purged ${initialCount - mockStore.liveQueue.length} entries from mock liveQueue.`
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

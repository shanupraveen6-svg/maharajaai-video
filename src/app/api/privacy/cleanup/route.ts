import { NextRequest, NextResponse } from 'next/server';
import { getDb, getStorageBucket } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const db = getDb();
  const bucket = getStorageBucket();
  if (!db || !bucket) {
    return NextResponse.json({ success: false, error: 'Production Firebase is not configured.' }, { status: 503 });
  }

  const nowIso = new Date().toISOString();
  const snapshot = await db.collection('sessions').where('expiresAt', '<=', nowIso).limit(100).get();
  let deleted = 0;
  let retainedForPromotion = 0;

  for (const doc of snapshot.docs) {
    const session = doc.data();
    if (session.promotionConsent === true) {
      retainedForPromotion += 1;
      continue;
    }

    const sessionId = doc.id;
    await bucket.deleteFiles({ prefix: `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/`, force: true });
    const queue = await db.collection('liveQueue').where('sessionId', '==', sessionId).get();
    const batch = db.batch();
    queue.docs.forEach((item) => batch.delete(item.ref));
    batch.delete(db.collection('videos').doc(`video_${sessionId}`));
    batch.delete(doc.ref);
    await batch.commit();
    deleted += 1;
  }

  return NextResponse.json({ success: true, deleted, retainedForPromotion, checkedAt: nowIso });
}

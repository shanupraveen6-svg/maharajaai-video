import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl } from '@/lib/firebase/admin';
import { isEventId } from '@/lib/maharaja/config';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';
import { bindClient } from '@/lib/maharaja/client-context';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')?.trim() || '';
  const accessCode = req.nextUrl.searchParams.get('accessCode')?.trim() || '';
  if (!sessionId || !accessCode) {
    return NextResponse.json({ success: false, error: 'sessionId and accessCode are required.' }, { status: 400 });
  }

  const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');

  bindClient(access.allowed ? access.clientId : null);
  if (!access.allowed || !access.pass) {
    return NextResponse.json({ success: false, error: access.error || 'A valid AI Video pass is required.' }, { status: 401 });
  }

  const db = getDb();
  const session = db
    ? (await db.collection('sessions').doc(sessionId).get()).data()
    : getMockStore().sessions.get(sessionId);
  if (!session || session.accessCode !== accessCode) {
    return NextResponse.json({ success: false, error: 'This result does not belong to this AI Video pass.' }, { status: 403 });
  }

  let job: any = null;
  let jobId = typeof session.latestReadyVideoTestJobId === 'string' ? session.latestReadyVideoTestJobId : '';
  if (db) {
    if (jobId) job = (await db.collection('videoTestJobs').doc(jobId).get()).data();
    if (!job || job.status !== 'ready') {
      const snapshot = await db.collection('videoTestJobs').where('sessionId', '==', sessionId).limit(20).get();
      const ready = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((item: any) => item.status === 'ready' && item.accessCode === accessCode && item.videoStoragePath)
        .sort((left: any, right: any) => String(right.completedAt || right.updatedAt).localeCompare(String(left.completedAt || left.updatedAt)))[0];
      if (ready) {
        job = ready;
        jobId = ready.id;
      }
    }
  } else {
    if (jobId) job = getMockStore().sessions.get(`video_test_${jobId}`);
  }

  if (!job || job.status !== 'ready' || job.accessCode !== accessCode || job.sessionId !== sessionId || !job.videoStoragePath) {
    return NextResponse.json({ success: false, status: 'processing', error: 'The completed video is not ready yet.' }, { status: 404 });
  }

  const queueId = `live_${sessionId}`;
  const queue = db
    ? (await db.collection('liveQueue').doc(queueId).get()).data()
    : getMockStore().liveQueue.find((item) => item.id === queueId);

  return NextResponse.json({
    success: true,
    status: 'ready',
    jobId,
    videoUrl: await getSignedPlaybackUrl(job.videoStoragePath),
    masterImageUrl: session.masterStoragePath ? await getSignedPlaybackUrl(session.masterStoragePath) : access.pass.videoMasterUrl,
    eventId: isEventId(job.eventId) ? job.eventId : access.pass.eventId,
    category: job.category || access.pass.videoMasterCategory || null,
    customerName: access.pass.customerName || null,
    customerLocality: access.pass.customerLocality || null,
    allowGoLive: true,
    catalogueProduct: access.pass.catalogueSku ? {
      sku: access.pass.catalogueSku,
      title: access.pass.catalogueTitle,
      price: access.pass.cataloguePrice,
    } : null,
    queue: queue ? {
      queueId,
      queueNumber: queue.queueNumber || null,
      status: queue.status || 'queued',
    } : null,
  });
}

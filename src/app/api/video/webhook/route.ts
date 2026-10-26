import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getStorageBucket } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { finalizeCompletedVideo, markPassVideoFailed } from '@/lib/maharaja/server';
import { extractVideoUrl } from '@/lib/maharaja/video-test';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeEqual(left: string, right: string) {
  try {
    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId')?.trim() || '';
  const token = req.nextUrl.searchParams.get('token')?.trim() || '';
  const db = getDb();
  if (!db || !getStorageBucket()) return NextResponse.json({ success: false, error: 'Production storage unavailable.' }, { status: 503 });
  if (!jobId || !token) return NextResponse.json({ success: false, error: 'Invalid webhook.' }, { status: 401 });

  const jobRef = db.collection('videoTestJobs').doc(jobId);
  const snapshot = await jobRef.get();
  const job = snapshot.data();
  const suppliedHash = crypto.createHash('sha256').update(token).digest('hex');
  if (!job || !safeEqual(suppliedHash, String(job.webhookTokenHash || ''))) {
    return NextResponse.json({ success: false, error: 'Invalid webhook.' }, { status: 401 });
  }
  if (job.status === 'ready') return NextResponse.json({ success: true, status: 'ready' });

  const body = await req.json().catch(() => null);
  const providerRequestId = body?.request_id || body?.requestId;
  if (providerRequestId && job.requestId && providerRequestId !== job.requestId) {
    return NextResponse.json({ success: false, error: 'Webhook request mismatch.' }, { status: 409 });
  }
  if (body?.status === 'ERROR' || body?.error) {
    await jobRef.set({ status: 'failed', error: 'Fal video generation failed.', updatedAt: new Date().toISOString() }, { merge: true });
    await db.collection('sessions').doc(job.sessionId).set({ activeVideoTestJobId: null }, { merge: true });
    const passCode = String(job.passCode || job.accessCode || '');
    if (passCode) await markPassVideoFailed(passCode, jobId);
    return NextResponse.json({ success: true, status: 'failed' });
  }

  const remoteVideoUrl = extractVideoUrl(body?.payload || body?.data || body);
  if (!remoteVideoUrl) return NextResponse.json({ success: false, error: 'Webhook has no video result.' }, { status: 422 });

  // Save the completed provider result before local post-processing so a
  // transient branding failure can be recovered without a second paid render.
  await jobRef.set({
    providerVideoUrl: remoteVideoUrl,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  const leaseUntil = Date.now() + 2 * 60 * 1000;
  const claimed = await db.runTransaction(async (transaction) => {
    const fresh = (await transaction.get(jobRef)).data();
    if (!fresh || fresh.status === 'ready') return false;
    if (fresh.status === 'finalizing' && Number(fresh.finalizationLeaseUntil || 0) > Date.now()) return false;
    transaction.set(jobRef, {
      status: 'finalizing',
      finalizationLeaseUntil: leaseUntil,
      finalizationStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  });
  if (!claimed) return NextResponse.json({ success: true, status: 'processing' });

  try {
    const mediaResponse = await fetch(remoteVideoUrl, { cache: 'no-store' });
    if (!mediaResponse.ok || !(mediaResponse.headers.get('content-type') || '').startsWith('video/')) {
      throw new Error('Fal webhook video could not be downloaded safely.');
    }
    const providerBytes = Buffer.from(await mediaResponse.arrayBuffer());
    const finalized = await finalizeCompletedVideo({
      sessionId: job.sessionId,
      jobId,
      videoBuffer: providerBytes,
      provider: job.modelId || 'minimax/h3-max/reference-to-video',
      accessCode: String(job.passCode || job.accessCode || ''),
      clientId: MAHARAJA_CLIENT_ID,
      eventId: job.eventId || 'diwali',
    });
    if (!finalized.success) throw new Error(finalized.error);
    const nowIso = new Date().toISOString();
    await Promise.all([
      jobRef.set({
        status: 'ready',
        videoStoragePath: finalized.storagePath,
        liveVideoStoragePath: finalized.liveStoragePath || null,
        providerVideoUrl: remoteVideoUrl,
        finalizationLeaseUntil: null,
        completedAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true }),
      db.collection('sessions').doc(job.sessionId).set({
        activeVideoTestJobId: null,
        latestReadyVideoTestJobId: jobId,
        videoStatus: 'ready',
        videoStoragePath: finalized.storagePath,
        liveVideoStoragePath: finalized.liveStoragePath || null,
        updatedAt: nowIso,
      }, { merge: true }),
    ]);
    return NextResponse.json({ success: true, status: 'ready' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video finalization failed.';
    await jobRef.set({ status: 'post_processing_failed', error: message, finalizationLeaseUntil: null, updatedAt: new Date().toISOString() }, { merge: true });
    // Keep the paid provider render attached to the session. Refresh/polling can
    // retry local branding and storage without submitting another Fal request.
    await db.collection('sessions').doc(job.sessionId).set({ activeVideoTestJobId: jobId }, { merge: true });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

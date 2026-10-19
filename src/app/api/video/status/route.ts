import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';
import { extractVideoUrl, publicFalQueueUrl } from '@/lib/maharaja/video-test';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function falGet(url: string, falKey: string) {
  const safeUrl = publicFalQueueUrl(url);
  if (!safeUrl) throw new Error('Stored Fal queue URL is invalid.');
  const response = await fetch(safeUrl, { headers: { Authorization: `Key ${falKey}`, Accept: 'application/json' }, cache: 'no-store' });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data?.detail || data?.error || data);
    throw new Error(`Fal queue failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  return data;
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId')?.trim() || '';
  const accessCode = req.nextUrl.searchParams.get('accessCode')?.trim() || '';
  if (!jobId || !accessCode) return NextResponse.json({ success: false, error: 'jobId and accessCode are required.' }, { status: 400 });

  const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
  if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: 401 });
  const db = getDb();
  const job = db
    ? (await db.collection('videoTestJobs').doc(jobId).get()).data()
    : getMockStore().sessions.get(`video_test_${jobId}`);
  if (!job || job.accessCode !== accessCode) return NextResponse.json({ success: false, error: 'Video test job not found.' }, { status: 404 });

  if (job.status === 'ready') {
    const videoUrl = job.videoStoragePath ? await getSignedPlaybackUrl(job.videoStoragePath) : job.videoUrl;
    return NextResponse.json({ success: true, status: 'ready', jobId, modelId: job.modelId, videoUrl, inputMetadata: job.inputMetadata });
  }
  const recoverablePostProcessFailure = job.status === 'failed'
    && typeof job.error === 'string'
    && job.error.includes('FFmpeg binary')
    && job.responseUrl;
  if (job.status === 'failed' && !recoverablePostProcessFailure) {
    return NextResponse.json({ success: false, status: 'failed', jobId, error: job.error || 'Video test failed.' }, { status: 422 });
  }

  const falKey = process.env.FAL_KEY?.trim();
  if (!falKey) return NextResponse.json({ success: false, status: 'failed', error: 'FAL_KEY is not configured.' }, { status: 503 });

  try {
    const providerStatus = await falGet(job.statusUrl, falKey);
    const state = String(providerStatus?.status || '').toUpperCase();
    if (state === 'IN_QUEUE' || state === 'IN_PROGRESS') {
      const update = { status: 'processing', providerStatus: state, updatedAt: new Date().toISOString() };
      if (db) await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
      else getMockStore().sessions.set(`video_test_${jobId}`, { ...job, ...update });
      return NextResponse.json({ success: true, status: 'processing', jobId, providerStatus: state });
    }
    if (state !== 'COMPLETED') throw new Error(`Fal returned terminal status ${state || 'UNKNOWN'}.`);

    const result = await falGet(job.responseUrl, falKey);
    const remoteVideoUrl = extractVideoUrl(result);
    if (!remoteVideoUrl) throw new Error('Fal completed the request without a playable video URL.');
    const videoResponse = await fetch(remoteVideoUrl, { cache: 'no-store' });
    if (!videoResponse.ok) throw new Error(`Generated video download failed (${videoResponse.status}).`);
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    if (!contentType.startsWith('video/')) throw new Error(`Provider output is not a video (${contentType}).`);
    const providerBytes = Buffer.from(await videoResponse.arrayBuffer());
    if (providerBytes.length < 10_000) throw new Error('Generated video file is unexpectedly small.');
    const bytes = providerBytes;
    const storagePath = `clients/${MAHARAJA_CLIENT_ID}/sessions/${job.sessionId}/video-tests/${jobId}/output.mp4`;
    const bucket = getStorageBucket();
    if (!bucket) throw new Error('Firebase Storage is unavailable for the completed test video.');
    await bucket.file(storagePath).save(bytes, { contentType: 'video/mp4', resumable: false });
    const update = {
      status: 'ready', providerStatus: state, videoStoragePath: storagePath,
      providerVideoUrl: remoteVideoUrl, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
      await db.collection('sessions').doc(job.sessionId).set({ activeVideoTestJobId: null }, { merge: true });
    } else {
      getMockStore().sessions.set(`video_test_${jobId}`, { ...job, ...update });
      const session = getMockStore().sessions.get(job.sessionId) || {};
      getMockStore().sessions.set(job.sessionId, { ...session, activeVideoTestJobId: null });
    }
    return NextResponse.json({ success: true, status: 'ready', jobId, modelId: job.modelId, videoUrl: await getSignedPlaybackUrl(storagePath), inputMetadata: job.inputMetadata });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video test failed.';
    const update = { status: 'failed', error: message, updatedAt: new Date().toISOString() };
    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
      await db.collection('sessions').doc(job.sessionId).set({ activeVideoTestJobId: null }, { merge: true });
    } else {
      getMockStore().sessions.set(`video_test_${jobId}`, { ...job, ...update });
    }
    return NextResponse.json({ success: false, status: 'failed', jobId, error: message }, { status: 422 });
  }
}

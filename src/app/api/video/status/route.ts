import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { finalizeCompletedVideo, logMaharajaActivity, verifyMaharajaAccess } from '@/lib/maharaja/server';
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

async function waveSpeedGet(url: string, waveSpeedKey: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.wavespeed.ai' || !parsed.pathname.startsWith('/api/v3/predictions/')) {
    throw new Error('Stored WaveSpeed prediction URL is invalid.');
  }
  const response = await fetch(parsed, { headers: { Authorization: `Bearer ${waveSpeedKey}`, Accept: 'application/json' }, cache: 'no-store' });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(`WaveSpeed queue failed (${response.status}): ${typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500)}`);
  if (data?.code && data.code !== 200 && data.code !== 0) {
    throw new Error(`WaveSpeed queue error (${data.code}): ${data.message || data.error || raw.slice(0, 500)}`);
  }
  return data?.data || data;
}

function providerFailure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Video generation failed.';
  const statusMatch = message.match(/\((4\d\d|5\d\d)\)/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : null;
  return {
    message,
    providerStatusCode: statusCode,
    retryable: statusCode === null || statusCode >= 500 || statusCode === 429,
  };
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
  if (job.status === 'finalizing' && Number(job.finalizationLeaseUntil || 0) > Date.now()) {
    return NextResponse.json({ success: true, status: 'processing', providerStatus: 'FINALIZING', jobId });
  }
  if (job.status === 'failed') {
    return NextResponse.json({ success: false, status: 'failed', jobId, error: job.error || 'Video test failed.' }, { status: 422 });
  }

  const providerName = job.providerName === 'wavespeed' ? 'wavespeed' : 'fal';
  const falKey = process.env.FAL_KEY?.trim();
  const waveSpeedKey = process.env.WAVESPEED_API_KEY?.trim();
  if (providerName === 'fal' && !falKey) return NextResponse.json({ success: false, status: 'failed', error: 'Video provider is temporarily unavailable.' }, { status: 503 });
  if (providerName === 'wavespeed' && !waveSpeedKey) return NextResponse.json({ success: false, status: 'failed', error: 'Video provider is temporarily unavailable.' }, { status: 503 });

  let remoteVideoUrl = '';
  try {
    const providerStatus = providerName === 'wavespeed'
      ? await waveSpeedGet(job.statusUrl, waveSpeedKey!)
      : await falGet(job.statusUrl, falKey!);
    const state = String(providerStatus?.status || '').toUpperCase();
    const isCompleted = state === 'COMPLETED' || state === 'SUCCEEDED';
    const isTerminalFailure = ['FAILED', 'CANCELLED', 'TIMEOUT', 'DELETED', 'ERROR'].includes(state)
      || (typeof providerStatus?.error === 'string' && providerStatus.error.trim().length > 0);

    if (!isCompleted && !isTerminalFailure) {
      const activeState = state || 'PROCESSING';
      const update = { status: 'processing', providerStatus: activeState, updatedAt: new Date().toISOString() };
      if (db) await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
      else getMockStore().sessions.set(`video_test_${jobId}`, { ...job, ...update });
      return NextResponse.json({ success: true, status: 'processing', jobId, providerStatus: activeState });
    }

    if (isTerminalFailure) {
      const providerError = typeof providerStatus?.error === 'string'
        ? providerStatus.error
        : typeof providerStatus?.message === 'string'
          ? providerStatus.message
          : typeof providerStatus?.detail === 'string'
            ? providerStatus.detail
            : '';
      const failureMessage = providerError
        ? `${providerName === 'wavespeed' ? 'WaveSpeed' : 'Fal'} error: ${providerError.slice(0, 500)}`
        : `${providerName === 'wavespeed' ? 'WaveSpeed' : 'Fal'} returned terminal status ${state || 'UNKNOWN'}.`;
      throw new Error(failureMessage);
    }

    const leaseUntil = Date.now() + 2 * 60 * 1000;
    if (db) {
      const claimed = await db.runTransaction(async (transaction) => {
        const ref = db.collection('videoTestJobs').doc(jobId);
        const snapshot = await transaction.get(ref);
        const current = snapshot.data();
        if (!current || current.accessCode !== accessCode) return false;
        if (current.status === 'ready') return false;
        if (current.status === 'finalizing' && Number(current.finalizationLeaseUntil || 0) > Date.now()) return false;
        transaction.set(ref, {
          status: 'finalizing',
          finalizationLeaseUntil: leaseUntil,
          finalizationStartedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        return true;
      });
      if (!claimed) {
        return NextResponse.json({ success: true, status: 'processing', providerStatus: 'FINALIZING', jobId });
      }
    } else {
      const current = getMockStore().sessions.get(`video_test_${jobId}`);
      if (current?.status === 'ready' || (current?.status === 'finalizing' && Number(current.finalizationLeaseUntil || 0) > Date.now())) {
        return NextResponse.json({ success: true, status: current.status === 'ready' ? 'ready' : 'processing', providerStatus: 'FINALIZING', jobId });
      }
      getMockStore().sessions.set(`video_test_${jobId}`, { ...current, status: 'finalizing', finalizationLeaseUntil: leaseUntil });
    }

    const result = providerName === 'wavespeed'
      ? providerStatus
      : await falGet(job.responseUrl, falKey!);
    remoteVideoUrl = extractVideoUrl(result);
    if (!remoteVideoUrl) throw new Error(`${providerName === 'wavespeed' ? 'WaveSpeed' : 'Fal'} completed the request without a playable video URL.`);

    // Persist the provider result before local branding. A deployment problem
    // must never require another paid provider generation to recover the video.
    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set({
        providerVideoUrl: remoteVideoUrl,
        providerStatus: state,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
    const videoResponse = await fetch(remoteVideoUrl, { cache: 'no-store' });
    if (!videoResponse.ok) throw new Error(`Generated video download failed (${videoResponse.status}).`);
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    if (!contentType.startsWith('video/')) throw new Error(`Provider output is not a video (${contentType}).`);
    const providerBytes = Buffer.from(await videoResponse.arrayBuffer());
    if (providerBytes.length < 10_000) throw new Error('Generated video file is unexpectedly small.');
    const finalized = await finalizeCompletedVideo({
      sessionId: job.sessionId,
      jobId,
      videoBuffer: providerBytes,
      provider: job.modelId || 'minimax/h3-max/reference-to-video',
      accessCode,
      clientId: MAHARAJA_CLIENT_ID,
      eventId: job.eventId || 'diwali',
    });
    if (!finalized.success) throw new Error(finalized.error);
    const update = {
      status: 'ready', providerStatus: state, videoStoragePath: finalized.storagePath,
      liveVideoStoragePath: finalized.liveStoragePath || null,
      providerVideoUrl: remoteVideoUrl, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      finalizationLeaseUntil: null,
    };
    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
      await db.collection('sessions').doc(job.sessionId).set({
        activeVideoTestJobId: null,
        latestReadyVideoTestJobId: jobId,
        videoStatus: 'ready',
        videoStoragePath: finalized.storagePath,
        liveVideoStoragePath: finalized.liveStoragePath || null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } else {
      getMockStore().sessions.set(`video_test_${jobId}`, { ...job, ...update });
      const session = getMockStore().sessions.get(job.sessionId) || {};
      getMockStore().sessions.set(job.sessionId, { ...session, activeVideoTestJobId: null });
    }
    return NextResponse.json({ success: true, status: 'ready', jobId, modelId: job.modelId, videoUrl: await getSignedPlaybackUrl(finalized.storagePath), inputMetadata: job.inputMetadata });
  } catch (error) {
    const failure = providerFailure(error);
    const isPostProcessingFailure = failure.message.startsWith('Video branding validation failed:')
      || failure.message.startsWith('Final video storage failed:');
    const isUnknown = !isPostProcessingFailure && (failure.providerStatusCode === null || failure.providerStatusCode >= 500 || failure.providerStatusCode === 429);
    const update = {
      status: isPostProcessingFailure ? 'post_processing_failed' : isUnknown ? 'unknown' : 'failed',
      error: failure.message,
      ...(remoteVideoUrl ? { providerVideoUrl: remoteVideoUrl } : {}),
      providerStatusCode: failure.providerStatusCode,
      retryable: failure.retryable,
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
      await db.collection('sessions').doc(job.sessionId).set({
        // A completed provider render with a local branding failure is still
        // recoverable. Keep it attached to the session for refresh recovery.
        activeVideoTestJobId: isUnknown || isPostProcessingFailure ? jobId : null,
      }, { merge: true });
    } else {
      getMockStore().sessions.set(`video_test_${jobId}`, { ...job, ...update });
    }
    await logMaharajaActivity('video', 'AI Video generation stopped', {
      sessionId: job.sessionId,
      jobId,
      providerStatusCode: failure.providerStatusCode,
      retryable: failure.retryable,
    });
    return NextResponse.json({
      success: false,
      status: isUnknown ? 'unknown' : 'failed',
      jobId,
      error: failure.message,
      retryable: failure.retryable,
    }, { status: isUnknown ? 503 : 422 });
  }
}

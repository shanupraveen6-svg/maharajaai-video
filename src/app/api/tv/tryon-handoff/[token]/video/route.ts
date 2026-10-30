import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl } from '@/lib/firebase/admin';
import { finalizeCompletedVideo } from '@/lib/maharaja/server';
import { extractVideoUrl, publicFalQueueUrl } from '@/lib/maharaja/video-test';
import { activeClientId, liveScreenId } from '@/lib/maharaja/client-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;


async function falGet(url: string, falKey: string) {
  const safeUrl = publicFalQueueUrl(url);
  if (!safeUrl) throw new Error('Stored Fal queue URL is invalid.');
  const response = await fetch(safeUrl, {
    headers: { Authorization: `Key ${falKey}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (!response.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data?.detail || data?.error || data);
    throw new Error(`Fal queue failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  return data;
}

// New festival videos start from POST ../pass, which issues a credit-checked customer pass.
// This route only finishes jobs that were already rendering before that change.
export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const jobId = req.nextUrl.searchParams.get('jobId')?.trim();
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId is required.' }, { status: 400 });
    }

    const db = getDb();
    const job = db
      ? (await db.collection('videoTestJobs').doc(jobId).get()).data()
      : getMockStore().sessions.get(`video_test_${jobId}`);

    if (!job || job.token !== token) {
      return NextResponse.json({ success: false, error: 'Video task not found.' }, { status: 404 });
    }

    if (job.status === 'ready') {
      const videoUrl = job.videoStoragePath ? await getSignedPlaybackUrl(job.videoStoragePath) : job.videoUrl;
      return NextResponse.json({
        success: true,
        status: 'ready',
        jobId,
        videoUrl,
        downloadUrl: videoUrl,
        liveDisplayConsented: true,
        liveQueueStatus: job.liveQueueStatus || 'queued',
      });
    }

    if (job.status === 'failed') {
      return NextResponse.json({
        success: false,
        status: 'failed',
        jobId,
        error: job.error || 'Video generation failed. Tap Retry Video to recreate with fail-proof motion.',
      }, { status: 422 });
    }

    const falKey = process.env.FAL_KEY?.trim();
    if (!falKey || !job.statusUrl) {
      return NextResponse.json({ success: true, status: job.status || 'processing', jobId });
    }

    // Check Fal queue status
    const providerStatus = await falGet(job.statusUrl, falKey);
    const state = String(providerStatus?.status || '').toUpperCase();
    const isCompleted = state === 'COMPLETED' || state === 'SUCCEEDED';
    const isTerminalFailure = ['FAILED', 'CANCELLED', 'TIMEOUT', 'DELETED', 'ERROR'].includes(state);

    if (isTerminalFailure) {
      const failureMsg = providerStatus?.error || 'Video rendering was interrupted.';
      const update = { status: 'failed', error: failureMsg, updatedAt: new Date().toISOString() };
      if (db) await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
      else getMockStore().sessions.set(`video_test_${jobId}`, { ...job, ...update });
      return NextResponse.json({ success: false, status: 'failed', error: failureMsg });
    }

    if (!isCompleted) {
      return NextResponse.json({ success: true, status: 'processing', jobId, providerStatus: state });
    }

    // Finalize completed video
    const result = await falGet(job.responseUrl, falKey);
    const remoteVideoUrl = extractVideoUrl(result);
    if (!remoteVideoUrl) {
      throw new Error('Fal completed request without a playable video URL.');
    }

    const finalized = await finalizeCompletedVideo({
      sessionId: job.sessionId,
      jobId,
      outputVideoUrl: remoteVideoUrl,
      clientId: activeClientId(),
      eventId: 'diwali',
    });

    if (!finalized.success) {
      throw new Error(finalized.error);
    }

    // Finding 8: Actual TV Showroom Queue Publishing
    let liveQueueStatus = 'not_consented';
    if (job.consentGoLive === true) {
      liveQueueStatus = 'queued';
      const queueId = `live_${job.sessionId}`;
      const now = new Date();
      const queueData = {
        id: queueId,
        screenId: liveScreenId(),
        videoId: `video_${job.sessionId}`,
        videoJobId: jobId,
        videoUrl: finalized.liveStoragePath || finalized.storagePath,
        sessionId: job.sessionId,
        accessCode: 'tryon-mobile',
        eventId: 'diwali',
        status: 'queued',
        priority: 100,
        repeatCount: 2,
        timesPlayed: 0,
        playAtMs: now.getTime(),
        createdAt: now.toISOString(),
        consentVersion: '2026-10-tv-golive-v1',
        liveConsent: true,
        loopConsent: true,
      };

      if (db) {
        await db.collection('clientWorkspaces').doc(activeClientId()).collection('liveQueue').doc(queueId).set(queueData, { merge: true });
      } else {
        getMockStore().sessions.set(`live_queue_${queueId}`, queueData);
      }
    }

    const update = {
      status: 'ready',
      videoStoragePath: finalized.storagePath,
      liveVideoStoragePath: finalized.liveStoragePath || null,
      videoUrl: finalized.videoUrl,
      liveQueueStatus,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
    } else {
      const updated = { ...job, ...update };
      getMockStore().sessions.set(`video_test_${jobId}`, updated);
      getMockStore().sessions.set(`video_test_${job.sessionId}`, updated);
    }

    return NextResponse.json({
      success: true,
      status: 'ready',
      jobId,
      videoUrl: finalized.videoUrl,
      downloadUrl: finalized.videoUrl,
      liveDisplayConsented: true,
      liveQueueStatus,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error checking video status.',
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { ENFORCE_REPEAT_LIMITS } from '@/lib/maharaja/config';
import { finalizeCompletedVideo, getCampaignEntitlementForPass, getCustomerServiceAllowances, getVideoPass, markPassVideoFailed, markPassVideoReady, verifyMaharajaAccess } from '@/lib/maharaja/server';

export const maxDuration = 300;
const FAL_VIDEO_MODEL = 'minimax/h3-max/reference-to-video';

function isFalQueueUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'fal.run' || hostname.endsWith('.fal.run');
  } catch {
    return false;
  }
}

async function fetchFalQueueJson(url: string, falKey: string) {
  if (!isFalQueueUrl(url)) throw new Error('Stored Fal.ai queue URL is invalid.');
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Key ${falKey.trim()}`,
      Accept: 'application/json',
    },
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
    const detail = typeof data === 'string'
      ? data
      : data?.detail || data?.error || data?.message || JSON.stringify(data || {});
    throw new Error(`Fal.ai queue request failed (${response.status}): ${detail}`);
  }
  return data;
}

async function markVideoFailed(db: any, sessionId: string, message: string, accessCode?: string | null, jobId?: string | null) {
  if (!sessionId) return;
  const nowIso = new Date().toISOString();
  if (db) {
    await db.collection('sessions').doc(sessionId).set({
      videoStatus: 'failed',
      videoError: message,
      updatedAt: nowIso
    }, { merge: true });
  } else {
    const mockStore = getMockStore();
    const existing = mockStore.sessions.get(sessionId) || {};
    mockStore.sessions.set(sessionId, {
      ...existing,
      videoStatus: 'failed',
      videoError: message,
      updatedAt: nowIso
    });
  }

  if (accessCode) {
    try {
      await markPassVideoFailed(accessCode, jobId || undefined);
      console.log(`Reopened video slot for pass ${accessCode} following failed render.`);
    } catch (passErr) {
      console.warn('Could not reset failed pass video state:', passErr);
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let jobId = searchParams.get('jobId')?.trim() || null;
    const sessionId = searchParams.get('sessionId')?.trim() || null;
    const accessCode = searchParams.get('accessCode')?.trim() || null;
    const queryRequestId = searchParams.get('requestId')?.trim() || null;
    const queryModel = searchParams.get('model')?.trim() || null;

    if (!accessCode) {
      return NextResponse.json(
        { success: false, error: 'accessCode parameter is required.' },
        { status: 401 }
      );
    }

    if (!jobId && !sessionId) {
      return NextResponse.json(
        { success: false, error: 'jobId or sessionId parameter is required.' },
        { status: 400 }
      );
    }

    let targetSessionId = sessionId || '';
    const db = getDb();
    
    let videoUrl: string | null = null;
    let liveVideoUrl: string | null = null;
    let masterImageUrl: string | null = null;
    let status: string = 'processing';
    let requestId: string | null = queryRequestId;
    let providerStatusUrl: string | null = null;
    let providerResponseUrl: string | null = null;
    let provider: string | null = null;
    let providerModel: string = queryModel || FAL_VIDEO_MODEL;
    let eventId = 'diwali';
    let clientId: string | null = null;
    let category: string | null = null;

    if (db) {
      // 1. Fetch Session Doc first
      if (targetSessionId) {
        const sessionDoc = await db.collection('sessions').doc(targetSessionId).get();
        if (sessionDoc.exists) {
          const sData = sessionDoc.data();
          eventId = sData?.eventId || eventId;
          clientId = sData?.clientId || clientId;
          masterImageUrl = sData?.masterImageUrl || masterImageUrl;
          category = sData?.templateId || category;

          // Cross-validate that requested jobId belongs to this session
          if (jobId && sData?.jobId && sData.jobId !== jobId) {
            return NextResponse.json({ success: false, error: 'The specified jobId does not belong to this sessionId.' }, { status: 400 });
          }
          // Cross-validate that caller-supplied accessCode belongs to this session
          if (sData?.accessCode && sData.accessCode !== accessCode) {
            return NextResponse.json({ success: false, error: 'The specified accessCode does not match this session.' }, { status: 403 });
          }

          if (sData?.videoStatus === 'failed') {
            return NextResponse.json({
              success: false,
              jobId: jobId || sData?.jobId || null,
              sessionId: targetSessionId,
              status: 'failed',
              masterImageUrl,
              error: sData?.videoError || 'Video generation failed.'
            }, { status: 500 });
          }
          if (sData?.videoStatus === 'ready' || sData?.videoStatus === 'succeeded') {
            if (sData?.videoUrl && sData?.videoStoragePath) {
              videoUrl = await getSignedPlaybackUrl(sData.videoStoragePath).catch(() => sData.videoUrl);
              liveVideoUrl = sData?.liveVideoStoragePath
                ? await getSignedPlaybackUrl(sData.liveVideoStoragePath).catch(() => sData?.liveVideoUrl || videoUrl)
                : sData?.liveVideoUrl || liveVideoUrl;
              status = 'ready';
            }
          }
          if (!jobId && sData?.jobId) {
            jobId = sData.jobId;
          }
          if (sData?.provider) {
            provider = sData.provider;
          }
          if (typeof sData?.model === 'string') providerModel = sData.model;
        }
      }

      // 2. Fetch the generation job document to retrieve its Fal request ID.
      if (jobId) {
        const jobDoc = await db.collection('generationJobs').doc(jobId).get();
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          requestId = jobData?.requestId || null;
          providerStatusUrl = jobData?.statusUrl || null;
          providerResponseUrl = jobData?.responseUrl || null;
          provider = jobData?.provider || provider;
          if (typeof jobData?.model === 'string') providerModel = jobData.model;

          // Cross-validate that requested sessionId belongs to this job
          if (targetSessionId && jobData?.sessionId && jobData.sessionId !== targetSessionId) {
            return NextResponse.json({ success: false, error: 'The specified sessionId does not belong to this jobId.' }, { status: 400 });
          }
          if (jobData?.accessCode && jobData.accessCode !== accessCode) {
            return NextResponse.json({ success: false, error: 'The specified accessCode does not match this job.' }, { status: 403 });
          }

          if (!targetSessionId && jobData?.sessionId) {
            targetSessionId = jobData.sessionId;
          }
        }
      }
    } else {
      const mockStore = getMockStore();
      if (targetSessionId) {
        const session = mockStore.sessions.get(targetSessionId);
        if (session) {
          eventId = session.eventId || eventId;
          clientId = session.clientId || clientId;
          masterImageUrl = session.masterImageUrl || masterImageUrl;
          category = session.templateId || category;

          if (jobId && session.jobId && session.jobId !== jobId) {
            return NextResponse.json({ success: false, error: 'The specified jobId does not belong to this sessionId.' }, { status: 400 });
          }
          if (session.accessCode && session.accessCode !== accessCode) {
            return NextResponse.json({ success: false, error: 'The specified accessCode does not match this session.' }, { status: 403 });
          }

          if (session.videoStatus === 'failed') {
            return NextResponse.json({
              success: false,
              jobId: jobId || session.jobId || null,
              sessionId: targetSessionId,
              status: 'failed',
              masterImageUrl,
              error: session.videoError || 'Video generation failed.'
            }, { status: 500 });
          }
          if (session.videoStatus === 'ready' || session.videoStatus === 'succeeded') {
            if (session.videoUrl) {
              videoUrl = session.videoUrl;
              liveVideoUrl = session.liveVideoUrl || liveVideoUrl;
              status = 'ready';
            }
          }
          if (!jobId && session.jobId) jobId = session.jobId;
          provider = session.provider || null;
          if (typeof session.model === 'string') providerModel = session.model;
        }
      }

      if (jobId) {
        const jobData = mockStore.sessions.get(jobId) || mockStore.sessions.get(`job_${jobId}`);
        if (jobData) {
          if (targetSessionId && jobData.sessionId && jobData.sessionId !== targetSessionId) {
            return NextResponse.json({ success: false, error: 'The specified sessionId does not belong to this jobId.' }, { status: 400 });
          }
          if (jobData.accessCode && jobData.accessCode !== accessCode) {
            return NextResponse.json({ success: false, error: 'The specified accessCode does not match this job.' }, { status: 403 });
          }

          requestId = jobData.requestId || null;
          providerStatusUrl = jobData.statusUrl || null;
          providerResponseUrl = jobData.responseUrl || null;
          provider = jobData.provider || provider;
          if (typeof jobData.model === 'string') providerModel = jobData.model;
          if (!targetSessionId && jobData.sessionId) {
            targetSessionId = jobData.sessionId;
          }
        }
      }
    }

    // Verify customer pass access before generating/returning signed media URLs
    const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
    if (!access.allowed && access.error !== 'This AI Video has been completed.') {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }

    // =====================================================
    // Fal.ai MiniMax H3 Max Turbo queue polling.
    // =====================================================
    if ((provider === 'fal-h3-max-turbo' || requestId) && status === 'processing') {
      const falKey = AI_CONFIG.FAL_KEY;
      if (!falKey || !requestId) {
        const message = !falKey ? 'Fal.ai video service is not configured.' : 'Video provider request ID is missing.';
        await markVideoFailed(db, targetSessionId, message, accessCode, jobId);
        return NextResponse.json({ success: false, jobId, sessionId: targetSessionId, status: 'failed', error: message }, { status: 500 });
      }
      if (falKey && requestId) {
        try {
          const { fal } = await import('@fal-ai/client');
          fal.config({ credentials: falKey.trim() });
          console.log('STATUS_POLL', { sessionId: targetSessionId, jobId, requestId });

          const queueStatus: any = providerStatusUrl
            ? await fetchFalQueueJson(providerStatusUrl, falKey)
            : await fal.queue.status(providerModel, {
                requestId,
                logs: false
              });
          const queueState = String((queueStatus as { status?: string }).status || '');
          const queuePosition = queueState === 'IN_QUEUE'
            ? Number((queueStatus as { queue_position?: number }).queue_position ?? 0)
            : null;

          if (queueState === 'COMPLETED') {
            const falResult: any = providerResponseUrl
              ? await fetchFalQueueJson(providerResponseUrl, falKey)
              : await fal.queue.result(providerModel, {
                  requestId
                });

            const outputVideoUrl = falResult.data?.video?.url || falResult.video?.url || falResult.data?.video_url || falResult.video_url;
            const outputSeed = falResult.data?.seed ?? falResult.seed ?? null;
            const providerTimings = falResult.data?.timings ?? falResult.timings ?? null;

            if (!outputVideoUrl) {
              const errMessage = 'Fal.ai generation completed but did not return a valid video URL.';
              await markVideoFailed(db, targetSessionId, errMessage, accessCode, jobId);
              return NextResponse.json({
                success: false,
                jobId,
                sessionId: targetSessionId,
                status: 'failed',
                error: errMessage
              }, { status: 500 });
            }
            console.log('RESULT_READY', { sessionId: targetSessionId, jobId, requestId });

            const finalizeResult = await finalizeCompletedVideo({
              sessionId: targetSessionId,
              jobId: jobId || `job_${targetSessionId}`,
              outputVideoUrl,
              accessCode,
              clientId: clientId || undefined,
              eventId,
              provider: provider || providerModel,
            });

            if (!finalizeResult.success) {
              return NextResponse.json({
                success: false,
                jobId,
                sessionId: targetSessionId,
                status: 'failed',
                error: finalizeResult.error,
              }, { status: 503 });
            }

            videoUrl = finalizeResult.videoUrl;
            liveVideoUrl = finalizeResult.liveVideoUrl || finalizeResult.videoUrl;
            status = 'ready';

            const providerResultMetadata = {
              seed: outputSeed,
              providerTimings,
              providerCompletedAt: new Date().toISOString(),
              sourceVideoUrl: outputVideoUrl,
              finalVideoUrl: videoUrl,
            };
            if (db) {
              const writes: Promise<unknown>[] = [
                db.collection('sessions').doc(targetSessionId).set(providerResultMetadata, { merge: true }),
              ];
              if (jobId) writes.push(db.collection('generationJobs').doc(jobId).set(providerResultMetadata, { merge: true }));
              await Promise.all(writes);
            } else {
              const mockStore = getMockStore();
              const existingSession = mockStore.sessions.get(targetSessionId) || {};
              mockStore.sessions.set(targetSessionId, { ...existingSession, ...providerResultMetadata });
              if (jobId) {
                const jobKey = `job_${jobId}`;
                const existingJob = mockStore.sessions.get(jobKey) || {};
                mockStore.sessions.set(jobKey, { ...existingJob, ...providerResultMetadata });
              }
            }

            if (accessCode) {
              await markPassVideoReady(accessCode, jobId || undefined);
            }
            const pass = accessCode ? await getVideoPass(accessCode) : null;
            const entitlement = accessCode ? await getCampaignEntitlementForPass(accessCode) : null;
            const allowances = getCustomerServiceAllowances(entitlement);

            return NextResponse.json({
              success: true,
              jobId,
              sessionId: targetSessionId,
              status: 'ready',
              videoUrl,
              liveVideoUrl,
              masterImageUrl,
              videoId: `video_${targetSessionId}`,
              eventId,
              allowances,
              retryUsed: ENFORCE_REPEAT_LIMITS ? (!!pass?.retryUsed || allowances.video.used >= 2) : false,
              videoDone: !!pass?.videoDone,
            });
          }

          if (queueState === 'IN_PROGRESS' || queueState === 'IN_QUEUE') {
            return NextResponse.json({
              success: true,
              jobId,
              sessionId: targetSessionId,
              status: 'processing',
              queueState,
              queuePosition,
              masterImageUrl,
              eventId,
              message: queueState === 'IN_QUEUE'
                ? `Your video is queued${queuePosition ? ` at position ${queuePosition}` : ''}.`
                : 'MiniMax H3 video rendering in progress...'
            });
          }

          if (queueState === 'FAILED' || queueState === 'ERROR' || queueState === 'CANCELLED') {
            const errMessage = `Video generation ${queueState.toLowerCase()}. Please try again.`;
            console.error('RESULT_FAILED', { sessionId: targetSessionId, jobId, requestId, queueState });
            await markVideoFailed(db, targetSessionId, errMessage, accessCode, jobId);
            return NextResponse.json({
              success: false,
              jobId,
              sessionId: targetSessionId,
              status: 'failed',
              error: errMessage
            }, { status: 500 });
          }

          return NextResponse.json({
            success: true,
            jobId,
            sessionId: targetSessionId,
            status: 'processing',
            masterImageUrl,
            message: `H3 Max queue status: ${queueState || 'processing'}`
          });
        } catch (falPollErr: any) {
          const pollMessage = falPollErr?.message || String(falPollErr);
          console.warn('Fal.ai Queue Polling Warning:', pollMessage);
          if (/\(4\d\d\)|status code: 4\d\d|rejected|unprocessable/i.test(pollMessage)) {
            await markVideoFailed(db, targetSessionId, pollMessage, accessCode, jobId);
            return NextResponse.json({
              success: false,
              jobId,
              sessionId: targetSessionId,
              status: 'failed',
              error: pollMessage,
            }, { status: 422 });
          }
          return NextResponse.json({
            success: true,
            jobId,
            sessionId: targetSessionId,
            status: 'processing',
            masterImageUrl,
            message: 'Fal.ai status check transient network delay, retrying status...'
          });
        }
      }
    }

    if (!videoUrl || (status !== 'ready' && status !== 'succeeded')) {
      return NextResponse.json({
        success: true,
        jobId,
        sessionId: targetSessionId,
        status: 'processing',
        videoUrl: null,
        liveVideoUrl: null,
        masterImageUrl,
        eventId,
      });
    }

    if (accessCode) {
      await markPassVideoReady(accessCode, jobId || undefined);
    }
    const pass = accessCode ? await getVideoPass(accessCode) : null;
    const entitlement = accessCode ? await getCampaignEntitlementForPass(accessCode) : null;
    const allowances = getCustomerServiceAllowances(entitlement);

    return NextResponse.json({
      success: true,
      jobId,
      sessionId: targetSessionId,
      status: 'ready',
      videoUrl,
      liveVideoUrl,
      masterImageUrl,
      videoId: `video_${targetSessionId}`,
      eventId,
      category,
      allowances,
      retryUsed: ENFORCE_REPEAT_LIMITS ? (!!pass?.retryUsed || allowances.video.used >= 2) : false,
      videoDone: !!pass?.videoDone,
    });

  } catch (error: any) {
    console.error('Video Status Route Error:', error);
    return NextResponse.json(
      { success: false, error: `Failed to retrieve video status: ${error instanceof Error ? error.message : 'Unknown error.'}` },
      { status: 500 }
    );
  }
}

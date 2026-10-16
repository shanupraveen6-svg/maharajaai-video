import { NextRequest, NextResponse } from 'next/server';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';

import { getVideoPass, markPassVideoFailed, markPassVideoReady, verifyMaharajaAccess } from '@/lib/maharaja/server';

export const maxDuration = 60;
const FAL_VIDEO_MODEL = 'minimax/h3-max-turbo/image-to-video';

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
    let masterImageUrl: string | null = null;
    let status: string = 'processing';
    let requestId: string | null = null;
    let provider: string | null = null;
    let eventId = 'diwali';
    let clientId: string | null = null;

    if (db) {
      // 1. Fetch Session Doc first
      if (targetSessionId) {
        const sessionDoc = await db.collection('sessions').doc(targetSessionId).get();
        if (sessionDoc.exists) {
          const sData = sessionDoc.data();
          eventId = sData?.eventId || eventId;
          clientId = sData?.clientId || clientId;
          masterImageUrl = sData?.masterImageUrl || masterImageUrl;

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
              videoUrl = sData.videoUrl;
              status = 'ready';
            }
          }
          if (!jobId && sData?.jobId) {
            jobId = sData.jobId;
          }
          if (sData?.provider) {
            provider = sData.provider;
          }
        }
      }

      // 2. Fetch the generation job document to retrieve its Fal request ID.
      if (jobId) {
        const jobDoc = await db.collection('generationJobs').doc(jobId).get();
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          requestId = jobData?.requestId || null;
          provider = jobData?.provider || provider;

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
              status = 'ready';
            }
          }
          if (!jobId && session.jobId) jobId = session.jobId;
          provider = session.provider || null;
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
          provider = jobData.provider || provider;
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

          const queueStatus = await fal.queue.status(FAL_VIDEO_MODEL, {
            requestId,
            logs: false
          });
          const queueState = String((queueStatus as { status?: string }).status || '');
          const queuePosition = queueState === 'IN_QUEUE'
            ? Number((queueStatus as { queue_position?: number }).queue_position ?? 0)
            : null;

          if (queueState === 'COMPLETED') {
            const falResult: any = await fal.queue.result(FAL_VIDEO_MODEL, {
              requestId
            });

            const outputVideoUrl = falResult.data?.video?.url || falResult.video?.url || falResult.data?.video_url || falResult.video_url;

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

            let fileBuffer: Buffer | null = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                const fetchRes = await fetch(outputVideoUrl);
                if (fetchRes.ok) {
                  fileBuffer = Buffer.from(await fetchRes.arrayBuffer());
                  break;
                } else {
                  console.warn(`Fal.ai video download attempt ${attempt} HTTP ${fetchRes.status}`);
                  if (attempt < 3) await new Promise((r) => setTimeout(r, 1200));
                }
              } catch (netErr) {
                console.warn(`Fal.ai video download attempt ${attempt} network warning:`, netErr);
                if (attempt < 3) await new Promise((r) => setTimeout(r, 1200));
              }
            }

            const storagePath = clientId
              ? `clients/${clientId}/sessions/${targetSessionId}/video/final.mp4`
              : `sessions/${targetSessionId}/video/final.mp4`;
            const bucket = getStorageBucket();

            if (bucket && fileBuffer) {
              try {
                const file = bucket.file(storagePath);
                await file.save(fileBuffer, { contentType: 'video/mp4', public: false });
                const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
                videoUrl = signedUrl;
              } catch (stSaveErr) {
                console.warn('Storage save fallback to outputVideoUrl warning:', stSaveErr);
                videoUrl = outputVideoUrl;
              }
            } else {
              videoUrl = outputVideoUrl;
            }

            status = 'ready';

            if (db) {
              await Promise.all([
                db.collection('videos').doc(`video_${targetSessionId}`).set({
                id: `video_${targetSessionId}`,
                sessionId: targetSessionId,
                storagePath,
                status: 'ready',
                provider: 'fal-h3-max-turbo',
                createdAt: new Date().toISOString()
                }, { merge: true }),
                db.collection('sessions').doc(targetSessionId).set({
                videoStatus: 'ready',
                videoUrl,
                videoStoragePath: storagePath,
                updatedAt: new Date().toISOString()
                }, { merge: true }),
              ]);
            }

            if (accessCode) {
              await markPassVideoReady(accessCode, jobId || undefined);
            }
            const pass = accessCode ? await getVideoPass(accessCode) : null;

            return NextResponse.json({
              success: true,
              jobId,
              sessionId: targetSessionId,
              status: 'ready',
              videoUrl,
              masterImageUrl,
              videoId: `video_${targetSessionId}`,
              eventId,
              retryUsed: !!pass?.retryUsed,
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
                : 'MiniMax H3 Max Turbo video rendering in progress...'
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
            message: `H3 Max Turbo queue status: ${queueState || 'processing'}`
          });
        } catch (falPollErr: any) {
          console.warn('Fal.ai Queue Polling Transient Network Warning:', falPollErr?.message || falPollErr);
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
        masterImageUrl,
        eventId,
      });
    }

    if (accessCode) {
      await markPassVideoReady(accessCode, jobId || undefined);
    }
    const pass = accessCode ? await getVideoPass(accessCode) : null;

    return NextResponse.json({
      success: true,
      jobId,
      sessionId: targetSessionId,
      status: 'ready',
      videoUrl,
      masterImageUrl,
      videoId: `video_${targetSessionId}`,
      eventId,
      retryUsed: !!pass?.retryUsed,
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

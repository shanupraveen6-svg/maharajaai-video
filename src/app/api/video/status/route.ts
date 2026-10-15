import { NextRequest, NextResponse } from 'next/server';
import { runQualityAssurance } from '@/lib/ai/gemini';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { GoogleGenAI, GenerateVideosOperation } from '@google/genai';
import fs from 'fs';
import path from 'path';

import { getVideoPass, markPassVideoFailed, markPassVideoReady, verifyMaharajaAccess } from '@/lib/maharaja/server';

export const maxDuration = 60;

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

function getGenAIClient() {
  const apiKey = AI_CONFIG.PRIMARY_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    return null;
  }
}

function formatVeoStatusError(error: any) {
  const raw = error?.message || String(error || 'Unknown Veo error.');
  const lower = raw.toLowerCase();

  if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('free tier')) {
    return 'Veo video quota is exhausted or too low for this 6-second generation. Add/enable paid video quota for the Google AI project before retrying.';
  }

  if (lower.includes('api key') || lower.includes('permission') || lower.includes('unauthenticated')) {
    return 'Gemini/Veo API key is invalid or does not have video generation access. Update GOOGLE_AI_API_KEY_PRIMARY in Vercel with a paid project key that has Veo access.';
  }

  if (lower.includes('safety') || lower.includes('blocked') || lower.includes('policy')) {
    return 'Veo blocked the video generation for policy/safety reasons. Try a calmer prompt or use Proof Mode/manual video upload for this customer.';
  }

  return raw.length > 280 ? `${raw.slice(0, 280)}...` : raw;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let jobId = searchParams.get('jobId')?.trim() || null;
    const sessionId = searchParams.get('sessionId')?.trim() || null;
    const accessCodeParam = searchParams.get('accessCode')?.trim() || null;

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
    let operationName: string | null = null;
    let requestId: string | null = null;
    let provider: string | null = null;
    let eventId = 'diwali';
    let clientId: string | null = null;
    let accessCode: string | null = accessCodeParam;

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
          // Cross-validate that requested accessCode belongs to this session
          if (accessCodeParam && sData?.accessCode && sData.accessCode !== accessCodeParam) {
            return NextResponse.json({ success: false, error: 'The specified accessCode does not match this session.' }, { status: 403 });
          }

          accessCode = sData?.accessCode || accessCode;
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

      // 2. Fetch Generation Job Doc to retrieve operationName / requestId
      if (jobId) {
        const jobDoc = await db.collection('generationJobs').doc(jobId).get();
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          operationName = jobData?.operationName || null;
          requestId = jobData?.requestId || null;
          provider = jobData?.provider || provider;

          // Cross-validate that requested sessionId belongs to this job
          if (targetSessionId && jobData?.sessionId && jobData.sessionId !== targetSessionId) {
            return NextResponse.json({ success: false, error: 'The specified sessionId does not belong to this jobId.' }, { status: 400 });
          }
          if (accessCodeParam && jobData?.accessCode && jobData.accessCode !== accessCodeParam) {
            return NextResponse.json({ success: false, error: 'The specified accessCode does not match this job.' }, { status: 403 });
          }

          accessCode = jobData?.accessCode || accessCode;
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
          if (accessCodeParam && session.accessCode && session.accessCode !== accessCodeParam) {
            return NextResponse.json({ success: false, error: 'The specified accessCode does not match this session.' }, { status: 403 });
          }

          accessCode = session.accessCode || accessCode;
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
          if (accessCodeParam && jobData.accessCode && jobData.accessCode !== accessCodeParam) {
            return NextResponse.json({ success: false, error: 'The specified accessCode does not match this job.' }, { status: 403 });
          }

          requestId = jobData.requestId || null;
          operationName = jobData.operationName || null;
          provider = jobData.provider || provider;
          accessCode = jobData.accessCode || accessCode;
          if (!targetSessionId && jobData.sessionId) {
            targetSessionId = jobData.sessionId;
          }
        }
      }
    }

    // Verify customer pass access before generating/returning signed media URLs
    if (accessCode) {
      const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
      if (!access.allowed && access.error !== 'This AI Video has been completed.') {
        return NextResponse.json({ success: false, error: access.error }, { status: 401 });
      }
    }

    // =====================================================
    // 1. Fal.ai MiniMax Hailuo-02 Queue Polling (Primary)
    // =====================================================
    if (!AI_CONFIG.IS_DEMO_MODE && (provider === 'fal-minimax' || requestId) && status === 'processing') {
      const falKey = AI_CONFIG.FAL_KEY;
      if (falKey && requestId) {
        try {
          const { fal } = await import('@fal-ai/client');
          fal.config({ credentials: falKey.trim() });

          const queueStatus = await fal.queue.status('fal-ai/minimax/hailuo-02/standard/image-to-video', {
            requestId,
            logs: true
          });
          const queueState = String((queueStatus as { status?: string }).status || '');

          if (queueState === 'COMPLETED') {
            const falResult: any = await fal.queue.result('fal-ai/minimax/hailuo-02/standard/image-to-video', {
              requestId
            });

            const outputVideoUrl = falResult.data?.video?.url || falResult.video?.url || falResult.data?.video_url || falResult.video_url;

            if (!outputVideoUrl) {
              const errMessage = 'Fal.ai generation completed but did not return a valid video URL.';
              await markVideoFailed(db, targetSessionId, errMessage, accessCode);
              return NextResponse.json({
                success: false,
                jobId,
                sessionId: targetSessionId,
                status: 'failed',
                error: errMessage
              }, { status: 500 });
            }

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
              await db.collection('videos').doc(`video_${targetSessionId}`).set({
                id: `video_${targetSessionId}`,
                sessionId: targetSessionId,
                storagePath,
                status: 'ready',
                provider: 'fal-minimax',
                createdAt: new Date().toISOString()
              }, { merge: true });

              await db.collection('sessions').doc(targetSessionId).set({
                videoStatus: 'ready',
                videoUrl,
                videoStoragePath: storagePath,
                updatedAt: new Date().toISOString()
              }, { merge: true });
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
              masterImageUrl,
              eventId,
              message: 'MiniMax Hailuo video rendering in progress via Fal.ai...'
            });
          }

          if (queueState === 'FAILED' || queueState === 'ERROR' || queueState === 'CANCELLED') {
            const errMessage = `MiniMax Hailuo generation ${queueState.toLowerCase()}. Stop and review the prompt/image before retrying.`;
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
            message: `MiniMax Hailuo queue status: ${queueState || 'processing'}`
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

    // =====================================================
    // 2. Real Veo Operation Polling via Google (Secondary)
    // =====================================================
    if (!AI_CONFIG.IS_DEMO_MODE && operationName && status === 'processing') {
      const ai = getGenAIClient();
      if (ai) {
        try {
          // Rebuild a real SDK operation object from the stored operation name so the
          // SDK can poll and convert the raw REST response into `generatedVideos`.
          const pendingOperation = new GenerateVideosOperation();
          pendingOperation.name = operationName;

          const operation: any = await ai.operations.getVideosOperation({
            operation: pendingOperation
          });

          if (operation.error) {
            const message = formatVeoStatusError(operation.error);
            await markVideoFailed(db, targetSessionId, message, accessCode, jobId);
            return NextResponse.json({
              success: false,
              jobId,
              sessionId: targetSessionId,
              status: 'failed',
              error: message
            }, { status: 500 });
          }

          if (!operation.done) {
            return NextResponse.json({
              success: true,
              jobId,
              sessionId: targetSessionId,
              status: 'processing',
              message: 'Veo video rendering in progress...'
            });
          }

          // Operation complete: download generated MP4 to temp file or Buffer
          const generatedVideo = operation.response?.generatedVideos?.[0]?.video;
          let fileBuffer: Buffer | null = null;

          if (generatedVideo) {
            if (generatedVideo.videoBytes) {
              fileBuffer = Buffer.from(generatedVideo.videoBytes, 'base64');
            } else if (generatedVideo.uri) {
              const videoUri = generatedVideo.uri;

              try {
                const tempFileName = `veo_${jobId || targetSessionId}_${Date.now()}.mp4`;
                const tempFilePath = path.join('/tmp', tempFileName);

                await ai.files.download({
                  file: generatedVideo as any,
                  downloadPath: tempFilePath
                });

                if (fs.existsSync(tempFilePath)) {
                  fileBuffer = fs.readFileSync(tempFilePath);
                  try { fs.unlinkSync(tempFilePath); } catch (_) {}
                }
              } catch (dlErr: any) {
                console.warn('ai.files.download fallback warning:', dlErr);
              }

              if (!fileBuffer && typeof videoUri === 'string' && videoUri.startsWith('http')) {
                try {
                  const fetchRes = await fetch(videoUri, {
                    headers: {
                      'x-goog-api-key': AI_CONFIG.PRIMARY_API_KEY
                    }
                  });
                  if (fetchRes.ok) {
                    fileBuffer = Buffer.from(await fetchRes.arrayBuffer());
                  } else {
                    console.error(`Direct video fetch failed with status ${fetchRes.status}`);
                  }
                } catch (netErr) {
                  console.error('Direct video fetch network error:', netErr);
                }
              }
            }
          }

          if (!fileBuffer) {
            status = 'failed';
            await markVideoFailed(db, targetSessionId, 'Failed to download generated Veo video output', accessCode, jobId);
            return NextResponse.json({
              success: false,
              jobId,
              sessionId: targetSessionId,
              status: 'failed',
              error: 'Veo video download failed.'
            }, { status: 500 });
          }

          const storagePath = clientId
            ? `clients/${clientId}/sessions/${targetSessionId}/video/final.mp4`
            : `sessions/${targetSessionId}/video/final.mp4`;

          const bucket = getStorageBucket();
          if (!bucket) {
            status = 'failed';
            await markVideoFailed(db, targetSessionId, 'Firebase Storage bucket is required to save generated Veo video output.', accessCode, jobId);
            return NextResponse.json({
              success: false,
              jobId,
              sessionId: targetSessionId,
              status: 'failed',
              error: 'Firebase Storage bucket is required to save generated Veo video output.'
            }, { status: 500 });
          }

          const file = bucket.file(storagePath);
          await file.save(fileBuffer, { contentType: 'video/mp4', public: false });
          const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
          videoUrl = signedUrl;

          status = 'ready';

          // Store in Firestore: videos/video_{sessionId} and update session
          if (db) {
            await db.collection('videos').doc(`video_${targetSessionId}`).set({
              id: `video_${targetSessionId}`,
              sessionId: targetSessionId,
              storagePath,
              status: 'ready',
              createdAt: new Date().toISOString()
            }, { merge: true });

            await db.collection('sessions').doc(targetSessionId).set({
              videoStatus: 'ready',
              videoUrl,
              videoStoragePath: storagePath,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          } else {
            const mockStore = getMockStore();
            mockStore.videos.set(`video_${targetSessionId}`, {
              id: `video_${targetSessionId}`,
              sessionId: targetSessionId,
              storagePath,
              status: 'ready',
              createdAt: new Date().toISOString()
            });
          }
        } catch (opErr: any) {
          console.error('Veo Operation Polling Error:', opErr);
          const message = formatVeoStatusError(opErr);
          await markVideoFailed(db, targetSessionId, message, accessCode, jobId);
          return NextResponse.json({
            success: false,
            jobId,
            sessionId: targetSessionId,
            status: 'failed',
            error: message
          }, { status: 500 });
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

    const qaResult = await runQualityAssurance('', videoUrl);

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
      qaResult,
      eventId,
      retryUsed: !!pass?.retryUsed,
      videoDone: !!pass?.videoDone,
    });

  } catch (error: any) {
    console.error('Video Status Route Error:', error);
    return NextResponse.json(
      { success: false, error: `Failed to retrieve video status: ${formatVeoStatusError(error)}` },
      { status: 500 }
    );
  }
}

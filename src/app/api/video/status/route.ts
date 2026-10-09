import { NextRequest, NextResponse } from 'next/server';
import { runQualityAssurance } from '@/lib/ai/gemini';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { GoogleGenAI, GenerateVideosOperation } from '@google/genai';
import fs from 'fs';
import path from 'path';

async function markVideoFailed(db: any, sessionId: string, message: string) {
  if (!db || !sessionId) return;
  await db.collection('sessions').doc(sessionId).set({
    videoStatus: 'failed',
    videoError: message,
    updatedAt: new Date().toISOString()
  }, { merge: true });
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
    let jobId = searchParams.get('jobId');
    const sessionId = searchParams.get('sessionId');

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

    if (db) {
      // 1. Fetch Session Doc first
      if (targetSessionId) {
        const sessionDoc = await db.collection('sessions').doc(targetSessionId).get();
        if (sessionDoc.exists) {
          const sData = sessionDoc.data();
          masterImageUrl = sData?.masterImageUrl || masterImageUrl;
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
          masterImageUrl = session.masterImageUrl || masterImageUrl;
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
          requestId = jobData.requestId || null;
          operationName = jobData.operationName || null;
          provider = jobData.provider || provider;
        }
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
              await markVideoFailed(db, targetSessionId, errMessage);
              return NextResponse.json({
                success: false,
                jobId,
                sessionId: targetSessionId,
                status: 'failed',
                error: errMessage
              }, { status: 500 });
            }

            let fileBuffer: Buffer | null = null;
            try {
              const fetchRes = await fetch(outputVideoUrl);
              if (fetchRes.ok) {
                fileBuffer = Buffer.from(await fetchRes.arrayBuffer());
              }
            } catch (netErr) {
              console.error('Fal.ai video download network error:', netErr);
            }

            if (!fileBuffer) {
              await markVideoFailed(db, targetSessionId, 'Failed to download generated video output from Fal.ai.');
              return NextResponse.json({
                success: false,
                jobId,
                sessionId: targetSessionId,
                status: 'failed',
                error: 'Failed to download generated video output from Fal.ai.'
              }, { status: 500 });
            }

            const storagePath = `sessions/${targetSessionId}/video/final.mp4`;
            const bucket = getStorageBucket();

            if (bucket) {
              const file = bucket.file(storagePath);
              await file.save(fileBuffer, { contentType: 'video/mp4', public: false });
              const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
              videoUrl = signedUrl;
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

            return NextResponse.json({
              success: true,
              jobId,
              sessionId: targetSessionId,
              status: 'ready',
              videoUrl,
              masterImageUrl,
              videoId: `video_${targetSessionId}`
            });
          }

          if (queueState === 'IN_PROGRESS' || queueState === 'IN_QUEUE') {
            return NextResponse.json({
              success: true,
              jobId,
              sessionId: targetSessionId,
              status: 'processing',
              masterImageUrl,
              message: 'MiniMax Hailuo video rendering in progress via Fal.ai...'
            });
          }

          if (queueState === 'FAILED' || queueState === 'ERROR' || queueState === 'CANCELLED') {
            const errMessage = `MiniMax Hailuo generation ${queueState.toLowerCase()}. Stop and review the prompt/image before retrying.`;
            await markVideoFailed(db, targetSessionId, errMessage);
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
            message: `MiniMax Hailuo queue status: ${queueState || 'processing'}`
          });
        } catch (falPollErr: any) {
          console.error('Fal.ai Queue Polling Error:', falPollErr);
          const rawMessage = falPollErr?.message || 'Fal.ai queue polling failed.';
          await markVideoFailed(db, targetSessionId, rawMessage);
          return NextResponse.json({
            success: false,
            jobId,
            sessionId: targetSessionId,
            status: 'failed',
            error: rawMessage
          }, { status: 500 });
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
            await markVideoFailed(db, targetSessionId, message);
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
            await markVideoFailed(db, targetSessionId, 'Failed to download generated Veo video output');
            return NextResponse.json({
              success: false,
              jobId,
              sessionId: targetSessionId,
              status: 'failed',
              error: 'Veo video download failed.'
            }, { status: 500 });
          }

          const storagePath = `sessions/${targetSessionId}/video/final.mp4`;

          const bucket = getStorageBucket();
          if (!bucket) {
            status = 'failed';
            await markVideoFailed(db, targetSessionId, 'Firebase Storage bucket is required to save generated Veo video output.');
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
              storagePath: `sessions/${targetSessionId}/video/final.mp4`,
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
              storagePath: `sessions/${targetSessionId}/video/final.mp4`,
              status: 'ready',
              createdAt: new Date().toISOString()
            });
          }
        } catch (opErr: any) {
          console.error('Veo Operation Polling Error:', opErr);
          const message = formatVeoStatusError(opErr);
          await markVideoFailed(db, targetSessionId, message);
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
        masterImageUrl
      });
    }

    const qaResult = await runQualityAssurance('', videoUrl);

    return NextResponse.json({
      success: true,
      jobId,
      sessionId: targetSessionId,
      status: 'ready',
      videoUrl,
      masterImageUrl,
      videoId: `video_${targetSessionId}`,
      qaResult
    });

  } catch (error: any) {
    console.error('Video Status Route Error:', error);
    return NextResponse.json(
      { success: false, error: `Failed to retrieve video status: ${formatVeoStatusError(error)}` },
      { status: 500 }
    );
  }
}

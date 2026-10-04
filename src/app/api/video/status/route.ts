import { NextRequest, NextResponse } from 'next/server';
import { runQualityAssurance } from '@/lib/ai/gemini';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

function getGenAIClient() {
  const apiKey = AI_CONFIG.PRIMARY_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    return null;
  }
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
    let status: string = 'processing';
    let operationName: string | null = null;

    if (db) {
      // 1. Fetch Session Doc first
      if (targetSessionId) {
        const sessionDoc = await db.collection('sessions').doc(targetSessionId).get();
        if (sessionDoc.exists) {
          const sData = sessionDoc.data();
          if (sData?.videoStatus === 'ready' || sData?.videoStatus === 'succeeded') {
            if (sData?.videoUrl && sData?.videoStoragePath) {
              videoUrl = sData.videoUrl;
              status = 'ready';
            }
          }
          if (!jobId && sData?.jobId) {
            jobId = sData.jobId;
          }
        }
      }

      // 2. Fetch Generation Job Doc to retrieve operationName
      if (jobId) {
        const jobDoc = await db.collection('generationJobs').doc(jobId).get();
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          operationName = jobData?.operationName || null;
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
          if (session.videoStatus === 'ready' || session.videoStatus === 'succeeded') {
            if (session.videoUrl) {
              videoUrl = session.videoUrl;
              status = 'ready';
            }
          }
          if (!jobId && session.jobId) jobId = session.jobId;
        }
      }
    }


    // Real Veo Operation Polling via Google operations API
    if (!AI_CONFIG.IS_DEMO_MODE && operationName && status === 'processing') {
      const ai = getGenAIClient();
      if (ai) {
        try {
          const operation: any = await (ai.operations as any).getVideosOperation({
            operation: { name: operationName }
          });

          if (!operation.done) {
            return NextResponse.json({
              success: true,
              jobId,
              sessionId: targetSessionId,
              status: 'processing',
              message: 'Veo video rendering in progress...'
            });
          }

          // Operation complete: download generated MP4 to temp file using official ai.files.download({ file: generatedVideo, downloadPath: tempFilePath })
          const generatedVideo = operation.response?.generatedVideos?.[0]?.video;
          let fileBuffer: Buffer | null = null;

          if (generatedVideo) {
            if (generatedVideo.videoBytes) {
              fileBuffer = Buffer.from(generatedVideo.videoBytes, 'base64');
            } else {
              const tempFileName = `veo_${jobId || targetSessionId}_${Date.now()}.mp4`;
              const tempFilePath = path.join('/tmp', tempFileName);

              try {
                // Official @google/genai SDK file download
                await ai.files.download({
                  file: generatedVideo as any,
                  downloadPath: tempFilePath
                });

                if (fs.existsSync(tempFilePath)) {
                  fileBuffer = fs.readFileSync(tempFilePath);
                  try { fs.unlinkSync(tempFilePath); } catch (_) {}
                } else {
                  console.error('Temp MP4 file was not created at:', tempFilePath);
                }
              } catch (dlErr: any) {
                console.error('ai.files.download error:', dlErr);
                if (fs.existsSync(tempFilePath)) {
                  try { fs.unlinkSync(tempFilePath); } catch (_) {}
                }
              }
            }
          }

          if (!fileBuffer) {
            status = 'failed';
            if (db) {
              await db.collection('sessions').doc(targetSessionId).set({
                videoStatus: 'failed',
                videoError: 'Failed to download generated Veo video output',
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
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
          if (bucket) {
            const file = bucket.file(storagePath);
            await file.save(fileBuffer, { contentType: 'video/mp4', public: false });
            const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
            videoUrl = signedUrl;
          } else {
            videoUrl = `data:video/mp4;base64,${fileBuffer.toString('base64')}`;
          }

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
        }
      }
    }

    if (!videoUrl || (status !== 'ready' && status !== 'succeeded')) {
      return NextResponse.json({
        success: true,
        jobId,
        sessionId: targetSessionId,
        status: 'processing',
        videoUrl: null
      });
    }

    const qaResult = await runQualityAssurance('', videoUrl);

    return NextResponse.json({
      success: true,
      jobId,
      sessionId: targetSessionId,
      status: 'ready',
      videoUrl,
      videoId: `video_${targetSessionId}`,
      qaResult
    });

  } catch (error: any) {
    console.error('Video Status Route Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve video status.' },
      { status: 500 }
    );
  }
}

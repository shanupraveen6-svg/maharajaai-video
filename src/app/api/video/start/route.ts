import { NextRequest, NextResponse } from 'next/server';
import { buildVideoPrompt } from '@/lib/ai/gemini';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { fal } from '@fal-ai/client';
import fs from 'fs';
import path from 'path';
import { isEventId, MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { acquirePassVideoLock, incrementMaharajaUsage, incrementPassUsage, logMaharajaActivity, markPassVideoSubmitted, releasePassVideoLock, verifyMaharajaAccess } from '@/lib/maharaja/server';

export const maxDuration = 60;
const FAL_VIDEO_MODEL = 'minimax/h3-max-turbo/image-to-video';

function detectImageMimeType(buffer: Buffer, fallback = 'image/jpeg') {
  if (buffer.length >= 12) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  }
  return fallback;
}

function formatFalError(error: any) {
  const detail = error?.body?.detail || error?.response?.data?.detail || error?.data?.detail;
  const detailText = typeof detail === 'string'
    ? detail
    : detail
      ? JSON.stringify(detail)
      : '';
  const raw = detailText || error?.message || String(error || 'Unknown Fal.ai error.');
  const lower = raw.toLowerCase();

  if (lower.includes('credit') || lower.includes('balance') || lower.includes('quota') || lower.includes('402')) {
    return 'Fal.ai credit balance is exhausted or depleted. Please top up your Fal.ai account to continue video generation.';
  }

  if (lower.includes('unauthorized') || lower.includes('api key') || lower.includes('401')) {
    return 'Fal.ai API key (FAL_KEY) is invalid or unauthorized. Please verify FAL_KEY in your environment variables.';
  }

  if (lower.includes('unprocessable') || lower.includes('422')) {
    return 'Fal.ai rejected the video request before rendering. Check the festival image and try again.';
  }

  return raw.length > 280 ? `${raw.slice(0, 280)}...` : raw;
}

type MotionSafetyDecision = {
  lowerBodyVisibility: 'clear' | 'partial' | 'hidden';
  garmentMotionRisk: 'low' | 'medium' | 'high';
  recommendedMotion: 'still_cinematic';
  reason: string;
};

const DEFAULT_MOTION_SAFETY: MotionSafetyDecision = {
  lowerBodyVisibility: 'hidden',
  garmentMotionRisk: 'high',
  recommendedMotion: 'still_cinematic',
  reason: 'Maharaja videos always use the approved stationary cinematic motion mode.'
};

const MAX_PROVIDER_PROMPT_CHARS = 2800;

function buildMotionSafetyRule(decision: MotionSafetyDecision) {
  const visibility = decision.lowerBodyVisibility === 'clear'
    ? 'lower body visible but still locked'
    : 'lower body risky';
  return `Motion safety: ${visibility}. Lock pose, feet, legs, torso, shoulders, head angle, arms, hands, fingers, garment edges and floor contact. No walking, stepping, turning, dancing, body spin, foot slide, hand movement, head movement, breathing motion, hip or waist motion, garment motion or recomposed person. The only subject action permitted is one gradual natural closed-mouth smile.`;
}

function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxLength * 0.75)) {
    return sliced.slice(0, lastSpace).replace(/[,;:\-\s]+$/, '') + '.';
  }
  return sliced;
}

function buildFinalPrompt(basePrompt: string, decision: MotionSafetyDecision) {
  const canonicalPrompt = `${basePrompt} Start camera and background animation at frame 1 with no blank screen or delayed intro. Follow only the camera path and background effects stated in this prompt. Do not invent subject motion. Do not add any text, words, titles or logos.`;

  const finalPrompt = `${canonicalPrompt}\n\n${buildMotionSafetyRule(decision)}`;
  return truncateAtWordBoundary(finalPrompt.replace(/\s+/g, ' ').trim(), MAX_PROVIDER_PROMPT_CHARS);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  let lockedPassCode = '';
  let videoSubmitted = false;

  try {
    const body = await req.json();
    const { sessionId, garmentAnalysis, conceptPrompt, accessCode } = body;
    const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }
    // Billing passes always use the stored festival video master. The browser-supplied image
    // (and any isRetry flag) is ignored, so the plain Try-On image can never become the video source.
    const masterImageUrl: string | undefined = access.pass ? access.pass.videoMasterUrl : body.masterImageUrl;
    if (access.pass && access.pass.videoDone) {
      return NextResponse.json({
        success: false,
        error: 'This billing pass has already completed its AI Video. Ask the manager if a retry is required.',
      }, { status: 409 });
    }
    const eventId = isEventId(body.eventId) ? body.eventId : access.pass?.eventId || 'diwali';

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    if (AI_CONFIG.IS_DEMO_MODE) {
      return NextResponse.json(
        {
          success: false,
          error: 'Real video generation is disabled because DEMO_MODE=true. Set DEMO_MODE=false in Vercel before shop testing.'
        },
        { status: 400 }
      );
    }

    // Claim the pass's single video slot atomically before any provider call (blocks double-click / second tab).
    if (access.pass) {
      const lock = await acquirePassVideoLock(access.pass.code, jobId);
      if (!lock.ok) {
        return NextResponse.json({ success: false, error: lock.error }, { status: 409 });
      }
      lockedPassCode = access.pass.code;
    }

    // ----------------------------------------------------
    // Prepare Master Image Reference (URL or Data URI)
    // ----------------------------------------------------
    let masterBase64: string | null = null;
    let masterMimeType = 'image/jpeg';
    let masterDataUrl: string | null = null;

    if (masterImageUrl && masterImageUrl.startsWith('data:image')) {
      masterDataUrl = masterImageUrl;
      const mimeMatch = masterImageUrl.match(/^data:([^;]+);base64,/);
      masterMimeType = mimeMatch?.[1] || masterMimeType;
      masterBase64 = masterImageUrl.split(',')[1];
    } else if (masterImageUrl && masterImageUrl.startsWith('/')) {
      try {
        const localPath = path.join(process.cwd(), 'public', masterImageUrl);
        if (fs.existsSync(localPath)) {
          const buffer = fs.readFileSync(localPath);
          masterBase64 = buffer.toString('base64');
          masterMimeType = detectImageMimeType(buffer);
          masterDataUrl = `data:${masterMimeType};base64,${masterBase64}`;
        }
      } catch (lErr) {
        console.warn('Local master image read warning:', lErr);
      }
    } else {
      const bucket = getStorageBucket();
      if (bucket) {
        try {
          const storagePath = `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/master.jpg`;
          const [buffer] = await bucket.file(storagePath).download();
          masterBase64 = buffer.toString('base64');
          masterMimeType = detectImageMimeType(buffer);
          masterDataUrl = `data:${masterMimeType};base64,${masterBase64}`;
        } catch (stErr) {
          console.warn('Storage master image download warning:', stErr);
        }
      }

      if (!masterBase64 && masterImageUrl && masterImageUrl.startsWith('http')) {
        try {
          const fetchRes = await fetch(masterImageUrl);
          if (fetchRes.ok) {
            const buffer = Buffer.from(await fetchRes.arrayBuffer());
            masterBase64 = buffer.toString('base64');
            masterMimeType = detectImageMimeType(
              buffer,
              fetchRes.headers.get('content-type')?.split(';')[0] || masterMimeType
            );
            masterDataUrl = masterImageUrl;
          }
        } catch (netErr) {
          console.warn('Signed URL fetch fallback error:', netErr);
        }
      }
    }

    if (!masterBase64 && !masterImageUrl) {
      return NextResponse.json(
        { success: false, error: 'Approved master reference image is required to initialize video generation.' },
        { status: 400 }
      );
    }


    const motionSafety = DEFAULT_MOTION_SAFETY;
    const prompt = buildFinalPrompt(buildVideoPrompt(garmentAnalysis, conceptPrompt), motionSafety);

    const falKey = AI_CONFIG.FAL_KEY;
    if (!falKey || !falKey.trim()) {
      return NextResponse.json({ success: false, error: 'Fal.ai video service is not configured.' }, { status: 503 });
    }

    let jobData: any = null;
    try {
        console.log('Starting Fal.ai MiniMax H3 Max Turbo video...');
        fal.config({ credentials: falKey.trim() });

        let hostedImageUrl: string | null = null;

        if (masterBase64) {
          try {
            const buffer = Buffer.from(masterBase64, 'base64');
            const blob = new Blob([buffer], { type: masterMimeType || 'image/jpeg' });
            hostedImageUrl = await fal.storage.upload(blob);
            console.log('Successfully uploaded master image to Fal storage:', hostedImageUrl);
          } catch (upErr) {
            console.warn('Fal storage upload error:', upErr);
          }
        }

        if (!hostedImageUrl && masterDataUrl) {
          const parts = masterDataUrl.split(',');
          if (parts.length > 1) {
            try {
              const buffer = Buffer.from(parts[1], 'base64');
              const blob = new Blob([buffer], { type: masterMimeType || 'image/jpeg' });
              hostedImageUrl = await fal.storage.upload(blob);
              console.log('Successfully uploaded data URI to Fal storage:', hostedImageUrl);
            } catch (upErr) {
              console.warn('Fal storage upload from data URI error:', upErr);
            }
          }
        }

        if (!hostedImageUrl) {
          throw new Error('Could not prepare a hosted image URL for Fal.ai generation.');
        }

        const falSubmitResult = await fal.queue.submit(FAL_VIDEO_MODEL, {
          input: {
            prompt,
            image_url: hostedImageUrl,
            duration: 6,
            resolution: '768P',
            prompt_expansion_mode: 'disabled',
            enable_safety_checker: true,
          }
        });

        if (falSubmitResult && falSubmitResult.request_id) {
          jobData = {
            id: jobId,
            sessionId,
            clientId: MAHARAJA_CLIENT_ID,
            accessCode: typeof accessCode === 'string' ? accessCode : null,
            eventId,
            prompt,
            requestId: falSubmitResult.request_id,
            provider: 'fal-h3-max-turbo',
            model: FAL_VIDEO_MODEL,
            motionSafety,
            status: 'processing',
            videoUrl: null,
            createdAt: nowIso
          };
          console.log(`Fal.ai H3 Max Turbo job started successfully. Request ID: ${falSubmitResult.request_id}`);
        }
      } catch (falErr: any) {
        console.error('Fal.ai H3 Max Turbo provider error:', falErr);
        return NextResponse.json(
          { success: false, error: `Video generation could not be started: ${formatFalError(falErr)}` },
          { status: 500 }
        );
      }

    // The provider has accepted the job: mark rendering on the pass and bind this jobId
    if (access.pass) {
      await markPassVideoSubmitted(access.pass.code, jobId);
      videoSubmitted = true;
    }

    // Record job state in Firestore or MockStore
    if (db) {
      await db.collection('generationJobs').doc(jobId).set(jobData);
      await db.collection('sessions').doc(sessionId).set({
        sessionId,
        clientId: MAHARAJA_CLIENT_ID,
        accessCode: typeof accessCode === 'string' ? accessCode : null,
        eventId,
        jobId,
        videoStatus: jobData.status,
        provider: jobData.provider,
        motionSafety,
        motionMode: motionSafety.recommendedMotion,
        updatedAt: nowIso
      }, { merge: true });
    } else {
      const mockStore = getMockStore();
      mockStore.sessions.set(`job_${jobId}`, jobData);
      const existingSession = mockStore.sessions.get(sessionId) || {};
      mockStore.sessions.set(sessionId, {
        ...existingSession,
        sessionId,
        clientId: MAHARAJA_CLIENT_ID,
        accessCode: typeof accessCode === 'string' ? accessCode : null,
        eventId,
        jobId,
        videoStatus: jobData.status,
        provider: jobData.provider,
        motionSafety,
        motionMode: motionSafety.recommendedMotion,
        updatedAt: nowIso
      });
    }

    await incrementMaharajaUsage('videosGenerated');
    if (access.pass) {
      await incrementPassUsage(access.pass.code, 'videosGenerated');
    }
    await logMaharajaActivity('video', `${eventId} AI Video generation started`, { sessionId });

    return NextResponse.json({
      success: true,
      jobId,
      sessionId,
      provider: jobData.provider,
      motionSafety,
      status: jobData.status,
      message: 'MiniMax H3 Max Turbo video generation initialized.'
    });
  } catch (error: any) {
    console.error('Video Start Route Error:', error);
    return NextResponse.json(
      { success: false, error: `Failed to start video generation job: ${formatFalError(error)}` },
      { status: 500 }
    );
  } finally {
    // Provider rejected / request failed before a job was accepted: free the slot so the customer can retry.
    if (lockedPassCode && !videoSubmitted) {
      await releasePassVideoLock(lockedPassCode).catch((releaseError) => console.error('Video lock release failed:', releaseError));
    }
  }
}

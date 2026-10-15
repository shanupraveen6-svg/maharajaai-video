import { NextRequest, NextResponse } from 'next/server';
import { buildVideoPrompt } from '@/lib/ai/gemini';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { GoogleGenAI } from '@google/genai';
import { fal } from '@fal-ai/client';
import fs from 'fs';
import path from 'path';
import { isEventId, MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { acquirePassVideoLock, incrementMaharajaUsage, incrementPassUsage, logMaharajaActivity, markPassVideoSubmitted, releasePassVideoLock, verifyMaharajaAccess } from '@/lib/maharaja/server';

export const maxDuration = 60;

function getGenAIClient() {
  const apiKey = AI_CONFIG.PRIMARY_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    return null;
  }
}

function detectImageMimeType(buffer: Buffer, fallback = 'image/jpeg') {
  if (buffer.length >= 12) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  }
  return fallback;
}

function formatVeoError(error: any) {
  const raw = error?.message || String(error || 'Unknown Veo error.');
  const lower = raw.toLowerCase();

  if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('free tier')) {
    return 'Veo video quota is exhausted or too low for a 6-second generation. Add/enable paid quota for the Google AI project, or stop testing video and use Proof Mode/manual video upload.';
  }

  if (lower.includes('api key') || lower.includes('permission') || lower.includes('unauthenticated')) {
    return 'Gemini/Veo API key is invalid or does not have video generation access. Update GOOGLE_AI_API_KEY_PRIMARY in Vercel with a paid project key that has Veo access.';
  }

  if (lower.includes('model') || lower.includes('not found')) {
    return `Veo model is not available for this API key/project. Current model: ${AI_CONFIG.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview'}.`;
  }

  return raw.length > 280 ? `${raw.slice(0, 280)}...` : raw;
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
    return 'Fal.ai rejected the video request before rendering. The app did not start Google/Veo fallback, so no extra fallback credit was spent. Check the uploaded master image and provider input settings before retrying.';
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
  reason: 'Default safe mode when lower-body motion is not verified.'
};

const MAX_PROVIDER_PROMPT_CHARS = 2800;

function parseMotionSafetyDecision(text: string): MotionSafetyDecision | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const lowerBodyVisibility = ['clear', 'partial', 'hidden'].includes(parsed.lowerBodyVisibility)
      ? parsed.lowerBodyVisibility
      : DEFAULT_MOTION_SAFETY.lowerBodyVisibility;
    const garmentMotionRisk = ['low', 'medium', 'high'].includes(parsed.garmentMotionRisk)
      ? parsed.garmentMotionRisk
      : DEFAULT_MOTION_SAFETY.garmentMotionRisk;
    return {
      lowerBodyVisibility,
      garmentMotionRisk,
      recommendedMotion: 'still_cinematic',
      reason: typeof parsed.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 180)
        : DEFAULT_MOTION_SAFETY.reason
    };
  } catch (parseErr) {
    console.warn('Motion safety JSON parse warning:', parseErr);
    return null;
  }
}

async function analyzeMasterMotionSafety(masterBase64: string | null, masterMimeType: string): Promise<MotionSafetyDecision> {
  const ai = getGenAIClient();
  if (!ai || !masterBase64) {
    return {
      ...DEFAULT_MOTION_SAFETY,
      reason: 'Motion analysis unavailable, so safe still-camera mode is enforced.'
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
      contents: [
        {
          inlineData: {
            mimeType: masterMimeType || 'image/jpeg',
            data: masterBase64
          }
        },
        `Analyze this generated fashion master image only for safe video motion planning.
Decide whether the lower body is risky for AI motion. For this showroom workflow, always choose still_cinematic because walking can distort feet, ankles, slippers, sandals, pants, sarees, lehengas and long garments.

Rules:
- If a lehenga, saree, gown, long anarkali, long kurta, dupatta, or any loose/covered garment hides the legs, use still_cinematic.
- If legs are only partly visible, cropped, shadowed, or covered by fabric, use still_cinematic.
- Never recommend walking, stepping, dancing, spinning, pose change, side turn, or large body movement.

Return ONLY valid JSON:
{
  "lowerBodyVisibility": "clear" | "partial" | "hidden",
  "garmentMotionRisk": "low" | "medium" | "high",
  "recommendedMotion": "still_cinematic",
  "reason": "short reason"
}`
      ]
    });

    return parseMotionSafetyDecision(response.text || '') || DEFAULT_MOTION_SAFETY;
  } catch (err) {
    console.warn('Motion safety analysis warning:', err);
    return {
      ...DEFAULT_MOTION_SAFETY,
      reason: 'Motion analysis failed, so safe still-camera mode is enforced.'
    };
  }
}

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
      const lock = await acquirePassVideoLock(access.pass.code);
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


    const motionSafety = await analyzeMasterMotionSafety(masterBase64, masterMimeType);
    const prompt = buildFinalPrompt(buildVideoPrompt(garmentAnalysis, conceptPrompt), motionSafety);

    const falKey = AI_CONFIG.FAL_KEY;
    let jobData: any = null;
    let falErrorReason: string | null = null;

    // ====================================================
    // PRIMARY PROVIDER: Fal.ai MiniMax Hailuo-02 Standard
    // ====================================================
    if (falKey && falKey.trim() !== '') {
      try {
        console.log('Attempting Primary Provider: Fal.ai MiniMax Hailuo-02...');
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

        const falSubmitResult = await fal.queue.submit('fal-ai/minimax/hailuo-02/standard/image-to-video', {
          input: {
            prompt,
            image_url: hostedImageUrl,
            duration: '6',
            prompt_optimizer: false,
            resolution: '768P'
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
            provider: 'fal-minimax',
            model: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
            motionSafety,
            status: 'processing',
            videoUrl: null,
            createdAt: nowIso
          };
          console.log(`Fal.ai MiniMax Hailuo-02 job started successfully. Request ID: ${falSubmitResult.request_id}`);
        }
      } catch (falErr: any) {
        falErrorReason = formatFalError(falErr);
        console.error('Fal.ai MiniMax Hailuo-02 Primary Provider Error:', falErr);
        return NextResponse.json(
          {
            success: false,
            error: `MiniMax Hailuo video generation failed: ${falErrorReason}. Google/Veo fallback was not started, so no extra fallback credit was spent.`
          },
          { status: 500 }
        );
      }
    }

    // ====================================================
    // SECONDARY PROVIDER (FALLBACK): Google Veo
    // ====================================================
    if (!jobData) {
      if (!AI_CONFIG.ENABLE_VEO_FALLBACK) {
        return NextResponse.json(
          {
            success: false,
            error: falErrorReason
              ? `MiniMax Hailuo video generation failed: ${falErrorReason}. Automatic Google Veo fallback is disabled (ENABLE_VEO_FALLBACK=false) to protect credits.`
              : 'Primary video generation is unavailable and Google Veo fallback is disabled.'
          },
          { status: 500 }
        );
      }

      const ai = getGenAIClient();
      if (!ai) {
        return NextResponse.json(
          {
            success: false,
            error: falKey
              ? `Primary Fal.ai provider failed (${falErrorReason || 'Unknown error'}) and Google AI API key is missing for secondary fallback.`
              : 'Neither Fal.ai API Key (FAL_KEY) nor Google AI API key is configured.'
          },
          { status: 500 }
        );
      }

      try {
        if (!masterBase64) {
          throw new Error('Approved master reference image bytes are required to initialize Veo generation.');
        }

        const videoConfig: any = {
          aspectRatio: '9:16',
          numberOfVideos: 1,
          durationSeconds: 6,
          resolution: '720p'
        };

        const generateParams: any = {
          model: AI_CONFIG.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview',
          source: {
            prompt,
            image: {
              imageBytes: masterBase64,
              mimeType: masterMimeType
            }
          },
          config: videoConfig
        };

        const videoResponse = await ai.models.generateVideos(generateParams);
        const operationName = videoResponse.name || null;

        if (!operationName) {
          throw new Error('Veo did not return an operation name for polling.');
        }

        jobData = {
          id: jobId,
          sessionId,
          clientId: MAHARAJA_CLIENT_ID,
          accessCode: typeof accessCode === 'string' ? accessCode : null,
          eventId,
          prompt,
          operationName,
          provider: 'google-veo',
          model: AI_CONFIG.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview',
          motionSafety,
          status: 'processing',
          videoUrl: null,
          createdAt: nowIso
        };
        console.log(`Google Veo job started successfully. Operation Name: ${operationName}`);
      } catch (veoError: any) {
        console.error('Google Veo Secondary Provider Error:', veoError);
        return NextResponse.json(
          {
            success: false,
            error: falErrorReason
              ? `Video generation failed: Primary Fal.ai error (${falErrorReason}) | Secondary Google Veo error (${formatVeoError(veoError)})`
              : `Video generation failed to start: ${formatVeoError(veoError)}`
          },
          { status: 500 }
        );
      }
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
      message: jobData.provider === 'fal-minimax'
        ? 'MiniMax Hailuo video generation initialized via Fal.ai (Primary).'
        : 'Veo video generation job initialized via Google (Secondary).'
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

import { NextRequest, NextResponse } from 'next/server';
import { buildVideoPrompt } from '@/lib/ai/gemini';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { GoogleGenAI } from '@google/genai';
import { fal } from '@fal-ai/client';
import fs from 'fs';
import path from 'path';
import { verifyOperatorRequest } from '@/lib/auth/operator';

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
  const raw = error?.message || String(error || 'Unknown Fal.ai error.');
  const lower = raw.toLowerCase();

  if (lower.includes('credit') || lower.includes('balance') || lower.includes('quota') || lower.includes('402')) {
    return 'Fal.ai credit balance is exhausted or depleted. Please top up your Fal.ai account to continue video generation.';
  }

  if (lower.includes('unauthorized') || lower.includes('api key') || lower.includes('401')) {
    return 'Fal.ai API key (FAL_KEY) is invalid or unauthorized. Please verify FAL_KEY in your environment variables.';
  }

  return raw.length > 280 ? `${raw.slice(0, 280)}...` : raw;
}

type MotionSafetyDecision = {
  lowerBodyVisibility: 'clear' | 'partial' | 'hidden';
  garmentMotionRisk: 'low' | 'medium' | 'high';
  recommendedMotion: 'micro_walk' | 'still_cinematic';
  reason: string;
};

const DEFAULT_MOTION_SAFETY: MotionSafetyDecision = {
  lowerBodyVisibility: 'hidden',
  garmentMotionRisk: 'high',
  recommendedMotion: 'still_cinematic',
  reason: 'Default safe mode when lower-body motion is not verified.'
};

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
    const recommendedMotion = parsed.recommendedMotion === 'micro_walk' && lowerBodyVisibility === 'clear' && garmentMotionRisk === 'low'
      ? 'micro_walk'
      : 'still_cinematic';

    return {
      lowerBodyVisibility,
      garmentMotionRisk,
      recommendedMotion,
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
Decide if the person's legs and lower garment are clearly visible enough for 2 to 3 tiny slow steps without AI leg/cloth distortion.

Rules:
- If a lehenga, saree, gown, long anarkali, long kurta, dupatta, or any loose/covered garment hides the legs, use still_cinematic.
- If legs are only partly visible, cropped, shadowed, or covered by fabric, use still_cinematic.
- Use micro_walk only when both legs/feet are clearly visible and the garment shape supports tiny controlled steps.
- Never recommend normal walking, dancing, spinning, or large body movement.

Return ONLY valid JSON:
{
  "lowerBodyVisibility": "clear" | "partial" | "hidden",
  "garmentMotionRisk": "low" | "medium" | "high",
  "recommendedMotion": "micro_walk" | "still_cinematic",
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
  if (decision.recommendedMotion === 'micro_walk') {
    return `Motion safety decision: lower body and feet are clearly visible, so allow only 2 to 3 tiny slow controlled forward steps before stopping. This is not full walking. Keep steps small, straight, and stable. No dancing, no leg crossing, no fast stride, no spin, no hip or waist emphasis. Preserve exact face, body size, outfit fit, garment edges and footwear. If the model becomes unstable, switch to a grounded still pose with camera movement only.`;
  }

  return `Motion safety decision: lower body is hidden, partially visible, or risky for cloth motion. Do not walk. The person stays grounded in a modest still pose with only tiny head/eye movement and a soft festival smile. Make the video feel premium using camera movement only: controlled dolly-in, side truck, rack focus, light sweep, diya glow, bokeh, background crackers or lantern shimmer, and a final slow zoom-out. No dancing, no leg movement, no body spin, no hip or waist emphasis.`;
}

function buildFinalPrompt(basePrompt: string, decision: MotionSafetyDecision) {
  const finalPrompt = `${basePrompt}\n\n${buildMotionSafetyRule(decision)}`;
  return finalPrompt.length > 2400 ? finalPrompt.slice(0, 2400) : finalPrompt;
}

export async function POST(req: NextRequest) {
  const db = getDb();

  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized operator session. Please login again.' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, garmentAnalysis, masterImageUrl, conceptPrompt } = body;

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
          const storagePath = `sessions/${sessionId}/master/master.jpg`;
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

        let hostedImageUrl: string | null = (masterImageUrl && masterImageUrl.startsWith('http'))
          ? masterImageUrl
          : null;

        if (!hostedImageUrl && masterBase64) {
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
            prompt_optimizer: true,
            resolution: '768P'
          }
        });

        if (falSubmitResult && falSubmitResult.request_id) {
          jobData = {
            id: jobId,
            sessionId,
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

    // Record job state in Firestore or MockStore
    if (db) {
      await db.collection('generationJobs').doc(jobId).set(jobData);
      await db.collection('sessions').doc(sessionId).set({
        sessionId,
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
        jobId,
        videoStatus: jobData.status,
        provider: jobData.provider,
        motionSafety,
        motionMode: motionSafety.recommendedMotion,
        updatedAt: nowIso
      });
    }

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
  }
}

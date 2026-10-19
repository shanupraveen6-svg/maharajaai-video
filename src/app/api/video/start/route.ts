import { NextRequest, NextResponse } from 'next/server';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { fal } from '@fal-ai/client';
import {
  buildEventVideoPrompt,
  buildFailSafeVideoPrompt,
  isEventId,
  resolveGarmentType,
  getSceneIndex,
  MAHARAJA_CLIENT_ID,
  MAX_VIDEO_PROMPT_CHARS,
  buildMotionSafetyRule,
  truncateAtWordBoundary,
  buildFinalPrompt,
  ENFORCE_REPEAT_LIMITS,
  type CustomerCategory,
  type BackupPromptMode,
  type VideoPromptSet,
  type EventId
} from '@/lib/maharaja/config';
import {
  buildDiwaliReferenceVideoPrompt,
  getDiwaliReferenceVideoModel,
  getDiwaliReferencePromptId,
} from '@/lib/maharaja/reference-video';
import {
  acquirePassVideoLock,
  approvePassVideoMaster,
  finalizeCompletedVideo,
  incrementMaharajaUsage,
  incrementPassUsage,
  logMaharajaActivity,
  markPassVideoSubmitted,
  releasePassVideoLock,
  verifyMaharajaAccess
} from '@/lib/maharaja/server';
import { generateDeterministicPushVideo } from '@/lib/maharaja/video-processor';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { canSignFalWebhook, signFalWebhook } from '@/lib/security/fal-webhook';

export const maxDuration = 60;
function isFalReferenceVideoEnabled(): boolean {
  return AI_CONFIG.VIDEO_PROVIDER === 'fal';
}

async function resolveReferenceUrl(value: string, sessionId: string): Promise<string> {
  const expectedPrefix = `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/`;
  if (!value.startsWith(expectedPrefix)) {
    throw new Error('A visual reference does not belong to this customer session.');
  }
  return getSignedPlaybackUrl(value);
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
  lowerBodyVisibility: 'clear',
  garmentMotionRisk: 'high',
  recommendedMotion: 'still_cinematic',
  reason: 'Maharaja videos always use the approved stationary cinematic motion mode.'
};

async function resolveMasterImageBuffer(
  hostedImageUrl: string | null,
  sessionId: string,
  masterImageUrl?: string
): Promise<Buffer | null> {
  const dataCandidate = (masterImageUrl && masterImageUrl.startsWith('data:'))
    ? masterImageUrl
    : (hostedImageUrl && hostedImageUrl.startsWith('data:'))
      ? hostedImageUrl
      : null;
  if (dataCandidate) {
    const base64 = dataCandidate.split(',')[1];
    if (base64) return Buffer.from(base64, 'base64');
  }

  const bucket = getStorageBucket();
  if (bucket) {
    try {
      const candidates = [
        `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/master.jpg`,
        `sessions/${sessionId}/master/master.jpg`,
      ];
      for (const p of candidates) {
        const file = bucket.file(p);
        const [exists] = await file.exists();
        if (exists) {
          const [buf] = await file.download();
          if (buf && buf.length > 0) return buf;
        }
      }
    } catch (storageErr) {
      console.warn('Storage bucket direct read for master image warning:', storageErr);
    }
  }

  const mockStore = getMockStore();
  const mockBlob = mockStore.sessions?.get(`mock_blob_clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/master.jpg`)
    || mockStore.sessions?.get(`mock_blob_sessions/${sessionId}/master/master.jpg`)
    || (masterImageUrl ? mockStore.sessions?.get(`mock_blob_${masterImageUrl}`) : null)
    || (hostedImageUrl ? mockStore.sessions?.get(`mock_blob_${hostedImageUrl}`) : null);
  if (mockBlob?.buffer) {
    return mockBlob.buffer;
  }

  const urlCandidate = (hostedImageUrl && /^https?:\/\//i.test(hostedImageUrl))
    ? hostedImageUrl
    : (masterImageUrl && /^https?:\/\//i.test(masterImageUrl))
      ? masterImageUrl
      : null;

  if (urlCandidate) {
    try {
      const res = await fetch(urlCandidate);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        if (ab.byteLength > 0) return Buffer.from(ab);
      }
    } catch (fetchErr) {
      console.warn('Fetch master image URL warning:', fetchErr);
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const db = getDb();
  let lockedPassCode = '';
  let videoSubmitted = false;

  try {
    const body = await req.json();
    const { sessionId, accessCode } = body;
    console.log('VIDEO_START_RECEIVED', { sessionId: sessionId || null });
    const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
    }
    // Determine retry mode
    const isRetry = Boolean(
      body.retry === true ||
      body.isRetry === true ||
      body.retryMode === 'backup-1' ||
      body.retryMode === 'backup-locked' ||
      body.retryMode === 'safe' ||
      (typeof body.conceptPrompt === 'string' && body.conceptPrompt.includes('FAIL-SAFE'))
    );

    if (ENFORCE_REPEAT_LIMITS && access.allowances.video.used >= 2 && !isRetry) {
      return NextResponse.json({
        success: false,
        error: 'H3 Cinematic Video allowance exhausted. Maximum generations reached for this customer mobile number.',
      }, { status: 403 });
    }

    // Billing passes always use the stored festival video master.
    const masterImageUrl: string | undefined = access.pass ? access.pass.videoMasterUrl : body.masterImageUrl;

    // Server-side master-image quality & approval verification
    if (access.pass) {
      if (!access.pass.videoMasterDone || !access.pass.videoMasterUrl) {
        return NextResponse.json({
          success: false,
          error: 'Create the AI Video image first, then generate the video.',
        }, { status: 409 });
      }

      // 1. Rejected master image blocking: Ensure rejected images can NEVER be used
      if (access.pass.rejectedMasterUrls && (
        access.pass.rejectedMasterUrls.includes(access.pass.videoMasterUrl) ||
        (body.masterImageUrl && access.pass.rejectedMasterUrls.includes(body.masterImageUrl))
      )) {
        return NextResponse.json({
          success: false,
          error: 'Rejected master image: This image was rejected. Please generate a fresh festival image before creating the video.',
        }, { status: 409 });
      }

      // 2. Stale master image blocking: Image submitted by client must match server pass image
      if (body.masterImageUrl && access.pass.videoMasterUrl && body.masterImageUrl !== access.pass.videoMasterUrl) {
        return NextResponse.json({
          success: false,
          error: 'Stale master image: The submitted image does not match the latest master image. Please review the updated image.',
        }, { status: 409 });
      }

      // 3. Image validation: Ensure master image exists before starting video generation
      if (!access.pass.videoMasterDone && !access.pass.videoMasterUrl && !body.masterImageUrl) {
        return NextResponse.json({
          success: false,
          error: 'Festival portrait image must be generated before starting video generation.',
        }, { status: 400 });
      }
    }

    const eventId = isEventId(body.eventId) ? body.eventId : access.pass?.eventId || 'diwali';
    const rate = await enforceRateLimit(req, 'video-start', 4, 15 * 60 * 1000, access.pass?.code || sessionId);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: 'Video generation is temporarily limited for this customer. Please wait and try again.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      });
    }
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    // Claim the pass's single video slot atomically before any provider call (blocks double-click / second tab).
    if (access.pass) {
      const lock = await acquirePassVideoLock(access.pass.code, jobId);
      if (!lock.ok) {
        return NextResponse.json({ success: false, error: lock.error }, { status: 409 });
      }
      lockedPassCode = access.pass.code;
      console.log('VIDEO_PASS_LOCK_ACQUIRED', { sessionId, jobId });
    }

    let hostedImageUrl: string | null = masterImageUrl && /^https?:\/\//i.test(masterImageUrl)
      ? masterImageUrl
      : null;

    if (!hostedImageUrl) {
      try {
        hostedImageUrl = await getSignedPlaybackUrl(`clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/master.jpg`);
      } catch (storageError) {
        console.warn('Stored video master URL could not be prepared:', storageError);
      }
    }

    if (!hostedImageUrl && masterImageUrl && masterImageUrl.startsWith('data:')) {
      hostedImageUrl = masterImageUrl;
    }

    if (!hostedImageUrl) {
      return NextResponse.json(
        { success: false, error: 'The approved Maharaja video image is unavailable. Generate the festival image again.' },
        { status: 409 }
      );
    }

    const motionSafety = DEFAULT_MOTION_SAFETY;
    const sessionData = db
      ? (await db.collection('sessions').doc(sessionId).get()).data()
      : getMockStore().sessions.get(sessionId);
    if ((!sessionData && !isRetry) || (sessionData && access.pass && sessionData.accessCode !== accessCode)) {
      return NextResponse.json({ success: false, error: 'This video session does not belong to this customer pass.' }, { status: 403 });
    }

    let effectiveCategory: CustomerCategory;
    let effectiveGarment: string;
    let effectiveEventId: EventId;
    let effectivePromptSet: VideoPromptSet;

    if (access.pass) {
      effectiveCategory = (access.pass.videoMasterCategory || body.templateId || 'women') as CustomerCategory;
      effectiveGarment = (access.pass.videoMasterGarmentType || body.garmentType || resolveGarmentType(effectiveCategory)) as string;
      effectiveEventId = (access.pass.eventId || body.eventId || 'diwali') as EventId;
      effectivePromptSet = (access.pass.videoMasterPromptSet || body.promptSet || 'set-1') as VideoPromptSet;
    } else {
      const categoryValue = sessionData?.templateId || body.templateId;
      if (!categoryValue || !['women', 'men', 'girl', 'boy'].includes(categoryValue)) {
        return NextResponse.json({
          success: false,
          error: 'Customer category is required for video generation. Please select a valid category (women, men, girl, boy).',
        }, { status: 400 });
      }
      effectiveCategory = categoryValue as CustomerCategory;
      const explicitGarment = body.garmentType || sessionData?.garmentType;
      effectiveGarment = resolveGarmentType(effectiveCategory, explicitGarment, sessionData?.garmentAnalysis);
      effectiveEventId = (isEventId(body.eventId) ? body.eventId : 'diwali') as EventId;
      effectivePromptSet = (body.promptSet === 'set-2' || body.promptSet === 'set-1') ? body.promptSet : (sessionData?.promptSet || 'set-1');
    }

    if (effectiveEventId !== 'diwali') {
      return NextResponse.json({
        success: false,
        error: 'Reference-to-Video validation is currently available only for Diwali.',
      }, { status: 409 });
    }

    const backupNumber = isRetry && body.retryMode === 'backup-2' ? 2 : isRetry ? 1 : undefined;
    const promptId = getDiwaliReferencePromptId(effectiveCategory, effectivePromptSet, backupNumber);
    const prompt = buildDiwaliReferenceVideoPrompt(promptId);
    console.log('VIDEO_MASTER_LOADED', {
      sessionId,
      jobId,
      hasImage: true,
      isRetry,
      promptId,
      effectiveCategory,
      effectiveGarment,
      effectiveEventId,
      effectivePromptSet,
    });

    if (!isFalReferenceVideoEnabled() && !body.videoModelId) {
      return NextResponse.json({
        success: false,
        error: 'Diwali Reference-to-Video is not enabled. Set VIDEO_PROVIDER=fal; no automatic fallback was used.',
      }, { status: 503 });
    }

    // Mode A — Safe / Production (Default): Deterministic FFmpeg Video with 100% garment fidelity
    if (AI_CONFIG.VIDEO_PROVIDER === 'deterministic' && !body.videoModelId) {
      console.log('DETERMINISTIC_VIDEO_START', { sessionId, jobId });
      const imageBuffer = await resolveMasterImageBuffer(hostedImageUrl, sessionId, masterImageUrl);
      if (!imageBuffer || imageBuffer.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Could not load the master image for deterministic video generation.' },
          { status: 409 }
        );
      }

      // 1. Generate 6s raw video with slow whole-frame 4.5% optical push-in
      const raw6sBuffer = await generateDeterministicPushVideo(imageBuffer, 6);

      // 2. Finalize into branded 6s customer preview + 9s showroom broadcast MP4s
      const finalizeResult = await finalizeCompletedVideo({
        sessionId,
        jobId,
        videoBuffer: raw6sBuffer,
        provider: 'deterministic-ffmpeg',
        accessCode: typeof accessCode === 'string' ? accessCode : null,
        clientId: MAHARAJA_CLIENT_ID,
        eventId,
      });

      if (!finalizeResult.success) {
        return NextResponse.json(
          { success: false, error: finalizeResult.error },
          { status: 500 }
        );
      }

      videoSubmitted = true;

      // 3. Increment pass usage and log activity
      const postSubmitTasks: Promise<unknown>[] = [];
      if (access.pass) {
        postSubmitTasks.push(incrementPassUsage(access.pass.code, 'videosGenerated'));
      }
      postSubmitTasks.push(logMaharajaActivity('video-start', `${eventId} Deterministic AI Video generated with 100% garment fidelity`, { sessionId, jobId }));
      await Promise.all(postSubmitTasks);

      return NextResponse.json({
        success: true,
        jobId,
        sessionId,
        status: 'ready',
        videoUrl: finalizeResult.videoUrl,
        liveVideoUrl: finalizeResult.liveVideoUrl,
        provider: 'deterministic-ffmpeg',
        allowances: access.allowances,
        message: 'Maharaja Cinematic Video generated deterministically with 100% garment fidelity.'
      });
    }

    // Mode B — Experimental AI Motion: MiniMax Hailuo H3 Max Turbo
    const falKey = AI_CONFIG.FAL_KEY;
    if (!falKey || !falKey.trim()) {
      return NextResponse.json({ success: false, error: 'Fal.ai video service is not configured.' }, { status: 503 });
    }

    let jobData: any = null;
    try {
        const sourceValues = [
          access.pass?.videoPersonPhotoStoragePath || sessionData?.personPhotoStoragePath,
          ...(Array.isArray(access.pass?.videoGarmentPhotoStoragePaths)
            ? access.pass.videoGarmentPhotoStoragePaths.slice(0, 3)
            : Array.isArray(sessionData?.garmentPhotoStoragePaths)
              ? sessionData.garmentPhotoStoragePaths.slice(0, 3)
              : []),
        ].filter((value): value is string => typeof value === 'string' && value.length > 0);
        if (!sourceValues.length) {
          throw new Error('Original customer and clothing references are missing. Generate and approve a fresh Diwali master image before creating the video.');
        }

        console.log('FAL_UPLOAD_START', { sessionId, jobId });
        fal.config({ credentials: falKey.trim() });

        const referenceSessionId = access.pass?.videoReferenceSessionId || sessionId;
        const referenceImageUrls = await Promise.all(sourceValues.map((value) => resolveReferenceUrl(value, referenceSessionId)));
        const uniqueReferenceImageUrls = [...new Set(referenceImageUrls)].slice(0, 4);
        if (!uniqueReferenceImageUrls.length) {
          throw new Error('No accessible visual references were available for Reference-to-Video.');
        }

        console.log('FAL_IMAGE_READY', {
          sessionId,
          jobId,
          promptId,
          reusedHostedUrl: true,
          referenceCount: uniqueReferenceImageUrls.length,
        });

        const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
        const proto = req.headers.get('x-forwarded-proto') || 'https';
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (host && !host.includes('localhost') ? `${proto}://${host}` : '');
        const webhookToken = signFalWebhook(jobId, sessionId);
        const webhookUrl = baseUrl && canSignFalWebhook()
          ? `${baseUrl}/api/video/webhook?jobId=${encodeURIComponent(jobId)}&sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(webhookToken)}`
          : undefined;

        const selectedVideoModel = getDiwaliReferenceVideoModel(body.videoModelId);
        const providerStartedAt = Date.now();
        console.log('FAL_SUBMIT_START', {
          sessionId,
          jobId,
          model: selectedVideoModel.model,
          promptId,
          referenceCount: uniqueReferenceImageUrls.length,
          hasWebhook: Boolean(webhookUrl),
        });
        const allReferenceUrls = [hostedImageUrl, ...uniqueReferenceImageUrls].filter(Boolean);
        const namedPrompt = `Image 1 is the original customer identity reference. Images 2 onward are the original garment references. The approved first frame is the composition authority. ${prompt}`;
        const providerInput = selectedVideoModel.id === 'vidu-q4'
          ? {
              prompt: `[@reference_image_1] is the approved master composition. [@reference_image_2] is the original customer. Preserve the customer and clothing using all supplied references. ${prompt}`,
              reference_image_urls: allReferenceUrls,
              duration: 6,
              resolution: '720p',
              aspect_ratio: '9:16',
              audio: false,
              enable_safety_checker: true,
            }
          : selectedVideoModel.id === 'h3-max'
            ? {
                prompt: namedPrompt,
                image_url: hostedImageUrl,
                reference_image_urls: uniqueReferenceImageUrls,
                duration: 6,
                resolution: '768P',
                aspect_ratio: 'adaptive',
                prompt_expansion_mode: 'disabled',
                enable_safety_checker: true,
              }
            : selectedVideoModel.id === 'h3'
              ? {
                  prompt: namedPrompt,
                  reference_image_urls: allReferenceUrls,
                  duration: 6,
                  resolution: '768P',
                  aspect_ratio: '9:16',
                  prompt_expansion_mode: 'disabled',
                  enable_safety_checker: true,
                }
              : selectedVideoModel.id === 'gemini-omni'
                ? {
                    prompt: namedPrompt,
                    image_urls: allReferenceUrls,
                    duration: 6,
                    resolution: '720p',
                    aspect_ratio: '9:16',
                  }
                : {
                    prompt: `@master is the approved composition. Keep @customer identity exact${allReferenceUrls.slice(2).map((_, index) => ` and preserve @garment${index + 1}`).join('')}. No face, age, body, pose, clothing, colour, gradient, pattern, layer or accessory changes. The person remains still. Use only a slow premium forward camera push and subtle existing background light movement. No orbit, new objects, garment motion or effects crossing the person. Finish with a stable luxury Diwali hero hold.`,
                    image_references: allReferenceUrls.map((imageUrl, index) => ({
                      image_url: imageUrl,
                      type: index === 0 ? 'background' : 'subject',
                      ref_name: index === 0 ? 'master' : index === 1 ? 'customer' : `garment${index - 1}`,
                    })),
                    duration: 6,
                    resolution: '720p',
                    aspect_ratio: '9:16',
                    generate_audio_switch: false,
                    enable_safety_checker: true,
                  };
        const falSubmitResult = await fal.queue.submit(selectedVideoModel.model, {
          input: providerInput,
          ...(webhookUrl ? { webhookUrl } : {}),
        });

        if (!falSubmitResult?.request_id) {
          throw new Error('Fal.ai accepted the request without returning a request ID.');
        }
        if (falSubmitResult.request_id) {
          jobData = {
            id: jobId,
            sessionId,
            clientId: MAHARAJA_CLIENT_ID,
            accessCode: typeof accessCode === 'string' ? accessCode : null,
            eventId,
            prompt,
            promptId,
            requestId: falSubmitResult.request_id,
            provider: `fal-${selectedVideoModel.id}-reference-to-video`,
            model: selectedVideoModel.model,
            videoModelId: selectedVideoModel.id,
            videoModelLabel: selectedVideoModel.label,
            referenceCount: allReferenceUrls.length,
            duration: 6,
            resolution: selectedVideoModel.id === 'h3-max' || selectedVideoModel.id === 'h3' ? '768P' : '720p',
            aspectRatio: selectedVideoModel.id === 'h3-max' ? 'adaptive' : '9:16',
            providerSubmitMs: Date.now() - providerStartedAt,
            seed: null,
            motionSafety,
            status: 'processing',
            queueState: falSubmitResult.status,
            queuePosition: falSubmitResult.queue_position,
            videoUrl: null,
            createdAt: nowIso
          };
          console.log('FAL_REQUEST_ID', { sessionId, jobId, requestId: falSubmitResult.request_id });
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
    const postSubmitTasks: Promise<unknown>[] = [];
    if (db) {
      postSubmitTasks.push(db.collection('generationJobs').doc(jobId).set(jobData));
      postSubmitTasks.push(db.collection('sessions').doc(sessionId).set({
        sessionId,
        clientId: MAHARAJA_CLIENT_ID,
        accessCode: typeof accessCode === 'string' ? accessCode : null,
        eventId,
        jobId,
        videoStatus: jobData.status,
        provider: jobData.provider,
        model: jobData.model,
        promptId,
        referenceCount: jobData.referenceCount,
        motionSafety,
        motionMode: motionSafety.recommendedMotion,
        updatedAt: nowIso
      }, { merge: true }));
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
        model: jobData.model,
        promptId,
        referenceCount: jobData.referenceCount,
        motionSafety,
        motionMode: motionSafety.recommendedMotion,
        updatedAt: nowIso
      });
    }

    if (access.pass) {
      postSubmitTasks.push(incrementPassUsage(access.pass.code, 'videosGenerated'));
    }
    postSubmitTasks.push(logMaharajaActivity('video-start', `${eventId} AI Video generation started`, { sessionId }));
    await Promise.all(postSubmitTasks);

    return NextResponse.json({
      success: true,
      jobId,
      sessionId,
      allowances: access.allowances,
      provider: jobData.provider,
      motionSafety,
      status: jobData.status,
      queueState: jobData.queueState,
      queuePosition: jobData.queuePosition,
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

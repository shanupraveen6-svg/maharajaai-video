import { NextRequest, NextResponse } from 'next/server';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getSignedPlaybackUrl } from '@/lib/firebase/admin';
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
import { acquirePassVideoLock, approvePassVideoMaster, incrementMaharajaUsage, incrementPassUsage, logMaharajaActivity, markPassVideoSubmitted, releasePassVideoLock, verifyMaharajaAccess } from '@/lib/maharaja/server';

export const maxDuration = 60;
const FAL_VIDEO_MODEL = 'minimax/h3-max-turbo/image-to-video';

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

    if (ENFORCE_REPEAT_LIMITS && access.allowances.video.used >= 2) {
      return NextResponse.json({
        success: false,
        error: 'H3 Cinematic Video allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.',
      }, { status: 403 });
    }

    if (ENFORCE_REPEAT_LIMITS && access.pass && access.pass.videoDone && !access.pass.retryApproved && !access.allowances.video.managerAuthorized) {
      return NextResponse.json({
        success: false,
        error: 'This billing pass has already completed its AI Video. Ask the manager if a retry is required.',
      }, { status: 409 });
    }

    if (ENFORCE_REPEAT_LIMITS && access.allowances.video.used === 1 && !access.allowances.video.managerAuthorized && !access.pass?.retryApproved) {
      return NextResponse.json({
        success: false,
        error: 'H3 Cinematic Video retry requires manager authorization.',
      }, { status: 403 });
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

      // 3. Approval gate: Customer must explicitly approve master image before H3 video can start.
      // Approval CANNOT be silently bypassed or granted during video start.
      if (!access.pass.videoMasterApproved) {
        return NextResponse.json({
          success: false,
          error: 'Customer approval required: Please review and explicitly approve the festival master image before starting H3 video generation.',
        }, { status: 403 });
      }

      // 4. Strict Metadata Consistency Lock (Category, Garment Type, Event, Scene Style):
      // The approved master image is the single source of truth.
      // Missing or incomplete metadata must NOT silently default to Women/Saree/Diwali:
      const approvedCategory = access.pass.videoMasterCategory;
      if (!approvedCategory || !['women', 'men', 'girl', 'boy'].includes(approvedCategory)) {
        return NextResponse.json({
          success: false,
          error: 'Incomplete approved master metadata: Customer category is missing or invalid on the approved record. Please generate and approve a fresh master image.',
        }, { status: 409 });
      }

      const approvedGarmentType = access.pass.videoMasterGarmentType;
      if (!approvedGarmentType || typeof approvedGarmentType !== 'string' || !approvedGarmentType.trim()) {
        return NextResponse.json({
          success: false,
          error: 'Incomplete approved master metadata: Garment type is missing from the approved record. Please generate and approve a fresh master image.',
        }, { status: 409 });
      }

      const approvedPromptSet = access.pass.videoMasterPromptSet;
      if (!approvedPromptSet || !['set-1', 'set-2'].includes(approvedPromptSet)) {
        return NextResponse.json({
          success: false,
          error: 'Incomplete approved master metadata: Scene style is missing or invalid on the approved record. Please generate and approve a fresh master image.',
        }, { status: 409 });
      }

      const approvedEventId = access.pass.eventId;
      if (!approvedEventId || !isEventId(approvedEventId)) {
        return NextResponse.json({
          success: false,
          error: 'Incomplete approved master metadata: Festival event is missing or invalid on the pass. Please generate and approve a fresh master image.',
        }, { status: 409 });
      }

      if (body.templateId && body.templateId !== approvedCategory) {
        return NextResponse.json({
          success: false,
          error: `Customer category mismatch: Master image was approved for ${approvedCategory}, but ${body.templateId} was requested. Changing category requires generating and approving a fresh master image.`,
        }, { status: 409 });
      }

      if (body.garmentType && body.garmentType !== approvedGarmentType) {
        return NextResponse.json({
          success: false,
          error: `Garment type mismatch: Master image was approved for ${approvedGarmentType}, but ${body.garmentType} was requested. Changing garment type requires generating and approving a fresh master image.`,
        }, { status: 409 });
      }

      if (body.eventId && body.eventId !== approvedEventId) {
        return NextResponse.json({
          success: false,
          error: `Event mismatch: Master image was approved for ${approvedEventId}, but ${body.eventId} was requested. Changing festival event requires generating and approving a fresh master image.`,
        }, { status: 409 });
      }

      if (!isRetry && body.promptSet && body.promptSet !== approvedPromptSet) {
        return NextResponse.json({
          success: false,
          error: `Scene style mismatch: Master image was approved for ${approvedPromptSet === 'set-1' ? 'Style 1 (Courtyard Reveal)' : 'Style 2 (Doorway Glide)'}, but ${body.promptSet === 'set-1' ? 'Style 1' : 'Style 2'} was requested. Changing scene style requires generating and approving a fresh master image.`,
        }, { status: 409 });
      }
    }

    const eventId = isEventId(body.eventId) ? body.eventId : access.pass?.eventId || 'diwali';
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

    let effectiveCategory: CustomerCategory;
    let effectiveGarment: string;
    let effectiveEventId: EventId;
    let effectivePromptSet: VideoPromptSet;

    if (access.pass) {
      // Zero fallbacks: strictly use verified stored metadata from the approved master image
      effectiveCategory = access.pass.videoMasterCategory as CustomerCategory;
      effectiveGarment = access.pass.videoMasterGarmentType as string;
      effectiveEventId = access.pass.eventId as EventId;
      effectivePromptSet = access.pass.videoMasterPromptSet as VideoPromptSet;
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

    let approvedPrompt = '';
    if (isRetry) {
      approvedPrompt = buildFailSafeVideoPrompt(effectiveCategory, effectiveEventId, effectiveGarment);
    } else {
      approvedPrompt = buildEventVideoPrompt(effectiveCategory, effectiveEventId, sessionId, effectivePromptSet, effectiveGarment);
    }
    const prompt = buildFinalPrompt(approvedPrompt, motionSafety, isRetry);
    console.log('VIDEO_MASTER_LOADED', { sessionId, jobId, hasImage: true, isRetry, effectiveCategory, effectiveGarment, effectiveEventId, effectivePromptSet });

    const falKey = AI_CONFIG.FAL_KEY;
    if (!falKey || !falKey.trim()) {
      return NextResponse.json({ success: false, error: 'Fal.ai video service is not configured.' }, { status: 503 });
    }

    let jobData: any = null;
    try {
        console.log('FAL_UPLOAD_START', { sessionId, jobId });
        fal.config({ credentials: falKey.trim() });

        console.log('FAL_IMAGE_READY', { sessionId, jobId, reusedHostedUrl: true });

        const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
        const proto = req.headers.get('x-forwarded-proto') || 'https';
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (host && !host.includes('localhost') ? `${proto}://${host}` : '');
        const webhookUrl = baseUrl
          ? `${baseUrl}/api/video/webhook?jobId=${encodeURIComponent(jobId)}&sessionId=${encodeURIComponent(sessionId)}&accessCode=${encodeURIComponent(typeof accessCode === 'string' ? accessCode : '')}`
          : undefined;

        console.log('FAL_SUBMIT_START', { sessionId, jobId, model: FAL_VIDEO_MODEL, hasWebhook: Boolean(webhookUrl) });
        const falSubmitResult = await fal.queue.submit(FAL_VIDEO_MODEL, {
          input: {
            prompt,
            image_url: hostedImageUrl,
            duration: 6,
            resolution: '768P',
            prompt_expansion_mode: 'disabled',
            enable_safety_checker: true,
          },
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
            requestId: falSubmitResult.request_id,
            provider: 'fal-h3-max-turbo',
            model: FAL_VIDEO_MODEL,
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

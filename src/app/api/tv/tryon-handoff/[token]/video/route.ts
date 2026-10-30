import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID, type CustomerCategory, type EventId, type GarmentType } from '@/lib/maharaja/config';
import { getCatalogueProduct } from '@/lib/maharaja/catalogue';
import { finalizeCompletedVideo } from '@/lib/maharaja/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { buildVideoTestInput, extractVideoUrl, getVideoTestModel, publicFalQueueUrl } from '@/lib/maharaja/video-test';
import { getVideoConcept, VIDEO_PROMPT_ARCHITECTURE_VERSION, type VideoConceptId } from '@/lib/maharaja/video-concepts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type StoredLook = {
  sku: string;
  title: string;
  contentType: string;
  path?: string;
  bytes?: Buffer;
  category?: string;
  garmentType?: string;
  gender?: string;
  garmentReferenceUrl?: string;
};

type StoredHandoff = {
  expiresAtMs: number;
  looks: StoredLook[];
};

async function readHandoff(token: string): Promise<StoredHandoff | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const db = getDb();
  const record = db
    ? (await db.collection('tvTryOnHandoffs').doc(token).get()).data()
    : getMockStore().sessions.get(`tv_handoff_${token}`);
  if (!record || Number(record.expiresAtMs) <= Date.now() || !Array.isArray(record.looks)) return null;
  return record as StoredHandoff;
}

async function falGet(url: string, falKey: string) {
  const safeUrl = publicFalQueueUrl(url);
  if (!safeUrl) throw new Error('Stored Fal queue URL is invalid.');
  const response = await fetch(safeUrl, {
    headers: { Authorization: `Key ${falKey}`, Accept: 'application/json' },
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
    const detail = typeof data === 'string' ? data : JSON.stringify(data?.detail || data?.error || data);
    throw new Error(`Fal queue failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  return data;
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const rate = await enforceRateLimit(req, 'tryon-video', 10, 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: 'Too many video generation requests. Please wait.' }, { status: 429 });
    }

    const { token } = await context.params;
    const handoff = await readHandoff(token);
    if (!handoff) {
      return NextResponse.json({ success: false, error: 'This private look link has expired.' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    // Finding 1: Explicit opt-in Go-Live consent check
    const consentGoLive = body?.consentGoLive === true;
    if (!consentGoLive) {
      return NextResponse.json({
        success: false,
        error: 'Explicit consent to preview this festival video on Maharaja showroom TV displays (Go-Live) is required.',
      }, { status: 400 });
    }

    const imageIndex = typeof body?.imageIndex === 'number' ? Math.max(0, Math.min(handoff.looks.length - 1, body.imageIndex)) : 0;
    const look = handoff.looks[imageIndex];
    if (!look) {
      return NextResponse.json({ success: false, error: 'The selected look is unavailable.' }, { status: 404 });
    }

    const isRetry = body?.isRetry === true || body?.useFailProofPrompt === true || body?.backupPrompt === true;
    const useFailProofPrompt = isRetry;
    const sessionId = `handoff_${token}_${imageIndex}`;

    const db = getDb();

    // Finding 3: Server-side job lifecycle protection & concurrency lock
    let existingJob: any = null;
    if (db) {
      const snap = await db.collection('videoTestJobs').where('sessionId', '==', sessionId).limit(1).get();
      if (!snap.empty) {
        existingJob = snap.docs[0].data();
      }
    } else {
      existingJob = getMockStore().sessions.get(`video_test_${sessionId}`);
    }

    if (existingJob) {
      // If a generation is currently in-flight, reject concurrent duplicate requests
      if (['preparing', 'submitted', 'processing'].includes(existingJob.status)) {
        return NextResponse.json({
          success: true,
          jobId: existingJob.jobId,
          status: existingJob.status,
          message: 'Video generation is already in progress.',
        });
      }

      // If already ready and customer is not performing an explicit retry, return existing ready video
      if (existingJob.status === 'ready' && !isRetry) {
        return NextResponse.json({
          success: true,
          jobId: existingJob.jobId,
          status: 'ready',
          videoUrl: existingJob.videoUrl,
          downloadUrl: existingJob.videoUrl,
          liveDisplayConsented: true,
        });
      }

      // If customer is requesting a retry, enforce maximum 1 retry limit per look
      if (isRetry && Number(existingJob.retryCount || 0) >= 1) {
        return NextResponse.json({
          success: false,
          error: 'Video retry limit reached for this look (maximum 1 regeneration allowed).',
          jobId: existingJob.jobId,
        }, { status: 400 });
      }
    }

    const retryCount = existingJob ? Number(existingJob.retryCount || 0) + (isRetry ? 1 : 0) : 0;
    const catalogueProduct = await getCatalogueProduct(look.sku);

    const category: CustomerCategory =
      look.gender === 'boy' || look.gender === 'boys' ? 'boy'
      : look.gender === 'girl' || look.gender === 'girls' ? 'girl'
      : look.gender === 'men' ? 'men'
      : catalogueProduct?.gender === 'boys' ? 'boy'
      : catalogueProduct?.gender === 'girls' ? 'girl'
      : catalogueProduct?.gender === 'men' ? 'men'
      : 'women';

    const defaultConcept: VideoConceptId =
      category === 'boy' ? 'boy-heritage-entrance'
      : category === 'girl' ? 'girl-garden-lights'
      : category === 'men' ? 'men-heritage-passage'
      : 'women-golden-courtyard';

    const concept = getVideoConcept((body?.conceptId as VideoConceptId) || defaultConcept) || getVideoConcept(defaultConcept)!;
    const garmentType: GarmentType = (look.garmentType || catalogueProduct?.garmentType || 'generic') as GarmentType;

    // Resolve master image URL for video input
    let masterImageUrl = '';
    const bucket = getStorageBucket();
    if (look.path && bucket) {
      masterImageUrl = await getSignedPlaybackUrl(look.path);
    } else {
      masterImageUrl = `${req.nextUrl.origin}/api/tv/tryon-handoff/${token}?image=${imageIndex}`;
    }

    // Finding 6: Correctly source authentic garment reference
    let garmentReferenceUrl = '';
    if (look.garmentReferenceUrl) {
      garmentReferenceUrl = look.garmentReferenceUrl;
    } else if (catalogueProduct?.garmentReferencePath && bucket) {
      garmentReferenceUrl = await getSignedPlaybackUrl(catalogueProduct.garmentReferencePath);
    } else if (catalogueProduct?.storagePath && bucket) {
      garmentReferenceUrl = await getSignedPlaybackUrl(catalogueProduct.storagePath);
    } else {
      garmentReferenceUrl = masterImageUrl;
    }

    const model = getVideoTestModel('h3-max');
    if (!model) {
      return NextResponse.json({ success: false, error: 'Video model configuration unavailable.' }, { status: 500 });
    }

    const jobId = `vtest_handoff_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const createdAt = new Date().toISOString();

    // Finding 1: Durable consent record saved with the job
    const consentRecord = {
      granted: true,
      grantedAt: createdAt,
      purpose: 'showroom-tv-golive-preview',
      consentVersion: '2026-10-tv-golive-v1',
      clientIp: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'direct',
      userAgent: req.headers.get('user-agent') || 'unknown',
      token,
      imageIndex,
    };

    // Finding 2: Create initial job record BEFORE calling external provider
    const jobBase = {
      jobId,
      sessionId,
      token,
      imageIndex,
      consentGoLive: true,
      consentRecord,
      retryCount,
      modelId: model.id,
      model: model.model,
      status: 'preparing',
      useFailProofPrompt,
      createdAt,
      updatedAt: createdAt,
      promptArchitectureVersion: VIDEO_PROMPT_ARCHITECTURE_VERSION,
      category,
      conceptId: concept.id,
    };

    const falKey = process.env.FAL_KEY?.trim();
    const isMockBackendAllowed = process.env.ALLOW_MOCK_BACKEND === 'true' && process.env.NODE_ENV !== 'production';

    // Finding 4: In non-mock production, missing provider key MUST fail honestly BEFORE creating any job
    if (!falKey && !isMockBackendAllowed) {
      return NextResponse.json({
        success: false,
        error: 'AI Video generation service is temporarily unavailable. Please try again shortly.',
      }, { status: 503 });
    }

    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(jobBase);
    } else {
      getMockStore().sessions.set(`video_test_${jobId}`, jobBase);
      getMockStore().sessions.set(`video_test_${sessionId}`, jobBase);
    }

    // Mock testing path only (never executed in production)
    if (!falKey && isMockBackendAllowed) {
      const mockReady = {
        ...jobBase,
        status: 'ready',
        videoUrl: '/videos/hero-preview.mp4',
        completedAt: createdAt,
      };
      if (db) await db.collection('videoTestJobs').doc(jobId).set(mockReady);
      else {
        getMockStore().sessions.set(`video_test_${jobId}`, mockReady);
        getMockStore().sessions.set(`video_test_${sessionId}`, mockReady);
      }
      return NextResponse.json({
        success: true,
        jobId,
        status: 'ready',
        videoUrl: '/videos/hero-preview.mp4',
        downloadUrl: '/videos/hero-preview.mp4',
        liveDisplayConsented: true,
      });
    }

    // Build model input with fail-proof backup flag when requested
    const garmentRoles = [catalogueProduct?.title || look.title || 'Selected Garment'];
    const input = buildVideoTestInput(
      model.id,
      masterImageUrl,
      [garmentReferenceUrl],
      concept.id,
      garmentRoles,
      'diwali',
      garmentType,
      useFailProofPrompt,
    );

    const webhookToken = crypto.randomBytes(32).toString('hex');
    const webhookUrl = new URL('/api/video/webhook', req.nextUrl.origin);
    webhookUrl.searchParams.set('jobId', jobId);
    webhookUrl.searchParams.set('token', webhookToken);

    const queueUrl = new URL(`https://queue.fal.run/${model.model}`);
    queueUrl.searchParams.set('fal_webhook', webhookUrl.toString());

    let raw = '';
    let response: Response;
    try {
      response = await fetch(queueUrl, {
        method: 'POST',
        headers: {
          Authorization: `Key ${falKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(input),
        cache: 'no-store',
      });
      raw = await response.text();
    } catch (networkError) {
      const errorMsg = networkError instanceof Error ? networkError.message : 'Network failure communicating with video provider.';
      const failureUpdate = { status: 'failed', error: errorMsg, updatedAt: new Date().toISOString() };
      if (db) await db.collection('videoTestJobs').doc(jobId).set(failureUpdate, { merge: true });
      else getMockStore().sessions.set(`video_test_${jobId}`, { ...jobBase, ...failureUpdate });
      return NextResponse.json({ success: false, error: 'Video generation could not be submitted. Please retry.' }, { status: 502 });
    }

    if (!response.ok) {
      const errorMsg = `Video generation service busy (${response.status}). Please retry.`;
      const failureUpdate = { status: 'failed', error: errorMsg, updatedAt: new Date().toISOString() };
      if (db) await db.collection('videoTestJobs').doc(jobId).set(failureUpdate, { merge: true });
      else getMockStore().sessions.set(`video_test_${jobId}`, { ...jobBase, ...failureUpdate });
      return NextResponse.json({ success: false, error: errorMsg }, { status: 502 });
    }

    const provider = JSON.parse(raw);
    const requestId = provider.request_id || provider.requestId;
    const statusUrl = provider.status_url || provider.statusUrl;
    const responseUrl = provider.response_url || provider.responseUrl;

    // Finding 2: Update existing job record with external provider IDs
    const jobUpdate = {
      status: 'submitted',
      requestId,
      statusUrl,
      responseUrl,
      providerName: 'fal',
      updatedAt: new Date().toISOString(),
    };

    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(jobUpdate, { merge: true });
    } else {
      const updated = { ...jobBase, ...jobUpdate };
      getMockStore().sessions.set(`video_test_${jobId}`, updated);
      getMockStore().sessions.set(`video_test_${sessionId}`, updated);
    }

    return NextResponse.json({
      success: true,
      jobId,
      status: 'submitted',
      liveDisplayConsented: true,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to initiate AI video generation.',
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const jobId = req.nextUrl.searchParams.get('jobId')?.trim();
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId is required.' }, { status: 400 });
    }

    const db = getDb();
    const job = db
      ? (await db.collection('videoTestJobs').doc(jobId).get()).data()
      : getMockStore().sessions.get(`video_test_${jobId}`);

    if (!job || job.token !== token) {
      return NextResponse.json({ success: false, error: 'Video task not found.' }, { status: 404 });
    }

    if (job.status === 'ready') {
      const videoUrl = job.videoStoragePath ? await getSignedPlaybackUrl(job.videoStoragePath) : job.videoUrl;
      return NextResponse.json({
        success: true,
        status: 'ready',
        jobId,
        videoUrl,
        downloadUrl: videoUrl,
        liveDisplayConsented: true,
        liveQueueStatus: job.liveQueueStatus || 'queued',
      });
    }

    if (job.status === 'failed') {
      return NextResponse.json({
        success: false,
        status: 'failed',
        jobId,
        error: job.error || 'Video generation failed. Tap Retry Video to recreate with fail-proof motion.',
      }, { status: 422 });
    }

    const falKey = process.env.FAL_KEY?.trim();
    if (!falKey || !job.statusUrl) {
      return NextResponse.json({ success: true, status: job.status || 'processing', jobId });
    }

    // Check Fal queue status
    const providerStatus = await falGet(job.statusUrl, falKey);
    const state = String(providerStatus?.status || '').toUpperCase();
    const isCompleted = state === 'COMPLETED' || state === 'SUCCEEDED';
    const isTerminalFailure = ['FAILED', 'CANCELLED', 'TIMEOUT', 'DELETED', 'ERROR'].includes(state);

    if (isTerminalFailure) {
      const failureMsg = providerStatus?.error || 'Video rendering was interrupted.';
      const update = { status: 'failed', error: failureMsg, updatedAt: new Date().toISOString() };
      if (db) await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
      else getMockStore().sessions.set(`video_test_${jobId}`, { ...job, ...update });
      return NextResponse.json({ success: false, status: 'failed', error: failureMsg });
    }

    if (!isCompleted) {
      return NextResponse.json({ success: true, status: 'processing', jobId, providerStatus: state });
    }

    // Finalize completed video
    const result = await falGet(job.responseUrl, falKey);
    const remoteVideoUrl = extractVideoUrl(result);
    if (!remoteVideoUrl) {
      throw new Error('Fal completed request without a playable video URL.');
    }

    const finalized = await finalizeCompletedVideo({
      sessionId: job.sessionId,
      jobId,
      outputVideoUrl: remoteVideoUrl,
      clientId: MAHARAJA_CLIENT_ID,
      eventId: 'diwali',
    });

    if (!finalized.success) {
      throw new Error(finalized.error);
    }

    // Finding 8: Actual TV Showroom Queue Publishing
    let liveQueueStatus = 'not_consented';
    if (job.consentGoLive === true) {
      liveQueueStatus = 'queued';
      const queueId = `live_${job.sessionId}`;
      const now = new Date();
      const queueData = {
        id: queueId,
        screenId: 'maharaja-main',
        videoId: `video_${job.sessionId}`,
        videoJobId: jobId,
        videoUrl: finalized.liveStoragePath || finalized.storagePath,
        sessionId: job.sessionId,
        accessCode: 'tryon-mobile',
        eventId: 'diwali',
        status: 'queued',
        priority: 100,
        repeatCount: 2,
        timesPlayed: 0,
        playAtMs: now.getTime(),
        createdAt: now.toISOString(),
        consentVersion: '2026-10-tv-golive-v1',
        liveConsent: true,
        loopConsent: true,
      };

      if (db) {
        await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('liveQueue').doc(queueId).set(queueData, { merge: true });
      } else {
        getMockStore().sessions.set(`live_queue_${queueId}`, queueData);
      }
    }

    const update = {
      status: 'ready',
      videoStoragePath: finalized.storagePath,
      liveVideoStoragePath: finalized.liveStoragePath || null,
      videoUrl: finalized.videoUrl,
      liveQueueStatus,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
    } else {
      const updated = { ...job, ...update };
      getMockStore().sessions.set(`video_test_${jobId}`, updated);
      getMockStore().sessions.set(`video_test_${job.sessionId}`, updated);
    }

    return NextResponse.json({
      success: true,
      status: 'ready',
      jobId,
      videoUrl: finalized.videoUrl,
      downloadUrl: finalized.videoUrl,
      liveDisplayConsented: true,
      liveQueueStatus,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error checking video status.',
    }, { status: 500 });
  }
}

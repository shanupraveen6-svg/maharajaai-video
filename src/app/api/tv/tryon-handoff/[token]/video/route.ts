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
    const consentGoLive = body?.consentGoLive === true;
    if (!consentGoLive) {
      return NextResponse.json({
        success: false,
        error: 'Consent to preview this festival video on Maharaja showroom TV displays (Go-Live) is required.',
      }, { status: 400 });
    }

    const imageIndex = typeof body?.imageIndex === 'number' ? Math.max(0, Math.min(handoff.looks.length - 1, body.imageIndex)) : 0;
    const look = handoff.looks[imageIndex];
    if (!look) {
      return NextResponse.json({ success: false, error: 'The selected look is unavailable.' }, { status: 404 });
    }

    const useFailProofPrompt = body?.useFailProofPrompt === true || body?.backupPrompt === true;
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

    // Resolve garment reference URL
    let garmentReferenceUrl = masterImageUrl;
    if (catalogueProduct?.garmentReferencePath && bucket) {
      garmentReferenceUrl = await getSignedPlaybackUrl(catalogueProduct.garmentReferencePath);
    } else if (catalogueProduct?.storagePath && bucket) {
      garmentReferenceUrl = await getSignedPlaybackUrl(catalogueProduct.storagePath);
    }

    const model = getVideoTestModel('h3-max');
    if (!model) {
      return NextResponse.json({ success: false, error: 'Video model configuration unavailable.' }, { status: 500 });
    }

    const jobId = `vtest_handoff_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const sessionId = `handoff_${token}_${imageIndex}`;
    const createdAt = new Date().toISOString();

    const jobBase = {
      jobId,
      sessionId,
      token,
      imageIndex,
      consentGoLive: true,
      modelId: model.id,
      model: model.model,
      status: 'submitted',
      useFailProofPrompt,
      createdAt,
      updatedAt: createdAt,
      promptArchitectureVersion: VIDEO_PROMPT_ARCHITECTURE_VERSION,
      category,
      conceptId: concept.id,
    };

    const falKey = process.env.FAL_KEY?.trim();
    const db = getDb();

    // If FAL_KEY is not configured or in mock dev environment, simulate immediate ready video
    if (!falKey) {
      const readyJob = {
        ...jobBase,
        status: 'ready',
        videoUrl: '/videos/hero-preview.mp4',
        completedAt: createdAt,
      };
      if (db) {
        await db.collection('videoTestJobs').doc(jobId).set(readyJob);
      } else {
        getMockStore().sessions.set(`video_test_${jobId}`, readyJob);
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

    const response = await fetch(queueUrl, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
      cache: 'no-store',
    });

    const raw = await response.text();
    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Video generation service busy (${response.status}). Please retry.`,
      }, { status: 502 });
    }

    const provider = JSON.parse(raw);
    const requestId = provider.request_id || provider.requestId;
    const statusUrl = provider.status_url || provider.statusUrl;
    const responseUrl = provider.response_url || provider.responseUrl;

    const jobData = {
      ...jobBase,
      requestId,
      statusUrl,
      responseUrl,
      providerName: 'fal',
    };

    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(jobData);
    } else {
      getMockStore().sessions.set(`video_test_${jobId}`, jobData);
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

    const update = {
      status: 'ready',
      videoStoragePath: finalized.storagePath,
      liveVideoStoragePath: finalized.liveStoragePath || null,
      videoUrl: finalized.videoUrl,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
    } else {
      getMockStore().sessions.set(`video_test_${jobId}`, { ...job, ...update });
    }

    return NextResponse.json({
      success: true,
      status: 'ready',
      jobId,
      videoUrl: finalized.videoUrl,
      downloadUrl: finalized.videoUrl,
      liveDisplayConsented: true,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error checking video status.',
    }, { status: 500 });
  }
}

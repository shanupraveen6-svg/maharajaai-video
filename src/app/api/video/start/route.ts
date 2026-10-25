import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { isEventId, MAHARAJA_CLIENT_ID, type CustomerCategory, type EventId } from '@/lib/maharaja/config';
import { getVideoConcept, VIDEO_PROMPT_ARCHITECTURE_VERSION, type VideoConceptId } from '@/lib/maharaja/video-concepts';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';
import { buildVideoTestInput, buildWaveSpeedVideoInput, getActiveVideoProvider, getVideoTestModel, isVideoModelTestingEnabled } from '@/lib/maharaja/video-test';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MAX_VIDEO_REFERENCE_BYTES = 12 * 1024 * 1024;

async function downloadValidatedReference(sourcePath: string, label: string, allowedCataloguePath = '') {
  const expectedPrefix = `clients/${MAHARAJA_CLIENT_ID}/sessions/`;
  if (!sourcePath.startsWith(expectedPrefix) && sourcePath !== allowedCataloguePath) throw new Error(`${label} path is outside this Maharaja session.`);
  const bucket = getStorageBucket();
  if (!bucket) throw new Error('Firebase Storage is unavailable.');
  const file = bucket.file(sourcePath);
  const [objectMetadata] = await file.getMetadata();
  const contentType = String(objectMetadata.contentType || '').toLowerCase();
  const size = Number(objectMetadata.size || 0);
  if (!contentType.startsWith('image/')) throw new Error(`${label} is not a supported image file.`);
  if (size <= 0 || size > MAX_VIDEO_REFERENCE_BYTES) throw new Error(`${label} must be a valid image smaller than 12 MB.`);
  const [source] = await file.download();
  if (!source.length || source.length > MAX_VIDEO_REFERENCE_BYTES) throw new Error(`${label} could not be read safely from storage.`);
  return { source, bucket };
}

async function normalizeStorageImage(sourcePath: string, outputPath: string) {
  const { source, bucket } = await downloadValidatedReference(sourcePath, 'Approved master image');
  const metadata = await sharp(source).rotate().metadata();
  if (!metadata.width || !metadata.height) throw new Error('Video reference has invalid image dimensions.');
  const output = await sharp(source)
    .rotate()
    .resize(720, 1280, { fit: 'contain', position: 'centre', background: { r: 20, g: 6, b: 10, alpha: 1 } })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer();
  await bucket.file(outputPath).save(output, { contentType: 'image/jpeg', resumable: false });
  return {
    url: await getSignedPlaybackUrl(outputPath),
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    outputWidth: 720,
    outputHeight: 1280,
    storagePath: outputPath,
  };
}

async function normalizeGarmentReference(sourcePath: string, outputPath: string, allowedCataloguePath = '') {
  const { source, bucket } = await downloadValidatedReference(sourcePath, 'Garment reference', allowedCataloguePath);
  const metadata = await sharp(source).rotate().metadata();
  if (!metadata.width || !metadata.height) throw new Error('Garment reference has invalid image dimensions.');
  if (metadata.width < 256 || metadata.height < 256) {
    throw new Error('A garment reference is below the 256 px minimum. Retake it closer with the complete garment clearly visible.');
  }
  const output = await sharp(source)
    .rotate()
    .resize(1024, 1024, { fit: 'contain', position: 'centre', background: { r: 20, g: 6, b: 10, alpha: 1 }, kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer();
  const outputMetadata = await sharp(output).metadata();
  if (!outputMetadata.width || !outputMetadata.height || outputMetadata.width / outputMetadata.height < 0.4 || outputMetadata.width / outputMetadata.height > 2.5) {
    throw new Error('Garment reference normalization failed the video provider aspect-ratio requirement.');
  }
  await bucket.file(outputPath).save(output, { contentType: 'image/jpeg', resumable: false });
  return {
    url: await getSignedPlaybackUrl(outputPath),
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    outputWidth: outputMetadata.width,
    outputHeight: outputMetadata.height,
    storagePath: outputPath,
  };
}

function falError(status: number, raw: string) {
  let detail = raw;
  try {
    const parsed = JSON.parse(raw);
    detail = typeof parsed?.detail === 'string' ? parsed.detail : JSON.stringify(parsed?.detail || parsed?.error || parsed);
  } catch {}
  return `Fal request failed (${status}): ${detail.slice(0, 500)}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const accessCode = typeof body?.accessCode === 'string' ? body.accessCode.trim() : '';
  const requestedModelId = typeof body?.videoModel === 'string' ? body.videoModel.trim() : '';
  const providerName = getActiveVideoProvider();
  if (requestedModelId && (providerName !== 'wavespeed' || !isVideoModelTestingEnabled())) {
    return NextResponse.json({ success: false, error: 'Video model selection is unavailable.' }, { status: 400 });
  }
  const model = getVideoTestModel(requestedModelId || undefined);
  if (!sessionId || !accessCode || !model) {
    return NextResponse.json({ success: false, error: requestedModelId ? 'The selected video test model is unavailable.' : 'sessionId and accessCode are required.' }, { status: 400 });
  }

  const falKey = process.env.FAL_KEY?.trim();
  const waveSpeedKey = process.env.WAVESPEED_API_KEY?.trim();
  if (providerName === 'fal' && !falKey) return NextResponse.json({ success: false, error: 'Video provider is temporarily unavailable.' }, { status: 503 });
  if (providerName === 'wavespeed' && !waveSpeedKey) return NextResponse.json({ success: false, error: 'Video provider is temporarily unavailable.' }, { status: 503 });

  const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
  if (!access.allowed || !access.pass) {
    return NextResponse.json({ success: false, error: access.allowed ? 'A customer AI Video pass is required.' : access.error }, { status: 401 });
  }
  if (!access.pass.videoMasterDone || !access.pass.videoMasterUrl) {
    return NextResponse.json({ success: false, error: 'Create the AI Video image first.' }, { status: 409 });
  }
  if (access.pass.rejectedMasterUrls?.includes(access.pass.videoMasterUrl)) {
    return NextResponse.json({ success: false, error: 'This master image was rejected. Generate and approve a new festival image.' }, { status: 409 });
  }
  if (!access.pass.videoMasterApproved || access.pass.videoMasterApprovedUrl !== access.pass.videoMasterUrl) {
    return NextResponse.json({ success: false, error: 'Customer approval required before generating the AI video.' }, { status: 403 });
  }
  if (access.pass.videoPromptArchitectureVersion !== VIDEO_PROMPT_ARCHITECTURE_VERSION) {
    return NextResponse.json({ success: false, error: 'This is a legacy AI Video session. Please use a newly issued Maharaja QR for the updated film experience.' }, { status: 409 });
  }
  if (access.pass.videoReferenceSessionId && access.pass.videoReferenceSessionId !== sessionId) {
    return NextResponse.json({ success: false, error: 'The approved master belongs to a different session.' }, { status: 409 });
  }

  const db = getDb();
  const session = db
    ? (await db.collection('sessions').doc(sessionId).get()).data()
    : getMockStore().sessions.get(sessionId);
  if (!session || session.accessCode !== accessCode || session.masterStoragePath !== `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/master.jpg`) {
    return NextResponse.json({ success: false, error: 'The approved master image session could not be verified.' }, { status: 403 });
  }

  const jobId = `vtest_${crypto.randomUUID()}`;
  const webhookToken = crypto.randomBytes(32).toString('hex');
  const webhookTokenHash = crypto.createHash('sha256').update(webhookToken).digest('hex');
  const createdAt = new Date().toISOString();
  const basePath = `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/video-tests/${jobId}`;
  const jobBase = {
    jobId, sessionId, accessCode, modelId: model.id, model: model.model,
    status: 'preparing', createdAt, updatedAt: createdAt,
    estimatedUsd: model.estimatedUsd, duration: model.seconds,
    attempt: 1, providerName,
    webhookTokenHash,
    promptArchitectureVersion: VIDEO_PROMPT_ARCHITECTURE_VERSION,
  };

  if (db) {
    const sessionRef = db.collection('sessions').doc(sessionId);
    const jobRef = db.collection('videoTestJobs').doc(jobId);
    try {
      await db.runTransaction(async (transaction) => {
        const freshSession = (await transaction.get(sessionRef)).data();
        const activeJobId = freshSession?.activeVideoTestJobId;
        let activeJob: any = null;
        if (activeJobId) activeJob = (await transaction.get(db.collection('videoTestJobs').doc(activeJobId))).data();
        if (activeJob && ['preparing', 'submitted', 'processing', 'unknown'].includes(activeJob.status)) {
          throw new Error(`ACTIVE_VIDEO_TEST:${activeJobId}`);
        }
        transaction.set(jobRef, jobBase);
        transaction.set(sessionRef, { activeVideoTestJobId: jobId, updatedAt: createdAt }, { merge: true });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.startsWith('ACTIVE_VIDEO_TEST:')) {
        return NextResponse.json({ success: false, error: 'A video test is already running for this image. Please wait.', jobId: message.split(':')[1] }, { status: 409 });
      }
      throw error;
    }
  } else {
    const activeJobId = session.activeVideoTestJobId;
    const activeJob = activeJobId ? getMockStore().sessions.get(`video_test_${activeJobId}`) : null;
    if (activeJob && ['preparing', 'submitted', 'processing', 'unknown'].includes(activeJob.status)) {
      return NextResponse.json({ success: false, error: 'A video test is already running for this image. Please wait.', jobId: activeJobId }, { status: 409 });
    }
    getMockStore().sessions.set(`video_test_${jobId}`, jobBase);
    getMockStore().sessions.set(sessionId, { ...session, activeVideoTestJobId: jobId, updatedAt: createdAt });
  }

  try {
    const master = await normalizeStorageImage(session.masterStoragePath, `${basePath}/input-master.jpg`);
    const garmentPaths = Array.isArray(access.pass.videoGarmentPhotoStoragePaths)
      ? access.pass.videoGarmentPhotoStoragePaths.filter((value): value is string => typeof value === 'string').slice(0, 3)
      : [];
    if (!garmentPaths.length) throw new Error('At least one garment reference is required for the approved master.');
    const garments = [];
    for (let index = 0; index < garmentPaths.length; index += 1) {
      garments.push(await normalizeGarmentReference(garmentPaths[index], `${basePath}/input-garment-${index + 1}.jpg`, access.pass.catalogueStoragePath || ''));
    }
    const category = access.pass.videoMasterCategory || session.templateId;
    if (!['women', 'men', 'girl', 'boy'].includes(category)) throw new Error('The approved master image has no valid customer category.');
    const eventId: EventId = isEventId(access.pass.eventId)
      ? access.pass.eventId
      : isEventId(session.eventId) ? session.eventId : 'diwali';
    const conceptId = (access.pass.videoMasterConceptId || session.conceptId) as VideoConceptId | undefined;
    const concept = getVideoConcept(conceptId);
    if (!concept || concept.category !== category) throw new Error('The selected Diwali film concept could not be verified. Generate the festival image again.');
    const garmentRoles = Array.isArray(access.pass.videoMasterGarmentRoles)
      ? access.pass.videoMasterGarmentRoles.map((value) => String(value)).slice(0, garments.length)
      : [];
    let requestId = '';
    let statusUrl = '';
    let responseUrl = '';
    let providerSeed: string | number | null = null;
    if (providerName === 'wavespeed') {
      if (model.inputFormat === 'fal') throw new Error('The selected WaveSpeed video model is unavailable.');
      const response = await fetch(`https://api.wavespeed.ai/api/v3/${model.model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${waveSpeedKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildWaveSpeedVideoInput(model.inputFormat, master.url, garments.map((item) => item.url), concept.id, garmentRoles)),
        cache: 'no-store',
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`WaveSpeed request failed (${response.status}): ${raw.slice(0, 500)}`);
      const parsed = JSON.parse(raw);
      if (parsed?.code && parsed.code !== 200 && parsed.code !== 0) {
        throw new Error(`WaveSpeed rejected request (${parsed.code}): ${parsed.message || parsed.error || raw.slice(0, 500)}`);
      }
      const task = parsed?.data || parsed;
      requestId = String(task?.id || '');
      providerSeed = typeof task?.seed === 'number' || typeof task?.seed === 'string' ? task.seed : null;
      statusUrl = requestId ? `https://api.wavespeed.ai/api/v3/predictions/${encodeURIComponent(requestId)}/result` : '';
      responseUrl = statusUrl;
      if (!requestId) throw new Error('WaveSpeed accepted the request but returned no prediction id.');
    } else {
      const input = buildVideoTestInput(master.url, garments.map((item) => item.url), concept.id, garmentRoles);
      const webhookUrl = new URL('/api/video/webhook', req.nextUrl.origin);
      webhookUrl.searchParams.set('jobId', jobId);
      webhookUrl.searchParams.set('token', webhookToken);
      const queueUrl = new URL(`https://queue.fal.run/${model.model}`);
      queueUrl.searchParams.set('fal_webhook', webhookUrl.toString());
      const response = await fetch(queueUrl, {
        method: 'POST',
        headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(input),
        cache: 'no-store',
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(falError(response.status, raw));
      const provider = JSON.parse(raw);
      requestId = provider.request_id || provider.requestId;
      statusUrl = provider.status_url || provider.statusUrl;
      responseUrl = provider.response_url || provider.responseUrl;
      providerSeed = typeof provider.seed === 'number' || typeof provider.seed === 'string' ? provider.seed : null;
      if (!requestId || !statusUrl || !responseUrl) throw new Error('Fal accepted the request but returned incomplete queue tracking data.');
    }

    const update = {
      status: 'submitted', requestId, statusUrl, responseUrl, providerName,
      seed: providerSeed,
      referenceCount: garments.length + 1,
      eventId,
      category,
      conceptId: concept.id,
      promptArchitectureVersion: VIDEO_PROMPT_ARCHITECTURE_VERSION,
      garmentRoles,
      inputMetadata: { master, garments, originalPersonExcluded: true },
      updatedAt: new Date().toISOString(),
    };
    if (db) await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
    else getMockStore().sessions.set(`video_test_${jobId}`, { ...jobBase, ...update });
    return NextResponse.json({ success: true, jobId, status: 'submitted', modelId: model.id, estimatedUsd: model.estimatedUsd });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video test submission failed.';
    const update = { status: 'failed', error: message, updatedAt: new Date().toISOString() };
    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
      await db.collection('sessions').doc(sessionId).set({ activeVideoTestJobId: null }, { merge: true });
    } else {
      getMockStore().sessions.set(`video_test_${jobId}`, { ...jobBase, ...update });
      getMockStore().sessions.set(sessionId, { ...session, activeVideoTestJobId: null });
    }
    return NextResponse.json({ success: false, status: 'failed', jobId, error: message }, { status: 502 });
  }
}

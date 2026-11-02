import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { isEventId, type EventId, type GarmentType } from '@/lib/maharaja/config';
import { getVideoConcept, VIDEO_PROMPT_ARCHITECTURE_VERSION, type VideoConceptId } from '@/lib/maharaja/video-concepts';
import {
  acquirePassVideoLock,
  markPassVideoFailed,
  markPassVideoSubmitted,
  verifyMaharajaAccess,
} from '@/lib/maharaja/server';
import { getVideoTestModel } from '@/lib/maharaja/video-test';
import { availableEngines, newWebhookToken, submitRender, videoEngineOrder, webhookUrlFor, type RenderRequest } from '@/lib/maharaja/video-engines';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MAX_VIDEO_REFERENCE_BYTES = 12 * 1024 * 1024;

async function downloadValidatedReference(sourcePath: string, label: string, allowedCataloguePath = '') {
  const expectedPrefix = `clients/${activeClientId()}/sessions/`;
  if (!sourcePath.startsWith(expectedPrefix) && sourcePath !== allowedCataloguePath) throw new Error(`This ${label.toLowerCase()} does not belong to this session.`);
  const bucket = getStorageBucket();
  if (!bucket) throw new Error('Storage is unavailable right now. Please try again shortly.');
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const accessCode = typeof body?.accessCode === 'string' ? body.accessCode.trim() : '';
  const requestedModelId = typeof body?.videoModel === 'string' ? body.videoModel.trim() : '';
  const providerName = 'fal';
  const model = getVideoTestModel(requestedModelId || undefined);
  if (!sessionId || !accessCode || !model) {
    return NextResponse.json({ success: false, error: requestedModelId ? 'The selected video test model is unavailable.' : 'sessionId and accessCode are required.' }, { status: 400 });
  }

  const falKey = process.env.FAL_KEY?.trim();
  if (!falKey) return NextResponse.json({ success: false, error: 'Video provider is temporarily unavailable.' }, { status: 503 });

  const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');

  bindClient(access.allowed ? access.clientId : null);
  if (!access.allowed || !access.pass) {
    return NextResponse.json({ success: false, error: access.allowed ? 'A customer AI Video pass is required.' : access.error }, { status: 401 });
  }
  const passCode = access.pass.code;
  if (!access.pass.videoMasterDone || !access.pass.videoMasterUrl) {
    return NextResponse.json({ success: false, error: 'Create the AI Video image first.' }, { status: 409 });
  }
  if (access.pass.rejectedMasterUrls?.includes(access.pass.videoMasterUrl)) {
    return NextResponse.json({ success: false, error: 'This portrait was not approved. Make a new portrait first.' }, { status: 409 });
  }
  if (!access.pass.videoMasterApproved || access.pass.videoMasterApprovedUrl !== access.pass.videoMasterUrl) {
    return NextResponse.json({ success: false, error: 'Customer approval required before generating the AI video.' }, { status: 403 });
  }
  if (access.pass.videoPromptArchitectureVersion !== VIDEO_PROMPT_ARCHITECTURE_VERSION) {
    return NextResponse.json({ success: false, error: 'Please make a new portrait, then make the video.' }, { status: 409 });
  }
  if (access.pass.videoReferenceSessionId && access.pass.videoReferenceSessionId !== sessionId) {
    return NextResponse.json({ success: false, error: 'This portrait belongs to another session. Make a new portrait.' }, { status: 409 });
  }

  const db = getDb();
  const session = db
    ? (await db.collection('sessions').doc(sessionId).get()).data()
    : getMockStore().sessions.get(sessionId);
  if (!session || session.accessCode !== accessCode || session.masterStoragePath !== `clients/${activeClientId()}/sessions/${sessionId}/master/master.jpg`) {
    return NextResponse.json({ success: false, error: 'Your portrait could not be found. Make a new portrait.' }, { status: 403 });
  }

  const jobId = `vtest_${crypto.randomUUID()}`;
  const { token: webhookToken, hash: webhookTokenHash } = newWebhookToken();
  const createdAt = new Date().toISOString();
  // Engines in order, resting ones left out; a requested test model goes first.
  const engineChain = Array.from(new Set([...(requestedModelId ? [model.id] : []), ...await availableEngines(videoEngineOrder())]));
  const basePath = `clients/${activeClientId()}/sessions/${sessionId}/video-tests/${jobId}`;
  const jobBase = {
    jobId, sessionId, accessCode, passCode, clientId: activeClientId(), modelId: engineChain[0], model: getVideoTestModel(engineChain[0])?.model || model.model, engineChain,
    status: 'preparing', createdAt, updatedAt: createdAt,
    estimatedUsd: model.estimatedUsd, duration: model.seconds,
    attempt: 1, providerName,
    webhookTokenHash,
    promptArchitectureVersion: VIDEO_PROMPT_ARCHITECTURE_VERSION,
  };

  const passLock = await acquirePassVideoLock(passCode, jobId);
  if (!passLock.ok) {
    return NextResponse.json({ success: false, error: passLock.error }, { status: 409 });
  }

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
        await markPassVideoFailed(passCode, jobId);
        return NextResponse.json({ success: false, error: 'Your video is already being made. Please wait.', jobId: message.split(':')[1] }, { status: 409 });
      }
      await markPassVideoFailed(passCode, jobId);
      throw error;
    }
  } else {
    const activeJobId = session.activeVideoTestJobId;
    const activeJob = activeJobId ? getMockStore().sessions.get(`video_test_${activeJobId}`) : null;
    if (activeJob && ['preparing', 'submitted', 'processing', 'unknown'].includes(activeJob.status)) {
      await markPassVideoFailed(passCode, jobId);
      return NextResponse.json({ success: false, error: 'Your video is already being made. Please wait.', jobId: activeJobId }, { status: 409 });
    }
    getMockStore().sessions.set(`video_test_${jobId}`, jobBase);
    getMockStore().sessions.set(sessionId, { ...session, activeVideoTestJobId: jobId, updatedAt: createdAt });
  }

  try {
    const master = await normalizeStorageImage(session.masterStoragePath, `${basePath}/input-master.jpg`);
    const garmentPaths = Array.isArray(access.pass.videoGarmentPhotoStoragePaths)
      ? access.pass.videoGarmentPhotoStoragePaths.filter((value): value is string => typeof value === 'string').slice(0, 2)
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
    if (!concept || concept.category !== category) throw new Error('The selected film concept could not be verified. Generate the festival image again.');
    const garmentRoles = Array.isArray(access.pass.videoMasterGarmentRoles)
      ? access.pass.videoMasterGarmentRoles.map((value) => String(value)).slice(0, garments.length)
      : [];
    // A retry (a video already made, or the last attempt failed) uses the fail-proof backup prompt:
    // customer standing still with a light smile, gentle camera, stable framing.
    const renderRequest: RenderRequest = {
      masterUrl: master.url,
      garmentUrls: garments.map((item) => item.url),
      conceptId: concept.id,
      garmentRoles,
      eventId,
      garmentType: (access.pass.videoMasterGarmentType || 'generic') as GarmentType,
      retryRender: Number(access.pass.usage?.videosGenerated || 0) >= 1 || access.pass.lastVideoFailed === true,
    };
    // The first engine that accepts the job renders it; a refused submission moves on at once.
    const submitted = await submitRender({ chain: engineChain, request: renderRequest, webhookUrl: webhookUrlFor(req.nextUrl.origin, jobId, webhookToken), falKey });

    const update = {
      status: 'submitted', requestId: submitted.requestId, statusUrl: submitted.statusUrl, responseUrl: submitted.responseUrl, providerName,
      modelId: submitted.engine.id, model: submitted.engine.model, estimatedUsd: submitted.engine.estimatedUsd,
      engineAttempts: submitted.attempts, engineSubmittedAt: new Date().toISOString(), renderRequest,
      seed: submitted.seed,
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
    await markPassVideoSubmitted(passCode, jobId);
    return NextResponse.json({ success: true, jobId, status: 'submitted', modelId: submitted.engine.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video test submission failed.';
    const update = { status: 'failed', error: message, engineAttempts: (error as Error & { attempts?: unknown }).attempts || [], updatedAt: new Date().toISOString() };
    if (db) {
      await db.collection('videoTestJobs').doc(jobId).set(update, { merge: true });
      await db.collection('sessions').doc(sessionId).set({ activeVideoTestJobId: null }, { merge: true });
    } else {
      getMockStore().sessions.set(`video_test_${jobId}`, { ...jobBase, ...update });
      getMockStore().sessions.set(sessionId, { ...session, activeVideoTestJobId: null });
    }
    await markPassVideoFailed(passCode, jobId);
    return NextResponse.json({ success: false, status: 'failed', jobId, error: message }, { status: 502 });
  }
}

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { getCampaignPoseId, isCampaignPoseId, isEventId, MAHARAJA_CLIENT_ID, type CampaignPoseId, type CustomerCategory, type EventId, type VideoPromptSet } from '@/lib/maharaja/config';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';
import { buildVideoTestInput, getVideoTestModel } from '@/lib/maharaja/video-test';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function normalizeStorageImage(sourcePath: string, outputPath: string) {
  const expectedPrefix = `clients/${MAHARAJA_CLIENT_ID}/sessions/`;
  if (!sourcePath.startsWith(expectedPrefix)) throw new Error('Video reference path is outside this Maharaja session.');
  const bucket = getStorageBucket();
  if (!bucket) throw new Error('Firebase Storage is unavailable.');
  const [source] = await bucket.file(sourcePath).download();
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

async function normalizeGarmentReference(sourcePath: string, outputPath: string) {
  const expectedPrefix = `clients/${MAHARAJA_CLIENT_ID}/sessions/`;
  if (!sourcePath.startsWith(expectedPrefix)) throw new Error('Video reference path is outside this Maharaja session.');
  const bucket = getStorageBucket();
  if (!bucket) throw new Error('Firebase Storage is unavailable.');
  const [source] = await bucket.file(sourcePath).download();
  const metadata = await sharp(source).rotate().metadata();
  if (!metadata.width || !metadata.height) throw new Error('Garment reference has invalid image dimensions.');
  const output = await sharp(source)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer();
  const outputMetadata = await sharp(output).metadata();
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
  const model = getVideoTestModel('h3-max');
  if (!sessionId || !accessCode || !model) {
    return NextResponse.json({ success: false, error: 'sessionId and accessCode are required.' }, { status: 400 });
  }

  const falKey = process.env.FAL_KEY?.trim();
  if (!falKey) return NextResponse.json({ success: false, error: 'FAL_KEY is not configured.' }, { status: 503 });

  const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
  if (!access.allowed || !access.pass) {
    return NextResponse.json({ success: false, error: access.allowed ? 'A customer AI Video pass is required.' : access.error }, { status: 401 });
  }
  if (!access.pass.videoMasterDone || !access.pass.videoMasterUrl) {
    return NextResponse.json({ success: false, error: 'Generate the festival master image first.' }, { status: 409 });
  }
  if (!access.pass.videoMasterApproved || access.pass.videoMasterApprovedUrl !== access.pass.videoMasterUrl) {
    return NextResponse.json({ success: false, error: 'Approve this exact master image before testing video.' }, { status: 409 });
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

  if (db) {
    const priorJobs = await db.collection('videoTestJobs').where('sessionId', '==', sessionId).limit(10).get();
    const recoverable = priorJobs.docs
      .map((doc) => doc.data())
      .filter((job) => job.accessCode === accessCode && job.status === 'failed' && typeof job.error === 'string' && job.error.includes('FFmpeg binary') && job.responseUrl)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0];
    if (recoverable?.jobId) {
      await db.collection('videoTestJobs').doc(recoverable.jobId).set({ status: 'processing', error: null, updatedAt: new Date().toISOString() }, { merge: true });
      await db.collection('sessions').doc(sessionId).set({ activeVideoTestJobId: recoverable.jobId }, { merge: true });
      return NextResponse.json({ success: true, jobId: recoverable.jobId, status: 'processing', modelId: 'h3-max', estimatedUsd: 0, recovered: true });
    }
  }

  const jobId = `vtest_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const basePath = `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/video-tests/${jobId}`;
  const jobBase = {
    jobId, sessionId, accessCode, modelId: model.id, model: model.model,
    status: 'preparing', createdAt, updatedAt: createdAt,
    estimatedUsd: model.estimatedUsd, duration: model.seconds,
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
        if (activeJob && ['preparing', 'submitted', 'processing'].includes(activeJob.status)) {
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
    if (activeJob && ['preparing', 'submitted', 'processing'].includes(activeJob.status)) {
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
      garments.push(await normalizeGarmentReference(garmentPaths[index], `${basePath}/input-garment-${index + 1}.jpg`));
    }
    const category = access.pass.videoMasterCategory || session.templateId;
    if (!['women', 'men', 'girl', 'boy'].includes(category)) throw new Error('The approved master image has no valid customer category.');
    const eventId: EventId = isEventId(access.pass.eventId)
      ? access.pass.eventId
      : isEventId(session.eventId) ? session.eventId : 'diwali';
    const promptSet = access.pass.videoMasterPromptSet === 'set-2' ? 'set-2' : 'set-1';
    const poseId: CampaignPoseId = isCampaignPoseId(access.pass.videoMasterPoseId)
      ? access.pass.videoMasterPoseId
      : isCampaignPoseId(session?.poseId)
        ? session.poseId
        : getCampaignPoseId(sessionId, category as CustomerCategory);
    const input = buildVideoTestInput(
      model.id,
      master.url,
      garments.map((item) => item.url),
      category as CustomerCategory,
      eventId,
      promptSet as VideoPromptSet,
      poseId,
    );
    const response = await fetch(`https://queue.fal.run/${model.model}`, {
      method: 'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(falError(response.status, raw));
    const provider = JSON.parse(raw);
    const requestId = provider.request_id || provider.requestId;
    const statusUrl = provider.status_url || provider.statusUrl;
    const responseUrl = provider.response_url || provider.responseUrl;
    if (!requestId || !statusUrl || !responseUrl) throw new Error('Fal accepted the request but returned incomplete queue tracking data.');

    const update = {
      status: 'submitted', requestId, statusUrl, responseUrl,
      referenceCount: garments.length + 1,
      eventId,
      category,
      promptSet,
      poseId,
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

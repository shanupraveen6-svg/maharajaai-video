import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';
import { isEventId, MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { incrementPassUsage, logMaharajaActivity, verifyMaharajaAccess } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';
const LIVE_PLAY_COUNT = 2;

function cleanDisplayText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 48);
  return cleaned || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const accessCode = typeof body?.accessCode === 'string' ? body.accessCode.trim() : '';
  const jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : '';
  if (!sessionId || !accessCode || !jobId) {
    return NextResponse.json({ success: false, error: 'sessionId, accessCode and jobId are required.' }, { status: 400 });
  }
  if (body?.liveConsent !== true || body?.loopConsent !== true) {
    return NextResponse.json({ success: false, error: 'Showroom playback and three-day loop consent are required.' }, { status: 400 });
  }
  const promotionConsent = body?.promotionConsent === true;

  const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
  if (!access.allowed || !access.pass) {
    return NextResponse.json({ success: false, error: access.error || 'A valid AI Video pass is required.' }, { status: 401 });
  }
  if (access.pass.experienceType === 'catalogue-gift') {
    return NextResponse.json({ success: false, error: 'Universal AI Video Gift Link videos are private customer gifts and cannot be sent to the showroom TV.' }, { status: 403 });
  }
  const category = access.pass.videoMasterCategory || null;
  if ((category === 'girl' || category === 'boy') && body?.guardianConsent !== true) {
    return NextResponse.json({ success: false, error: 'Parent or legal guardian consent is required for a child video.' }, { status: 400 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const queueId = `live_${sessionId}`;
  const videoId = `video_${sessionId}`;
  const eventId = isEventId(access.pass.eventId) ? access.pass.eventId : 'diwali';
  const expiresAt = new Date(Math.min(
    Number.isFinite(new Date(access.pass.expiresAt).getTime()) ? new Date(access.pass.expiresAt).getTime() : now.getTime() + 3 * 24 * 60 * 60 * 1000,
    now.getTime() + 3 * 24 * 60 * 60 * 1000,
  )).toISOString();
  const customerName = cleanDisplayText(body?.customerName) || cleanDisplayText(access.pass.customerName);
  const customerLocality = cleanDisplayText(body?.customerLocality) || cleanDisplayText(access.pass.customerLocality) || 'தஞ்சாவூர்';
  const liveAudioUrl = getLiveAudioTrack(queueId, eventId);
  const db = getDb();

  let created = false;
  let queueNumber: number | null = null;
  let status = 'queued';

  if (db) {
    const result = await db.runTransaction(async (transaction) => {
      const sessionRef = db.collection('sessions').doc(sessionId);
      const jobRef = db.collection('videoTestJobs').doc(jobId);
      const queueRef = db.collection('liveQueue').doc(queueId);
      const videoRef = db.collection('videos').doc(videoId);
      const screenRef = db.collection('screens').doc('maharaja-main');
      const [sessionDoc, jobDoc, queueDoc, screenDoc, videoDoc] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(jobRef),
        transaction.get(queueRef),
        transaction.get(screenRef),
        transaction.get(videoRef),
      ]);
      const session = sessionDoc.data();
      const job = jobDoc.data();
      if (!session || session.accessCode !== accessCode) throw new Error('This session does not belong to this AI Video pass.');
      if (!job || job.status !== 'ready' || job.sessionId !== sessionId || job.accessCode !== accessCode || !job.videoStoragePath) {
        throw new Error('Only the completed approved H3 video can be sent live.');
      }
      if (queueDoc.exists) {
        const existing = queueDoc.data() || {};
        if (existing.accessCode !== accessCode || existing.videoJobId !== jobId) {
          throw new Error('A different video is already registered for this session.');
        }
        return { created: false, queueNumber: existing.queueNumber || null, status: existing.status || 'queued' };
      }

      const nextQueueNumber = Number(screenDoc.data()?.lastQueueNumber || 0) + 1;
      const liveStoragePath = String(job.liveVideoStoragePath || session.liveVideoStoragePath || videoDoc.data()?.liveStoragePath || '');
      const hasFinalLiveAsset = Boolean(liveStoragePath);
      const media = {
        id: videoId,
        clientId: MAHARAJA_CLIENT_ID,
        sessionId,
        accessCode,
        approvedJobId: jobId,
        storagePath: job.videoStoragePath,
        ...(hasFinalLiveAsset ? { liveStoragePath } : {}),
        eventId,
        category,
        status: 'ready',
        published: false,
        replayEnabled: false,
        liveConsent: true,
        loopConsent: true,
        promotionConsent,
        playbackMode: hasFinalLiveAsset ? 'embedded' : 'external',
        durationSeconds: hasFinalLiveAsset ? 9 : 6,
        hasEmbeddedAudio: hasFinalLiveAsset,
        customerName,
        customerLocality,
        createdAt: nowIso,
        expiresAt,
      };
      transaction.set(videoRef, media, { merge: true });
      transaction.set(queueRef, {
        id: queueId,
        screenId: 'maharaja-main',
        videoId,
        videoJobId: jobId,
        videoUrl: liveStoragePath || job.videoStoragePath,
        sessionId,
        accessCode,
        eventId,
        customerName,
        customerLocality,
        ...(hasFinalLiveAsset ? {} : { liveAudioUrl }),
        status: 'queued',
        priority: 100,
        repeatCount: LIVE_PLAY_COUNT,
        timesPlayed: 0,
        queueNumber: nextQueueNumber,
        playAtMs: now.getTime(),
        createdAt: nowIso,
        consentVersion: '2026-10-live-loop-v1',
        liveConsent: true,
        loopConsent: true,
        promotionConsent,
      });
      transaction.set(screenRef, { lastQueueNumber: nextQueueNumber, updatedAt: nowIso }, { merge: true });
      transaction.set(sessionRef, {
        selectedVideoTestJobId: jobId,
        liveQueueId: queueId,
        liveConsent: true,
        loopConsent: true,
        promotionConsent,
        liveConsentAt: nowIso,
        expiresAt,
        updatedAt: nowIso,
      }, { merge: true });
      return { created: true, queueNumber: nextQueueNumber, status: 'queued' };
    });
    created = result.created;
    queueNumber = result.queueNumber;
    status = result.status;
  } else {
    const store = getMockStore();
    const session = store.sessions.get(sessionId);
    const job = store.sessions.get(`video_test_${jobId}`);
    if (!session || session.accessCode !== accessCode || !job || job.status !== 'ready' || job.sessionId !== sessionId || !job.videoStoragePath) {
      return NextResponse.json({ success: false, error: 'Only the completed approved H3 video can be sent live.' }, { status: 409 });
    }
    const existing = store.liveQueue.find((item) => item.id === queueId) as any;
    if (existing) {
      if (existing.accessCode !== accessCode || existing.videoJobId !== jobId) {
        return NextResponse.json({ success: false, error: 'A different video is already registered for this session.' }, { status: 409 });
      }
      queueNumber = existing.queueNumber || null;
      status = existing.status || 'queued';
    } else {
      queueNumber = store.liveQueue.reduce((highest, item) => Math.max(highest, Number(item.queueNumber || 0)), 0) + 1;
      const liveStoragePath = String((job as any).liveVideoStoragePath || (session as any).liveVideoStoragePath || '');
      const hasFinalLiveAsset = Boolean(liveStoragePath);
      store.videos.set(videoId, {
        id: videoId, sessionId, accessCode, approvedJobId: jobId, storagePath: job.videoStoragePath,
        ...(hasFinalLiveAsset ? { liveStoragePath } : {}),
        eventId, category, status: 'ready', published: false, replayEnabled: false,
        liveConsent: true, loopConsent: true, promotionConsent, playbackMode: hasFinalLiveAsset ? 'embedded' : 'external', durationSeconds: hasFinalLiveAsset ? 9 : 6,
        hasEmbeddedAudio: hasFinalLiveAsset, customerName, customerLocality, createdAt: nowIso, expiresAt,
      });
      store.liveQueue.push({
        id: queueId, screenId: 'maharaja-main', videoId, sessionId, queueNumber,
        status: 'queued', priority: 100, repeatCount: LIVE_PLAY_COUNT, timesPlayed: 0, createdAt: nowIso,
        playAtMs: now.getTime(), accessCode, videoJobId: jobId, eventId, customerName,
        customerLocality, videoUrl: liveStoragePath || job.videoStoragePath, ...(hasFinalLiveAsset ? {} : { liveAudioUrl }), liveConsent: true, loopConsent: true, promotionConsent,
      } as any);
      store.sessions.set(sessionId, {
        ...session, selectedVideoTestJobId: jobId, liveQueueId: queueId,
        liveConsent: true, loopConsent: true, promotionConsent, liveConsentAt: nowIso, expiresAt, updatedAt: nowIso,
      });
      created = true;
    }
  }

  if (created) {
    await Promise.allSettled([
      incrementPassUsage(accessCode, 'goLive'),
      logMaharajaActivity('go-live', `AI Video queued for Maharaja TV #${queueNumber || '?'}`, {
        sessionId,
        jobId,
        queueId,
        queueNumber,
        eventId,
        customerName,
        customerLocality,
        promotionConsent,
      }),
    ]);
  }
  return NextResponse.json({ success: true, queueId, queueNumber, status, created });
}

import { GO_LIVE_LIFETIME_MS } from '@/lib/maharaja/retention';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';
import { isEventId } from '@/lib/maharaja/config';
import { getMaharajaWorkspace, passAllowsGoLive, incrementMaharajaUsage, incrementPassUsage, logMaharajaActivity, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { resolveAccess } from '@/lib/maharaja/access';
import { activeClientId, bindClient, liveScreenId } from '@/lib/maharaja/client-context';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { saveGoLiveEntry } from '@/lib/maharaja/go-live-library';

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
    return NextResponse.json({ success: false, error: 'Showroom playback and one-day loop consent are required.' }, { status: 400 });
  }
  const promotionConsent = body?.promotionConsent === true;

  const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');

  bindClient(access.allowed ? access.clientId : null);
  if (!access.allowed || !access.pass) {
    return NextResponse.json({ success: false, error: access.error || 'A valid AI Video pass is required.' }, { status: 401 });
  }
  if (!passAllowsGoLive(access.pass)) {
    return NextResponse.json({ success: false, error: 'Go Live is available for videos made from the store TV catalogue.' }, { status: 403 });
  }
  const goLiveWorkspace = await getMaharajaWorkspace();
  if (!resolveAccess(goLiveWorkspace.devices, goLiveWorkspace.modules).goLive) {
    return NextResponse.json({ success: false, error: 'Go Live is switched off for this store. You can still download and share your video.' }, { status: 403 });
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
  // A Go Live video plays on the Go Live screen for one day, then it is deleted.
  const expiresAt = new Date(now.getTime() + GO_LIVE_LIFETIME_MS).toISOString();
  const customerName = cleanDisplayText(body?.customerName) || cleanDisplayText(access.pass.customerName);
  // Maharaja's screens show Thanjavur; another store shows the city of its branch.
  const storeLocality = activeClientId() === MAHARAJA_CLIENT_ID ? 'தஞ்சாவூர்' : cleanDisplayText(String(goLiveWorkspace.branch || '').split('·')[0]);
  const customerLocality = cleanDisplayText(body?.customerLocality) || cleanDisplayText(access.pass.customerLocality) || storeLocality;
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
      const screenRef = db.collection('screens').doc(liveScreenId());
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
        throw new Error('Only a finished video can go live.');
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
        clientId: activeClientId(),
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
      // The store's own Go Live library holds the video from consent; it joins the replay loop after two live plays.
      void saveGoLiveEntry({
        id: videoId,
        sessionId,
        storagePath: job.videoStoragePath,
        liveStoragePath: hasFinalLiveAsset ? liveStoragePath : null,
        status: 'ready',
        published: false,
        replayEnabled: false,
        eventId,
        category,
        playbackMode: hasFinalLiveAsset ? 'embedded' : 'external',
        hasEmbeddedAudio: hasFinalLiveAsset,
        durationSeconds: hasFinalLiveAsset ? 9 : 6,
        customerName,
        customerLocality,
        createdAt: nowIso,
        expiresAt,
        updatedAt: nowIso,
      }, { transaction });
      transaction.set(queueRef, {
        id: queueId,
        screenId: liveScreenId(),
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
        retentionPolicyVersion: 'live-v2',
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
      return NextResponse.json({ success: false, error: 'Only a finished video can go live.' }, { status: 409 });
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
      await saveGoLiveEntry({
        id: videoId, sessionId, storagePath: job.videoStoragePath, liveStoragePath: hasFinalLiveAsset ? liveStoragePath : null,
        status: 'ready', published: false, replayEnabled: false, eventId, category,
        playbackMode: hasFinalLiveAsset ? 'embedded' : 'external', hasEmbeddedAudio: hasFinalLiveAsset, durationSeconds: hasFinalLiveAsset ? 9 : 6,
        customerName, customerLocality, createdAt: nowIso, expiresAt, updatedAt: nowIso,
      });
      store.videos.set(videoId, {
        id: videoId, clientId: activeClientId(), sessionId, accessCode, approvedJobId: jobId, storagePath: job.videoStoragePath,
        ...(hasFinalLiveAsset ? { liveStoragePath } : {}),
        eventId, category, status: 'ready', published: false, replayEnabled: false,
        liveConsent: true, loopConsent: true, promotionConsent, playbackMode: hasFinalLiveAsset ? 'embedded' : 'external', durationSeconds: hasFinalLiveAsset ? 9 : 6,
        hasEmbeddedAudio: hasFinalLiveAsset, customerName, customerLocality, createdAt: nowIso, expiresAt,
      });
      store.liveQueue.push({
        id: queueId, screenId: liveScreenId(), videoId, sessionId, queueNumber,
        status: 'queued', priority: 100, repeatCount: LIVE_PLAY_COUNT, timesPlayed: 0, createdAt: nowIso,
        playAtMs: now.getTime(), accessCode, videoJobId: jobId, eventId, customerName,
        customerLocality, videoUrl: liveStoragePath || job.videoStoragePath, ...(hasFinalLiveAsset ? {} : { liveAudioUrl }), liveConsent: true, loopConsent: true, promotionConsent,
      } as any);
      store.sessions.set(sessionId, {
        ...session, selectedVideoTestJobId: jobId, liveQueueId: queueId,
        retentionPolicyVersion: 'live-v2', liveConsent: true, loopConsent: true, promotionConsent, liveConsentAt: nowIso, expiresAt, updatedAt: nowIso,
      });
      created = true;
    }
  }

  if (created) {
    await Promise.allSettled([
      incrementPassUsage(accessCode, 'goLive'),
      incrementMaharajaUsage('goLive'),
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

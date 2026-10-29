import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';
import { isEventId, MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { logMaharajaActivity } from '@/lib/maharaja/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export const dynamic = 'force-dynamic';

const LIVE_PLAY_COUNT = 2;

function cleanDisplayText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 48);
  return cleaned || fallback;
}

/**
 * Recovery is deliberately operator-only. It is for an already-rendered video
 * whose customer pass has expired; it never restores or bypasses that pass.
 */
export async function POST(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized operator session.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
  const jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : '';
  if (!sessionId || !jobId) {
    return NextResponse.json({ success: false, error: 'sessionId and jobId are required.' }, { status: 400 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const queueId = `live_${sessionId}`;
  const videoId = `video_${sessionId}`;
  const expiresAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();

  try {
    let queueNumber: number | null = null;
    let created = false;

    if (db) {
      const result = await db.runTransaction(async (transaction) => {
        const sessionRef = db.collection('sessions').doc(sessionId);
        const jobRef = db.collection('videoTestJobs').doc(jobId);
        const queueRef = db.collection('liveQueue').doc(queueId);
        const videoRef = db.collection('videos').doc(videoId);
        const screenRef = db.collection('screens').doc('maharaja-main');
        const [sessionDoc, jobDoc, queueDoc, videoDoc, screenDoc] = await Promise.all([
          transaction.get(sessionRef),
          transaction.get(jobRef),
          transaction.get(queueRef),
          transaction.get(videoRef),
          transaction.get(screenRef),
        ]);
        const session = sessionDoc.data();
        const job = jobDoc.data();
        if (!session || !job || job.sessionId !== sessionId || job.status !== 'ready' || !job.videoStoragePath) {
          throw new Error('Only an already completed stored video can be recovered to Maharaja TV.');
        }
        if (queueDoc.exists) {
          const existing = queueDoc.data() || {};
          if (existing.videoJobId !== jobId) throw new Error('A different video is already registered for this session.');
          return { created: false, queueNumber: Number(existing.queueNumber || 0) || null };
        }

        const eventId = isEventId(session.eventId) ? session.eventId : 'diwali';
        const liveStoragePath = String(job.liveVideoStoragePath || session.liveVideoStoragePath || videoDoc.data()?.liveStoragePath || '');
        const hasFinalLiveAsset = Boolean(liveStoragePath);
        const nextQueueNumber = Number(screenDoc.data()?.lastQueueNumber || 0) + 1;
        const customerName = cleanDisplayText(session.customerName, 'Maharaja Guest');
        const customerLocality = cleanDisplayText(session.customerLocality, 'தஞ்சாவூர்');

        transaction.set(videoRef, {
          id: videoId,
          clientId: MAHARAJA_CLIENT_ID,
          sessionId,
          approvedJobId: jobId,
          storagePath: job.videoStoragePath,
          ...(hasFinalLiveAsset ? { liveStoragePath } : {}),
          eventId,
          category: session.videoMasterCategory || null,
          status: 'ready',
          published: false,
          replayEnabled: false,
          liveConsent: true,
          loopConsent: true,
          promotionConsent: false,
          playbackMode: hasFinalLiveAsset ? 'embedded' : 'external',
          durationSeconds: hasFinalLiveAsset ? 9 : 6,
          hasEmbeddedAudio: hasFinalLiveAsset,
          customerName,
          customerLocality,
          operatorRecovery: true,
          createdAt: nowIso,
          expiresAt,
        }, { merge: true });
        transaction.set(queueRef, {
          id: queueId,
          screenId: 'maharaja-main',
          videoId,
          videoJobId: jobId,
          videoUrl: liveStoragePath || job.videoStoragePath,
          sessionId,
          eventId,
          customerName,
          customerLocality,
          ...(hasFinalLiveAsset ? {} : { liveAudioUrl: getLiveAudioTrack(queueId, eventId) }),
          status: 'queued',
          priority: 100,
          repeatCount: LIVE_PLAY_COUNT,
          timesPlayed: 0,
          queueNumber: nextQueueNumber,
          playAtMs: now.getTime(),
          createdAt: nowIso,
          expiresAt,
          operatorRecovery: true,
          liveConsent: true,
          loopConsent: true,
          promotionConsent: false,
        });
        transaction.set(screenRef, { lastQueueNumber: nextQueueNumber, updatedAt: nowIso }, { merge: true });
        transaction.set(sessionRef, {
          selectedVideoTestJobId: jobId,
          liveQueueId: queueId,
          retentionPolicyVersion: 'live-v2',
          liveConsent: true,
          loopConsent: true,
          promotionConsent: false,
          operatorRecovery: true,
          operatorRecoveryAt: nowIso,
          expiresAt,
          updatedAt: nowIso,
        }, { merge: true });
        return { created: true, queueNumber: nextQueueNumber };
      });
      created = result.created;
      queueNumber = result.queueNumber;
    } else {
      const store = getMockStore();
      const session = store.sessions.get(sessionId);
      const job = store.sessions.get(`video_test_${jobId}`);
      if (!session || !job || job.sessionId !== sessionId || job.status !== 'ready' || !job.videoStoragePath) {
        return NextResponse.json({ success: false, error: 'Only an already completed stored video can be recovered to Maharaja TV.' }, { status: 409 });
      }
      const existing = store.liveQueue.find((item: any) => item.id === queueId) as any;
      if (existing) {
        if (existing.videoJobId !== jobId) return NextResponse.json({ success: false, error: 'A different video is already registered for this session.' }, { status: 409 });
        queueNumber = existing.queueNumber || null;
      } else {
        queueNumber = store.liveQueue.reduce((highest: number, item: any) => Math.max(highest, Number(item.queueNumber || 0)), 0) + 1;
        store.liveQueue.push({ id: queueId, screenId: 'maharaja-main', videoId, videoJobId: jobId, videoUrl: job.videoStoragePath, sessionId, status: 'queued', priority: 100, repeatCount: LIVE_PLAY_COUNT, timesPlayed: 0, queueNumber, playAtMs: now.getTime(), createdAt: nowIso, expiresAt, operatorRecovery: true, liveConsent: true, loopConsent: true, promotionConsent: false } as any);
        created = true;
      }
    }

    if (created) {
      await logMaharajaActivity('go-live', `Operator recovery queued for Maharaja TV #${queueNumber || '?'}`, {
        sessionId,
        jobId,
        queueId,
        queueNumber,
        operatorRecovery: true,
        promotionConsent: false,
      });
    }
    return NextResponse.json({ success: true, created, queueId, queueNumber });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Unable to recover the stored video.' }, { status: 409 });
  }
}

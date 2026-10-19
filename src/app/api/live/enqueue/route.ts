import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getSignedPlaybackUrl } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { incrementMaharajaUsage, incrementPassUsage, logMaharajaActivity, markVideoPassUsed, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';

function getMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

const ACTIVE_STATUSES = new Set(['queued', 'reserved', 'playing']);

function cleanDisplayText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 48);
  return cleaned || fallback;
}

function cleanLiveAudioUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned.startsWith('/audio/maharaja/live/') || !cleaned.endsWith('.mp3')) return null;
  return cleaned.slice(0, 96);
}

function compareQueueItems(a: any, b: any): number {
  const queueDiff = Number(a.queueNumber || 0) - Number(b.queueNumber || 0);
  if (queueDiff !== 0) return queueDiff;

  const playDiff = getMillis(a.playAtMs || a.playAt) - getMillis(b.playAtMs || b.playAt);
  if (playDiff !== 0) return playDiff;

  return getMillis(a.createdAt) - getMillis(b.createdAt);
}

async function getQueuePosition(db: any, queueId: string): Promise<number | null> {
  const snapshot = await db.collection('liveQueue')
    .where('screenId', '==', 'maharaja-main')
    .where('status', '==', 'queued')
    .get();

  const queuedItems = snapshot.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort(compareQueueItems);

  const index = queuedItems.findIndex((item: any) => item.id === queueId);
  return index >= 0 ? index + 1 : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, videoId } = body;
    const access = await verifyMaharajaAccess(req, body.accessCode, 'ai-video');
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }
    const customerName = cleanDisplayText(body.customerName, 'Maharaja Customer');
    const customerLocality = cleanDisplayText(body.customerLocality, 'Thanjavur');
    const liveAudioUrl = cleanLiveAudioUrl(body.liveAudioUrl);

    if (body.showroomConsent !== true) {
      return NextResponse.json({ success: false, error: 'Showroom display permission is required for Go Live.' }, { status: 400 });
    }
    const storedCategory = access.pass?.videoMasterCategory;
    const category = (storedCategory && ['women', 'men', 'girl', 'boy'].includes(storedCategory))
      ? storedCategory
      : (body.category && ['women', 'men', 'girl', 'boy'].includes(body.category) ? body.category : 'men');
    const isMinorCategory = category === 'girl' || category === 'boy';
    if (isMinorCategory && body.guardianConsent !== true) {
      return NextResponse.json({ success: false, error: 'Parent or legal guardian permission is required for a child to Go Live.' }, { status: 400 });
    }
    const promotionConsent = !isMinorCategory && body.promotionConsent === true;


    if (!sessionId || !videoId) {
      return NextResponse.json(
        { success: false, error: 'sessionId and videoId parameters are required for Go Live.' },
        { status: 400 }
      );
    }
    const rate = await enforceRateLimit(req, 'go-live', 10, 10 * 60 * 1000, access.pass?.code || sessionId);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: 'Too many Go Live requests. Wait briefly and try again.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      });
    }


    let queueId = `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const playAtMs = nowMs + 5000;
    const playAtTimestamp = Timestamp.fromMillis(playAtMs);
    const playAtIso = new Date(playAtMs).toISOString();
    const db = getDb();
    let resolvedVideoUrl = '';
    let resolvedStoragePath = '';
    if (db) {
      const [videoDoc, sessionDoc] = await Promise.all([
        db.collection('videos').doc(videoId).get(),
        db.collection('sessions').doc(sessionId).get(),
      ]);
      const videoData = videoDoc.data();
      const sessionData = sessionDoc.data();
      if (!sessionDoc.exists || (access.pass && sessionData?.accessCode !== body.accessCode)) {
        return NextResponse.json({ success: false, error: 'This video session does not belong to this customer pass.' }, { status: 403 });
      }
      if (!videoDoc.exists || videoData?.sessionId !== sessionId || videoData?.status !== 'ready' || !videoData?.storagePath) {
        return NextResponse.json({ success: false, error: 'The final AI Video is not ready for Go Live.' }, { status: 409 });
      }
      if (videoData?.liveStoragePath) {
        resolvedStoragePath = videoData.liveStoragePath;
        resolvedVideoUrl = sessionData?.liveVideoUrl || await getSignedPlaybackUrl(videoData.liveStoragePath);
      } else {
        resolvedStoragePath = videoData.storagePath;
        resolvedVideoUrl = sessionData?.liveVideoUrl || sessionData?.videoUrl || await getSignedPlaybackUrl(videoData.storagePath);
      }
    } else {
      const mockStore = getMockStore();
      const videoData = mockStore.videos.get(videoId);
      const sessionData = mockStore.sessions.get(sessionId);
      if (!sessionData || (access.pass && sessionData.accessCode !== body.accessCode)) {
        return NextResponse.json({ success: false, error: 'This video session does not belong to this customer pass.' }, { status: 403 });
      }
      if (!videoData || videoData.sessionId !== sessionId || videoData.status !== 'ready' || !videoData.storagePath) {
        return NextResponse.json({ success: false, error: 'The final AI Video is not ready for Go Live.' }, { status: 409 });
      }
      if (videoData?.liveStoragePath) {
        resolvedStoragePath = videoData.liveStoragePath;
        resolvedVideoUrl = videoData?.liveVideoUrl || await getSignedPlaybackUrl(videoData.liveStoragePath);
      } else {
        resolvedStoragePath = videoData.storagePath;
        resolvedVideoUrl = videoData?.liveVideoUrl || videoData?.videoUrl || await getSignedPlaybackUrl(videoData.storagePath);
      }
    }

    const displayMetadata = {
      customerName,
      customerLocality,
      liveAudioUrl,
      videoUrl: resolvedVideoUrl,
      playbackStoragePath: resolvedStoragePath,
      playbackMode: 'embedded',
      durationSeconds: /(?:live[-_]?9s|final[-_]?9s)/i.test(resolvedStoragePath) ? 9 : 6,
      hasEmbeddedAudio: true,
      category,
      showroomConsent: true,
      guardianConsent: isMinorCategory,
      promotionConsent,
      consentVersion: '2026-10-privacy-v1',
      consentedAt: nowIso,
      expiresAt: new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString(),
      displayUpdatedAt: nowIso
    };
    let queueNumber = 1;
    let queuePosition: number | null = 1;
    let reusedExistingQueue = false;

    const baseQueueItem = {
      id: queueId,
      screenId: 'maharaja-main',
      videoId,
      sessionId,
      accessCode: typeof body.accessCode === 'string' ? body.accessCode.trim() : '',
      clientId: 'maharaja',
      customerName,
      customerLocality,
      liveAudioUrl,
      videoUrl: resolvedVideoUrl,
      status: 'queued' as const,
      priority: 1,
      repeatCount: 1,
      timesPlayed: 0,
      createdAt: nowIso,
      playAt: playAtTimestamp,
      playAtIso,
      playAtMs
    };

    if (db) {
      const counterRef = db.collection('appControl').doc('liveQueueCounter');

      await db.runTransaction(async (transaction: any) => {
        const existingSnapshot = await transaction.get(
          db.collection('liveQueue').where('sessionId', '==', sessionId)
        );
        const existingActive = existingSnapshot.docs
          .map((doc: any) => ({ ref: doc.ref, id: doc.id, ...doc.data() }))
          .filter((item: any) => item.screenId === 'maharaja-main' && ACTIVE_STATUSES.has(item.status || 'queued'))
          .sort(compareQueueItems)[0];

        if (existingActive) {
          queueId = existingActive.id;
          queueNumber = Number(existingActive.queueNumber || 1);
          reusedExistingQueue = true;
          transaction.update(existingActive.ref, {
            ...displayMetadata,
            updatedAt: nowIso
          });
          transaction.set(db.collection('videos').doc(videoId), displayMetadata, { merge: true });
          transaction.set(db.collection('sessions').doc(sessionId), displayMetadata, { merge: true });
          return;
        }

        const queueRef = db.collection('liveQueue').doc(queueId);
        const counterDoc = await transaction.get(counterRef);
        const current = counterDoc.exists ? Number(counterDoc.data()?.lastQueueNumber || 0) : 0;
        queueNumber = current + 1;
        transaction.set(counterRef, {
          lastQueueNumber: queueNumber,
          updatedAt: nowIso
        }, { merge: true });
        transaction.set(queueRef, {
          ...baseQueueItem,
          queueNumber
      });
        transaction.set(db.collection('videos').doc(videoId), displayMetadata, { merge: true });
        transaction.set(db.collection('sessions').doc(sessionId), displayMetadata, { merge: true });
      });
      queuePosition = await getQueuePosition(db, queueId);
    } else {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          {
            success: false,
            error: 'Real Firebase is not configured for the live queue. Set Firebase Admin env vars in Vercel before using Go Live.'
          },
          { status: 500 }
        );
      }

      const mockStore = getMockStore();
      const existingActive = mockStore.liveQueue
        .filter((item: any) => item.sessionId === sessionId && item.screenId === 'maharaja-main' && ACTIVE_STATUSES.has(item.status || 'queued'))
        .sort(compareQueueItems)[0];

      if (existingActive) {
        queueId = existingActive.id;
        queueNumber = existingActive.queueNumber || 1;
        reusedExistingQueue = true;
        Object.assign(existingActive as any, displayMetadata, { updatedAt: nowIso });
      } else {
        queueNumber = mockStore.liveQueue.reduce((max: number, item: any) => Math.max(max, Number(item.queueNumber || 0)), 0) + 1;
        mockStore.liveQueue.push({
          ...baseQueueItem,
          id: queueId,
          queueNumber,
          playAt: playAtIso
        });
      }
      const mockVideo = mockStore.videos.get(videoId) || { id: videoId, sessionId };
      mockStore.videos.set(videoId, { ...mockVideo, ...displayMetadata });
      const mockSession = mockStore.sessions.get(sessionId) || { sessionId };
      mockStore.sessions.set(sessionId, { ...mockSession, ...displayMetadata });

      const queuedItems = mockStore.liveQueue
        .filter((item: any) => item.screenId === 'maharaja-main' && item.status === 'queued')
        .sort(compareQueueItems);
      const index = queuedItems.findIndex((item: any) => item.id === queueId);
      queuePosition = index >= 0 ? index + 1 : null;
    }

    const phone = access.pass?.phone || '';
    const phoneMasked = access.pass?.phoneMasked || (phone ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : 'Customer');

    if (!reusedExistingQueue) {
      await incrementMaharajaUsage('goLive');
      if (access.pass) {
        await incrementPassUsage(access.pass.code, 'goLive');
        await markVideoPassUsed(access.pass.code);
      }
      await logMaharajaActivity('go-live', `Customer ${customerName} joined the Maharaja live-screen queue`, {
        sessionId,
        queueNumber,
        customerName,
        phone,
        phoneMasked,
        videoUrl: resolvedVideoUrl,
        storagePath: resolvedStoragePath,
        showroomConsent: true,
        guardianConsent: isMinorCategory,
        promotionConsent,
        });
    }

    return NextResponse.json({
      success: true,
      queueId,
      queueNumber,
      queuePosition,
      peopleAhead: queuePosition ? Math.max(queuePosition - 1, 0) : null,
      playAt: playAtIso,
      reusedExistingQueue,
      message: reusedExistingQueue
        ? 'Your Maharaja Diwali moment is already in the live queue.'
        : 'Your Maharaja Diwali moment has been added to the big screen.'
    });
  } catch (error: any) {
    console.error('Enqueue Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

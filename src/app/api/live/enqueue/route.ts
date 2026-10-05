import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

function getMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

const ACTIVE_STATUSES = new Set(['queued', 'reserved', 'playing']);

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


    if (!sessionId || !videoId) {
      return NextResponse.json(
        { success: false, error: 'sessionId and videoId parameters are required for Go Live.' },
        { status: 400 }
      );
    }


    let queueId = `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const playAtMs = nowMs + 5000;
    const playAtTimestamp = Timestamp.fromMillis(playAtMs);
    const playAtIso = new Date(playAtMs).toISOString();
    let queueNumber = 1;
    let queuePosition: number | null = 1;
    let reusedExistingQueue = false;

    const baseQueueItem = {
      id: queueId,
      screenId: 'maharaja-main',
      videoId,
      sessionId,
      status: 'queued' as const,
      priority: 1,
      repeatCount: 1,
      timesPlayed: 0,
      createdAt: nowIso,
      playAt: playAtTimestamp,
      playAtIso,
      playAtMs
    };

    const db = getDb();
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
            updatedAt: nowIso
          });
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
      } else {
        queueNumber = mockStore.liveQueue.reduce((max: number, item: any) => Math.max(max, Number(item.queueNumber || 0)), 0) + 1;
        mockStore.liveQueue.push({
          ...baseQueueItem,
          id: queueId,
          queueNumber,
          playAt: playAtIso
        });
      }

      const queuedItems = mockStore.liveQueue
        .filter((item: any) => item.screenId === 'maharaja-main' && item.status === 'queued')
        .sort(compareQueueItems);
      const index = queuedItems.findIndex((item: any) => item.id === queueId);
      queuePosition = index >= 0 ? index + 1 : null;
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

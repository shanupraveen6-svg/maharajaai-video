import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { goLiveClientId, resolveRequestClientId, logMaharajaActivity } from '@/lib/maharaja/server';
import { verifyTvRequest } from '@/lib/auth/display';
import { bindClient } from '@/lib/maharaja/client-context';

export async function POST(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  if (!(await goLiveClientId(req)) && !await verifyTvRequest(req)) {
    return NextResponse.json({ success: false, error: 'Open this screen from the workspace Go Live link.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { queueId, reservationId, heartbeat = false } = body;

    if (!queueId || !reservationId) {
      return NextResponse.json({ success: false, error: 'Missing queueId or reservationId' }, { status: 400 });
    }

    const db = getDb();
    const nowIso = new Date().toISOString();

    if (db) {
      const queueDocRef = db.collection('liveQueue').doc(queueId);
      const queueDoc = await queueDocRef.get();

      if (!queueDoc.exists || queueDoc.data()?.reservationId !== reservationId) {
        return NextResponse.json({ success: false, error: 'Invalid reservation' }, { status: 400 });
      }

      await queueDocRef.update({
        status: 'playing',
        startedAt: heartbeat ? queueDoc.data()?.startedAt || nowIso : nowIso,
        lastHeartbeatAt: nowIso,
      });
    } else {
      const mockStore = getMockStore();
      const item = mockStore.liveQueue.find((i) => i.id === queueId && i.reservationId === reservationId);
      if (!item) {
        return NextResponse.json({ success: false, error: 'Invalid reservation' }, { status: 400 });
      }

      item.status = 'playing';
      item.startedAt = heartbeat ? item.startedAt || nowIso : nowIso;
      (item as any).lastHeartbeatAt = nowIso;
    }

    if (!heartbeat) {
      await logMaharajaActivity('video', 'TV playback started', { queueId, reservationId, stage: 'tv-play' });
    }
    return NextResponse.json({ success: true, status: 'playing' });
  } catch (error: any) {
    console.error('TV Playing Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

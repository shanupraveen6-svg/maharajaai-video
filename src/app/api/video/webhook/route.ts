import { NextRequest, NextResponse } from 'next/server';
import { finalizeCompletedVideo, markPassVideoFailed } from '@/lib/maharaja/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const jobId = searchParams.get('jobId') || '';
    const sessionId = searchParams.get('sessionId') || '';
    const accessCode = searchParams.get('accessCode') || null;

    const body = await req.json().catch(() => ({}));
    console.log('FAL_WEBHOOK_RECEIVED', { jobId, sessionId, status: body.status, requestId: body.request_id });

    if (!jobId || !sessionId) {
      return NextResponse.json({ success: false, error: 'jobId and sessionId are required.' }, { status: 400 });
    }

    if (body.status === 'ERROR') {
      const db = getDb();
      const errorMessage = body.error || 'Fal.ai reported a video generation error.';
      if (accessCode) await markPassVideoFailed(accessCode, jobId);
      if (db) {
        await db.collection('sessions').doc(sessionId).set({
          videoStatus: 'failed',
          videoError: errorMessage,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } else {
        const mockStore = getMockStore();
        const session = mockStore.sessions.get(sessionId) || {};
        mockStore.sessions.set(sessionId, {
          ...session,
          videoStatus: 'failed',
          videoError: errorMessage,
          updatedAt: new Date().toISOString(),
        });
      }
      return NextResponse.json({ success: true, handled: 'error' });
    }

    // Output can be nested under payload.video.url or output.video.url or video.url
    const outputVideoUrl = body.payload?.video?.url || body.output?.video?.url || body.video?.url;
    if (outputVideoUrl && typeof outputVideoUrl === 'string') {
      const db = getDb();
      let eventId = 'diwali';
      if (db) {
        const sDoc = await db.collection('sessions').doc(sessionId).get();
        if (sDoc.exists && sDoc.data()?.eventId) eventId = sDoc.data()?.eventId;
      } else {
        const mockStore = getMockStore();
        const s = mockStore.sessions.get(sessionId);
        if (s?.eventId) eventId = s.eventId;
      }

      const finalizeResult = await finalizeCompletedVideo({
        sessionId,
        jobId,
        outputVideoUrl,
        accessCode,
        eventId,
      });

      if (!finalizeResult.success) {
        return NextResponse.json({ success: false, error: finalizeResult.error }, { status: 500 });
      }

      return NextResponse.json({ success: true, handled: 'ready', videoUrl: finalizeResult.videoUrl });
    }

    return NextResponse.json({ success: true, handled: 'ignored' });
  } catch (err: any) {
    console.error('Fal Webhook Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

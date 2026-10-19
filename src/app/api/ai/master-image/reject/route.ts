import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { logMaharajaActivity, rejectPassMasterImage, verifyMaharajaAccess } from '@/lib/maharaja/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessCode, sessionId, reason } = body;
    const service: 'try-on' | 'ai-video' = body.service === 'try-on' ? 'try-on' : 'ai-video';

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required.' }, { status: 400 });
    }

    const access = await verifyMaharajaAccess(req, accessCode, service);
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }

    const db = getDb();
    const existingSession = db
      ? (await db.collection('sessions').doc(sessionId).get()).data()
      : getMockStore().sessions.get(sessionId);
    if (!existingSession || (access.pass && existingSession.accessCode !== accessCode)) {
      return NextResponse.json({ success: false, error: 'This image session does not belong to this customer pass.' }, { status: 403 });
    }

    if (access.pass) {
      await rejectPassMasterImage(access.pass.code, service, reason);
    }

    const nowIso = new Date().toISOString();
    if (db) {
      const sessionRef = db.collection('sessions').doc(sessionId);
      await sessionRef.set({
        ...(service === 'ai-video' ? {
          masterImageUrl: null,
          masterImageApproved: false,
          masterImageApprovedUrl: null,
          masterImageRejected: true,
          masterImageRejectedAt: nowIso,
          masterImageRejectionReason: reason || 'customer_rejected',
        } : {
          tryOnImageUrl: null,
          tryOnImageRejected: true,
          tryOnImageRejectedAt: nowIso,
        }),
        updatedAt: nowIso,
      }, { merge: true });
    } else {
      const mockStore = getMockStore();
      const existing = existingSession;
      mockStore.sessions.set(sessionId, {
        ...existing,
        ...(service === 'ai-video' ? {
          masterImageUrl: null,
          masterImageApproved: false,
          masterImageApprovedUrl: null,
          masterImageRejected: true,
          masterImageRejectedAt: nowIso,
          masterImageRejectionReason: reason || 'customer_rejected',
        } : {
          tryOnImageUrl: null,
          tryOnImageRejected: true,
          tryOnImageRejectedAt: nowIso,
        }),
        updatedAt: nowIso,
      });
    }

    await logMaharajaActivity('image-rejected', reason ? `Master image rejected: ${reason}` : 'Festival master image rejected by customer', {
      sessionId,
      service,
      reason: reason || 'customer_rejected',
      accessCode: typeof accessCode === 'string' ? accessCode : undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Master image safely invalidated on server. Fresh generation permitted.',
    });
  } catch (error: any) {
    console.error('Master image rejection error:', error);
    const msg = error?.message || 'Failed to reject master image.';
    const isConflict = msg.includes('already completed') || msg.includes('in progress');
    return NextResponse.json(
      { success: false, error: msg },
      { status: isConflict ? 409 : 500 }
    );
  }
}

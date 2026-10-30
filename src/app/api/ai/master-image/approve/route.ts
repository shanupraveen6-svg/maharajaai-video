import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { approvePassVideoMaster, logMaharajaActivity, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { bindClient } from '@/lib/maharaja/client-context';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessCode, sessionId, masterImageUrl, imageUrl } = body;
    const targetUrl = masterImageUrl || imageUrl;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required.' }, { status: 400 });
    }

    const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');

    bindClient(access.allowed ? access.clientId : null);
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

    let approvedUrl = targetUrl;
    if (access.pass) {
      if (!access.pass.videoMasterDone || !access.pass.videoMasterUrl) {
        return NextResponse.json(
          { success: false, error: 'No festival master image exists to approve. Generate the image first.' },
          { status: 400 }
        );
      }
      if (targetUrl && access.pass.videoMasterUrl !== targetUrl) {
        return NextResponse.json(
          { success: false, error: 'Master image version mismatch: This image was superseded by another generation.' },
          { status: 409 }
        );
      }
      approvedUrl = access.pass.videoMasterUrl;
      await approvePassVideoMaster(access.pass.code, approvedUrl);
    }

    const nowIso = new Date().toISOString();
    if (db) {
      const sessionRef = db.collection('sessions').doc(sessionId);
      await sessionRef.set({
        masterImageApproved: true,
        masterImageApprovedAt: nowIso,
        masterImageApprovedUrl: approvedUrl,
        updatedAt: nowIso,
      }, { merge: true });
    } else {
      const mockStore = getMockStore();
      const existing = existingSession;
      mockStore.sessions.set(sessionId, {
        ...existing,
        masterImageApproved: true,
        masterImageApprovedAt: nowIso,
        masterImageApprovedUrl: approvedUrl,
        updatedAt: nowIso,
      });
    }

    await logMaharajaActivity('image-approved', 'Festival master image approved by customer', {
      sessionId,
      accessCode: typeof accessCode === 'string' ? accessCode : undefined,
    });

    return NextResponse.json({
      success: true,
      approvedUrl,
      message: 'Master image successfully approved. You can now generate your cinematic AI video.',
    });
  } catch (error: any) {
    console.error('Master image approval error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to approve master image.' },
      { status: 500 }
    );
  }
}

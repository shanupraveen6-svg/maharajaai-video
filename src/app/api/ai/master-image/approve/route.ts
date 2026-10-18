import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { approvePassVideoMaster, logMaharajaActivity, verifyMaharajaAccess } from '@/lib/maharaja/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessCode, sessionId, masterImageUrl, imageUrl } = body;
    const targetUrl = masterImageUrl || imageUrl;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required.' }, { status: 400 });
    }

    const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
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
    const db = getDb();
    if (db) {
      await db.collection('sessions').doc(sessionId).set({
        masterImageApproved: true,
        masterImageApprovedAt: nowIso,
        masterImageApprovedUrl: approvedUrl,
        updatedAt: nowIso,
      }, { merge: true });
    } else {
      const mockStore = getMockStore();
      const existing = mockStore.sessions.get(sessionId) || {};
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

import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export async function POST(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized operator session. Please login again.' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, storagePath: clientStoragePath, masterImageUrl: clientMasterUrl } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId parameter is required.' },
        { status: 400 }
      );
    }

    const targetStoragePath = clientStoragePath || `sessions/${sessionId}/master/master.jpg`;
    const nowIso = new Date().toISOString();
    let masterImageUrl = clientMasterUrl || null;

    const bucket = getStorageBucket();
    if (bucket) {
      const file = bucket.file(targetStoragePath);
      const [exists] = await file.exists();
      if (exists) {
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 24 * 60 * 60 * 1000
        });
        masterImageUrl = signedUrl;
      } else if (!masterImageUrl) {
        return NextResponse.json(
          { success: false, error: `Uploaded master image object does not exist at storagePath: ${targetStoragePath}` },
          { status: 400 }
        );
      }
    }

    if (!masterImageUrl) {
      return NextResponse.json(
        { success: false, error: `Failed to verify or generate master image URL for session ${sessionId}` },
        { status: 400 }
      );
    }

    const db = getDb();
    if (db) {
      await db.collection('sessions').doc(sessionId).set({
        sessionId,
        masterImageUrl,
        masterStoragePath: targetStoragePath,
        status: 'master_ready',
        updatedAt: nowIso
      }, { merge: true });
    } else {
      const mockStore = getMockStore();
      const existingSession = mockStore.sessions.get(sessionId) || {};
      mockStore.sessions.set(sessionId, {
        ...existingSession,
        sessionId,
        masterImageUrl,
        masterStoragePath: targetStoragePath,
        status: 'master_ready',
        updatedAt: nowIso
      });
    }

    return NextResponse.json({
      success: true,
      sessionId,
      masterImageUrl,
      message: 'Master image uploaded and registered successfully.'
    });
  } catch (error: any) {
    console.error('Master Complete Route Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to complete master image upload.' },
      { status: 500 }
    );
  }
}

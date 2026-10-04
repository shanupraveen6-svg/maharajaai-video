import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, storagePath: clientStoragePath, videoUrl: clientVideoUrl } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId parameter is required.' },
        { status: 400 }
      );
    }

    const targetStoragePath = clientStoragePath || `sessions/${sessionId}/video/final.mp4`;
    const nowIso = new Date().toISOString();
    let videoUrl: string | null = clientVideoUrl || null;

    const bucket = getStorageBucket();
    if (bucket) {
      const file = bucket.file(targetStoragePath);
      const [exists] = await file.exists();

      if (!exists) {
        return NextResponse.json(
          { success: false, error: `Uploaded video object does not exist at storagePath: ${targetStoragePath}` },
          { status: 400 }
        );
      }

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000
      });
      videoUrl = signedUrl;
    }

    if (!videoUrl) {
      return NextResponse.json(
        { success: false, error: `Failed to verify or generate video URL for session ${sessionId}` },
        { status: 400 }
      );
    }


    const db = getDb();
    if (db) {
      await db.collection('videos').doc(`video_${sessionId}`).set({
        id: `video_${sessionId}`,
        sessionId,
        storagePath: targetStoragePath,
        status: 'ready',
        createdAt: nowIso
      }, { merge: true });

      await db.collection('sessions').doc(sessionId).set({
        sessionId,
        videoStatus: 'ready',
        videoUrl,
        videoStoragePath: targetStoragePath,
        updatedAt: nowIso
      }, { merge: true });
    } else {
      const mockStore = getMockStore();
      mockStore.videos.set(`video_${sessionId}`, {
        id: `video_${sessionId}`,
        sessionId,
        storagePath: targetStoragePath,
        status: 'ready',
        createdAt: nowIso
      });
      const existingSession = mockStore.sessions.get(sessionId) || {};
      mockStore.sessions.set(sessionId, {
        ...existingSession,
        sessionId,
        videoStatus: 'ready',
        videoUrl,
        videoStoragePath: targetStoragePath,
        updatedAt: nowIso
      });
    }

    return NextResponse.json({
      success: true,
      sessionId,
      videoId: `video_${sessionId}`,
      videoUrl,
      message: 'Manual video completion registered successfully.'
    });
  } catch (error: any) {
    console.error('Manual Video Complete Route Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to complete manual video upload.' },
      { status: 500 }
    );
  }
}

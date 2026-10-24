import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { validTryOnDeviceId, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, accessCode, deviceId, contentType = 'image/jpeg', folder = 'uploads' } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ success: false, error: 'sessionId is required.' }, { status: 400 });
    }

    // Verify access
    const isOperator = verifyOperatorRequest(req);
    let isAllowed = isOperator;

    if (!isAllowed && validTryOnDeviceId(deviceId) && typeof accessCode === 'string' && accessCode.trim()) {
      const accessTryOn = await verifyMaharajaAccess(req, accessCode, 'try-on');
      const accessVideo = await verifyMaharajaAccess(req, accessCode, 'ai-video');
      isAllowed = accessTryOn.allowed || accessVideo.allowed;
    }

    if (!isAllowed) {
      return NextResponse.json({ success: false, error: 'Unauthorized media upload request.' }, { status: 401 });
    }
    const rate = await enforceRateLimit(req, 'media-upload', 12, 10 * 60 * 1000, `${accessCode || 'operator'}:${sessionId}`);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: 'Too many media uploads. Wait briefly and try again.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      });
    }

    if (!/^maharaja_[a-zA-Z0-9_-]{8,100}$/.test(sessionId)) {
      return NextResponse.json({ success: false, error: 'Invalid media session.' }, { status: 400 });
    }

    if (!['image/jpeg', 'image/png'].includes(contentType)) {
      return NextResponse.json({ success: false, error: 'Only JPEG and PNG photos are accepted.' }, { status: 415 });
    }

    const db = getDb();
    const normalizedAccessCode = typeof accessCode === 'string' ? accessCode.trim() : '';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString();
    if (db) {
      const sessionRef = db.collection('sessions').doc(sessionId);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(sessionRef);
        const existing = snapshot.data();
        if (snapshot.exists && existing?.accessCode && existing.accessCode !== normalizedAccessCode) {
          throw new Error('SESSION_OWNERSHIP_MISMATCH');
        }
        transaction.set(sessionRef, {
          sessionId,
          clientId: MAHARAJA_CLIENT_ID,
          accessCode: normalizedAccessCode || null,
          expiresAt: existing?.expiresAt || expiresAt,
          updatedAt: now.toISOString(),
        }, { merge: true });
      });
    } else {
      const mockStore = getMockStore();
      const existing = mockStore.sessions.get(sessionId);
      if (existing?.accessCode && existing.accessCode !== normalizedAccessCode) {
        return NextResponse.json({ success: false, error: 'This media session belongs to another customer pass.' }, { status: 403 });
      }
      mockStore.sessions.set(sessionId, {
        ...(existing || {}),
        sessionId,
        clientId: MAHARAJA_CLIENT_ID,
        accessCode: normalizedAccessCode || null,
        expiresAt: existing?.expiresAt || expiresAt,
        updatedAt: now.toISOString(),
      });
    }

    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const filename = `${crypto.randomUUID()}.${ext}`;
    const safeFolder = ['person', 'garment', 'uploads'].includes(folder) ? folder : 'uploads';
    const storagePath = `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/${safeFolder}/${filename}`;

    const bucket = getStorageBucket();
    if (bucket) {
      const file = bucket.file(storagePath);
      const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000,
        contentType,
      });

      const [downloadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000,
      });

      return NextResponse.json({
        success: true,
        uploadUrl,
        storagePath,
        downloadUrl,
      });
    }

    // Local / Mock store upload route
    const mockUploadUrl = `/api/storage/mock-upload?path=${encodeURIComponent(storagePath)}`;
    return NextResponse.json({
      success: true,
      uploadUrl: mockUploadUrl,
      storagePath,
      downloadUrl: mockUploadUrl,
    });
  } catch (error: any) {
    console.error('Storage Upload URL Error:', error);
    if (error?.message === 'SESSION_OWNERSHIP_MISMATCH') {
      return NextResponse.json({ success: false, error: 'This media session belongs to another customer pass.' }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: 'Failed to create upload URL.' }, { status: 500 });
  }
}

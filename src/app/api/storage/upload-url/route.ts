import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getStorageBucket } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { validTryOnDeviceId, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';

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
    const hasValidDevice = validTryOnDeviceId(deviceId);
    let isAllowed = isOperator || hasValidDevice;

    if (!isAllowed && typeof accessCode === 'string' && accessCode.trim()) {
      const accessTryOn = await verifyMaharajaAccess(req, accessCode, 'try-on');
      const accessVideo = await verifyMaharajaAccess(req, accessCode, 'ai-video');
      isAllowed = accessTryOn.allowed || accessVideo.allowed;
    }

    if (!isAllowed) {
      return NextResponse.json({ success: false, error: 'Unauthorized media upload request.' }, { status: 401 });
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
    return NextResponse.json({ success: false, error: 'Failed to create upload URL.' }, { status: 500 });
  }
}

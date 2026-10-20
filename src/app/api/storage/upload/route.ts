import { NextRequest, NextResponse } from 'next/server';
import { getStorageBucket } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { validTryOnDeviceId, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function decodeJpeg(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') throw new Error('Photo data is required.');
  const match = dataUrl.match(/^data:image\/jpeg;base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error('Only compressed JPEG photos are accepted.');
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('Photo must be 4 MB or smaller.');
  return buffer;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
    const accessCode = typeof body?.accessCode === 'string' ? body.accessCode.trim() : '';
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';
    const folder = body?.folder === 'person' || body?.folder === 'garment' ? body.folder : '';
    const storagePath = typeof body?.storagePath === 'string' ? body.storagePath : '';
    const expectedPrefix = `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/${folder}/`;

    if (!sessionId || !folder || !storagePath.startsWith(expectedPrefix) || !storagePath.endsWith('.jpg')) {
      return NextResponse.json({ success: false, error: 'Invalid secure photo destination.' }, { status: 400 });
    }

    const isOperator = verifyOperatorRequest(req);
    const accessTryOn = !isOperator && validTryOnDeviceId(deviceId)
      ? await verifyMaharajaAccess(req, accessCode, 'try-on')
      : null;
    const accessVideo = !isOperator && validTryOnDeviceId(deviceId)
      ? await verifyMaharajaAccess(req, accessCode, 'ai-video')
      : null;
    if (!isOperator && !accessTryOn?.allowed && !accessVideo?.allowed) {
      return NextResponse.json({ success: false, error: 'Unauthorized media upload request.' }, { status: 401 });
    }

    const bucket = getStorageBucket();
    if (!bucket) return NextResponse.json({ success: false, error: 'Firebase Storage is unavailable.' }, { status: 503 });
    const image = decodeJpeg(body?.dataUrl);
    await bucket.file(storagePath).save(image, {
      resumable: false,
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'private, max-age=0' },
    });
    return NextResponse.json({ success: true, storagePath });
  } catch (error: any) {
    console.error('Secure server photo upload error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Secure photo upload failed.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { clearTryOnGrants, incrementMaharajaUsage, logMaharajaActivity, markTryOnDeviceUsed, validTryOnDeviceId } from '@/lib/maharaja/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deviceId, sessionId } = body;
    if (!validTryOnDeviceId(deviceId)) {
      return NextResponse.json({ success: false, error: 'Invalid device identifier.' }, { status: 400 });
    }
    await markTryOnDeviceUsed(deviceId);
    await incrementMaharajaUsage('downloads');
    await logMaharajaActivity('download', 'Maharaja AI Try-On downloaded', { deviceId: deviceId.slice(0, 10), sessionId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to complete Try-On.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  const cleared = await clearTryOnGrants();
  await logMaharajaActivity('campaign', 'Manager reset AI Try-On device limits', { cleared });
  return NextResponse.json({ success: true, cleared });
}

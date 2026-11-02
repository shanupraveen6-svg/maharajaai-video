import { NextRequest, NextResponse } from 'next/server';
import { bindClient } from '@/lib/maharaja/client-context';
import { validTryOnDeviceId, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { readPhoneLook } from '@/lib/maharaja/phone-looks';

export const dynamic = 'force-dynamic';

/** The look this phone made from the store's Wall QR, while its one hour lasts. */
export async function GET(req: NextRequest) {
  const accessCode = req.nextUrl.searchParams.get('access') || '';
  const deviceId = req.nextUrl.searchParams.get('deviceId') || '';
  if (!validTryOnDeviceId(deviceId)) return NextResponse.json({ error: 'Look not found.' }, { status: 404 });
  const access = await verifyMaharajaAccess(req, accessCode, 'try-on');
  if (!access.allowed || access.pass || accessCode !== access.workspace.tryOnCode) {
    return NextResponse.json({ error: 'Look not found.' }, { status: 404 });
  }
  bindClient(access.clientId);
  const look = await readPhoneLook(access.clientId, deviceId);
  if (!look) return NextResponse.json({ error: 'Your look was kept for one hour and has now been deleted.' }, { status: 410 });
  return new NextResponse(new Uint8Array(look.bytes), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

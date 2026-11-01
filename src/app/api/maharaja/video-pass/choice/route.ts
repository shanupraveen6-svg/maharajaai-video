import { NextRequest, NextResponse } from 'next/server';
import { bindClient } from '@/lib/maharaja/client-context';
import { chooseGiftGarment, verifyMaharajaAccess } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

/** `{ accessCode, choice: 'catalogue' | 'own' }`: the customer's first step on a biller's gift QR. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const accessCode = typeof body?.accessCode === 'string' ? body.accessCode.trim() : '';
  const choice = body?.choice === 'catalogue' ? 'catalogue' : body?.choice === 'own' ? 'own' : null;
  if (!choice) return NextResponse.json({ success: false, error: 'Choose the store collection or your outfit.' }, { status: 400 });
  const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
  bindClient(access.allowed ? access.clientId : null);
  if (!access.allowed || !access.pass) {
    return NextResponse.json({ success: false, error: access.error || 'This AI Video QR is no longer valid.' }, { status: 401 });
  }
  try {
    if (!await chooseGiftGarment(access.pass.code, choice)) {
      return NextResponse.json({ success: false, error: 'Your AI Video has already started with the other choice.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, choice });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to save your choice.' }, { status: 409 });
  }
}

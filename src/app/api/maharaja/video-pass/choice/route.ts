import { NextRequest, NextResponse } from 'next/server';
import { resolveAccess } from '@/lib/maharaja/access';
import { bindClient } from '@/lib/maharaja/client-context';
import { chooseGiftGarment, verifyMaharajaAccess } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

/**
 * `{ accessCode, choice: 'catalogue' | 'own' }`: the first step on an older biller's gift QR issued before
 * AI Video became store-collection only. Only "catalogue" is accepted now.
 */
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
  // AI Video is made from the store collection only; an own-outfit video can no longer be started.
  if (choice === 'own' && !resolveAccess(access.workspace?.devices, access.workspace?.modules).ownGarmentVideo) {
    return NextResponse.json({ success: false, error: 'AI Video uses our store collection. Pick an outfit from the collection.' }, { status: 409 });
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

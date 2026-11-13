import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { bindClient } from '@/lib/maharaja/client-context';
import { applyTrialCatalogue, planTrialCatalogue } from '@/lib/maharaja/trial-catalogue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const clientOf = (value: unknown) => (typeof value === 'string' && /^[a-z0-9-]{2,60}$/.test(value) ? value : '');

/** TryFocus admin only. GET `?clientId=` previews the trial catalogue; POST `{ clientId }` applies it. */
export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) return NextResponse.json({ success: false, error: 'TryFocus admin only.' }, { status: 401 });
  const clientId = clientOf(req.nextUrl.searchParams.get('clientId'));
  if (!clientId) return NextResponse.json({ success: false, error: 'Choose a store.' }, { status: 400 });
  bindClient(clientId);
  try {
    return NextResponse.json({ success: true, plan: await planTrialCatalogue(clientId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not read the catalogue.' }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminRequest(req)) return NextResponse.json({ success: false, error: 'TryFocus admin only.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const clientId = clientOf(body?.clientId);
  if (!clientId) return NextResponse.json({ success: false, error: 'Choose a store.' }, { status: 400 });
  bindClient(clientId);
  try {
    // Planned again here, from the catalogue as it is now, so nothing stale is written.
    const result = await applyTrialCatalogue(await planTrialCatalogue(clientId), clientId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not prepare the catalogue.' }, { status: 400 });
  }
}

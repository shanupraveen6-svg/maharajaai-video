import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { verifyTvRequest } from '@/lib/auth/display';
import { bindClient, activeClientId } from '@/lib/maharaja/client-context';
import { resolveRequestClientId } from '@/lib/maharaja/server';
import { deleteStoreLogo, maharajaDefaultLogo, readStoreLogo, saveStoreLogo } from '@/lib/maharaja/store-logo';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

async function signedIn(req: NextRequest, requestedClientId?: string | null) {
  if (!verifyOperatorRequest(req)) return false;
  bindClient(await resolveRequestClientId(req, undefined, requestedClientId));
  return true;
}

/** The store's own logo: the workspace preview, and the bottom of the TV's first screen (paired TV). */
export async function GET(req: NextRequest) {
  const allowed = verifyOperatorRequest(req) || await verifyTvRequest(req);
  if (!allowed) return NextResponse.json({ error: 'Sign in to the workspace.' }, { status: 401 });
  // TryFocus admin viewing a client's workspace passes which client this logo is for.
  bindClient(await resolveRequestClientId(req, undefined, req.nextUrl.searchParams.get('workspaceCode')));
  // `?fallback=1` (the TV and tablet): with no uploaded logo, the store's default badge, the same one its
  // downloaded looks carry. The workspace's own logo card asks without it, so it still shows "No logo yet".
  const logo = await readStoreLogo(activeClientId())
    ?? (req.nextUrl.searchParams.get('fallback') === '1' ? maharajaDefaultLogo(activeClientId()) : null);
  if (!logo) return NextResponse.json({ error: 'No logo yet.' }, { status: 404 });
  return new NextResponse(new Uint8Array(logo), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } });
}

/** Uploads the store logo put on every downloaded look. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!await signedIn(req, form?.get('workspaceCode') as string | null)) return NextResponse.json({ success: false, error: 'Sign in to the workspace.' }, { status: 401 });
  const file = form?.get('logo');
  if (!(file instanceof File) || !file.size) return NextResponse.json({ success: false, error: 'Choose your logo file.' }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ success: false, error: 'Use a PNG, JPG or WebP logo.' }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ success: false, error: 'Use a logo under 3 MB.' }, { status: 413 });
  try {
    await saveStoreLogo(activeClientId(), Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'This logo could not be read. Try a PNG.' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!await signedIn(req, req.nextUrl.searchParams.get('workspaceCode'))) return NextResponse.json({ success: false, error: 'Sign in to the workspace.' }, { status: 401 });
  await deleteStoreLogo(activeClientId());
  return NextResponse.json({ success: true });
}

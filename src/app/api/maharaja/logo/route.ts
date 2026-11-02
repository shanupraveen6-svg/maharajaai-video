import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { verifyTvRequest } from '@/lib/auth/display';
import { bindClient, activeClientId } from '@/lib/maharaja/client-context';
import { resolveRequestClientId } from '@/lib/maharaja/server';
import { deleteStoreLogo, readStoreLogo, saveStoreLogo } from '@/lib/maharaja/store-logo';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

async function signedIn(req: NextRequest) {
  if (!verifyOperatorRequest(req)) return false;
  bindClient(await resolveRequestClientId(req));
  return true;
}

/** The store's own logo: the workspace preview, and the bottom of the TV's first screen (paired TV). */
export async function GET(req: NextRequest) {
  const allowed = verifyOperatorRequest(req) || await verifyTvRequest(req);
  if (!allowed) return NextResponse.json({ error: 'Sign in to the workspace.' }, { status: 401 });
  bindClient(await resolveRequestClientId(req));
  const logo = await readStoreLogo(activeClientId());
  if (!logo) return NextResponse.json({ error: 'No logo yet.' }, { status: 404 });
  return new NextResponse(new Uint8Array(logo), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } });
}

/** Uploads the store logo put on every downloaded look. */
export async function POST(req: NextRequest) {
  if (!await signedIn(req)) return NextResponse.json({ success: false, error: 'Sign in to the workspace.' }, { status: 401 });
  const form = await req.formData().catch(() => null);
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
  if (!await signedIn(req)) return NextResponse.json({ success: false, error: 'Sign in to the workspace.' }, { status: 401 });
  await deleteStoreLogo(activeClientId());
  return NextResponse.json({ success: true });
}

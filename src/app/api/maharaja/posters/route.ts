import fs from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { verifyTvRequest } from '@/lib/auth/display';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';
import { resolveRequestClientId } from '@/lib/maharaja/server';
import { deletePoster, listPosters, POSTER_LIMITS, PosterError, readPoster, savePoster } from '@/lib/maharaja/store-posters';

export const dynamic = 'force-dynamic';

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
/** Maharaja's built-in poster, shown until the store uploads its own. */
const BUILT_IN_POSTER = 'maharaja-default';
const BUILT_IN_POSTER_FILE = path.join(process.cwd(), 'public', 'images', 'maharaja-client', 'poster-must-try.jpg');

/**
 * The store's posters. GET lists them (`{ posters: [id…] }`) or, with `?id=`, returns one image — for the
 * workspace and the paired TV/tablet. POST (multipart `poster`) adds one; DELETE `?id=` removes one.
 */
export async function GET(req: NextRequest) {
  const allowed = verifyOperatorRequest(req) || await verifyTvRequest(req);
  if (!allowed) return NextResponse.json({ success: false, error: 'Sign in to the workspace.' }, { status: 401 });
  bindClient(await resolveRequestClientId(req, undefined, req.nextUrl.searchParams.get('workspaceCode')));
  const id = req.nextUrl.searchParams.get('id');
  if (id === BUILT_IN_POSTER) {
    const poster = await fs.readFile(BUILT_IN_POSTER_FILE).catch(() => null);
    if (!poster) return NextResponse.json({ success: false, error: 'Poster not found.' }, { status: 404 });
    return new NextResponse(new Uint8Array(poster), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
  }
  if (id) {
    const poster = await readPoster(activeClientId(), id);
    if (!poster) return NextResponse.json({ success: false, error: 'Poster not found.' }, { status: 404 });
    return new NextResponse(new Uint8Array(poster), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300' } });
  }
  // `fallback`: the poster the TV shows while the store has none of its own (Maharaja's built-in one).
  const fallback = activeClientId() === MAHARAJA_CLIENT_ID ? BUILT_IN_POSTER : null;
  return NextResponse.json({ success: true, posters: await listPosters(activeClientId()), fallback, limits: POSTER_LIMITS }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Sign in to the workspace.' }, { status: 401 });
  bindClient(await resolveRequestClientId(req, undefined, form?.get('workspaceCode') as string | null));
  const file = form?.get('poster');
  if (!(file instanceof File) || !file.size) return NextResponse.json({ success: false, error: 'Choose a poster image.' }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ success: false, error: 'Use a JPG, PNG or WebP poster.' }, { status: 415 });
  if (file.size > POSTER_LIMITS.maxBytes) return NextResponse.json({ success: false, error: 'Use a poster under 5 MB.' }, { status: 413 });
  try {
    const id = await savePoster(activeClientId(), Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ success: true, id, posters: await listPosters(activeClientId()) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof PosterError ? error.message : 'This poster could not be saved.' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Sign in to the workspace.' }, { status: 401 });
  bindClient(await resolveRequestClientId(req, undefined, req.nextUrl.searchParams.get('workspaceCode')));
  await deletePoster(activeClientId(), String(req.nextUrl.searchParams.get('id') || ''));
  return NextResponse.json({ success: true, posters: await listPosters(activeClientId()) });
}

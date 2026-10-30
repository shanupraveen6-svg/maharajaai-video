import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { verifyTvRequest } from '@/lib/auth/display';
import { bindClient } from '@/lib/maharaja/client-context';
import { getMaharajaWorkspace, goLiveClientId, resolveRequestClientId } from '@/lib/maharaja/server';
import {
  PROMO_LIMITS,
  PromoError,
  confirmPromoUpload,
  createPromoUpload,
  deletePromoVideo,
  listPromoVideos,
  promoPlaylist,
} from '@/lib/maharaja/promos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'no-store, max-age=0' };

function failure(error: unknown) {
  if (error instanceof PromoError) return NextResponse.json({ success: false, error: error.message }, { status: 400, headers: noStore });
  console.error('Promo video request failed:', error);
  return NextResponse.json({ success: false, error: 'The promo video could not be saved. Please try again.' }, { status: 500, headers: noStore });
}

/** Workspace staff manage promos; the workspace's Go Live link reads them for playback. */
export async function GET(req: NextRequest) {
  const screenClient = await goLiveClientId(req);
  if (!screenClient && !verifyOperatorRequest(req) && !await verifyTvRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401, headers: noStore });
  }
  bindClient(screenClient || await resolveRequestClientId(req));
  try {
    if (req.nextUrl.searchParams.get('playback') === '1') {
      const workspace = await getMaharajaWorkspace();
      return NextResponse.json({
        success: true,
        clientId: workspace.clientId,
        clientName: workspace.clientName,
        everyCustomerVideos: PROMO_LIMITS.everyCustomerVideos,
        promos: await promoPlaylist(),
      }, { headers: noStore });
    }
    return NextResponse.json({ success: true, limits: PROMO_LIMITS, promos: await listPromoVideos() }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

/** `{ action: 'upload-url', contentType, sizeBytes }` then, after the direct upload, `{ action: 'confirm', id, title, contentType }`. */
export async function POST(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401, headers: noStore });
  }
  bindClient(await resolveRequestClientId(req));
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'upload-url') {
      return NextResponse.json({ success: true, ...await createPromoUpload(body.contentType, body.sizeBytes) }, { headers: noStore });
    }
    if (body.action === 'confirm') {
      const promo = await confirmPromoUpload(body.id, body.title, body.contentType);
      return NextResponse.json({ success: true, promo, promos: await listPromoVideos() }, { headers: noStore });
    }
    return NextResponse.json({ success: false, error: 'Unknown promo action.' }, { status: 400, headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401, headers: noStore });
  }
  bindClient(await resolveRequestClientId(req));
  try {
    await deletePromoVideo(req.nextUrl.searchParams.get('id'));
    return NextResponse.json({ success: true, promos: await listPromoVideos() }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

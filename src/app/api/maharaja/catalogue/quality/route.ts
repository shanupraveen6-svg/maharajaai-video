import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { bindClient } from '@/lib/maharaja/client-context';
import { resolveRequestClientId } from '@/lib/maharaja/server';
import { garmentPhotoSizes, MIN_GARMENT_LONG_SIDE } from '@/lib/maharaja/garment-warm';

export const dynamic = 'force-dynamic';

/** The workspace's garment photo sizes (`{ sku: long side in px }`), so the catalogue can flag soft photos. */
export async function GET(req: NextRequest) {
  if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  bindClient(await resolveRequestClientId(req, undefined, req.nextUrl.searchParams.get('workspaceCode')));
  return NextResponse.json({ success: true, sizes: await garmentPhotoSizes(), minLongSide: MIN_GARMENT_LONG_SIDE }, { headers: { 'Cache-Control': 'no-store' } });
}

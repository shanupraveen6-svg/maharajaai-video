import { NextRequest, NextResponse } from 'next/server';
import { AI_CONFIG } from '@/lib/ai/config';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';
import { bindClient } from '@/lib/maharaja/client-context';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { genlookSourceFrom } from '@/lib/maharaja/garment-prep';
import { genlookPersonImageId } from '@/lib/maharaja/genlook-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Store Try-On: the customer's photo is sent to GenLook the moment they confirm it, while they are still
 * choosing outfits. Generate then starts every look at once with nothing left to upload. If this cannot run,
 * nothing is lost: the first look uploads the photo itself.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const access = await verifyMaharajaAccess(req, body.accessCode, 'try-on');
    bindClient(access.allowed ? access.clientId : null);
    if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    const image = typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image.split(',')[1] || '' : '';
    const key = AI_CONFIG.GENLOOK_API_KEY?.trim();
    if (!image || !key) return NextResponse.json({ success: true, prepared: false });
    const rate = await enforceRateLimit(req, 'person-prepare', 40, 10 * 60 * 1000, typeof body.deviceId === 'string' ? body.deviceId : undefined);
    if (!rate.allowed) return NextResponse.json({ success: true, prepared: false });
    const personImageId = await genlookPersonImageId(await genlookSourceFrom(image), key, image);
    return NextResponse.json({ success: true, prepared: true, personImageId });
  } catch (error) {
    console.warn('Customer photo could not be prepared ahead:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: true, prepared: false });
  }
}

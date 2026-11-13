import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { bindClient } from '@/lib/maharaja/client-context';
import { bulkUpdateCatalogueFlags, deleteCatalogueProducts, type CatalogueFlags } from '@/lib/maharaja/catalogue';
import { logMaharajaActivity, resolveRequestClientId } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

const ACTIONS: Record<string, { flags?: CatalogueFlags; label: string }> = {
  delete: { label: 'deleted' },
  hide: { flags: { active: false }, label: 'hidden' },
  show: { flags: { active: true }, label: 'shown' },
  'new-arrival-on': { flags: { newArrival: true }, label: 'tagged New arrival' },
  'new-arrival-off': { flags: { newArrival: false }, label: 'untagged New arrival' },
  'trending-on': { flags: { trending: true }, label: 'tagged Trending' },
  'trending-off': { flags: { trending: false }, label: 'untagged Trending' },
  'ai-video-off': { flags: { eligibleForVideo: false }, label: 'removed from AI Video' },
  'live-on': { flags: { eligibleForLive: true }, label: 'put on Live Try-On' },
  'live-off': { flags: { eligibleForLive: false }, label: 'removed from Live Try-On' },
};

/** One action on many garments at once: delete, hide or show, or a New arrival / Trending tag. */
export async function POST(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    bindClient(await resolveRequestClientId(req, undefined, body.workspaceCode));
    const action = ACTIONS[String(body.action || '')];
    const skus = Array.isArray(body.skus) ? body.skus.filter((sku: unknown): sku is string => typeof sku === 'string') : [];
    if (!action) return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400 });
    if (!skus.length || skus.length > 500) return NextResponse.json({ success: false, error: 'Choose between 1 and 500 garments.' }, { status: 400 });
    const count = action.flags ? await bulkUpdateCatalogueFlags(skus, action.flags) : await deleteCatalogueProducts(skus);
    await logMaharajaActivity('campaign', `${count} catalogue garment(s) ${action.label}`, { action: body.action, count }).catch(() => undefined);
    return NextResponse.json({ success: true, count });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not update the garments.' }, { status: 400 });
  }
}

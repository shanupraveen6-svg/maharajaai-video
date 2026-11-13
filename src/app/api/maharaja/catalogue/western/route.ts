import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { bindClient } from '@/lib/maharaja/client-context';
import { bulkUpdateCatalogueFlags, loadAllCatalogueRecords } from '@/lib/maharaja/catalogue';
import { getMaharajaWorkspace, logMaharajaActivity, resolveRequestClientId, updateMaharajaSettings } from '@/lib/maharaja/server';
import { findCategory, isWesternCategory } from '@/lib/tryfocus/store-categories';

export const dynamic = 'force-dynamic';

/**
 * Live Try-On for a whole category. `{ categoryId, western }` is the switch above the Image Try-On table:
 * every garment already in the category goes on (or off) Live Try-On, and new uploads into it follow. `{ applyAll: true }` is the one-time correction: every garment set to
 * its category's Western wear setting, and the old SKU-prefix AI Video exception written down for real.
 */
export async function POST(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const clientId = await resolveRequestClientId(req, undefined, body.workspaceCode);
    bindClient(clientId);
    const workspace = await getMaharajaWorkspace();
    const customCategories = workspace.customCategories || [];
    const records = await loadAllCatalogueRecords(true);

    if (body.applyAll === true) {
      const overrides = workspace.westernOverrides || {};
      const liveOn: string[] = [];
      const liveOff: string[] = [];
      const videoOn: string[] = [];
      for (const item of records) {
        const western = isWesternCategory(item.category, customCategories, overrides);
        if (western && item.eligibleForLive !== true) liveOn.push(item.sku);
        if (!western && item.eligibleForLive === true) liveOff.push(item.sku);
        // The TV used to treat 8IC… and silk-… pieces as AI Video regardless of the switch; keep them on, explicitly.
        if (!item.eligibleForVideo && item.price > 0 && (item.sku.startsWith('8IC') || item.sku.startsWith('silk-'))) videoOn.push(item.sku);
      }
      const [on, off, video] = await Promise.all([
        liveOn.length ? bulkUpdateCatalogueFlags(liveOn, { eligibleForLive: true }) : 0,
        liveOff.length ? bulkUpdateCatalogueFlags(liveOff, { eligibleForLive: false }) : 0,
        videoOn.length ? bulkUpdateCatalogueFlags(videoOn, { eligibleForVideo: true }) : 0,
      ]);
      const updated = await updateMaharajaSettings({ westernRuleAppliedAt: new Date().toISOString() }, workspace.clientId);
      await logMaharajaActivity('campaign', `Western wear rule applied: ${on} on, ${off} off`, { on, off, video }).catch(() => undefined);
      return NextResponse.json({ success: true, on, off, video, westernRuleAppliedAt: updated.westernRuleAppliedAt });
    }

    const categoryId = String(body.categoryId || '');
    if (!findCategory(categoryId, customCategories) || typeof body.western !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Choose a category.' }, { status: 400 });
    }
    const western = body.western as boolean;
    const updated = await updateMaharajaSettings({ westernOverrides: { ...(workspace.westernOverrides || {}), [categoryId]: western } }, workspace.clientId);
    const inCategory = records.filter((item) => item.category === categoryId && (item.eligibleForLive === true) !== western).map((item) => item.sku);
    const changed = inCategory.length ? await bulkUpdateCatalogueFlags(inCategory, { eligibleForLive: western }) : 0;
    await logMaharajaActivity('campaign', `Live Try-On ${western ? 'on' : 'off'} for all ${findCategory(categoryId, customCategories)?.label}`, { categoryId, western, changed }).catch(() => undefined);
    return NextResponse.json({ success: true, changed, westernOverrides: updated.westernOverrides || {} });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not update Live Try-On.' }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { bindClient } from '@/lib/maharaja/client-context';
import { bulkUpdateCatalogueFlags, loadAllCatalogueRecords } from '@/lib/maharaja/catalogue';
import { getMaharajaWorkspace, logMaharajaActivity, resolveRequestClientId, updateMaharajaSettings } from '@/lib/maharaja/server';
import { findCategory } from '@/lib/tryfocus/store-categories';

export const dynamic = 'force-dynamic';

/**
 * Live Try-On for a whole category. `{ categoryId, western }` is the switch above the Image Try-On table:
 * every garment already in the category goes on (or off) Live Try-On, and new uploads into it follow.
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

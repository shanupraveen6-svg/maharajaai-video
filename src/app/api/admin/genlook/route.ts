import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { AI_CONFIG } from '@/lib/ai/config';
import { getGenlookCredits } from '@/lib/maharaja/genlook-provider';
import { genlookAllowance, listClientWorkspaces } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

/** TryFocus admin only: GenLook's balance, the credits locked to each store, and what is still free. */
export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in to TryFocus admin.' }, { status: 401 });
  }
  // Credits still locked to stores: each store's GenLook allowance minus what it used.
  const workspaces = await listClientWorkspaces();
  const stores = workspaces.map((workspace) => {
    const allowance = genlookAllowance(workspace);
    const used = Number(workspace.usage?.genlookUsed || 0);
    return { clientId: workspace.clientId, name: workspace.clientName, allowance, used, left: Math.max(0, allowance - used) };
  }).filter((store) => store.allowance > 0);
  const locked = stores.reduce((sum, store) => sum + store.left, 0);
  const key = AI_CONFIG.GENLOOK_API_KEY;
  if (!key) return NextResponse.json({ success: true, configured: false, locked, stores, error: 'GENLOOK_API_KEY is not set.' });
  const result = await getGenlookCredits(key);
  return NextResponse.json(result.ok
    ? { success: true, configured: true, creditBalance: result.creditBalance, locked, free: result.creditBalance - locked, stores }
    : { success: true, configured: true, locked, stores, error: result.error });
}

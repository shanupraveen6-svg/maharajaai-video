import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { AI_CONFIG } from '@/lib/ai/config';
import { addGenlookTopUp, getGenlookLedger } from '@/lib/maharaja/genlook-ledger';
import { freeGenlookCredits, genlookAllowance, listClientWorkspaces } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

async function storesSnapshot() {
  const workspaces = await listClientWorkspaces();
  return workspaces.map((workspace) => {
    const allowance = genlookAllowance(workspace);
    const used = Number(workspace.usage?.genlookUsed || 0);
    return { clientId: workspace.clientId, name: workspace.clientName, allowance, used, left: Math.max(0, allowance - used) };
  }).filter((store) => store.allowance > 0);
}

/**
 * TryFocus admin only: what TryFocus has actually logged paying GenLook for, what every store has used
 * against it, what is locked to specific stores, and what is free for the shared pool. The purchased
 * total comes from admin's own top-up log (genlook-ledger.ts), not from calling GenLook's balance API.
 */
export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in to TryFocus admin.' }, { status: 401 });
  }
  const [stores, ledger] = await Promise.all([storesSnapshot(), getGenlookLedger()]);
  const key = AI_CONFIG.GENLOOK_API_KEY;
  if (!key) return NextResponse.json({ success: true, configured: false, purchased: ledger.totalPurchased, topUps: ledger.topUps, stores, error: 'GENLOOK_API_KEY is not set.' });
  const pool = await freeGenlookCredits();
  if (!pool) return NextResponse.json({ success: true, configured: true, purchased: ledger.totalPurchased, topUps: ledger.topUps, stores, error: 'Could not work out the GenLook pool.' });
  return NextResponse.json({
    success: true,
    configured: true,
    purchased: pool.purchased,
    usedEverywhere: pool.usedEverywhere,
    locked: pool.locked,
    free: pool.free,
    liveApiBalance: pool.liveApiBalance,
    topUps: ledger.topUps,
    stores,
  });
}

/** Logs a top-up TryFocus actually paid GenLook for: `{ credits, paidUsd?, note? }`. */
export async function POST(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in to TryFocus admin.' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.credits !== 'number') {
    return NextResponse.json({ success: false, error: 'Enter how many credits this top-up added.' }, { status: 400 });
  }
  try {
    await addGenlookTopUp({ credits: body.credits, paidUsd: body.paidUsd, note: body.note });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not log the top-up.' }, { status: 400 });
  }
  const [stores, ledger] = await Promise.all([storesSnapshot(), getGenlookLedger()]);
  const pool = await freeGenlookCredits();
  return NextResponse.json({
    success: true,
    configured: true,
    purchased: pool?.purchased ?? ledger.totalPurchased,
    usedEverywhere: pool?.usedEverywhere,
    locked: pool?.locked,
    free: pool?.free,
    liveApiBalance: pool?.liveApiBalance,
    topUps: ledger.topUps,
    stores,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { AI_CONFIG } from '@/lib/ai/config';
import { addApiTopUp, API_PROVIDERS, getApiLedger, type ApiProvider } from '@/lib/maharaja/api-ledger';

export const dynamic = 'force-dynamic';

const CONFIGURED: Record<ApiProvider, boolean> = {
  fal: Boolean(process.env.FAL_KEY?.trim()),
  gemini: Boolean(AI_CONFIG.PRIMARY_API_KEY || process.env.GEMINI_API_KEY),
  fashn: Boolean(process.env.FASHN_API_KEY?.trim()),
};

async function snapshot() {
  const entries = await Promise.all(API_PROVIDERS.map(async (provider) => {
    const { topUps, totalPurchasedUsd, usedUsd } = await getApiLedger(provider);
    return [provider, {
      configured: CONFIGURED[provider],
      purchasedUsd: totalPurchasedUsd,
      usedUsd,
      freeUsd: totalPurchasedUsd - usedUsd,
      topUps,
    }] as const;
  }));
  return Object.fromEntries(entries);
}

/**
 * TryFocus admin only: what has actually been paid to fal.ai, Google Gemini and FASHN, what every
 * store's use of them has actually cost, and what dollars are left. GenLook has its own route
 * (/api/admin/genlook) because it bills in credits, not dollars, and locks allowances per store.
 */
export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in to TryFocus admin.' }, { status: 401 });
  }
  return NextResponse.json({ success: true, providers: await snapshot() });
}

/** Logs a top-up actually paid to one vendor: `{ provider: 'fal' | 'gemini' | 'fashn', usd, note? }`. */
export async function POST(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in to TryFocus admin.' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || !API_PROVIDERS.includes(body.provider) || typeof body.usd !== 'number') {
    return NextResponse.json({ success: false, error: 'Choose a vendor and how many dollars this top-up added.' }, { status: 400 });
  }
  try {
    await addApiTopUp(body.provider, { usd: body.usd, note: body.note });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not log the top-up.' }, { status: 400 });
  }
  return NextResponse.json({ success: true, providers: await snapshot() });
}

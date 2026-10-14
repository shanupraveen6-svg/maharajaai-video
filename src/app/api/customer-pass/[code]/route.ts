import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

type CustomerPassRecord = {
  id?: string;
  code?: string;
  storeSlug?: string;
  phoneMasked?: string | null;
  billLast4?: string | null;
  purchaseAmount?: number;
  status?: string;
  tryOnEligible?: boolean;
  aiVideoEligible?: boolean;
  tryOnEnabled?: boolean;
  aiVideoEnabled?: boolean;
  expiresAt?: string | null;
  expiresAtMs?: number;
  usage?: Record<string, unknown>;
};

function isExpired(pass: CustomerPassRecord) {
  const expiresAtMs = Number(pass?.expiresAtMs || new Date(pass?.expiresAt || 0).getTime());
  return Number.isFinite(expiresAtMs) && expiresAtMs < Date.now();
}

function publicPassView(pass: CustomerPassRecord) {
  const expired = isExpired(pass);
  return {
    code: pass.code,
    storeSlug: pass.storeSlug,
    phoneMasked: pass.phoneMasked || null,
    billLast4: pass.billLast4 || null,
    purchaseAmount: pass.purchaseAmount || 0,
    status: expired ? 'expired' : pass.status || 'active',
    tryOnEligible: !!pass.tryOnEligible && !expired && pass.status !== 'used',
    aiVideoEligible: !!pass.aiVideoEligible && !expired && pass.status !== 'used',
    tryOnEnabled: pass.tryOnEnabled !== false,
    aiVideoEnabled: pass.aiVideoEnabled !== false,
    expiresAt: pass.expiresAt || null,
    usage: pass.usage || {}
  };
}

export async function GET(req: NextRequest, ctx: RouteContext<'/api/customer-pass/[code]'>) {
  try {
    const { code } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const store = searchParams.get('store') || 'maharaja';

    if (!code) {
      return NextResponse.json({ success: false, error: 'Pass code is required.' }, { status: 400 });
    }

    const db = getDb();
    let pass: CustomerPassRecord | null = null;

    if (db) {
      const snap = await db.collection('customerPasses').doc(code).get();
      pass = snap.exists ? { id: snap.id, ...(snap.data() as CustomerPassRecord) } : null;
    } else {
      const mockPass = getMockStore().customerPasses.get(code);
      pass = typeof mockPass === 'object' && mockPass !== null ? mockPass as CustomerPassRecord : null;
    }

    if (!pass || pass.storeSlug !== store) {
      return NextResponse.json({ success: false, error: 'Customer pass not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, pass: publicPassView(pass) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to verify customer pass.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

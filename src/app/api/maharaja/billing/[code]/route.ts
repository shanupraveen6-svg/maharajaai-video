import { NextRequest, NextResponse } from 'next/server';
import { getMaharajaWorkspace } from '@/lib/maharaja/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const workspace = await getMaharajaWorkspace();
  if (code !== workspace.billingCode) {
    return NextResponse.json({ success: false, error: 'Invalid Maharaja billing-counter link.' }, { status: 403 });
  }
  const authenticated = verifyOperatorRequest(req);
  return NextResponse.json({
    success: true,
    authenticated,
    activeEvents: workspace.activeEvents,
    defaultEvent: workspace.defaultEvent,
    campaignEnabled: workspace.campaignEnabled,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { getMaharajaWorkspace } from '@/lib/maharaja/server';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const workspace = await getMaharajaWorkspace();
  if (code !== workspace.billingCode) return NextResponse.json({ success: false, error: 'Invalid Maharaja billing-counter link.' }, { status: 403 });
  return NextResponse.json({ success: true, activeEvents: workspace.activeEvents, defaultEvent: workspace.defaultEvent, campaignEnabled: workspace.campaignEnabled });
}

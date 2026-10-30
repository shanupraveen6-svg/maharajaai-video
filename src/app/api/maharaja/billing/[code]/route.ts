import { NextRequest, NextResponse } from 'next/server';
import { bindClient } from '@/lib/maharaja/client-context';
import { resolveRequestClientId, getWorkspaceLinks, isWhatsAppEnabled, resolveWorkspaceByAccessCode } from '@/lib/maharaja/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { AI_VIDEO_MIN_PURCHASE } from '@/lib/maharaja/config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  bindClient(await resolveRequestClientId(req, code));
  const workspace = await resolveWorkspaceByAccessCode(code);
  if (code !== workspace.billingCode) {
    return NextResponse.json({ success: false, error: 'Invalid Maharaja billing-counter link.' }, { status: 403 });
  }
  const authenticated = verifyOperatorRequest(req);
  return NextResponse.json({
    success: true,
    authenticated,
    clientId: workspace.clientId,
    clientName: workspace.clientName,
    activeEvents: workspace.activeEvents,
    defaultEvent: workspace.defaultEvent,
    campaignEnabled: workspace.campaignEnabled,
    deliveryMode: workspace.deliveryMode || 'qr',
    whatsappConnected: workspace.whatsappConnected ?? false,
    whatsappEnabled: isWhatsAppEnabled(workspace),
    videoMinPurchase: workspace.videoMinPurchase ?? AI_VIDEO_MIN_PURCHASE,
    openVideoUrl: getWorkspaceLinks(workspace).openVideoUrl,
  });
}

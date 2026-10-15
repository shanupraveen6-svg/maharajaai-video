import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import {
  getMaharajaWorkspace,
  getWorkspaceLinks,
  listRecentVideoPasses,
  listMaharajaActivity,
  logMaharajaActivity,
  updateMaharajaSettings,
} from '@/lib/maharaja/server';
import { EVENT_IDS, FESTIVE_TIER_MIN, LUXURY_TIER_MIN, isEventId } from '@/lib/maharaja/config';

export const dynamic = 'force-dynamic';

function publicPass(pass: Awaited<ReturnType<typeof listRecentVideoPasses>>[number]) {
  return {
    code: pass.code,
    phoneMasked: pass.phoneMasked,
    billLast4: pass.billLast4,
    eventId: pass.eventId,
    status: pass.status,
    createdAt: pass.createdAt,
    expiresAt: pass.expiresAt,
    usage: pass.usage,
  };
}

export async function GET(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized Maharaja session.' }, { status: 401 });
  }

  try {
    const workspace = await getMaharajaWorkspace();
    const [recentPasses, allActivity] = await Promise.all([listRecentVideoPasses(), listMaharajaActivity(500)]);
    const daily = new Map<string, { date: string; scans: number; tryOns: number; gmv: number; downloads: number }>();
    for (const item of allActivity) {
      const date = item.createdAt.slice(0, 10);
      const row = daily.get(date) || { date, scans: 0, tryOns: 0, gmv: 0, downloads: 0 };
      if (item.type === 'price-scan') { row.scans += 1; row.gmv += Number(item.metadata?.amount || 0); }
      if (item.type === 'try-on') row.tryOns += 1;
      if (item.type === 'download') row.downloads += 1;
      daily.set(date, row);
    }
    const days = Array.from(daily.values()).sort((a, b) => b.date.localeCompare(a.date)).map((row) => ({
      ...row,
      averagePrice: row.scans ? Math.round(row.gmv / row.scans) : 0,
      conversion: row.scans ? Math.min(100, Math.round((row.tryOns / row.scans) * 100)) : 0,
    }));
    const luxuryThreshold = Number(process.env.MAHARAJA_LUXURY_TIER_MIN) || LUXURY_TIER_MIN;
    const festiveThreshold = Number(process.env.MAHARAJA_FESTIVE_TIER_MIN) || FESTIVE_TIER_MIN;
    const scannedPrices = allActivity.filter((item) => item.type === 'price-scan').map((item) => Number(item.metadata?.amount || 0));
    const totalGmv = scannedPrices.reduce((sum, amount) => sum + amount, 0);
    const luxuryCount = scannedPrices.filter((amount) => amount >= luxuryThreshold).length;
    const brandedReach = allActivity.filter((item) => item.type === 'download' || item.type === 'share').length;
    return NextResponse.json({
      success: true,
      workspace: {
        ...workspace,
        ...getWorkspaceLinks(req.nextUrl.origin, workspace),
        recentPasses: recentPasses.map(publicPass),
        activity: allActivity.slice(0, 30),
        analytics: {
          totalGmv,
          totalGarments: scannedPrices.length,
          brandedReach,
          luxuryCount,
          festiveCount: scannedPrices.length - luxuryCount,
          luxuryThreshold,
          festiveThreshold,
          days,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Maharaja workspace.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized Maharaja session.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const settings: Parameters<typeof updateMaharajaSettings>[0] = {};
    if (typeof body.campaignEnabled === 'boolean') settings.campaignEnabled = body.campaignEnabled;
    if (Array.isArray(body.activeEvents)) {
      const activeEvents = body.activeEvents.filter(isEventId);
      if (!activeEvents.length || activeEvents.length !== body.activeEvents.length) {
        return NextResponse.json({ success: false, error: 'Keep at least one valid event active.' }, { status: 400 });
      }
      settings.activeEvents = activeEvents;
    }
    if (isEventId(body.defaultEvent)) settings.defaultEvent = body.defaultEvent;
    if (!Object.keys(settings).length) {
      return NextResponse.json({ success: false, error: `Provide campaignEnabled, activeEvents, or defaultEvent (${EVENT_IDS.join(', ')}).` }, { status: 400 });
    }
    const workspace = await updateMaharajaSettings(settings);
    await logMaharajaActivity('campaign', 'Maharaja campaign settings updated', {
      enabled: workspace.campaignEnabled,
      activeEvents: workspace.activeEvents.join(','),
      defaultEvent: workspace.defaultEvent,
    });
    return NextResponse.json({ success: true, workspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update Maharaja workspace.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

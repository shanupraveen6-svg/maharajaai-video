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
import { EVENT_IDS, isEventId } from '@/lib/maharaja/config';

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
    const [recentPasses, activity] = await Promise.all([listRecentVideoPasses(), listMaharajaActivity()]);
    return NextResponse.json({
      success: true,
      workspace: {
        ...workspace,
        ...getWorkspaceLinks(req.nextUrl.origin, workspace),
        recentPasses: recentPasses.map(publicPass),
        activity,
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

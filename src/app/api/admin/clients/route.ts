import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { disableClientAccount, listClientLoginUsernames, setClientAccount } from '@/lib/auth/client-accounts';
import {
  genlookAllowance,
  getClientWorkspaceById,
  getWorkspaceLinks,
  listClientWorkspaces,
  logMaharajaActivity,
  type MaharajaWorkspace,
  upsertClientWorkspace,
} from '@/lib/maharaja/server';
import { getWhatsAppStatus } from '@/lib/whatsapp';
import { monthlyReport, spendToday, usdToInr } from '@/lib/maharaja/usage-ledger';

export const dynamic = 'force-dynamic';

type ClientSpend = { todayInr: number; monthInr: number };

function formatClientRecord(ws: MaharajaWorkspace, logins: string[] = [], spend: ClientSpend = { todayInr: 0, monthInr: 0 }) {
  const whatsappStatus = getWhatsAppStatus();
  const links = getWorkspaceLinks(ws);
  return {
    id: ws.clientId,
    clientId: ws.clientId,
    name: ws.clientName,
    branch: ws.branch || (ws.clientId === 'maharaja' ? 'Thanjavur · Main Showroom' : 'Main Showroom'),
    workspaceCode: ws.workspaceCode,
    status: (ws.campaignEnabled ? 'Active' : 'Paused') as 'Active' | 'Paused',
    campaignEnabled: ws.campaignEnabled,
    minPurchaseTryOnDisabled: ws.minPurchaseTryOnDisabled ?? true,
    deliveryMode: ws.deliveryMode || 'qr',
    whatsappConnected: ws.whatsappConnected === true,
    whatsappApiReady: whatsappStatus.configured,
    videoMinPurchase: ws.videoMinPurchase ?? 5000,
    tryOnMinPurchase: ws.minPurchaseTryOnDisabled === false ? ws.tryOnMinPurchase ?? 500 : 0,
    devices: {
      tv: ws.devices?.tv ?? true,
      tablet: ws.devices?.tablet ?? true,
      mobile: ws.devices?.mobile ?? true,
      led: ws.devices?.led ?? true,
    },
    usage: {
      image: Number(ws.usage?.tryOnGenerated || 0),
      live: Number(ws.usage?.liveSessions || 0),
      video: Number(ws.usage?.videosGenerated || 0),
      passes: Number(ws.usage?.videoPasses || 0),
      goLive: Number(ws.usage?.goLive || 0),
      downloads: Number(ws.usage?.downloads || 0),
      scans: Number(ws.usage?.tryOnScans || 0),
      retries: Number(ws.usage?.retries || 0),
    },
    // GenLook credits locked to this store, and how many it has used.
    genlookCredits: genlookAllowance(ws),
    genlookUsed: Number(ws.usage?.genlookUsed || 0),
    limits: {
      image: Number(ws.limits?.image ?? 4000),
      live: Number(ws.limits?.live ?? 500),
      video: Number(ws.limits?.video ?? 500),
    },
    modules: { image: ws.modules?.image !== false, live: ws.modules?.live !== false, video: ws.modules?.video !== false },
    links: links.links,
    logins,
    spend,
    updatedAt: ws.updatedAt,
  };
}

/** Estimated AI spend for one client today and this month, in rupees. */
async function clientSpend(clientId: string): Promise<ClientSpend> {
  const [today, report] = await Promise.all([spendToday(clientId), monthlyReport(clientId)]).catch(() => [null, null] as const);
  return { todayInr: Math.round(usdToInr(today?.clientUsd || 0)), monthInr: Math.round(usdToInr(report?.costUsd || 0)) };
}

/** Client records with the staff login usernames TryFocus created for each client, and their AI spend. */
async function withLogins(workspaces: MaharajaWorkspace[]) {
  return Promise.all(workspaces.map(async (ws) => {
    const [logins, spend] = await Promise.all([listClientLoginUsernames(ws.clientId).catch(() => []), clientSpend(ws.clientId)]);
    return formatClientRecord(ws, logins, spend);
  }));
}

/** Today's estimated AI spend across every client, with the daily caps (₹). */
async function platformSpend() {
  const today = await spendToday().catch(() => null);
  return {
    todayInr: Math.round(usdToInr(today?.platformUsd || 0)),
    clientCapInr: today?.caps.client ? Math.round(usdToInr(today.caps.client)) : null,
    platformCapInr: today?.caps.platform ? Math.round(usdToInr(today.caps.platform)) : null,
  };
}

/** Creates or resets a client's own staff login when TryFocus admin supplies one. */
async function applyLogin(clientId: string, body: { loginUsername?: unknown; loginPassword?: unknown; disableLogin?: unknown }) {
  // Disabling a login signs out every device using it immediately.
  if (body.disableLogin !== undefined) await disableClientAccount(clientId, body.disableLogin);
  if (body.loginUsername === undefined && body.loginPassword === undefined) return;
  await setClientAccount(clientId, body.loginUsername, body.loginPassword);
}

export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized TryFocus admin session.' }, { status: 401 });
  }
  try {
    const clientId = req.nextUrl.searchParams.get('clientId');
    if (clientId) {
      const ws = await getClientWorkspaceById(clientId);
      return NextResponse.json({
        success: true,
        client: (await withLogins([ws]))[0],
      });
    }

    const workspaces = await listClientWorkspaces();
    const [clients, platform] = await Promise.all([withLogins(workspaces), platformSpend()]);
    return NextResponse.json({ success: true, clients, platform });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to load client workspaces.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized TryFocus admin session.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const saved = await upsertClientWorkspace(body);
    await applyLogin(saved.clientId, body);
    await logMaharajaActivity('campaign', `TryFocus admin created/updated client workspace: ${saved.clientId}`, {
      clientId: saved.clientId,
      campaignEnabled: saved.campaignEnabled,
    }).catch(() => undefined);

    const all = await listClientWorkspaces();
    return NextResponse.json({
      success: true,
      client: (await withLogins([saved]))[0],
      clients: await withLogins(all),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to create client workspace.' },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized TryFocus admin session.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (Array.isArray(body.clients)) {
      for (const item of body.clients) {
        await upsertClientWorkspace(item);
      }
      const all = await listClientWorkspaces();
      return NextResponse.json({
        success: true,
        clients: await withLogins(all),
      });
    }

    const saved = await upsertClientWorkspace(body);
    await applyLogin(saved.clientId, body);
    await logMaharajaActivity('campaign', `TryFocus admin updated client configuration: ${saved.clientId}`, {
      clientId: saved.clientId,
      campaignEnabled: saved.campaignEnabled,
    }).catch(() => undefined);

    const all = await listClientWorkspaces();
    return NextResponse.json({
      success: true,
      client: (await withLogins([saved]))[0],
      clients: await withLogins(all),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to update client configuration.' },
      { status: 400 }
    );
  }
}


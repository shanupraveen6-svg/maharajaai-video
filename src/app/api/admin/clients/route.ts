import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { disableClientAccount, listClientLoginUsernames, setClientAccount } from '@/lib/auth/client-accounts';
import {
  deleteClientWorkspace,
  genlookAllowance,
  usesFreeGenlookPool,
  getClientWorkspaceById,
  getWorkspaceLinks,
  instagramUrlFor,
  listClientWorkspaces,
  listMaharajaActivity,
  logMaharajaActivity,
  tryOnMinimumFor,
  type MaharajaWorkspace,
  upsertClientWorkspace,
} from '@/lib/maharaja/server';
import { getWhatsAppStatus } from '@/lib/whatsapp';
import { listCatalogueProducts } from '@/lib/maharaja/catalogue';
import { readStoreLogo } from '@/lib/maharaja/store-logo';
import { runWithClient } from '@/lib/maharaja/client-context';
import { AI_VIDEO_MIN_PURCHASE, EVENT_OPTIONS } from '@/lib/maharaja/config';
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
    // Maharaja (the first store) can draw on GenLook's shared balance instead of a locked number.
    genlookShared: usesFreeGenlookPool(ws),
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
    platformCapInr: today?.caps.platform ? Math.round(usdToInr(today.caps.platform)) : null,
  };
}

/**
 * What the store itself has done in its workspace, for TryFocus admin: catalogue, the settings the store
 * changes (categories, logo, Instagram, price tags, festival theme), this month's counts and recent activity.
 */
async function storeDetail(ws: MaharajaWorkspace) {
  return runWithClient(ws.clientId, async () => {
    const [catalogue, logo, report, activity] = await Promise.all([
      listCatalogueProducts(0, 10_000, { includeInactive: true }).catch(() => ({ products: [], total: 0 })),
      readStoreLogo(ws.clientId).catch(() => null),
      monthlyReport(ws.clientId).catch(() => null),
      listMaharajaActivity(8).catch(() => []),
    ]);
    const showing = catalogue.products.filter((item) => item.active);
    return {
      catalogue: {
        total: catalogue.products.length,
        showing: showing.length,
        video: showing.filter((item) => item.eligibleForVideo).length,
        live: showing.filter((item) => item.eligibleForLive === true).length,
      },
      hasLogo: Boolean(logo),
      instagramUrl: instagramUrlFor(ws),
      customCategories: Boolean(ws.categoryLists && Object.keys(ws.categoryLists).length),
      tryOnMinimum: tryOnMinimumFor(ws),
      videoMinimum: ws.videoMinPurchase ?? AI_VIDEO_MIN_PURCHASE,
      festival: (EVENT_OPTIONS.find((item) => item.id === ws.defaultEvent) || EVENT_OPTIONS[0]).label,
      report: report ? { month: report.month, counts: report.counts, lastCounts: report.lastCounts } : null,
      activity: activity.map((item) => ({ id: item.id, label: item.label, createdAt: item.createdAt })),
    };
  });
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
    return NextResponse.json({ success: false, error: 'Please sign in to TryFocus admin.' }, { status: 401 });
  }
  try {
    const clientId = req.nextUrl.searchParams.get('clientId');
    if (clientId) {
      const ws = await getClientWorkspaceById(clientId);
      const [client, detail] = await Promise.all([withLogins([ws]).then((items) => items[0]), storeDetail(ws)]);
      return NextResponse.json({ success: true, client, detail });
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
    return NextResponse.json({ success: false, error: 'Please sign in to TryFocus admin.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const saved = await upsertClientWorkspace(body);
    await applyLogin(saved.clientId, body);
    await runWithClient(saved.clientId, () => logMaharajaActivity('campaign', 'TryFocus updated the plan or settings', { clientId: saved.clientId, campaignEnabled: saved.campaignEnabled })).catch(() => undefined);

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
    return NextResponse.json({ success: false, error: 'Please sign in to TryFocus admin.' }, { status: 401 });
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
    await runWithClient(saved.clientId, () => logMaharajaActivity('campaign', 'TryFocus updated the plan or settings', { clientId: saved.clientId, campaignEnabled: saved.campaignEnabled })).catch(() => undefined);

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


/** Deletes a client's workspace, files and logins for good (TryFocus admin only). */
export async function DELETE(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in to TryFocus admin.' }, { status: 401 });
  }
  try {
    const clientId = String(req.nextUrl.searchParams.get('clientId') || '').trim().toLowerCase();
    const before = await getClientWorkspaceById(clientId);
    await deleteClientWorkspace(clientId);
    console.info('TryFocus admin deleted client workspace', { clientId, name: before.clientName });
    const all = await listClientWorkspaces();
    return NextResponse.json({ success: true, deleted: clientId, clients: await withLogins(all) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to delete the client workspace.' },
      { status: 400 }
    );
  }
}

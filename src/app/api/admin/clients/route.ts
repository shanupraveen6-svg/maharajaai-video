import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { disableClientAccount, listClientLoginUsernames, setClientAccount } from '@/lib/auth/client-accounts';
import {
  getClientWorkspaceById,
  getWorkspaceLinks,
  listClientWorkspaces,
  logMaharajaActivity,
  type MaharajaWorkspace,
  upsertClientWorkspace,
} from '@/lib/maharaja/server';
import { getWhatsAppStatus } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

function formatClientRecord(ws: MaharajaWorkspace, logins: string[] = []) {
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
    whatsappRequestedAt: ws.whatsappRequestedAt || null,
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
    },
    limits: {
      image: Number(ws.limits?.image ?? 4000),
      live: Number(ws.limits?.live ?? 500),
      video: Number(ws.limits?.video ?? 500),
    },
    modules: { image: ws.modules?.image !== false, live: ws.modules?.live !== false, video: ws.modules?.video !== false },
    links: links.links,
    logins,
    updatedAt: ws.updatedAt,
  };
}

/** Client records with the staff login usernames TryFocus created for each client. */
async function withLogins(workspaces: MaharajaWorkspace[]) {
  return Promise.all(workspaces.map(async (ws) => formatClientRecord(ws, await listClientLoginUsernames(ws.clientId).catch(() => []))));
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
    return NextResponse.json({
      success: true,
      clients: await withLogins(workspaces),
    });
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


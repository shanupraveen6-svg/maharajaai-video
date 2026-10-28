import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
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

function formatClientRecord(ws: MaharajaWorkspace) {
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
    whatsappConnected: Boolean(ws.whatsappConnected ?? whatsappStatus.configured),
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
    },
    limits: {
      image: Number(ws.limits?.image ?? 4000),
      live: Number(ws.limits?.live ?? 500),
      video: Number(ws.limits?.video ?? 500),
    },
    links: links.links,
    updatedAt: ws.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized TryFocus admin session.' }, { status: 401 });
  }
  try {
    const clientId = req.nextUrl.searchParams.get('clientId');
    if (clientId) {
      const ws = await getClientWorkspaceById(clientId);
      return NextResponse.json({
        success: true,
        client: formatClientRecord(ws),
      });
    }

    const workspaces = await listClientWorkspaces();
    return NextResponse.json({
      success: true,
      clients: workspaces.map(formatClientRecord),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to load client workspaces.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized TryFocus admin session.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const saved = await upsertClientWorkspace(body);
    await logMaharajaActivity('campaign', `TryFocus admin created/updated client workspace: ${saved.clientId}`, {
      clientId: saved.clientId,
      campaignEnabled: saved.campaignEnabled,
    }).catch(() => undefined);

    const all = await listClientWorkspaces();
    return NextResponse.json({
      success: true,
      client: formatClientRecord(saved),
      clients: all.map(formatClientRecord),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to create client workspace.' },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
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
        clients: all.map(formatClientRecord),
      });
    }

    const saved = await upsertClientWorkspace(body);
    await logMaharajaActivity('campaign', `TryFocus admin updated client configuration: ${saved.clientId}`, {
      clientId: saved.clientId,
      campaignEnabled: saved.campaignEnabled,
    }).catch(() => undefined);

    const all = await listClientWorkspaces();
    return NextResponse.json({
      success: true,
      client: formatClientRecord(saved),
      clients: all.map(formatClientRecord),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to update client configuration.' },
      { status: 400 }
    );
  }
}


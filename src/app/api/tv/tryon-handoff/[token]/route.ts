import { NextRequest, NextResponse } from 'next/server';
import { getStorageBucket } from '@/lib/firebase/admin';

import { lookVideoAvailable, readTryOnHandoff } from '@/lib/maharaja/tryon-handoff';
import { getClientWorkspaceById, instagramUrlFor, moduleLimit } from '@/lib/maharaja/server';
import { resolveAccess } from '@/lib/maharaja/access';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { countLeadDownload, verifyLeadToken } from '@/lib/maharaja/leads';

export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const handoff = await readTryOnHandoff(token);
  if (!handoff) return NextResponse.json({ error: 'This private look link has expired.' }, { status: 404 });

  const imageIndex = req.nextUrl.searchParams.get('image');
  if (imageIndex !== null) {
    const index = Number(imageIndex);
    if (!Number.isInteger(index) || index < 0 || index >= handoff.looks.length) {
      return NextResponse.json({ error: 'Look not found.' }, { status: 404 });
    }
    const look = handoff.looks[index];
    const bucket = getStorageBucket();
    const bytes = look.bytes || (bucket && look.path ? (await bucket.file(look.path).download())[0] : null);
    if (!bytes) return NextResponse.json({ error: 'Look is unavailable.' }, { status: 503 });
    const download = req.nextUrl.searchParams.get('download') === '1';
    if (download) {
      // Saving a look needs the customer's WhatsApp number first (the lead form on the phone).
      const lead = verifyLeadToken(req.nextUrl.searchParams.get('lead'), handoff.clientId || MAHARAJA_CLIENT_ID);
      if (!lead) return NextResponse.json({ error: 'Enter your WhatsApp number to save your look.', leadRequired: true }, { status: 428 });
      void countLeadDownload(lead.leadId, handoff.clientId || MAHARAJA_CLIENT_ID).catch(() => undefined);
    }
    const extension = look.contentType === 'image/png' ? 'png' : look.contentType === 'image/webp' ? 'webp' : 'jpg';
    return new NextResponse(new Uint8Array(bytes), { headers: {
      'Content-Type': look.contentType,
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="tryfocus-${look.sku.replace(/[^A-Za-z0-9_-]/g, '')}.${extension}"`,
      'X-Content-Type-Options': 'nosniff',
    } });
  }

  // No AI Video for this store (module or a device it needs is off): the look page shows no video step.
  const workspace = await getClientWorkspaceById(handoff.clientId || '');
  const videoOff = !workspace.campaignEnabled || moduleLimit(workspace, 'video') <= 0;
  const catalogueVideo = resolveAccess(workspace.devices, workspace.modules).catalogueVideo;
  return NextResponse.json({
    expiresAt: new Date(handoff.expiresAtMs).toISOString(),
    videoOff,
    // Shown after a download: Follow us on Instagram and Share on WhatsApp.
    clientName: workspace.clientName,
    instagramUrl: instagramUrlFor(workspace),
    looks: handoff.looks.map((look, index) => ({
      sku: look.sku,
      title: look.title,
      category: look.category,
      garmentType: look.garmentType,
      gender: look.gender,
      garmentReferenceUrl: look.garmentReferenceUrl,
      videoAvailable: lookVideoAvailable(handoff, look) && catalogueVideo,
      imageUrl: `/api/tv/tryon-handoff/${token}?image=${index}`,
      downloadUrl: `/api/tv/tryon-handoff/${token}?image=${index}&download=1`,
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

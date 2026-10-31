import { NextRequest, NextResponse } from 'next/server';
import { getStorageBucket } from '@/lib/firebase/admin';

import { lookVideoAvailable, readTryOnHandoff } from '@/lib/maharaja/tryon-handoff';

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
    const extension = look.contentType === 'image/png' ? 'png' : look.contentType === 'image/webp' ? 'webp' : 'jpg';
    return new NextResponse(new Uint8Array(bytes), { headers: {
      'Content-Type': look.contentType,
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="tryfocus-${look.sku.replace(/[^A-Za-z0-9_-]/g, '')}.${extension}"`,
      'X-Content-Type-Options': 'nosniff',
    } });
  }

  return NextResponse.json({
    expiresAt: new Date(handoff.expiresAtMs).toISOString(),
    looks: handoff.looks.map((look, index) => ({
      sku: look.sku,
      title: look.title,
      category: look.category,
      garmentType: look.garmentType,
      gender: look.gender,
      garmentReferenceUrl: look.garmentReferenceUrl,
      videoAvailable: lookVideoAvailable(handoff, look),
      imageUrl: `/api/tv/tryon-handoff/${token}?image=${index}`,
      downloadUrl: `/api/tv/tryon-handoff/${token}?image=${index}&download=1`,
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

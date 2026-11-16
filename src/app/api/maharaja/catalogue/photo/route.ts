import { NextRequest, NextResponse } from 'next/server';
import { bindClient } from '@/lib/maharaja/client-context';
import { resolveRequestClientId } from '@/lib/maharaja/server';
import { getCatalogueProduct } from '@/lib/maharaja/catalogue';
import { readCataloguePhoto } from '@/lib/maharaja/photo-source';

export const dynamic = 'force-dynamic';

function imageType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return 'image/jpeg';
}

/**
 * A store garment's photo served from our own address, for screens that must read the photo's bytes in the
 * browser (Live Try-On sends it to Lucy). Photos in storage are on another address that browsers block from
 * being read this way; through here they always load. The same garments the catalogue already lists.
 */
export async function GET(req: NextRequest) {
  try {
    bindClient(await resolveRequestClientId(req, req.nextUrl.searchParams.get('access'), req.nextUrl.searchParams.get('workspaceCode')));
    const product = await getCatalogueProduct(String(req.nextUrl.searchParams.get('sku') || ''));
    const photo = product ? String(product.garmentReferencePath || product.storagePath || '').trim() : '';
    if (!photo) return NextResponse.json({ success: false, error: 'Garment not found.' }, { status: 404 });
    const bytes = Buffer.from(await readCataloguePhoto(photo), 'base64');
    if (!bytes.length) return NextResponse.json({ success: false, error: 'Garment photo is empty.' }, { status: 404 });
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': imageType(bytes), 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (error) {
    console.warn('Catalogue photo could not be served:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Garment photo could not be loaded.' }, { status: 502 });
  }
}

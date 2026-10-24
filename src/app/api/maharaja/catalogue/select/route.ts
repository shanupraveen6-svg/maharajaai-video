import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase/admin';
import { getCatalogueProduct } from '@/lib/maharaja/catalogue';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const accessCode = typeof body?.accessCode === 'string' ? body.accessCode.trim() : '';
    const sku = typeof body?.sku === 'string' ? body.sku.trim() : '';
    const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
    if (!access.allowed || !access.pass) return NextResponse.json({ success: false, error: access.error || 'Gift link is invalid.' }, { status: 401 });
    if (access.pass.experienceType !== 'catalogue-gift') return NextResponse.json({ success: false, error: 'This link is not a catalogue gift.' }, { status: 403 });
    const product = await getCatalogueProduct(sku);
    if (!product) return NextResponse.json({ success: false, error: 'That catalogue product is unavailable.' }, { status: 404 });
    const db = getDb();
    if (!db) return NextResponse.json({ success: false, error: 'Catalogue storage is unavailable.' }, { status: 503 });
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(access.pass.code);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const pass = snapshot.data();
      if (!pass || pass.experienceType !== 'catalogue-gift') throw new Error('Gift link is invalid.');
      if (pass.catalogueSku && pass.catalogueSku !== product.sku) throw new Error('This gift link is already locked to its selected saree.');
      if (pass.videoMasterDone || pass.videoGenerating || pass.videoDone) {
        return;
      }
      transaction.set(ref, {
        catalogueSku: product.sku,
        catalogueTitle: product.title,
        cataloguePrice: product.price,
        catalogueStoragePath: product.storagePath,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    });
    return NextResponse.json({ success: true, product: { sku: product.sku, title: product.title, price: product.price } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to select this saree.' }, { status: 409 });
  }
}

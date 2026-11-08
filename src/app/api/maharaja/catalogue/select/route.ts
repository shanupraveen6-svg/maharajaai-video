import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { getCatalogueProduct } from '@/lib/maharaja/catalogue';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';
import { garmentTypeFor } from '@/lib/maharaja/garment-type';
import type { CustomerCategory } from '@/lib/maharaja/config';

const AUDIENCE_CATEGORY: Record<string, CustomerCategory> = { women: 'women', men: 'men', boys: 'boy', girls: 'girl' };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const accessCode = typeof body?.accessCode === 'string' ? body.accessCode.trim() : '';
    const sku = typeof body?.sku === 'string' ? body.sku.trim() : '';
    const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
    bindClient(access.allowed ? access.clientId : null);
    if (!access.allowed || !access.pass) return NextResponse.json({ success: false, error: access.error || 'Gift link is invalid.' }, { status: 401 });
    if (access.pass.experienceType !== 'catalogue-gift') return NextResponse.json({ success: false, error: 'This link is not a catalogue gift.' }, { status: 403 });
    const product = await getCatalogueProduct(sku);
    if (!product) return NextResponse.json({ success: false, error: 'That catalogue product is unavailable.' }, { status: 404 });
    // AI Video uses only the pieces the store switched on for it (its higher-value collection).
    if (!product.eligibleForVideo) {
      return NextResponse.json({ success: false, error: 'This outfit is not available for AI Video. Choose another.' }, { status: 400 });
    }
    // Who the video is for and what the garment is come from the piece chosen, so the portrait uses that
    // audience's looks and the right garment rule (a man's veshti is never drawn as a saree).
    const videoMasterCategory = AUDIENCE_CATEGORY[product.gender] || 'women';
    const videoMasterGarmentType = garmentTypeFor({ audience: videoMasterCategory, categoryId: product.category, storedType: product.garmentType, title: product.title });
    const db = getDb();
    if (!db) {
      const store = getMockStore();
      const passKey = `${activeClientId()}:${access.pass.code}`;
      const existing = store.customerPasses.get(passKey) as Record<string, any> | undefined;
      if (!existing || existing.experienceType !== 'catalogue-gift') {
        return NextResponse.json({ success: false, error: 'Gift link is invalid.' }, { status: 403 });
      }
      if (!existing.videoMasterDone && !existing.videoGenerating && !existing.videoDone) {
        store.customerPasses.set(passKey, {
          ...existing,
          catalogueSku: product.sku,
          catalogueTitle: product.title,
          cataloguePrice: product.price,
          catalogueStoragePath: product.storagePath,
          videoMasterCategory,
          videoMasterGarmentType,
          updatedAt: new Date().toISOString(),
        });
      }
      return NextResponse.json({ success: true, product: { sku: product.sku, title: product.title, price: product.price } });
    }
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(access.pass.code);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const pass = snapshot.data();
      if (!pass || pass.experienceType !== 'catalogue-gift') throw new Error('Gift link is invalid.');
      if (pass.catalogueSku && pass.catalogueSku !== product.sku) throw new Error('This gift link is already locked to its chosen piece.');
      if (pass.videoMasterDone || pass.videoGenerating || pass.videoDone) {
        return;
      }
      transaction.set(ref, {
        catalogueSku: product.sku,
        catalogueTitle: product.title,
        cataloguePrice: product.price,
        catalogueStoragePath: product.storagePath,
        videoMasterCategory,
        videoMasterGarmentType,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    });
    return NextResponse.json({ success: true, product: { sku: product.sku, title: product.title, price: product.price } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to select this piece.' }, { status: 409 });
  }
}

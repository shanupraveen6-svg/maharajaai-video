import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getStorageBucket } from '@/lib/firebase/admin';
import { upsertCatalogueProduct } from '@/lib/maharaja/catalogue';
import { catalogueCategories } from '@/lib/tryfocus/sample-data';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!verifyOperatorRequest(req)) return NextResponse.json({ error: 'Operator sign-in required.' }, { status: 401 });
  try {
    const body = await req.json();
    const batchId = String(body.batchId || '');
    const items = body.items;
    if (!/^[a-z0-9-]{12,64}$/i.test(batchId) || !Array.isArray(items) || items.length < 1 || items.length > 20) throw new Error('Publish 1–20 reviewed garments per request.');
    const bucket = getStorageBucket();
    if (!bucket) throw new Error('Catalogue storage is unavailable.');
    const results: Array<{ sku: string; success: boolean; error?: string }> = [];
    for (const raw of items) {
      const sku = String(raw.sku || '').trim().toUpperCase().slice(0, 60);
      const path = String(raw.storagePath || '');
      const category = catalogueCategories.find((entry) => entry.id === raw.category);
      if (!sku || !category || !path.startsWith(`clients/maharaja/catalogue-imports/${batchId}/`)) {
        results.push({ sku, success: false, error: 'SKU, category or image path is invalid.' });
        continue;
      }
      try {
        const [exists] = await bucket.file(path).exists();
        if (!exists) throw new Error('Uploaded garment photo is missing.');
        await upsertCatalogueProduct({
          sku,
          title: String(raw.title || sku).trim().slice(0, 120),
          price: Math.max(0, Number(raw.price) || 0),
          category: category.id,
          gender: category.gender,
          audience: category.audience,
          garmentType: category.garmentType,
          storagePath: path,
          garmentReferencePath: path,
          fabricNote: `${category.label} · Store catalogue`,
          newArrival: raw.newArrival === true,
          eligibleForVideo: false,
          eligibleForLive: false,
          active: true,
          sortOrder: Number(raw.sortOrder) || Date.now(),
        });
        results.push({ sku, success: true });
      } catch (error) {
        results.push({ sku, success: false, error: error instanceof Error ? error.message : 'Publish failed.' });
      }
    }
    return NextResponse.json({ success: results.every((item) => item.success), results });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Bulk publish failed.' }, { status: 400 });
  }
}

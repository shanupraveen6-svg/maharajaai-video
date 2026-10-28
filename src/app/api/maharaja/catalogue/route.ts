import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import {
  deleteCatalogueProduct,
  listCatalogueProducts,
  updateCatalogueProduct,
  upsertCatalogueProduct,
} from '@/lib/maharaja/catalogue';
import { logMaharajaActivity } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

function canManageCatalogue(req: NextRequest) {
  if (verifyOperatorRequest(req)) return true;
  if (process.env.ALLOW_MOCK_BACKEND === 'true' || process.env.NODE_ENV !== 'production') return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const offset = Number(req.nextUrl.searchParams.get('offset') || '0');
    const limit = Number(req.nextUrl.searchParams.get('limit') || '60');
    const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true' && canManageCatalogue(req);
    const catalogue = await listCatalogueProducts(
      Number.isFinite(offset) ? offset : 0,
      Number.isFinite(limit) ? limit : 60,
      { includeInactive }
    );
    return NextResponse.json(
      { success: true, ...catalogue },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to load the Maharaja catalogue.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!canManageCatalogue(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized Maharaja operator session.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const product = await upsertCatalogueProduct(body);
    await logMaharajaActivity('campaign', `Catalogue garment saved: ${product.sku}`, {
      sku: product.sku,
      category: product.category,
      active: product.active,
    }).catch(() => undefined);
    return NextResponse.json({ success: true, product });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to save catalogue item.' },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!canManageCatalogue(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized Maharaja operator session.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const sku = String(body.sku || '').trim();
    if (!sku) {
      return NextResponse.json({ success: false, error: 'SKU is required to update a catalogue item.' }, { status: 400 });
    }
    const product = await updateCatalogueProduct(sku, body);
    await logMaharajaActivity('campaign', `Catalogue garment updated: ${product.sku}`, {
      sku: product.sku,
      active: product.active,
      newArrival: product.newArrival,
      eligibleForVideo: product.eligibleForVideo,
    }).catch(() => undefined);
    return NextResponse.json({ success: true, product });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to update catalogue item.' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!canManageCatalogue(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized Maharaja operator session.' }, { status: 401 });
  }
  try {
    const sku = req.nextUrl.searchParams.get('sku') || '';
    if (!sku.trim()) {
      return NextResponse.json({ success: false, error: 'SKU query parameter is required.' }, { status: 400 });
    }
    await deleteCatalogueProduct(sku);
    return NextResponse.json({ success: true, sku });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to delete catalogue item.' },
      { status: 400 }
    );
  }
}

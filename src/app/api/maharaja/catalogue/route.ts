import { NextRequest, NextResponse } from 'next/server';
import { resolveAccess } from '@/lib/maharaja/access';
import { bindClient } from '@/lib/maharaja/client-context';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import {
  deleteCatalogueProduct,
  listCatalogueProducts,
  updateCatalogueProduct,
  upsertCatalogueProduct,
} from '@/lib/maharaja/catalogue';
import { videoLimitSet, resolveRequestClientId, getMaharajaWorkspace, logMaharajaActivity } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Customer pages pass their QR or pass code; staff pages are bound by their login.
    bindClient(await resolveRequestClientId(req, req.nextUrl.searchParams.get('access')));
    const offset = Number(req.nextUrl.searchParams.get('offset') || '0');
    const limit = Number(req.nextUrl.searchParams.get('limit') || '60');
    const requestedInactive = req.nextUrl.searchParams.get('includeInactive') === 'true';
    if (requestedInactive && !verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized Maharaja operator session.' }, { status: 401 });
    }
    const catalogue = await listCatalogueProducts(
      Number.isFinite(offset) ? offset : 0,
      Number.isFinite(limit) ? limit : 60,
      { includeInactive: requestedInactive }
    );
    const workspace = await getMaharajaWorkspace();
    return NextResponse.json(
      { success: true, ...catalogue, clientName: workspace.clientName, tvBillSuffixRequired: videoLimitSet(workspace), access: resolveAccess(workspace.devices, workspace.modules) },
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
  bindClient(await resolveRequestClientId(req));
  if (!verifyOperatorRequest(req)) {
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
  bindClient(await resolveRequestClientId(req));
  if (!verifyOperatorRequest(req)) {
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
  bindClient(await resolveRequestClientId(req));
  if (!verifyOperatorRequest(req)) {
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

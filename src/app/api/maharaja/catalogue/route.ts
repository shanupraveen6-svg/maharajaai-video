import { NextRequest, NextResponse, after } from 'next/server';
import { getDb, getStorageBucket } from '@/lib/firebase/admin';
import { maybeSweepExpired } from '@/lib/maharaja/privacy-cleanup';
import { resolveAccess } from '@/lib/maharaja/access';
import { bindClient } from '@/lib/maharaja/client-context';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import {
  deleteCatalogueProduct,
  listCatalogueProducts,
  updateCatalogueProduct,
  upsertCatalogueProduct,
} from '@/lib/maharaja/catalogue';
import { videoLimitSet, resolveRequestClientId, getMaharajaWorkspace, logMaharajaActivity, instagramUrlFor } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // TVs and workspaces read this every few minutes: it also starts the 10-minute privacy cleanup.
  try {
    after(async () => {
      const db = getDb();
      const bucket = getStorageBucket();
      if (db && bucket) await maybeSweepExpired(db, bucket).catch((error) => console.warn('Privacy sweep failed:', error));
    });
  } catch { /* outside a request scope (build) */ }
  try {
    // Customer pages pass their QR or pass code; staff pages are bound by their login (TryFocus admin
    // viewing a client's workspace passes which client this catalogue is for).
    bindClient(await resolveRequestClientId(req, req.nextUrl.searchParams.get('access'), req.nextUrl.searchParams.get('workspaceCode')));
    const offset = Number(req.nextUrl.searchParams.get('offset') || '0');
    const limit = Number(req.nextUrl.searchParams.get('limit') || '60');
    const requestedInactive = req.nextUrl.searchParams.get('includeInactive') === 'true';
    if (requestedInactive && !verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
    }
    const catalogue = await listCatalogueProducts(
      Number.isFinite(offset) ? offset : 0,
      Number.isFinite(limit) ? limit : 60,
      { includeInactive: requestedInactive, videoOnly: req.nextUrl.searchParams.get('videoOnly') === 'true' }
    );
    const workspace = await getMaharajaWorkspace();
    return NextResponse.json(
      { success: true, ...catalogue, clientName: workspace.clientName, tvBillSuffixRequired: videoLimitSet(workspace), access: resolveAccess(workspace.devices, workspace.modules), categoryLists: workspace.categoryLists || {}, instagramUrl: instagramUrlFor(workspace) },
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
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    bindClient(await resolveRequestClientId(req, undefined, body.workspaceCode));
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
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    bindClient(await resolveRequestClientId(req, undefined, body.workspaceCode));
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
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  }
  bindClient(await resolveRequestClientId(req, undefined, req.nextUrl.searchParams.get('workspaceCode')));
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

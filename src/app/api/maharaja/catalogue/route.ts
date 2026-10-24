import { NextRequest, NextResponse } from 'next/server';
import { listCatalogueProducts } from '@/lib/maharaja/catalogue';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const offset = Number(req.nextUrl.searchParams.get('offset') || '0');
    const limit = Number(req.nextUrl.searchParams.get('limit') || '8');
    const catalogue = await listCatalogueProducts(Number.isFinite(offset) ? offset : 0, Number.isFinite(limit) ? limit : 8);
    return NextResponse.json({ success: true, ...catalogue }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to load the Maharaja catalogue.' }, { status: 500 });
  }
}

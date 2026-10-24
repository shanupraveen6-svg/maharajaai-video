import { NextResponse } from 'next/server';
import { listCatalogueProducts } from '@/lib/maharaja/catalogue';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ success: true, products: await listCatalogueProducts() });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to load the Maharaja catalogue.' }, { status: 500 });
  }
}

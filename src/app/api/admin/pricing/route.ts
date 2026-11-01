import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { PLATFORMS, quote, type Platform } from '@/lib/maharaja/pricing';
import { quoteMargin } from '@/lib/maharaja/pricing-costs';

export const dynamic = 'force-dynamic';

/**
 * The price of a package for TryFocus admin, with our AI cost and profit if every credit is used.
 * Credits are clamped to the platform's rules, so the answer is always a package a store can buy.
 */
export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized TryFocus admin session.' }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  const platform = params.get('platform') as Platform;
  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json({ success: false, error: 'Choose TV, Tablet or Phone.' }, { status: 400 });
  }
  const result = quote(platform, {
    image: Number(params.get('image')),
    video: Number(params.get('video')),
    live: Number(params.get('live')),
  }, { includeSoftware: params.get('software') === '1' });
  return NextResponse.json({ success: true, quote: result, margin: quoteMargin(result) });
}

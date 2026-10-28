import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';

const LUCY_VTON_APP = 'decart/lucy2-vton/realtime';

export async function POST(req: NextRequest) {
  const falKey = process.env.FAL_KEY?.trim();
  if (!falKey) return new NextResponse('Live AI Mirror is not configured.', { status: 503 });
  const body = await req.json().catch(() => ({}));
  if (body?.app !== LUCY_VTON_APP) return new NextResponse('Unsupported realtime app.', { status: 400 });
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rate = await enforceRateLimit(req, 'fal-lucy-realtime-token', 8, 10 * 60 * 1000, forwarded);
  if (!rate.allowed) return new NextResponse('Too many Live AI Mirror sessions. Please wait.', { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
  try {
    const response = await fetch('https://rest.fal.ai/v1/tokens/', {
      method: 'POST',
      headers: { Authorization: `Key ${falKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed_apps: [LUCY_VTON_APP], token_expiration: 60 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const token = await response.text();
    if (!response.ok || !token) return new NextResponse('Could not start Live AI Mirror.', { status: 502 });
    return new NextResponse(token.replace(/^"|"$/g, ''), { status: 200, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch {
    return new NextResponse('Could not reach Live AI Mirror.', { status: 502 });
  }
}

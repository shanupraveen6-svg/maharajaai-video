import { NextRequest, NextResponse } from 'next/server';
import { getMaharajaWorkspace, incrementMaharajaUsage } from '@/lib/maharaja/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { verifyTvRequest } from '@/lib/auth/display';

const LUCY_VTON_APP = 'decart/lucy2-vton/realtime';

export async function POST(req: NextRequest) {
  if (!await verifyTvRequest(req)) return new NextResponse('Sign in or pair this display first.', { status: 401 });
  const workspace = await getMaharajaWorkspace();
  if (!workspace.campaignEnabled) {
    return new NextResponse('Store campaign is currently paused by the administrator.', { status: 403 });
  }
  if (workspace.devices && workspace.devices.tv === false) {
    return new NextResponse('The Interactive TV / Smart Mirror surface is currently disabled for this store.', { status: 403 });
  }
  const liveLimit = Number(workspace.limits?.live ?? 500);
  const liveUsed = Number(workspace.usage?.liveSessions || 0);
  if (liveLimit <= 0 || liveUsed >= liveLimit) {
    return new NextResponse('Live AI Mirror 30-second session credits are exhausted for this store.', { status: 403 });
  }

  const falKey = process.env.FAL_KEY?.trim();
  if (!falKey) return new NextResponse('Live AI Mirror is not configured.', { status: 503 });
  const body = await req.json().catch(() => ({}));
  if (body?.app !== LUCY_VTON_APP) return new NextResponse('Unsupported realtime app.', { status: 400 });
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rate = await enforceRateLimit(req, 'fal-lucy-realtime-token', 8, 10 * 60 * 1000, forwarded);
  if (!rate.allowed) {
    return new NextResponse('Too many Live AI Mirror sessions. Please wait.', {
      status: 429,
      headers: { 'Retry-After': String(rate.retryAfterSeconds) },
    });
  }
  try {
    const response = await fetch('https://rest.fal.ai/tokens/', {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ allowed_apps: ['lucy2-vton'], token_expiration: 60 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const token = await response.text();
    if (!response.ok || !token) return new NextResponse('Could not start Live AI Mirror.', { status: 502 });
    await incrementMaharajaUsage('liveSessions').catch(() => undefined);
    return new NextResponse(token.replace(/^"|"$/g, ''), {
      status: 200,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch {
    return new NextResponse('Could not reach Live AI Mirror.', { status: 502 });
  }
}

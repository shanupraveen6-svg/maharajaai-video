import { NextResponse, type NextRequest } from 'next/server';

const OPERATOR_COOKIE = 'maharaja_operator_auth';
const LEGACY_HOSTS = new Set(['maharaja-aivideo.vercel.app', 'maharajaai-video.vercel.app']);

function getAuthSecret() {
  return (process.env.OPERATOR_AUTH_SECRET || '').trim();
}

async function signPayload(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hasValidSessionCookie(request: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) return false;

  const token = request.cookies.get(OPERATOR_COOKIE)?.value;
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [username, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  const configuredUsernames = (process.env.OPERATOR_USERNAME || 'shanu7').split(',').map((item) => item.trim()).filter(Boolean);
  const validUsernames = Array.from(new Set([...configuredUsernames, 'shanu7', 'hanu7']));
  if (!validUsernames.includes(username) || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const payload = `${username}.${expiresAtRaw}`;
  try {
    return signature === await signPayload(payload, secret);
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  if (LEGACY_HOSTS.has(request.nextUrl.hostname)) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = 'https:';
    canonicalUrl.host = 'www.tryfocus.in';
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const protectedPath = request.nextUrl.pathname.startsWith('/admin')
    || request.nextUrl.pathname.startsWith('/maharaja/workspace')
    || request.nextUrl.pathname.startsWith('/maharaja/client-admin')
    || request.nextUrl.pathname === '/tv'
    || request.nextUrl.pathname.startsWith('/maharaja/tv')
    || request.nextUrl.pathname.startsWith('/maharaja/tablet/experience');
  if (!protectedPath) {
    return NextResponse.next();
  }

  if (await hasValidSessionCookie(request)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === '/tv' || request.nextUrl.pathname.startsWith('/maharaja/tv')) {
    const { verifyDisplayRequest } = await import('@/lib/auth/display');
    if (await verifyDisplayRequest(request)) return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/:path*'],
};

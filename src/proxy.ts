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

/** Role of a valid operator session cookie: TryFocus admin, a client's own login, or none. */
async function sessionRole(request: NextRequest): Promise<'admin' | 'client' | null> {
  const secret = getAuthSecret();
  if (!secret) return null;

  const token = request.cookies.get(OPERATOR_COOKIE)?.value;
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [subject, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  try {
    if (signature !== await signPayload(`${subject}.${expiresAtRaw}`, secret)) return null;
  } catch {
    return null;
  }
  if (subject.startsWith('client~')) return 'client';
  const configuredUsernames = (process.env.OPERATOR_USERNAME || 'shanu7').split(',').map((item) => item.trim()).filter(Boolean);
  const validUsernames = Array.from(new Set([...configuredUsernames, 'shanu7', 'hanu7']));
  return validUsernames.includes(subject) ? 'admin' : null;
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

  // A workspace Go Live link plays without a login; its playback APIs check the screen code.
  if (request.nextUrl.pathname === '/tv' && /^[A-Za-z0-9_-]{24}$/.test(request.nextUrl.searchParams.get('screen') || '')) {
    return NextResponse.next();
  }

  const role = await sessionRole(request);
  if (role === 'client' && request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/maharaja/client-admin', request.url));
  }
  if (role) {
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

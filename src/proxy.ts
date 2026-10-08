import { NextResponse, type NextRequest } from 'next/server';

const OPERATOR_COOKIE = 'maharaja_operator_auth';

function getAuthSecret() {
  return process.env.OPERATOR_AUTH_SECRET || process.env.ADMIN_PASSWORD || '';
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
  if (username !== 'shanu7' || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const payload = `${username}.${expiresAtRaw}`;
  try {
    return signature === await signPayload(payload, secret);
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  if (await hasValidSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL(request.nextUrl.pathname.startsWith('/tv') ? '/tv-login' : '/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/create/:path*', '/tv/:path*'],
};

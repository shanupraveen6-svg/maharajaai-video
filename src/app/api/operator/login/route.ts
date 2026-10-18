import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { enforceRateLimit } from '@/lib/security/rate-limit';

const OPERATOR_COOKIE = 'maharaja_operator_auth';

function getAuthSecret() {
  return (process.env.OPERATOR_AUTH_SECRET || '').trim();
}

function getValidOperatorCredentials() {
  const envUsername = (process.env.OPERATOR_USERNAME || '').trim();
  const envPassword = (process.env.OPERATOR_PASSWORD || '').trim();
  const envPasswordsRaw = (process.env.OPERATOR_PASSWORDS || '').trim();
  const envPasswords = envPasswordsRaw ? envPasswordsRaw.split(',').map((p) => p.trim()).filter(Boolean) : [];

  const validUsernames = [envUsername].filter(Boolean);
  const validPasswords = [envPassword, ...envPasswords].filter(Boolean);

  return {
    usernames: validUsernames,
    passwords: validPasswords,
    isConfigured: validUsernames.length > 0 && validPasswords.length > 0,
  };
}

function signToken(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const rate = await enforceRateLimit(req, 'operator-login', 10, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: 'Too many login attempts. Try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      });
    }
    const secret = getAuthSecret();
    if (!secret) {
      return NextResponse.json({ success: false, error: 'Operator auth secret is not configured.' }, { status: 500 });
    }

    const creds = getValidOperatorCredentials();
    if (!creds.isConfigured) {
      return NextResponse.json(
        { success: false, error: 'Operator credentials must be configured in environment variables.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password.trim() : '';

    if (!creds.usernames.includes(username) || !creds.passwords.includes(password)) {
      return NextResponse.json({ success: false, error: 'Invalid login.' }, { status: 401 });
    }

    const expiresAt = Date.now() + 60 * 60 * 24 * 1000;
    const payload = `${username}.${expiresAt}`;
    const token = `${payload}.${signToken(payload, secret)}`;

    const response = NextResponse.json({ success: true });
    response.cookies.set(OPERATOR_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch {
    return NextResponse.json({ success: false, error: 'Login failed.' }, { status: 400 });
  }
}

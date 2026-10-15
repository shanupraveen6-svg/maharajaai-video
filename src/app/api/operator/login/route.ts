import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const OPERATOR_COOKIE = 'maharaja_operator_auth';

function getAuthSecret() {
  const secret = process.env.OPERATOR_AUTH_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret && process.env.NODE_ENV !== 'production') {
    return 'maharaja-local-dev-operator-auth-secret';
  }
  return secret || '';
}

function getValidOperatorCredentials() {
  const envUsername = (process.env.OPERATOR_USERNAME || '').trim();
  const envPassword = (process.env.OPERATOR_PASSWORD || '').trim();
  const envPasswordsRaw = (process.env.OPERATOR_PASSWORDS || '').trim();
  const envPasswords = envPasswordsRaw ? envPasswordsRaw.split(',').map((p) => p.trim()) : [];

  const validUsernames = [envUsername].filter(Boolean);
  const validPasswords = [envPassword, ...envPasswords].filter(Boolean);

  if (process.env.NODE_ENV === 'production' && (validUsernames.length === 0 || validPasswords.length === 0)) {
    return { usernames: validUsernames, passwords: validPasswords, isConfigured: false };
  }

  // Non-production fallback
  if (validUsernames.length === 0) validUsernames.push('shanu7');
  if (validPasswords.length === 0) validPasswords.push('9994837342', '99948387342');

  return { usernames: validUsernames, passwords: validPasswords, isConfigured: true };
}

function signToken(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
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

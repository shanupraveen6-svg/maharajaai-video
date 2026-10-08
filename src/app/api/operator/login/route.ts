import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const OPERATOR_USERNAME = 'shanu7';
const OPERATOR_PASSWORD = '99948387342';
const OPERATOR_COOKIE = 'maharaja_operator_auth';

function getAuthSecret() {
  return process.env.OPERATOR_AUTH_SECRET || process.env.ADMIN_PASSWORD || '';
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

    const body = await req.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password.trim() : '';

    if (username !== OPERATOR_USERNAME || password !== OPERATOR_PASSWORD) {
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

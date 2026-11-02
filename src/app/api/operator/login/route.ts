import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { clientSessionSubject, signOperatorToken } from '@/lib/auth/operator';
import { verifyClientLogin } from '@/lib/auth/client-accounts';
import { listClientWorkspaces } from '@/lib/maharaja/server';

const OPERATOR_COOKIE = 'maharaja_operator_auth';

function getAuthSecret() {
  return (process.env.OPERATOR_AUTH_SECRET || '').trim();
}

/** TryFocus admin login comes only from the environment; there is no built-in fallback. */
function getValidOperatorCredentials() {
  const validUsernames = (process.env.OPERATOR_USERNAME || '').split(',').map((item) => item.trim()).filter(Boolean);
  const envPassword = (process.env.OPERATOR_PASSWORD || '').trim();
  const validPasswords = envPassword ? [envPassword] : [];

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
    // The store chosen on the main page. A login must belong to that store; TryFocus admin opens it.
    const storeId = typeof body.store === 'string' && /^[a-z0-9][a-z0-9-]{1,40}$/.test(body.store) ? body.store : '';
    const store = storeId ? (await listClientWorkspaces()).find((workspace) => workspace.clientId === storeId) || null : null;
    if (storeId && !store) return NextResponse.json({ success: false, error: 'This store was not found. Go back and choose your store.' }, { status: 404 });
    let next: string | null = null;

    const expiresAt = Date.now() + 60 * 60 * 24 * 1000;
    let token = '';
    let clientId: string | null = null;
    if (creds.usernames.includes(username) && creds.passwords.includes(password)) {
      const payload = `${username}.${expiresAt}`;
      token = `${payload}.${signToken(payload, secret)}`;
      if (store) next = `/maharaja/${store.workspaceCode}`;
    } else {
      // A client's own login opens only that client's workspace.
      const clientLogin = await verifyClientLogin(username, password);
      if (!clientLogin) {
        return NextResponse.json({ success: false, error: 'Invalid login.' }, { status: 401 });
      }
      if (store && clientLogin.clientId !== store.clientId) {
        return NextResponse.json({ success: false, error: `These login details are not for ${store.clientName}. Check the store you chose.` }, { status: 401 });
      }
      clientId = clientLogin.clientId;
      token = signOperatorToken(clientSessionSubject(clientLogin.clientId, clientLogin.username, clientLogin.sessionVersion), expiresAt);
    }

    const response = NextResponse.json({ success: true, role: clientId ? 'client' : 'admin', clientId, next });
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

/** The chosen store's name for the sign-in page ("Sign in to Planet G"); store names are public on the main page. */
export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('store') || '';
  const store = (await listClientWorkspaces()).find((workspace) => workspace.clientId === storeId);
  return NextResponse.json({ success: Boolean(store), name: store ? store.clientName : null, branch: store?.branch || null });
}

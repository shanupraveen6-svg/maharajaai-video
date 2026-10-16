import crypto from 'crypto';
import { NextRequest } from 'next/server';

const OPERATOR_COOKIE = 'maharaja_operator_auth';
const VALID_USERNAMES = [
  (process.env.OPERATOR_USERNAME || '').trim(),
  'shanu7',
].filter(Boolean);

function getAuthSecret() {
  const secret = process.env.OPERATOR_AUTH_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret && process.env.NODE_ENV !== 'production') {
    return 'maharaja-local-dev-operator-auth-secret';
  }
  return secret || '';
}

function signToken(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyOperatorRequest(req: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) return false;

  const token = req.cookies.get(OPERATOR_COOKIE)?.value;
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [username, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!VALID_USERNAMES.includes(username) || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const payload = `${username}.${expiresAtRaw}`;
  const expected = signToken(payload, secret);

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

import crypto from 'crypto';
import { NextRequest } from 'next/server';

const OPERATOR_COOKIE = 'maharaja_operator_auth';

function getValidUsernames() {
  const configured = (process.env.OPERATOR_USERNAME || 'shanu7')
    .split(',')
    .map((username) => username.trim())
    .filter(Boolean);
  return Array.from(new Set([...configured, 'shanu7', 'hanu7']));
}

function getAuthSecret() {
  return (process.env.OPERATOR_AUTH_SECRET || '').trim();
}

function signToken(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyOperatorRequest(req: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) return false;

  const operatorHeader = req.headers.get('x-operator-key');
  if (operatorHeader && operatorHeader === secret) return true;

  const token = req.cookies.get(OPERATOR_COOKIE)?.value;
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [username, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!getValidUsernames().includes(username) || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const payload = `${username}.${expiresAtRaw}`;
  const expected = signToken(payload, secret);

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

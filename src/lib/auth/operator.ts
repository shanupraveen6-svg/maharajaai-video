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

export type OperatorSession = {
  /** TryFocus staff (the configured operator login) manage every client; client logins see only their own. */
  role: 'admin' | 'client';
  username: string;
  clientId: string | null;
};

const CLIENT_SUBJECT_PREFIX = 'client~';

/** Subject stored in a client login's signed cookie; the signature makes the client id trustworthy. */
export function clientSessionSubject(clientId: string, username: string) {
  return `${CLIENT_SUBJECT_PREFIX}${clientId}~${username}`;
}

export function signOperatorToken(subject: string, expiresAt: number) {
  const secret = getAuthSecret();
  if (!secret) throw new Error('Operator auth secret is not configured.');
  const payload = `${subject}.${expiresAt}`;
  return `${payload}.${signToken(payload, secret)}`;
}

export function getOperatorSession(req: NextRequest): OperatorSession | null {
  const secret = getAuthSecret();
  if (!secret) return null;

  const operatorHeader = req.headers?.get('x-operator-key');
  if (operatorHeader && operatorHeader === secret) return { role: 'admin', username: 'api-key', clientId: null };

  const token = req.cookies?.get(OPERATOR_COOKIE)?.value;
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [subject, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const expected = signToken(`${subject}.${expiresAtRaw}`, secret);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  if (subject.startsWith(CLIENT_SUBJECT_PREFIX)) {
    const [clientId, username] = subject.slice(CLIENT_SUBJECT_PREFIX.length).split('~');
    return clientId && username ? { role: 'client', username, clientId } : null;
  }
  return getValidUsernames().includes(subject) ? { role: 'admin', username: subject, clientId: null } : null;
}

export function verifyOperatorRequest(req: NextRequest) {
  return getOperatorSession(req) !== null;
}

/** TryFocus admin only: client management, credits, WhatsApp connection and other clients' data. */
export function verifyAdminRequest(req: NextRequest) {
  return getOperatorSession(req)?.role === 'admin';
}

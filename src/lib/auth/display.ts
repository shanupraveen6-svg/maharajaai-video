import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from './operator';

export const DISPLAY_COOKIE = 'maharaja_display_auth';
export const DISPLAY_MAX_AGE = 30 * 24 * 60 * 60;
const MAHARAJA_CLIENT = 'maharaja';

/**
 * A paired TV belongs to one workspace. Maharaja keeps its original token scope and revocation
 * record so TVs paired before multi-client keep working; other clients get their own of each.
 */
function displayScope(clientId: string) {
  return clientId === MAHARAJA_CLIENT ? 'maharaja-display' : `display~${clientId}`;
}

function statePath(clientId: string) {
  return clientId === MAHARAJA_CLIENT ? 'appControl/maharaja-display-auth' : `appControl/display-auth-${clientId}`;
}

async function currentVersion(clientId: string) {
  const db = getDb();
  return db
    ? (await db.doc(statePath(clientId)).get()).data()?.version || 'initial'
    : getMockStore().sessions.get(statePath(clientId))?.version || 'initial';
}

export async function issueDisplayToken(clientId = MAHARAJA_CLIENT) {
  const secret = process.env.OPERATOR_AUTH_SECRET?.trim();
  if (!secret) throw new Error('Display authentication is unavailable.');
  const payload = `${displayScope(clientId)}.${await currentVersion(clientId)}.${Date.now() + DISPLAY_MAX_AGE * 1000}`;
  return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
}

/** Disconnects every TV paired to this workspace only. */
export async function revokeDisplayTokens(clientId = MAHARAJA_CLIENT) {
  const state = {
    version: crypto.randomUUID(),
    revokedAt: new Date().toISOString(),
  };
  const db = getDb();
  if (db) await db.doc(statePath(clientId)).set(state);
  else getMockStore().sessions.set(statePath(clientId), state);
}

/** Workspace of a valid paired-TV cookie, or null. */
export async function displayClientId(req: NextRequest): Promise<string | null> {
  const secret = process.env.OPERATOR_AUTH_SECRET?.trim();
  const token = req.cookies?.get(DISPLAY_COOKIE)?.value;
  if (!secret || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [scope, version, expires, signature] = parts;
  const clientId = scope === 'maharaja-display' ? MAHARAJA_CLIENT : scope.startsWith('display~') ? scope.slice('display~'.length) : '';
  if (!clientId || !Number.isFinite(Number(expires)) || Number(expires) <= Date.now()) return null;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(parts.slice(0, 3).join('.'))
    .digest('hex');
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return null;
  try {
    return version === (await currentVersion(clientId)) ? clientId : null;
  } catch {
    return null;
  }
}

export async function verifyDisplayRequest(req: NextRequest) {
  return (await displayClientId(req)) !== null;
}

export async function verifyTvRequest(req: NextRequest) {
  return verifyOperatorRequest(req) || (await verifyDisplayRequest(req));
}

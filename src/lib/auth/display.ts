import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from './operator';

export const DISPLAY_COOKIE = 'maharaja_display_auth';
export const DISPLAY_MAX_AGE = 30 * 24 * 60 * 60;
const statePath = 'appControl/maharaja-display-auth';

async function currentVersion() {
  const db = getDb();
  return db
    ? (await db.doc(statePath).get()).data()?.version || 'initial'
    : getMockStore().sessions.get(statePath)?.version || 'initial';
}

export async function issueDisplayToken() {
  const secret = process.env.OPERATOR_AUTH_SECRET?.trim();
  if (!secret) throw new Error('Display authentication is unavailable.');
  const payload = `maharaja-display.${await currentVersion()}.${Date.now() + DISPLAY_MAX_AGE * 1000}`;
  return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
}

export async function revokeDisplayTokens() {
  const state = {
    version: crypto.randomUUID(),
    revokedAt: new Date().toISOString(),
  };
  const db = getDb();
  if (db) await db.doc(statePath).set(state);
  else getMockStore().sessions.set(statePath, state);
}

export async function verifyDisplayRequest(req: NextRequest) {
  const secret = process.env.OPERATOR_AUTH_SECRET?.trim();
  const token = req.cookies.get(DISPLAY_COOKIE)?.value;
  if (!secret || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [scope, version, expires, signature] = parts;
  if (
    scope !== 'maharaja-display' ||
    !Number.isFinite(Number(expires)) ||
    Number(expires) <= Date.now()
  )
    return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(parts.slice(0, 3).join('.'))
    .digest('hex');
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return false;
  try {
    return version === (await currentVersion());
  } catch {
    return false;
  }
}

export async function verifyTvRequest(req: NextRequest) {
  return verifyOperatorRequest(req) || (await verifyDisplayRequest(req));
}

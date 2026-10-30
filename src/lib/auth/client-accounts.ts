import crypto from 'crypto';
import { getDb, getMockStore } from '@/lib/firebase/admin';

/** A client's own staff login, created by TryFocus admin and limited to that client's workspace. */
type ClientAccount = { username: string; clientId: string; salt: string; passwordHash: string; active: boolean; updatedAt: string };

const COLLECTION = 'operatorAccounts';

export function normalizeLoginUsername(value: unknown) {
  const clean = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{2,40}$/.test(clean) ? clean : '';
}

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function readAccount(username: string): Promise<ClientAccount | null> {
  const db = getDb();
  if (db) return ((await db.collection(COLLECTION).doc(username).get()).data() as ClientAccount | undefined) || null;
  return (getMockStore().sessions.get(`operator_account_${username}`) as ClientAccount | undefined) || null;
}

export async function setClientAccount(clientId: string, usernameInput: unknown, password: unknown) {
  const username = normalizeLoginUsername(usernameInput);
  if (!username) throw new Error('Username must be 3-41 letters, numbers, _ or -.');
  if (typeof password !== 'string' || password.length < 8) throw new Error('Password must be at least 8 characters.');
  const existing = await readAccount(username);
  if (existing && existing.clientId !== clientId) throw new Error('This username belongs to another client.');
  const salt = crypto.randomBytes(16).toString('hex');
  const account: ClientAccount = { username, clientId, salt, passwordHash: hashPassword(password, salt), active: true, updatedAt: new Date().toISOString() };
  const db = getDb();
  if (db) await db.collection(COLLECTION).doc(username).set(account);
  else getMockStore().sessions.set(`operator_account_${username}`, account);
  return username;
}

/** Returns the client id for a valid, active client login, or null. */
export async function verifyClientLogin(usernameInput: unknown, password: unknown) {
  const username = normalizeLoginUsername(usernameInput);
  if (!username || typeof password !== 'string') return null;
  const account = await readAccount(username);
  if (!account?.active) return null;
  const candidate = Buffer.from(hashPassword(password, account.salt), 'hex');
  const stored = Buffer.from(account.passwordHash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored)
    ? { username, clientId: account.clientId }
    : null;
}

export async function listClientLoginUsernames(clientId: string) {
  const db = getDb();
  if (db) return (await db.collection(COLLECTION).where('clientId', '==', clientId).get()).docs.map((doc) => doc.id);
  return Array.from(getMockStore().sessions.entries())
    .filter(([key, value]) => key.startsWith('operator_account_') && (value as ClientAccount).clientId === clientId)
    .map(([, value]) => (value as ClientAccount).username);
}

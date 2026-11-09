import 'server-only';

import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb, getMockStore } from '@/lib/firebase/admin';

/**
 * TryFocus's own record of what it has actually paid GenLook for, kept apart from any store's workspace:
 * it is the platform's own account, not one client's. Each top-up is logged (credits, the dollars paid,
 * an optional note, when), and the running total is the sum of every entry. This running total — not
 * GenLook's own balance API — is what decides whether the shared pool still has credits to give out, so
 * the number TryFocus admin sees always matches what was actually paid for, even if GenLook's own
 * reporting is wrong, delayed, or the key changes.
 */
export type GenlookTopUp = {
  id: string;
  /** Credits added by this top-up. Always positive; a correction is its own negative-note entry below. */
  credits: number;
  /** What was paid for it in US dollars, if known. Purely a record; never used in any credit math. */
  paidUsd?: number;
  note?: string;
  at: string;
};

const DOC_PATH = ['appControl', 'genlookLedger'] as const;
const MOCK_KEY = 'app_control_genlook_ledger';

async function readTopUps(): Promise<GenlookTopUp[]> {
  const db = getDb();
  if (db) {
    const data = (await db.collection(DOC_PATH[0]).doc(DOC_PATH[1]).get()).data();
    return Array.isArray(data?.topUps) ? (data!.topUps as GenlookTopUp[]) : [];
  }
  const stored = getMockStore().sessions.get(MOCK_KEY);
  return Array.isArray((stored as { topUps?: GenlookTopUp[] } | undefined)?.topUps)
    ? (stored as { topUps: GenlookTopUp[] }).topUps
    : [];
}

/** Every top-up ever logged, newest first, and the running total credits purchased. */
export async function getGenlookLedger(): Promise<{ topUps: GenlookTopUp[]; totalPurchased: number }> {
  const topUps = await readTopUps();
  const totalPurchased = topUps.reduce((sum, item) => sum + Number(item.credits || 0), 0);
  return { topUps: [...topUps].sort((a, b) => b.at.localeCompare(a.at)), totalPurchased };
}

/**
 * Logs one top-up TryFocus actually paid GenLook for. `credits` must be a whole number; it can be
 * negative only to record a correction (e.g. a refund), which lowers the running total the same way.
 */
export async function addGenlookTopUp(input: { credits: number; paidUsd?: number; note?: string }): Promise<GenlookTopUp> {
  const credits = Math.round(Number(input.credits));
  if (!Number.isFinite(credits) || credits === 0) {
    throw new Error('Enter how many credits this top-up added.');
  }
  const entry: GenlookTopUp = {
    id: crypto.randomBytes(8).toString('base64url'),
    credits,
    ...(Number.isFinite(Number(input.paidUsd)) && input.paidUsd !== undefined ? { paidUsd: Math.max(0, Number(input.paidUsd)) } : {}),
    ...(input.note?.trim() ? { note: input.note.trim().slice(0, 200) } : {}),
    at: new Date().toISOString(),
  };
  const db = getDb();
  if (db) {
    await db.collection(DOC_PATH[0]).doc(DOC_PATH[1]).set({ topUps: FieldValue.arrayUnion(entry) }, { merge: true });
  } else {
    const current = await readTopUps();
    getMockStore().sessions.set(MOCK_KEY, { topUps: [...current, entry] });
  }
  // A fresh top-up (a deliberate, infrequent admin action) must be usable at once, not after the cache
  // below expires: the cached total is dropped here rather than waited out.
  totalPurchasedCache = null;
  return entry;
}

let totalPurchasedCache: { value: number; at: number } | null = null;

/**
 * The running total purchased, cached for 30 seconds (it changes only on a top-up, which clears this
 * cache itself, so the cache is purely to avoid re-reading Firestore on every Try-On).
 */
export async function cachedTotalPurchased(): Promise<number> {
  if (!totalPurchasedCache || Date.now() - totalPurchasedCache.at > 30_000) {
    const { totalPurchased } = await getGenlookLedger();
    totalPurchasedCache = { value: totalPurchased, at: Date.now() };
  }
  return totalPurchasedCache.value;
}

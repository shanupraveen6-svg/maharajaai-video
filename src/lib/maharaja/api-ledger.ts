import 'server-only';

import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb, getMockStore } from '@/lib/firebase/admin';

/**
 * TryFocus's own record of what it has actually paid each dollar-billed AI vendor for — fal.ai (Try-On
 * backup, H3 Max and Gemini-Omni video, Live Mirror), Google Gemini (Try-On backup, the AI Video
 * portrait, garment checks, bill reading) and FASHN (a Try-On backup). GenLook is tracked separately
 * (genlook-ledger.ts) because it bills in credits, not dollars, and locks allowances per store.
 *
 * Each vendor gets one doc: a log of top-ups (what was paid, in US dollars) and a running lifetime total
 * actually spent, attributed to that vendor from the real event that used it (never a guess at which
 * vendor served a request: see the `provider` argument threaded through recordAiCost in usage-ledger.ts).
 */
export type ApiProvider = 'fal' | 'gemini' | 'fashn';
export const API_PROVIDERS: ApiProvider[] = ['fal', 'gemini', 'fashn'];
export const API_PROVIDER_LABELS: Record<ApiProvider, string> = {
  fal: 'fal.ai (video, Live Mirror, Try-On backup)',
  gemini: 'Google Gemini (AI Video portrait, Try-On backup, garment/bill reading)',
  fashn: 'FASHN (Try-On backup)',
};

export type ApiTopUp = { id: string; usd: number; note?: string; at: string };
type ProviderDoc = { topUps?: ApiTopUp[]; usedUsd?: number };

const docRef = (provider: ApiProvider) => getDb()!.collection('appControl').doc(`apiLedger_${provider}`);
const mockKey = (provider: ApiProvider) => `app_control_api_ledger_${provider}`;

async function readDoc(provider: ApiProvider): Promise<ProviderDoc> {
  const db = getDb();
  if (db) return (await docRef(provider).get()).data() || {};
  return (getMockStore().sessions.get(mockKey(provider)) || {}) as ProviderDoc;
}

/** Every top-up logged for this vendor (newest first), the running total paid, and the lifetime spend. */
export async function getApiLedger(provider: ApiProvider): Promise<{ topUps: ApiTopUp[]; totalPurchasedUsd: number; usedUsd: number }> {
  const data = await readDoc(provider);
  const topUps = Array.isArray(data.topUps) ? data.topUps : [];
  const totalPurchasedUsd = topUps.reduce((sum, item) => sum + Number(item.usd || 0), 0);
  return { topUps: [...topUps].sort((a, b) => b.at.localeCompare(a.at)), totalPurchasedUsd, usedUsd: Number(data.usedUsd || 0) };
}

/** Logs one top-up TryFocus actually paid this vendor. `usd` can be negative only to record a correction. */
export async function addApiTopUp(provider: ApiProvider, input: { usd: number; note?: string }): Promise<ApiTopUp> {
  const usd = Number(input.usd);
  if (!Number.isFinite(usd) || usd === 0) throw new Error('Enter how many dollars this top-up added.');
  const entry: ApiTopUp = {
    id: crypto.randomBytes(8).toString('base64url'),
    usd,
    ...(input.note?.trim() ? { note: input.note.trim().slice(0, 200) } : {}),
    at: new Date().toISOString(),
  };
  const db = getDb();
  if (db) {
    await docRef(provider).set({ topUps: FieldValue.arrayUnion(entry) }, { merge: true });
  } else {
    const current = await readDoc(provider);
    getMockStore().sessions.set(mockKey(provider), { ...current, topUps: [...(current.topUps || []), entry] });
  }
  // A fresh top-up (a deliberate, infrequent admin action) must be usable at once.
  purchasedCache.delete(provider);
  return entry;
}

const purchasedCache = new Map<ApiProvider, { value: number; at: number }>();

/** The running total purchased, cached for 30 seconds (a top-up clears its own provider's cache). */
export async function cachedTotalPurchasedUsd(provider: ApiProvider): Promise<number> {
  const cached = purchasedCache.get(provider);
  if (cached && Date.now() - cached.at <= 30_000) return cached.value;
  const { totalPurchasedUsd } = await getApiLedger(provider);
  purchasedCache.set(provider, { value: totalPurchasedUsd, at: Date.now() });
  return totalPurchasedUsd;
}

/**
 * Adds to this vendor's lifetime spend, attributed from the real event that used it. Never throws: a
 * bookkeeping write must not stop a customer's image or video.
 */
export async function recordApiUsageUsd(provider: ApiProvider, usd: number) {
  if (!(usd > 0)) return;
  try {
    const db = getDb();
    if (db) {
      await docRef(provider).set({ usedUsd: FieldValue.increment(usd) }, { merge: true });
      return;
    }
    const current = await readDoc(provider);
    getMockStore().sessions.set(mockKey(provider), { ...current, usedUsd: Number(current.usedUsd || 0) + usd });
  } catch (error) {
    console.error('API ledger usage write failed:', error);
  }
}

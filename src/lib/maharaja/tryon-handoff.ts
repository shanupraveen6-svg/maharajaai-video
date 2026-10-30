import { getDb, getMockStore } from '@/lib/firebase/admin';

export type StoredLook = {
  sku: string;
  title: string;
  contentType: string;
  path?: string;
  bytes?: Buffer;
  category?: string;
  garmentType?: string;
  gender?: string;
  garmentReferenceUrl?: string;
};

export type StoredHandoff = {
  /** Client whose TV or tablet created the looks; handoffs from before multi-client are Maharaja's. */
  clientId?: string;
  expiresAtMs: number;
  looks: StoredLook[];
  /** Festival video pass issued for each look, keyed by look index. */
  lookPassCodes?: Record<string, string>;
};

export function isHandoffToken(token: string) {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}

export async function readTryOnHandoff(token: string): Promise<StoredHandoff | null> {
  if (!isHandoffToken(token)) return null;
  const db = getDb();
  const record = db
    ? (await db.collection('tvTryOnHandoffs').doc(token).get()).data()
    : getMockStore().sessions.get(`tv_handoff_${token}`);
  if (!record || Number(record.expiresAtMs) <= Date.now() || !Array.isArray(record.looks)) return null;
  return record as StoredHandoff;
}

import { getDb, getMockStore } from '@/lib/firebase/admin';
import { afterDownloadExpiresAtMs } from '@/lib/maharaja/retention';

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
  /** Device that created the looks; catalogue festival videos are offered only for TV looks. */
  source?: 'tv' | 'tablet';
  expiresAtMs: number;
  looks: StoredLook[];
  /** Look indexes the customer has downloaded; once all are, the link ends within minutes. */
  downloaded?: number[];
  /** Festival video pass issued for each look, keyed by look index. */
  lookPassCodes?: Record<string, string>;
};

/**
 * Whether a look can become an AI Video. AI Video is made from the store collection only, so a catalogue
 * look from the TV or the tablet can, and a look of the customer's own outfit cannot.
 */
export function lookVideoAvailable(_handoff: StoredHandoff, look: StoredLook) {
  return !look.sku.startsWith('OWN-');
}

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

/** Records a downloaded look; when every look is downloaded the handoff is wiped within minutes. */
export async function markHandoffLookDownloaded(token: string, index: number) {
  if (!isHandoffToken(token)) return;
  const db = getDb();
  if (db) {
    const ref = db.collection('tvTryOnHandoffs').doc(token);
    await db.runTransaction(async (tx) => {
      const record = (await tx.get(ref)).data() as StoredHandoff | undefined;
      if (!record) return;
      const downloaded = Array.from(new Set([...(record.downloaded || []), index]));
      const done = downloaded.length >= record.looks.length;
      tx.set(ref, { downloaded, ...(done ? { expiresAtMs: Math.min(record.expiresAtMs, afterDownloadExpiresAtMs()) } : {}) }, { merge: true });
    });
    return;
  }
  const key = `tv_handoff_${token}`;
  const record = getMockStore().sessions.get(key) as StoredHandoff | undefined;
  if (!record) return;
  const downloaded = Array.from(new Set([...(record.downloaded || []), index]));
  const done = downloaded.length >= record.looks.length;
  getMockStore().sessions.set(key, { ...record, downloaded, ...(done ? { expiresAtMs: Math.min(record.expiresAtMs, afterDownloadExpiresAtMs()) } : {}) });
}

import { createHash } from 'node:crypto';
import { getDb } from '@/lib/firebase/admin';
import { activeClientId } from '@/lib/maharaja/client-context';
import { uploadGenlookPersonImage } from '@/lib/maharaja/genlook-provider';

/**
 * What GenLook already holds for a store, so a look sends ids instead of photos: the customer photo of this
 * session (uploaded once, when the photo is confirmed) and every registered garment. Both are remembered in
 * Firestore; a missing or stale entry only means the photo is sent again.
 */
const PERSON_ID_VALID_MS = 12 * 60 * 60 * 1000;
const uploadsInFlight = new Map<string, Promise<string>>();

const hash40 = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 40);
const personKey = (personBase64: string) => `${activeClientId()}-${hash40(personBase64)}`;
const rawPersonKey = (rawBase64: string) => `${activeClientId()}-raw-${hash40(rawBase64)}`;
const verifiedPersonIdKey = (imageId: string) => `${activeClientId()}-id-${imageId.replace(/\//g, '_').slice(0, 120)}`;
const productKey = (externalId: string) => externalId.replace(/\//g, '_').slice(0, 300);
const warmDocKey = (sku: string) => `${activeClientId()}-${sku}`.replace(/\//g, '_').slice(0, 300);

/**
 * The GenLook id of this customer photo: from this session's earlier upload, or uploaded now and remembered
 * under both its processed and raw fingerprints (and by imageId ownership for the current client).
 */
export async function genlookPersonImageId(personBase64: string, apiKey: string, rawBase64?: string): Promise<string> {
  const key = personKey(personBase64);
  const running = uploadsInFlight.get(key);
  if (running) return running;
  const task = (async () => {
    const db = getDb();
    const ref = db?.collection('genlookPersonUploads').doc(key);
    const saved = ref ? (await ref.get().catch(() => null))?.data() : undefined;
    const validSaved = typeof saved?.imageId === 'string' && Date.now() - Number(saved.atMs || 0) < PERSON_ID_VALID_MS;
    const imageId = validSaved ? (saved.imageId as string) : await uploadGenlookPersonImage(personBase64, apiKey);
    const meta = { clientId: activeClientId(), imageId, atMs: Date.now(), expiresAt: new Date(Date.now() + PERSON_ID_VALID_MS) };
    if (db) {
      const writes: Promise<unknown>[] = [
        db.collection('genlookPersonUploads').doc(verifiedPersonIdKey(imageId)).set(meta).catch(() => undefined),
      ];
      if (!validSaved) writes.push(db.collection('genlookPersonUploads').doc(key).set(meta).catch(() => undefined));
      if (rawBase64) writes.push(db.collection('genlookPersonUploads').doc(rawPersonKey(rawBase64)).set(meta).catch(() => undefined));
      await Promise.all(writes);
    }
    return imageId;
  })();
  uploadsInFlight.set(key, task);
  try { return await task; } finally { uploadsInFlight.delete(key); }
}

/** Fast non-Sharp lookup for an already uploaded customer photo belonging to the active store. */
export async function resolveCachedPersonImageId(rawBase64?: string, candidateId?: string): Promise<string | undefined> {
  const db = getDb();
  if (!db) return undefined;
  const checks: Promise<FirebaseFirestore.DocumentSnapshot | null>[] = [];
  if (candidateId) checks.push(db.collection('genlookPersonUploads').doc(verifiedPersonIdKey(candidateId)).get().catch(() => null));
  if (rawBase64) checks.push(db.collection('genlookPersonUploads').doc(rawPersonKey(rawBase64)).get().catch(() => null));
  if (!checks.length) return undefined;
  const snaps = await Promise.all(checks);
  for (const snap of snaps) {
    const data = snap?.data();
    if (typeof data?.imageId === 'string' && data?.clientId === activeClientId() && Date.now() - Number(data.atMs || 0) < PERSON_ID_VALID_MS) {
      return data.imageId;
    }
  }
  return undefined;
}

/** Pre-warmed GenLook product id for a catalogue garment, matching its current photo and garment type. */
export async function getWarmGenlookProductId(sku: unknown, photoPath: string, garmentType: string): Promise<string | null> {
  const db = getDb();
  if (!db || typeof sku !== 'string' || !sku.trim() || !photoPath) return null;
  const saved = (await db.collection('genlookGarmentWarm').doc(warmDocKey(sku.trim())).get().catch(() => null))?.data();
  if (saved?.photo === photoPath && saved?.garmentType === garmentType && typeof saved?.genlookProductId === 'string' && saved.genlookProductId) {
    return saved.genlookProductId;
  }
  return null;
}

export async function clearWarmGenlookProductId(sku: unknown, productId?: string) {
  const db = getDb();
  if (!db) return;
  const tasks: Promise<unknown>[] = [];
  if (typeof sku === 'string' && sku.trim()) {
    tasks.push(db.collection('genlookGarmentWarm').doc(warmDocKey(sku.trim())).set({ genlookProductId: null, version: 0 }, { merge: true }).catch(() => undefined));
  }
  if (productId) {
    tasks.push(db.collection('genlookProducts').doc(productKey(productId)).delete().catch(() => undefined));
  }
  await Promise.all(tasks);
}

export async function clearCachedPersonImageId(imageId?: string, rawBase64?: string) {
  const db = getDb();
  if (!db) return;
  const tasks: Promise<unknown>[] = [];
  if (imageId) tasks.push(db.collection('genlookPersonUploads').doc(verifiedPersonIdKey(imageId)).delete().catch(() => undefined));
  if (rawBase64) tasks.push(db.collection('genlookPersonUploads').doc(rawPersonKey(rawBase64)).delete().catch(() => undefined));
  await Promise.all(tasks);
}

export async function isGenlookProductKnown(externalId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  return Boolean((await db.collection('genlookProducts').doc(productKey(externalId)).get().catch(() => null))?.exists);
}

export async function markGenlookProductsKnown(externalIds: string[]) {
  const db = getDb();
  if (!db) return;
  await Promise.all(externalIds.map((id) => db.collection('genlookProducts').doc(productKey(id)).set({ externalId: id, clientId: activeClientId(), at: new Date().toISOString() }, { merge: true }).catch(() => undefined)));
}

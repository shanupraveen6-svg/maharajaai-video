import crypto from 'crypto';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { RESULT_LIFETIME_MS } from '@/lib/maharaja/retention';

/**
 * The look a phone made from the store's Wall QR, kept for one hour so scanning the QR again shows it.
 * One look per phone: a retry replaces it. Deleted by the privacy cleanup once the hour is over.
 */
type PhoneLook = { clientId: string; path: string; expiresAtMs: number; createdAt: string };

const COLLECTION = 'phoneLooks';

function lookId(clientId: string, deviceId: string) {
  const hash = crypto.createHash('sha256').update(`${clientId}:${deviceId}`).digest('hex');
  return `${clientId}__${hash}`;
}

export async function savePhoneLook(clientId: string, deviceId: string, image: Buffer) {
  const bucket = getStorageBucket();
  if (!bucket) return;
  const id = lookId(clientId, deviceId);
  const path = `clients/${clientId}/phone-looks/${id}/${Date.now()}.jpg`;
  await bucket.file(path).save(image, { contentType: 'image/jpeg', public: false, metadata: { cacheControl: 'private, no-store' } });
  const record: PhoneLook = { clientId, path, expiresAtMs: Date.now() + RESULT_LIFETIME_MS, createdAt: new Date().toISOString() };
  const db = getDb();
  const previous = await readRecord(id);
  if (db) await db.collection(COLLECTION).doc(id).set(record);
  else getMockStore().sessions.set(`${COLLECTION}_${id}`, record);
  // The retry's look replaces the first one.
  if (previous?.path && previous.path !== path) await bucket.file(previous.path).delete().catch(() => undefined);
}

async function readRecord(id: string): Promise<PhoneLook | null> {
  const db = getDb();
  if (db) return ((await db.collection(COLLECTION).doc(id).get()).data() as PhoneLook | undefined) || null;
  return (getMockStore().sessions.get(`${COLLECTION}_${id}`) as PhoneLook | undefined) || null;
}

/** The phone's look while its hour lasts, otherwise null. */
export async function readPhoneLook(clientId: string, deviceId: string): Promise<{ bytes: Buffer; expiresAtMs: number } | null> {
  const record = await readRecord(lookId(clientId, deviceId));
  if (!record || record.expiresAtMs <= Date.now()) return null;
  const bucket = getStorageBucket();
  if (!bucket) return null;
  try {
    const [bytes] = await bucket.file(record.path).download();
    return { bytes, expiresAtMs: record.expiresAtMs };
  } catch {
    return null;
  }
}

export async function hasPhoneLook(clientId: string, deviceId: string) {
  const record = await readRecord(lookId(clientId, deviceId));
  return Boolean(record && record.expiresAtMs > Date.now());
}

/** Deletes phone looks whose hour is over (Firestore only; the mock store forgets on restart). */
export async function cleanupPhoneLooks() {
  const db = getDb();
  const bucket = getStorageBucket();
  if (!db || !bucket) return 0;
  const expired = await db.collection(COLLECTION).where('expiresAtMs', '<=', Date.now()).limit(200).get();
  for (const doc of expired.docs) {
    const record = doc.data() as PhoneLook;
    await bucket.deleteFiles({ prefix: `clients/${record.clientId}/phone-looks/${doc.id}/`, force: true }).catch(() => undefined);
    await doc.ref.delete();
  }
  return expired.size;
}

import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';

export type PhotoTransfer = { receiver: string; expiresAtMs: number; status: 'waiting' | 'ready'; image?: string; path?: string; contentType?: string; clientId?: string };
export const validTransferToken = (token: string) => /^[A-Za-z0-9_-]{32}$/.test(token);
export async function readPhotoTransfer(token: string): Promise<PhotoTransfer | null> {
  if (!validTransferToken(token)) return null;
  const db = getDb();
  const value = db ? (await db.collection('tvPhotoTransfers').doc(token).get()).data() : getMockStore().sessions.get(`photo_transfer_${token}`);
  if (!value) return null;

  // Active transfer
  if (value.expiresAtMs > Date.now()) {
    return value as PhotoTransfer;
  }

  // Expired transfer: immediately delete storage object and database record for privacy
  if (value.path) {
    const bucket = getStorageBucket();
    if (bucket) {
      await bucket.file(value.path).delete({ ignoreNotFound: true }).catch(() => undefined);
    }
  }
  if (db) {
    await db.collection('tvPhotoTransfers').doc(token).delete().catch(() => undefined);
  } else {
    getMockStore().sessions.delete(`photo_transfer_${token}`);
  }
  return null;
}
export async function savePhotoTransfer(token: string, value: PhotoTransfer) {
  const db = getDb();
  if (db) await db.collection('tvPhotoTransfers').doc(token).set(value);
  else getMockStore().sessions.set(`photo_transfer_${token}`, value);
}

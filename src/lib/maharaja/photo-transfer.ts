import { getDb, getMockStore } from '@/lib/firebase/admin';

export type PhotoTransfer = { receiver: string; expiresAtMs: number; status: 'waiting' | 'ready'; image?: string; path?: string; contentType?: string };
export const validTransferToken = (token: string) => /^[A-Za-z0-9_-]{32}$/.test(token);
export async function readPhotoTransfer(token: string): Promise<PhotoTransfer | null> {
  if (!validTransferToken(token)) return null;
  const db = getDb();
  const value = db ? (await db.collection('tvPhotoTransfers').doc(token).get()).data() : getMockStore().sessions.get(`photo_transfer_${token}`);
  return value && value.expiresAtMs > Date.now() ? value as PhotoTransfer : null;
}
export async function savePhotoTransfer(token: string, value: PhotoTransfer) {
  const db = getDb();
  if (db) await db.collection('tvPhotoTransfers').doc(token).set(value);
  else getMockStore().sessions.set(`photo_transfer_${token}`, value);
}

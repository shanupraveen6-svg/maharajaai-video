import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { activeClientId } from './client-context';
import { probeVideo } from './video-processor';

/** A workspace's own promotional video, played on its Go Live TV after every few customer videos. */
export type PromoVideo = {
  id: string;
  title: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  createdAt: string;
};

export const PROMO_LIMITS = {
  maxVideos: 3,
  maxBytes: 50 * 1024 * 1024,
  minSeconds: 5,
  maxSeconds: 60,
  /** One promo plays after this many customer videos on the Go Live TV. */
  everyCustomerVideos: 10,
  types: { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' } as Record<string, string>,
};

const collection = () => `clientWorkspaces/${activeClientId()}/promoVideos`;
/** Real Cloud Storage only alongside real Firestore; local checks use the mock blob store. */
const realBucket = () => (getDb() ? getStorageBucket() : null);
const mockKey = (id: string) => `promo_${activeClientId()}_${id}`;

export async function listPromoVideos(): Promise<PromoVideo[]> {
  const db = getDb();
  const items = db
    ? (await db.collection(collection()).get()).docs.map((doc) => doc.data() as PromoVideo)
    : Array.from(getMockStore().sessions.entries())
      .filter(([key]) => key.startsWith(`promo_${activeClientId()}_`))
      .map(([, value]) => value as PromoVideo);
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Reserves a storage path and returns a short-lived direct upload URL for one promo file. */
export async function createPromoUpload(contentType: unknown, sizeBytes: unknown) {
  const ext = typeof contentType === 'string' ? PROMO_LIMITS.types[contentType] : undefined;
  if (!ext) throw new PromoError('Upload an MP4, WebM or MOV video.');
  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0) throw new PromoError('The video file is empty.');
  if (size > PROMO_LIMITS.maxBytes) throw new PromoError(`The video is ${(size / 1048576).toFixed(1)} MB; the limit is 50 MB.`);
  if ((await listPromoVideos()).length >= PROMO_LIMITS.maxVideos) {
    throw new PromoError('You already have 3 promo videos. Delete one to upload another.');
  }
  const id = crypto.randomBytes(9).toString('base64url');
  const storagePath = `clients/${activeClientId()}/promos/${id}.${ext}`;
  const bucket = realBucket();
  const uploadUrl = bucket
    ? (await bucket.file(storagePath).getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + 15 * 60 * 1000, contentType: contentType as string }))[0]
    : `/api/storage/mock-upload?path=${encodeURIComponent(storagePath)}`;
  return { id, storagePath, uploadUrl };
}

/**
 * Checks the uploaded file (type, size, length, portrait frame) and saves it as a promo.
 * A file that fails a check is deleted so it never reaches the TV.
 */
export async function confirmPromoUpload(id: unknown, titleInput: unknown, contentType: unknown) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{12}$/.test(id)) throw new PromoError('Upload the video again.');
  const ext = typeof contentType === 'string' ? PROMO_LIMITS.types[contentType] : undefined;
  if (!ext) throw new PromoError('Upload an MP4, WebM or MOV video.');
  const storagePath = `clients/${activeClientId()}/promos/${id}.${ext}`;
  const title = String(titleInput || '').trim().slice(0, 60) || 'Promo video';
  const bucket = realBucket();
  const tmp = path.join(os.tmpdir(), `promo_${id}.${ext}`);
  let sizeBytes = 0;
  try {
    if (bucket) {
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) throw new PromoError('The upload did not finish. Please try again.');
      const [metadata] = await file.getMetadata();
      sizeBytes = Number(metadata.size || 0);
      if (sizeBytes > PROMO_LIMITS.maxBytes) throw new PromoError('The video is larger than 50 MB.');
      await file.download({ destination: tmp });
      // Promos are re-signed on every TV refresh and never served from a cache.
      await file.setMetadata({ cacheControl: 'private, no-store, max-age=0', contentType: contentType as string });
    } else {
      const blob = getMockStore().sessions.get(`mock_blob_${storagePath}`) as { buffer?: Buffer } | undefined;
      if (!blob?.buffer?.length) throw new PromoError('The upload did not finish. Please try again.');
      sizeBytes = blob.buffer.length;
      if (sizeBytes > PROMO_LIMITS.maxBytes) throw new PromoError('The video is larger than 50 MB.');
      fs.writeFileSync(tmp, blob.buffer);
    }
    const { durationSeconds, width, height } = await probeVideo(tmp).catch((probeError) => {
      console.warn('Promo video probe failed:', probeError);
      throw new PromoError('This file could not be read as a video. Export it as MP4 and try again.');
    });
    if (durationSeconds < PROMO_LIMITS.minSeconds || durationSeconds > PROMO_LIMITS.maxSeconds) {
      throw new PromoError(`The video is ${Math.round(durationSeconds)} seconds; promos must be 5 to 60 seconds.`);
    }
    if (width > height) {
      throw new PromoError('The Go Live TV is vertical. Upload a portrait (9:16) video.');
    }
    if ((await listPromoVideos()).length >= PROMO_LIMITS.maxVideos) {
      throw new PromoError('You already have 3 promo videos. Delete one to upload another.');
    }
    const promo: PromoVideo = {
      id, title, storagePath, contentType: contentType as string, sizeBytes,
      durationSeconds: Math.round(durationSeconds * 10) / 10, width, height, createdAt: new Date().toISOString(),
    };
    const db = getDb();
    if (db) await db.collection(collection()).doc(id).set(promo);
    else getMockStore().sessions.set(mockKey(id), promo);
    return promo;
  } catch (error) {
    await deleteStoredFile(storagePath);
    throw error;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

export async function deletePromoVideo(id: unknown) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{12}$/.test(id)) throw new PromoError('Promo not found.');
  const promo = (await listPromoVideos()).find((item) => item.id === id);
  if (!promo) throw new PromoError('Promo not found.');
  await deleteStoredFile(promo.storagePath);
  const db = getDb();
  if (db) await db.collection(collection()).doc(id).delete();
  else getMockStore().sessions.delete(mockKey(id));
}

/** Promos with fresh signed URLs for the Go Live player. */
export async function promoPlaylist() {
  const promos = await listPromoVideos();
  return Promise.all(promos.map(async (promo) => ({
    id: promo.id,
    title: promo.title,
    durationSeconds: promo.durationSeconds,
    videoUrl: await getSignedPlaybackUrl(promo.storagePath),
  })));
}

async function deleteStoredFile(storagePath: string) {
  const bucket = realBucket();
  if (bucket) await bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => undefined);
  else getMockStore().sessions.delete(`mock_blob_${storagePath}`);
}

/** A rejection the client can fix (wrong type, too long, too large); shown to them as-is. */
export class PromoError extends Error {}

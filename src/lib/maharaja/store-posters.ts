import crypto from 'crypto';
import sharp from 'sharp';
import { getStorageBucket } from '@/lib/firebase/admin';

/**
 * The store's posters (its own brand and offer artwork). The TV shows them, rotating, in the space a screen's
 * own content leaves empty, so the portrait screen always looks full. Kept as JPEGs, at most 1080 × 1920.
 */
export const POSTER_LIMITS = { maxPosters: 8, maxBytes: 5 * 1024 * 1024, minWidth: 720, minHeight: 720 } as const;
const folder = (clientId: string) => `clients/${clientId}/branding/posters/`;
const ID = /^[a-f0-9]{24}$/;

// Without cloud storage (local runs) the posters live in memory.
const memory = new Map<string, Map<string, Buffer>>();

export class PosterError extends Error {}

export async function listPosters(clientId: string): Promise<string[]> {
  const bucket = getStorageBucket();
  if (!bucket) return [...(memory.get(clientId)?.keys() || [])];
  const [files] = await bucket.getFiles({ prefix: folder(clientId) });
  type StoredFile = { name: string; metadata?: { timeCreated?: string } };
  return (files as StoredFile[])
    .sort((a: StoredFile, b: StoredFile) => String(a.metadata?.timeCreated || '').localeCompare(String(b.metadata?.timeCreated || '')))
    .map((file: StoredFile) => file.name.slice(folder(clientId).length).replace(/\.jpg$/, ''))
    .filter((id: string) => ID.test(id));
}

export async function readPoster(clientId: string, id: string): Promise<Buffer | null> {
  if (!ID.test(id)) return null;
  const bucket = getStorageBucket();
  if (!bucket) return memory.get(clientId)?.get(id) || null;
  try { return (await bucket.file(`${folder(clientId)}${id}.jpg`).download())[0]; } catch { return null; }
}

export async function savePoster(clientId: string, bytes: Buffer) {
  if ((await listPosters(clientId)).length >= POSTER_LIMITS.maxPosters) throw new PosterError(`You have ${POSTER_LIMITS.maxPosters} posters. Delete one to add another.`);
  const image = sharp(bytes).rotate();
  const meta = await image.metadata().catch(() => null);
  if (!meta?.width || !meta?.height) throw new PosterError('This image could not be read. Use a JPG or PNG.');
  if (meta.width < POSTER_LIMITS.minWidth || meta.height < POSTER_LIMITS.minHeight) {
    throw new PosterError(`This poster is ${meta.width} × ${meta.height} px; it needs to be at least ${POSTER_LIMITS.minWidth} × ${POSTER_LIMITS.minHeight} px.`);
  }
  const jpeg = await image.resize(1080, 1920, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  const id = crypto.randomBytes(12).toString('hex');
  const bucket = getStorageBucket();
  if (!bucket) {
    if (!memory.has(clientId)) memory.set(clientId, new Map());
    memory.get(clientId)!.set(id, jpeg);
    return id;
  }
  await bucket.file(`${folder(clientId)}${id}.jpg`).save(jpeg, { contentType: 'image/jpeg', public: false, metadata: { cacheControl: 'private, max-age=300' } });
  return id;
}

export async function deletePoster(clientId: string, id: string) {
  if (!ID.test(id)) return;
  const bucket = getStorageBucket();
  if (!bucket) { memory.get(clientId)?.delete(id); return; }
  await bucket.file(`${folder(clientId)}${id}.jpg`).delete().catch(() => undefined);
}

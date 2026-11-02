import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getStorageBucket } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';

/** Where a store's own logo is kept (a PNG made from what the store uploaded). */
export const storeLogoPath = (clientId: string) => `clients/${clientId}/branding/logo.png`;

const cache = new Map<string, { logo: Buffer | null; at: number }>();
const CACHE_MS = 5 * 60 * 1000;

/** Turns an uploaded logo into a 600 px PNG with transparency kept. */
export async function normaliseLogo(bytes: Buffer) {
  return sharp(bytes).rotate().resize(600, 600, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

export async function saveStoreLogo(clientId: string, bytes: Buffer) {
  const bucket = getStorageBucket();
  if (!bucket) throw new Error('Storage is unavailable.');
  await bucket.file(storeLogoPath(clientId)).save(await normaliseLogo(bytes), { contentType: 'image/png', public: false, metadata: { cacheControl: 'private, no-store' } });
  cache.delete(clientId);
}

export async function deleteStoreLogo(clientId: string) {
  const bucket = getStorageBucket();
  if (bucket) await bucket.file(storeLogoPath(clientId)).delete().catch(() => undefined);
  cache.delete(clientId);
}

/** The store's uploaded logo, or null. */
export async function readStoreLogo(clientId: string): Promise<Buffer | null> {
  const hit = cache.get(clientId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.logo;
  let logo: Buffer | null = null;
  const bucket = getStorageBucket();
  if (bucket) {
    try { [logo] = await bucket.file(storeLogoPath(clientId)).download(); } catch { logo = null; }
  }
  cache.set(clientId, { logo, at: Date.now() });
  return logo;
}

/** The Maharaja demo's round badge, used when it has not uploaded its own logo. */
export function maharajaDefaultLogo(clientId: string) {
  if (clientId !== MAHARAJA_CLIENT_ID) return null;
  const file = path.join(process.cwd(), 'public', 'maharaja-logo.png');
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

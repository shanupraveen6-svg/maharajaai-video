import fs from 'fs/promises';
import path from 'path';
import { getStorageBucket } from '@/lib/firebase/admin';

const MAX_CATALOGUE_PHOTO_BYTES = 8 * 1024 * 1024;

/** The object path inside our own bucket from a signed Google Cloud Storage link, or '' for any other link. */
export function storagePathFromSignedUrl(value: string, bucketName: string): string {
  if (!bucketName || !/^https:\/\//.test(value)) return '';
  try {
    const url = new URL(value);
    if (url.hostname === 'storage.googleapis.com') {
      const [, bucket, ...rest] = url.pathname.split('/');
      return bucket === bucketName ? decodeURIComponent(rest.join('/')) : '';
    }
    if (url.hostname === `${bucketName}.storage.googleapis.com`) return decodeURIComponent(url.pathname.slice(1));
    const firebase = url.hostname === 'firebasestorage.googleapis.com' && url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (firebase && firebase[1] === bucketName) return decodeURIComponent(firebase[2]);
  } catch {
    // not a link
  }
  return '';
}

/** A catalogue garment photo's bytes (base64): bundled under public/images, a data URL, an https link or a storage path. */
export async function readCataloguePhoto(photoPath: string): Promise<string> {
  if (photoPath.startsWith('/images/')) {
    const root = path.resolve(process.cwd(), 'public', 'images');
    const file = path.resolve(process.cwd(), 'public', `.${photoPath.split('?')[0]}`);
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Invalid catalogue photo path.');
    return (await fs.readFile(file)).toString('base64');
  }
  if (photoPath.startsWith('data:image/')) return photoPath.split(',')[1] || '';
  if (/^https:\/\//.test(photoPath)) {
    const response = await fetch(photoPath, { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    if (!response.ok) throw new Error('Catalogue photo could not be downloaded.');
    return Buffer.from(await response.arrayBuffer()).toString('base64');
  }
  const bucket = getStorageBucket();
  if (!bucket) throw new Error('Storage is not available.');
  const [buffer] = await bucket.file(photoPath).download();
  if (buffer.byteLength > MAX_CATALOGUE_PHOTO_BYTES) throw new Error('Catalogue photo is too large.');
  return buffer.toString('base64');
}


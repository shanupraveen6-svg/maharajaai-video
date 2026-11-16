import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { getDb, getStorageBucket } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { GENLOOK_GARMENT_DESCRIPTIONS, type CustomerCategory } from '@/lib/maharaja/config';
import { activeClientId } from '@/lib/maharaja/client-context';
import { loadAllCatalogueRecords } from '@/lib/maharaja/catalogue';
import type { MaharajaCatalogueProduct } from '@/lib/maharaja/catalogue-types';
import { garmentTypeFor } from '@/lib/maharaja/garment-type';
import { genlookSourceFrom, prepareGenlookPieces } from '@/lib/maharaja/garment-prep';

/**
 * Pre-warm: every catalogue garment gets its Gemini checks (find the one garment, cut it out, describe it)
 * before any customer tries it, so a Try-On goes straight to GenLook instead of waiting 10–25 seconds for
 * them on the garment's first use. Runs in the background after the TV's regular catalogue read, at most
 * once every 10 minutes per store; a garment already prepared (same photo, same type) is skipped.
 * About ₹0.5–1 of Gemini per garment, once.
 */
const WARM_VERSION = 1;
const RUN_EVERY_MS = 10 * 60 * 1000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/** The garment photo's bytes, read the same way the Try-On route reads them. */
async function readCataloguePhoto(photoPath: string): Promise<string> {
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
  if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error('Catalogue photo is too large.');
  return buffer.toString('base64');
}

/** The garment type the Try-On route works out for this garment from the TV's request. */
export function warmGarmentType(product: Pick<MaharajaCatalogueProduct, 'gender' | 'category' | 'garmentType' | 'title' | 'fabricNote'>) {
  const template = product.gender === 'boys' ? 'boy' : product.gender === 'girls' ? 'girl' : product.gender;
  const audience: CustomerCategory = (['women', 'men', 'girl', 'boy'] as string[]).includes(template) ? template as CustomerCategory : 'women';
  return garmentTypeFor({
    audience,
    categoryId: product.category,
    storedType: product.garmentType,
    title: product.title,
    analysis: `${product.title} (${product.fabricNote || ''})`,
    roles: ['Primary Garment Reference'],
  });
}

/** Prepares up to `budgetMs` worth of garments not prepared yet. Returns how many were prepared and left. */
export async function warmCatalogueGarments({ budgetMs = 200_000, concurrency = 3 } = {}) {
  const apiKey = AI_CONFIG.PRIMARY_API_KEY?.trim();
  const db = getDb();
  if (!apiKey || !db) return { warmed: 0, left: 0 };
  const ai = new GoogleGenAI({ apiKey });
  const clientId = activeClientId();
  const stopAt = Date.now() + budgetMs;
  const products = await loadAllCatalogueRecords(false);
  const markers = db.collection('genlookGarmentWarm');
  const queue: Array<{ product: MaharajaCatalogueProduct; photo: string; garmentType: string; ref: FirebaseFirestore.DocumentReference }> = [];
  await Promise.all(products.map(async (product) => {
    const photo = String(product.garmentReferencePath || product.storagePath || '').trim();
    if (!photo) return;
    const garmentType = warmGarmentType(product);
    const ref = markers.doc(`${clientId}-${product.sku}`.replace(/\//g, '_').slice(0, 300));
    const saved = (await ref.get().catch(() => null))?.data();
    if (saved?.photo === photo && saved?.garmentType === garmentType && saved?.version === WARM_VERSION) return;
    queue.push({ product, photo, garmentType, ref });
  }));
  let warmed = 0;
  const work = async () => {
    while (queue.length && Date.now() < stopAt) {
      const item = queue.shift()!;
      try {
        const source = await genlookSourceFrom(await readCataloguePhoto(item.photo));
        const garmentType = item.garmentType as Parameters<typeof prepareGenlookPieces>[2];
        const pieces = await prepareGenlookPieces(ai, source, garmentType, { externalId: `${clientId}-${item.product.sku}`, title: item.product.title }, false);
        // Marked done only when Gemini really answered (not the plain fallback sentence), so a failed check is
        // tried again on the next run.
        const answered = pieces.length > 0 && pieces[0].product.description !== GENLOOK_GARMENT_DESCRIPTIONS[garmentType].description;
        if (answered) {
          await item.ref.set({ photo: item.photo, garmentType: item.garmentType, version: WARM_VERSION, at: new Date().toISOString() });
          warmed += 1;
        }
      } catch (error) {
        console.warn(`Garment pre-warm skipped ${item.product.sku}:`, error instanceof Error ? error.message : error);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, work));
  return { warmed, left: queue.length };
}

/**
 * Starts a pre-warm run unless one started in the last 10 minutes for this store (claimed in a Firestore
 * transaction, so two TVs never run it at the same time).
 */
export async function maybeWarmCatalogueGarments() {
  const db = getDb();
  if (!db || !AI_CONFIG.PRIMARY_API_KEY?.trim()) return null;
  const ref = db.collection('appControl').doc(`garmentWarm-${activeClientId()}`);
  const claimed = await db.runTransaction(async (tx) => {
    const last = Number((await tx.get(ref)).data()?.startedAt || 0);
    if (Date.now() - last < RUN_EVERY_MS) return false;
    tx.set(ref, { startedAt: Date.now() }, { merge: true });
    return true;
  }).catch(() => false);
  if (!claimed) return null;
  const result = await warmCatalogueGarments();
  await ref.set({ finishedAt: Date.now(), ...result }, { merge: true }).catch(() => undefined);
  if (result.warmed || result.left) console.info('Garment pre-warm', { clientId: activeClientId(), ...result });
  return result;
}

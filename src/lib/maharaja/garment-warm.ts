import { GoogleGenAI } from '@google/genai';
import { FieldPath } from 'firebase-admin/firestore';
import { getDb } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { GENLOOK_GARMENT_DESCRIPTIONS, type CustomerCategory } from '@/lib/maharaja/config';
import { activeClientId } from '@/lib/maharaja/client-context';
import { loadAllCatalogueRecords } from '@/lib/maharaja/catalogue';
import type { MaharajaCatalogueProduct } from '@/lib/maharaja/catalogue-types';
import { garmentTypeFor } from '@/lib/maharaja/garment-type';
import { genlookSourceFrom, prepareGenlookPieces } from '@/lib/maharaja/garment-prep';
import { readCataloguePhoto } from '@/lib/maharaja/photo-source';
import sharp from 'sharp';

/**
 * Pre-warm: every catalogue garment gets its Gemini checks (find the one garment, cut it out, describe it)
 * before any customer tries it, so a Try-On goes straight to GenLook instead of waiting 10–25 seconds for
 * them on the garment's first use. Runs in the background after the TV's regular catalogue read, at most
 * once every 10 minutes per store; a garment already prepared (same photo, same type) is skipped.
 * About ₹0.5–1 of Gemini per garment, once.
 */
// 2: also records each photo's long side (px), so admin can flag photos too small for a sharp Try-On.
const WARM_VERSION = 2;
/** Below this many pixels on the long side a garment photo gives a soft Try-On; admin flags it. */
export const MIN_GARMENT_LONG_SIDE = 800;
const RUN_EVERY_MS = 10 * 60 * 1000;

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
        const original = await readCataloguePhoto(item.photo);
        const meta = await sharp(Buffer.from(original, 'base64')).metadata().catch(() => null);
        const longSide = Math.max(meta?.width || 0, meta?.height || 0);
        const source = await genlookSourceFrom(original);
        const garmentType = item.garmentType as Parameters<typeof prepareGenlookPieces>[2];
        const pieces = await prepareGenlookPieces(ai, source, garmentType, { externalId: `${clientId}-${item.product.sku}`, title: item.product.title }, false);
        // Marked done only when Gemini really answered (not the plain fallback sentence), so a failed check is
        // tried again on the next run.
        const answered = pieces.length > 0 && pieces[0].product.description !== GENLOOK_GARMENT_DESCRIPTIONS[garmentType].description;
        // The photo size is kept either way; version marks the garment as prepared only when Gemini answered.
        await item.ref.set({ photo: item.photo, garmentType: item.garmentType, sku: item.product.sku, longSide, version: answered ? WARM_VERSION : 0, at: new Date().toISOString() });
        if (answered) warmed += 1;
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

/** Each garment's photo long side (px), from the pre-warm records: `{ sku: px }` for the store. */
export async function garmentPhotoSizes(): Promise<Record<string, number>> {
  const db = getDb();
  if (!db) return {};
  const prefix = `${activeClientId()}-`;
  const snapshot = await db.collection('genlookGarmentWarm').where(FieldPath.documentId(), '>=', prefix).where(FieldPath.documentId(), '<', `${prefix}\uf8ff`).get();
  const sizes: Record<string, number> = {};
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (typeof data.sku === 'string' && Number(data.longSide) > 0) sizes[data.sku] = Number(data.longSide);
  });
  return sizes;
}

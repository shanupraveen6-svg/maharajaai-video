import 'server-only';

import sharp from 'sharp';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { catalogueCategories, sampleCatalogue, type CatalogueCategoryId } from '@/lib/tryfocus/sample-data';
import type { MaharajaCatalogueProduct, PublicCatalogueProduct } from './catalogue-types';
import { activeClientId } from './client-context';
import { MAHARAJA_CLIENT_ID } from './config';

// Evaluated per call: each request reads the catalogue of the client it is bound to.
const collectionPath = () => `clientWorkspaces/${activeClientId()}/catalogueProducts`;

const BUILT_IN_CATALOGUE: MaharajaCatalogueProduct[] = sampleCatalogue.map((item, index) => ({
  id: item.id,
  sku: item.sku,
  title: item.title,
  price: item.price,
  gender: item.gender,
  audience: item.audience,
  category: item.category,
  garmentType: item.garmentType,
  storagePath: item.imageUrl,
  garmentReferencePath: item.garmentReferenceUrl || item.imageUrl,
  fabricNote: item.fabricNote,
  badge: item.badge,
  newArrival: item.badge === 'NEW ARRIVAL',
  eligibleForVideo: item.eligibleForVideo !== false,
  eligibleForLive: item.eligibleForLive === true,
  newArrivalOnly: item.newArrivalOnly === true,
  productUrl: '',
  active: true,
  sortOrder: index + 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}));

const ROOT_SILK_CATALOGUE = ([
  ['8IC53071', 'Kanchivaram Deep Purple Silk Saree with Peacock and Floral Brocade', 37000, '01_kanchivaram_deep_purple_silk_saree_with_all_over_peacock_flo.jpg'],
  ['8IC53074', 'Kanchivaram Gold Yellow Silk Saree with Bird Border', 37900, '02_kanchivaram_gold_yellow_silk_saree_with_all_over_daimond_bro.jpg'],
  ['8IC53072', 'Kanchivaram Black Geometrical Silk Saree with Silver Zari Border', 26000, '03_kanchivaram_black_geometrical_silk_saree_with_silver_zari_bo.jpg'],
  ['8IC53069', 'Kanchivaram Crimson Red Silk Saree with Bird and Floral Motifs', 34000, '04_kanchivaram_crimson_red_silk_saree_with_bird_floral_motifs.jpg'],
  ['8IC29', 'Kanchivaram Traditional Tissue Gold Silk Saree with Floral Zari Border', 34500, '05_kanchivaram_traditional_tissue_gold_silk_saree_with_floral_z.jpg'],
  ['8IC6', 'Kanchivaram Dark Green Checked Silk Saree with Elephant and Horse Motifs', 17500, '06_kanchivaram_dark_green_checked_silk_saree_with_elephant_hors.jpg'],
  ['8IC54160', 'Kanchivaram Orange Silk Saree with Peacock Border', 19900, '07_kanchivaram_orange_silk_saree_with_peacock_border.jpg'],
  ['8IC3', 'Kanchivaram Striped Mangalya Silk Saree', 16900, '08_kanchivaram_striped_mangalya_silk_saree.jpg'],
  ['8IC275', 'Kanchivaram Purple Silk Saree with Ganga Jamuna Border', 18900, '09_kanchivaram_purple_silk_saree_with_ganga_jamuna_border.jpg'],
  ['8IC402', 'Kanchivaram Traditional Black Silk Saree with Lotus and Peacock Border', 18950, '10_kanchivaram_traditional_black_silk_saree_with_lotus_peacock_.jpg'],
  ['8IC189', 'Kanchivaram Brown Silk Saree with Multi Colour Checks Border', 27000, '11_kanchivaram_brown_silk_saree_with_multi_colour_checks_border.jpg'],
  ['8IC38', 'Kanchivaram Dark Brown Checked Silk Saree with Peacock and Elephant Motifs', 24500, '12_kanchivaram_dark_brown_checked_silk_saree_with_peacock_eleph.jpg'],
  ['8IC193', 'Kanchivaram Violet Silk Saree with Peacock Motif and Turning Border', 29500, '13_kanchivaram_violet_silk_saree_with_peacock_motif_turning_bor.jpg'],
  ['8IC54126', 'Kanchivaram Ivory Gold Checked Silk Saree', 19700, '14_kanchivaram_ivory_gold_checked_silk_saree.jpg'],
  ['8IC406', 'Kanchivaram Coffee Brown Silk Saree with Green Checked Body', 19600, '15_kanchivaram_coffee_brown_silk_saree_with_green_checked_body.jpg'],
  ['8IC405', 'Kanchivaram Black Silk Saree with Checked Body', 19600, '16_kanchivaram_black_silk_saree_with_checked_body.jpg'],
  ['8IC404', 'Kanchivaram Dark Green Silk Saree with Purple Checked Body', 19600, '17_kanchivaram_dark_green_silk_saree_with_purple_checked_body.jpg'],
  ['8IC262', 'Kanchivaram Royal Magenta Silk Saree', 19000, '18_kanchivaram_royal_magenta_silk_saree.jpg'],
  ['8IC260', 'Kanchivaram Coffee Brown Silk Saree with Micro Checked Border', 19000, '19_kanchivaram_coffee_brown_silk_saree_with_micro_checked_borde.jpg'],
  ['8IC30', 'Kanchivaram Black and Gold Striped Saree with Traditional Motifs', 21500, '20_kanchivaram_black_gold_striped_saree_with_traditional_motifs.jpg'],
  ['8IC12', 'Kanchivaram Sand Gold Silk Saree with Traditional Human Motif Border', 22500, '21_kanchivaram_sand_gold_silk_saree_with_traditional_human_moti.jpg'],
  ['8IC273', 'Kanchivaram Deep Violet Silk Saree with Traditional Border', 18900, '22_kanchivaram_deep_violet_silk_saree_with_traditional_border.jpg'],
  ['8IC21', 'Kanchivaram Dual Tone Checked Silk Saree with Traditional Zari Border', 26000, '23_kanchivaram_dual_tone_checked_silk_saree_with_traditional_za.jpg'],
  ['8IC416', 'Kanchivaram Multi Colour Checks Silk Saree with Vintage Border', 27900, '24_kanchivaram_multi_colour_checks_silk_saree_with_vintage_bord.jpg'],
  ['8IC4', 'Kanchivaram Bronze Checks Saree with Black Border', 16500, '25_kanchivaram_bronze_checks_saree_with_black_border.jpg'],
] as Array<[string, string, number, string]>).map(([sku, title, price, storagePath], index): MaharajaCatalogueProduct => ({
  id: `silk-${sku.toLowerCase()}`,
  sku,
  title,
  price,
  gender: 'women',
  audience: 'Women',
  category: 'sarees',
  garmentType: 'saree',
  storagePath: storagePath.startsWith('/') ? storagePath : `/images/silk-sarees/${storagePath}`,
  garmentReferencePath: storagePath.startsWith('/') ? storagePath : `/images/silk-sarees/${storagePath}`,
  fabricNote: 'Pure Kanchivaram Handloom Silk Saree',
  badge: 'ROYAL SILK',
  newArrival: false,
  eligibleForVideo: true,
  eligibleForLive: true,
  productUrl: '',
  active: true,
  sortOrder: index + 101,
}));

const COMBINED_FALLBACK_CATALOGUE: MaharajaCatalogueProduct[] = [
  ...BUILT_IN_CATALOGUE,
  ...ROOT_SILK_CATALOGUE,
];

function getMockCatalogueMap(): Map<string, MaharajaCatalogueProduct> {
  const store = getMockStore() as any;
  if (!store.catalogueProductsByClient) {
    store.catalogueProductsByClient = new Map<string, Map<string, MaharajaCatalogueProduct>>();
  }
  const clientId = activeClientId();
  if (!store.catalogueProductsByClient.has(clientId)) store.catalogueProductsByClient.set(clientId, new Map());
  const catalogue = store.catalogueProductsByClient.get(clientId) as Map<string, MaharajaCatalogueProduct>;
  // Only Maharaja starts with its silk saree collection; other clients begin with an empty catalogue.
  for (const item of clientId === MAHARAJA_CLIENT_ID ? BUILT_IN_CATALOGUE : []) {
    if (!catalogue.has(item.sku)) catalogue.set(item.sku, { ...item });
  }
  return catalogue;
}

/**
 * Sample garments from the early demo (TF- SKUs and the bundled /images/catalogue-demo pictures) are never
 * shown: what customers see is only the store's real collection. Saved copies of them are hidden too.
 */
function isDeprecatedDemoProduct(sku?: string, storagePath?: string): boolean {
  const cleanSku = String(sku || '').trim().toUpperCase();
  if (cleanSku.startsWith('TF-')) return true;
  if (String(storagePath || '').trim().startsWith('/images/catalogue-demo/')) return true;
  const cleanPath = String(storagePath || '').trim();
  if (/-model-[2345]\b/i.test(cleanPath) || /saree-model-[2345]/i.test(cleanPath)) return true;
  return false;
}

function cleanUploadedGarmentTitle(rawTitle: string, sku: string, categoryLabel: string): string {
  const trimmed = String(rawTitle || '').trim();
  if (!trimmed) return categoryLabel;
  const bulkMatch = sku.match(/^MAH-[0-9A-F]{6}-(\d+)$/i);
  if (
    bulkMatch &&
    (trimmed === trimmed.toLowerCase() || /\b(original|ima[fgh][a-z0-9]{4,}|resized)\b/i.test(trimmed))
  ) {
    return `${categoryLabel} Look ${parseInt(bulkMatch[1], 10)}`;
  }
  return trimmed;
}

function normalizeCatalogueProduct(raw: Partial<MaharajaCatalogueProduct>, index = 1): MaharajaCatalogueProduct {
  const legacyCategories: Record<string, CatalogueCategoryId> = { shirts: 'casual-shirts', salwar: 'salwar-suits', lehenga: 'lehengas' };
  const requestedCategory = legacyCategories[String(raw.category)] || raw.category;
  // A store's own category (custom-…) is kept as is; its garment type and label come with the garment.
  const isCustom = typeof requestedCategory === 'string' && /^custom-[a-z0-9-]{3,60}$/.test(requestedCategory);
  const category = (isCustom || catalogueCategories.some((c) => c.id === requestedCategory) ? requestedCategory : 'sarees') as CatalogueCategoryId;
  const shared = catalogueCategories.find((c) => c.id === category);
  const catMeta = {
    gender: shared?.gender ?? 'women',
    garmentType: shared?.garmentType ?? 'top',
    label: shared?.label ?? (String(raw.fabricNote || '').split(' · ')[0].trim() || 'Garment'),
  };
  const gender = raw.gender === 'men' || raw.gender === 'boys' || raw.gender === 'girls' || raw.gender === 'women' ? raw.gender : catMeta.gender;
  const audience = gender === 'men' ? 'Men' : gender === 'boys' ? 'Boys' : gender === 'girls' ? 'Girls' : 'Women';
  const garmentType = raw.garmentType || catMeta.garmentType;
  const sku = String(raw.sku || `TF-${category.toUpperCase().slice(0, 3)}-${index}`).trim();
  const newArrival = typeof raw.newArrival === 'boolean' ? raw.newArrival : raw.badge === 'NEW ARRIVAL';
  const badge = raw.badge || (newArrival ? 'NEW ARRIVAL' : 'ROYAL SILK');
  const storagePath = String(raw.storagePath || '/images/catalogue-demo/kanchivaram-purple-peacock-model.png').trim();
  const garmentReferencePath = String(raw.garmentReferencePath || storagePath).trim();
  const title = cleanUploadedGarmentTitle(String(raw.title || sku), sku, catMeta.label);

  return {
    id: raw.id || sku.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    sku,
    title,
    price: Math.max(0, Number(raw.price || 0)),
    gender,
    audience,
    category,
    garmentType,
    storagePath,
    garmentReferencePath,
    ...(raw.thumbnailPath ? { thumbnailPath: String(raw.thumbnailPath), thumbnailSource: String(raw.thumbnailSource || '') } : {}),
    fabricNote: raw.fabricNote || `${catMeta.label} · Maharaja Collection`,
    badge,
    newArrival,
    trending: raw.trending === true,
    ...(typeof raw.photoHash === 'string' && /^[a-f0-9]{64}$/.test(raw.photoHash) ? { photoHash: raw.photoHash } : {}),
    eligibleForVideo: raw.eligibleForVideo !== false,
    eligibleForLive: raw.eligibleForLive === true,
    newArrivalOnly: raw.newArrivalOnly === true,
    ...(Array.isArray(raw.sizes) && raw.sizes.length ? { sizes: raw.sizes.filter((s): s is string => typeof s === 'string').slice(0, 10) } : {}),
    productUrl: String(raw.productUrl || ''),
    active: raw.active !== false,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

async function resolveCatalogueImageUrl(storagePath?: string): Promise<string> {
  if (!storagePath) return '/images/catalogue-demo/kanchivaram-purple-peacock-model.png';
  if (
    storagePath.startsWith('/') ||
    storagePath.startsWith('http://') ||
    storagePath.startsWith('https://') ||
    storagePath.startsWith('data:image/')
  ) {
    return storagePath;
  }
  const db = getDb();
  if (!db) {
    const bucket = getStorageBucket();
    if (bucket) {
      try {
        const [signed] = await bucket.file(storagePath).getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
        if (signed) return signed;
      } catch {
        // fallback below
      }
    }
    return '/images/catalogue-demo/kanchivaram-purple-peacock-model.png';
  }
  try {
    return await getSignedPlaybackUrl(storagePath);
  } catch {
    return '/images/catalogue-demo/kanchivaram-purple-peacock-model.png';
  }
}

async function persistDataUrlIfNeeded(sku: string, slot: 'model' | 'reference', input?: string): Promise<string> {
  if (!input || !input.trim()) return '';
  const trimmed = input.trim();
  if (!trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  const bucket = getStorageBucket();
  if (!bucket) return trimmed;

  try {
    const match = trimmed.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return trimmed;
    const contentType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const safeSku = sku.replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = `clients/${activeClientId()}/catalogue/${safeSku}/${slot}_${Date.now()}.${ext}`;
    const file = bucket.file(path);
    await file.save(buffer, { contentType, public: false });
    return path;
  } catch {
    return trimmed;
  }
}

/** Garment photos in storage (not the bundled demo images or outside links). */
function isStoredImagePath(path: string) {
  return Boolean(path) && !path.startsWith('/') && !path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('data:');
}

/**
 * A 480 px WebP preview beside the garment photo, so grids of 16+ garments load fast. Returns the
 * existing preview when the photo has not changed; nothing when the photo cannot be read.
 */
async function ensureThumbnail(record: MaharajaCatalogueProduct): Promise<Pick<MaharajaCatalogueProduct, 'thumbnailPath' | 'thumbnailSource'>> {
  if (!isStoredImagePath(record.storagePath)) return {};
  if (record.thumbnailPath && record.thumbnailSource === record.storagePath) {
    return { thumbnailPath: record.thumbnailPath, thumbnailSource: record.thumbnailSource };
  }
  const bucket = getStorageBucket();
  if (!bucket) return {};
  try {
    const [original] = await bucket.file(record.storagePath).download();
    const thumb = await sharp(original).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
    const safeSku = record.sku.replace(/[^a-zA-Z0-9_-]/g, '_');
    const thumbnailPath = `clients/${activeClientId()}/catalogue/${safeSku}/thumb_${Date.now()}.webp`;
    await bucket.file(thumbnailPath).save(thumb, { contentType: 'image/webp', public: false });
    return { thumbnailPath, thumbnailSource: record.storagePath };
  } catch (error) {
    console.warn(`Catalogue thumbnail skipped for ${record.sku}:`, error);
    return {};
  }
}

/** Every garment record for the bound client (shared built-ins merged with saved ones), without photo links. */
export async function loadAllCatalogueRecords(includeInactive = true): Promise<MaharajaCatalogueProduct[]> {
  const db = getDb();
  let allProducts: MaharajaCatalogueProduct[] = [];

  if (db) {
    const snapshot = await db.collection(collectionPath()).get();
    // Maharaja's built-in silk saree collection never appears in another client's catalogue.
    const builtIn = activeClientId() === MAHARAJA_CLIENT_ID ? BUILT_IN_CATALOGUE : [];
    if (!snapshot.empty) {
      const bySku = new Map<string, MaharajaCatalogueProduct>();
      for (const item of builtIn) {
        bySku.set(item.sku, item);
      }
      snapshot.docs.forEach((doc, idx) => {
        const rawData = doc.data() as Partial<MaharajaCatalogueProduct>;
        if (rawData.deletedAt) { bySku.delete(doc.id); return; }
        if (isDeprecatedDemoProduct(doc.id, rawData.storagePath)) return;
        const normalized = normalizeCatalogueProduct({ ...(bySku.get(doc.id) || {}), ...rawData, sku: doc.id }, idx + 1);
        bySku.set(normalized.sku, normalized);
      });
      allProducts = Array.from(bySku.values()).filter((item) => !isDeprecatedDemoProduct(item.sku, item.storagePath));
    } else {
      allProducts = [...builtIn];
    }
  } else {
    const map = getMockCatalogueMap();
    allProducts = Array.from(map.values()).map((item, idx) => normalizeCatalogueProduct(item, idx + 1));
  }

  return includeInactive ? allProducts : allProducts.filter((item) => item.active !== false);
}

export async function listCatalogueProducts(
  offset = 0,
  limit = 50,
  options?: { includeInactive?: boolean; videoOnly?: boolean }
): Promise<{ products: PublicCatalogueProduct[]; total: number }> {
  const includeInactive = options?.includeInactive === true;
  const allProducts = await loadAllCatalogueRecords(true);

  // videoOnly: the pieces the store switched on for AI Video, filtered before paging so every page is full.
  const filtered = (includeInactive ? allProducts : allProducts.filter((item) => item.active !== false))
    .filter((item) => !options?.videoOnly || item.eligibleForVideo !== false)
    // Newest upload day first, so a fresh batch leads each category on the TV; the store's order within a day.
    .sort((left, right) => (right.createdAt || '').slice(0, 10).localeCompare((left.createdAt || '').slice(0, 10)) || left.sortOrder - right.sortOrder);

  const safeLimit = Math.min(Math.max(1, limit), 100);
  const sliced = filtered.slice(Math.max(0, offset), Math.max(0, offset) + safeLimit);

  const products: PublicCatalogueProduct[] = await Promise.all(
    sliced.map(async ({ storagePath, garmentReferencePath, thumbnailPath, thumbnailSource: _thumbSource, ...product }) => {
      const [imageUrl, referenceUrl, thumbnailUrl] = await Promise.all([
        resolveCatalogueImageUrl(storagePath),
        garmentReferencePath ? resolveCatalogueImageUrl(garmentReferencePath) : Promise.resolve(''),
        thumbnailPath ? resolveCatalogueImageUrl(thumbnailPath) : Promise.resolve(''),
      ]);
      return {
        ...product,
        id: product.id || product.sku.toLowerCase(),
        imageUrl,
        garmentReferenceUrl: referenceUrl || imageUrl,
        thumbnailUrl: thumbnailUrl || imageUrl,
        accent: 'from-[#FAF6F0] to-[#EFE8DC]',
      };
    })
  );

  return {
    total: filtered.length,
    products,
  };
}

export async function getCatalogueProduct(sku: string): Promise<MaharajaCatalogueProduct | null> {
  const cleanSku = String(sku || '').trim();
  if (!cleanSku) return null;
  const db = getDb();
  if (db) {
    const snapshot = await db.collection(collectionPath()).doc(cleanSku).get();
    if (snapshot.exists) {
      const data = snapshot.data() as Partial<MaharajaCatalogueProduct>;
      if (data.deletedAt) return null;
      const product = normalizeCatalogueProduct(data);
      return product.active ? product : null;
    }
  } else {
    const map = getMockCatalogueMap();
    const mockItem = map.get(cleanSku);
    if (mockItem) {
      return mockItem.active ? mockItem : null;
    }
  }
  if (activeClientId() !== MAHARAJA_CLIENT_ID) return null;
  const fallback = COMBINED_FALLBACK_CATALOGUE.find((product) => product.sku === cleanSku);
  return fallback && fallback.active ? fallback : null;
}

export async function upsertCatalogueProduct(input: Partial<MaharajaCatalogueProduct> & { imageUrl?: string; garmentReferenceUrl?: string }): Promise<PublicCatalogueProduct> {
  const sku = String(input.sku || '').trim().toUpperCase();
  if (!sku) {
    throw new Error('SKU is required to save a catalogue garment.');
  }
  const title = String(input.title || '').trim();
  if (!title) {
    throw new Error('Garment title is required.');
  }

  const rawModelPath = input.storagePath || input.imageUrl || '/images/catalogue-demo/kanchivaram-purple-peacock-model.png';
  const rawRefPath = input.garmentReferencePath || input.garmentReferenceUrl || rawModelPath;

  const storagePath = await persistDataUrlIfNeeded(sku, 'model', rawModelPath);
  const garmentReferencePath = await persistDataUrlIfNeeded(sku, 'reference', rawRefPath);

  const nowIso = new Date().toISOString();
  const normalized = normalizeCatalogueProduct({
    ...input,
    sku,
    title,
    storagePath,
    garmentReferencePath,
    updatedAt: nowIso,
    createdAt: input.createdAt || nowIso,
  });
  const record = { ...normalized, ...await ensureThumbnail(normalized) };

  const db = getDb();
  if (db) {
    // A re-upload under a SKU the store once deleted brings it back.
    await db.collection(collectionPath()).doc(sku).set({ ...record, deletedAt: FieldValue.delete() }, { merge: true });
  } else {
    const map = getMockCatalogueMap();
    map.set(sku, record);
  }

  const imageUrl = await resolveCatalogueImageUrl(record.storagePath);
  const garmentReferenceUrl = record.garmentReferencePath
    ? await resolveCatalogueImageUrl(record.garmentReferencePath)
    : imageUrl;
  const thumbnailUrl = record.thumbnailPath ? await resolveCatalogueImageUrl(record.thumbnailPath) : imageUrl;

  const { storagePath: _s, garmentReferencePath: _g, thumbnailPath: _t, thumbnailSource: _ts, ...rest } = record;
  return {
    ...rest,
    id: record.id || record.sku.toLowerCase(),
    imageUrl,
    garmentReferenceUrl,
    thumbnailUrl,
    accent: 'from-[#FAF6F0] to-[#EFE8DC]',
  };
}

export async function updateCatalogueProduct(
  sku: string,
  patch: Partial<MaharajaCatalogueProduct> & { imageUrl?: string; garmentReferenceUrl?: string }
): Promise<PublicCatalogueProduct> {
  const cleanSku = String(sku || '').trim();
  if (!cleanSku) throw new Error('SKU is required.');

  const db = getDb();
  let existing: MaharajaCatalogueProduct | undefined;

  if (db) {
    const snap = await db.collection(collectionPath()).doc(cleanSku).get();
    if (snap.exists) {
      existing = normalizeCatalogueProduct(snap.data() as Partial<MaharajaCatalogueProduct>);
    }
  } else {
    existing = getMockCatalogueMap().get(cleanSku);
  }

  if (!existing) {
    existing = activeClientId() === MAHARAJA_CLIENT_ID ? COMBINED_FALLBACK_CATALOGUE.find((item) => item.sku === cleanSku) : undefined;
  }
  if (!existing) {
    throw new Error(`Catalogue item ${cleanSku} not found.`);
  }

  return upsertCatalogueProduct({
    ...existing,
    ...patch,
    sku: cleanSku,
    createdAt: existing.createdAt,
  });
}

export async function deleteCatalogueProduct(sku: string): Promise<void> {
  await deleteCatalogueProducts([sku]);
}

function cleanSkus(skus: string[]): string[] {
  return Array.from(new Set(skus.map((sku) => String(sku || '').trim()).filter(Boolean))).slice(0, 500);
}

function isBuiltInSku(sku: string): boolean {
  return activeClientId() === MAHARAJA_CLIENT_ID && COMBINED_FALLBACK_CATALOGUE.some((item) => item.sku === sku);
}

/**
 * Deletes garments for good: the record, and the store's own photo and preview files. A built-in garment
 * (part of the code) gets a deleted marker instead, or it would come back on the next load.
 */
export async function deleteCatalogueProducts(skus: string[]): Promise<number> {
  const clean = cleanSkus(skus);
  if (!clean.length) throw new Error('SKU is required.');
  const db = getDb();
  const bucket = getStorageBucket();
  const ownPrefix = `clients/${activeClientId()}/`;
  let deleted = 0;
  for (const sku of clean) {
    let files: string[] = [];
    if (db) {
      const ref = db.collection(collectionPath()).doc(sku);
      const snapshot = await ref.get();
      const data = (snapshot.exists ? snapshot.data() : {}) as Partial<MaharajaCatalogueProduct>;
      files = [data.storagePath, data.garmentReferencePath, data.thumbnailPath].filter((path): path is string => typeof path === 'string');
      if (isBuiltInSku(sku)) await ref.set({ deletedAt: new Date().toISOString() }, { merge: true });
      else if (snapshot.exists) await ref.delete();
      else continue;
    } else {
      const map = getMockCatalogueMap();
      if (!map.has(sku)) continue;
      map.delete(sku);
    }
    deleted += 1;
    if (bucket) {
      const owned = Array.from(new Set(files.filter((path) => path.startsWith(ownPrefix))));
      await Promise.all(owned.map((path) => bucket.file(path).delete({ ignoreNotFound: true }).catch(() => undefined)));
    }
  }
  return deleted;
}

/** The garment already saved with this exact photo, if any. */
/**
 * The garment that already has this exact photo. With `gender`, only within that audience: a unisex kids'
 * piece may be uploaded once under Boys and once under Girls, but never twice under the same one.
 */
export async function findCatalogueByPhotoHash(hash: string, gender?: string): Promise<MaharajaCatalogueProduct | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const db = getDb();
  if (db) {
    const snap = await db.collection(collectionPath()).where('photoHash', '==', hash).limit(8).get();
    const doc = snap.docs.find((item) => {
      const data = item.data() as Partial<MaharajaCatalogueProduct>;
      return !data.deletedAt && (!gender || data.gender === gender);
    });
    return doc ? normalizeCatalogueProduct({ ...(doc.data() as Partial<MaharajaCatalogueProduct>), sku: doc.id }) : null;
  }
  return Array.from(getMockCatalogueMap().values()).find((item) => item.photoHash === hash && (!gender || item.gender === gender)) || null;
}

export type CatalogueFlags = Partial<Pick<MaharajaCatalogueProduct, 'active' | 'newArrival' | 'trending' | 'eligibleForLive' | 'eligibleForVideo'>>;

/**
 * The same switches on many garments in one batched write, keeping the New arrival badge in step. Only
 * garments that exist are touched, so a stale SKU never leaves a half-empty record behind.
 */
export async function bulkUpdateCatalogueFlags(skus: string[], flags: CatalogueFlags): Promise<number> {
  const clean = cleanSkus(skus);
  const patch: Record<string, unknown> = { ...flags, updatedAt: new Date().toISOString() };
  if (typeof flags.newArrival === 'boolean') patch.badge = flags.newArrival ? 'NEW ARRIVAL' : 'ROYAL SILK';
  const db = getDb();
  if (!db) {
    const map = getMockCatalogueMap();
    let count = 0;
    for (const sku of clean) {
      const item = map.get(sku);
      if (item) { map.set(sku, { ...item, ...patch } as MaharajaCatalogueProduct); count += 1; }
    }
    return count;
  }
  const collection = db.collection(collectionPath());
  const snapshots = clean.length ? await db.getAll(...clean.map((sku) => collection.doc(sku))) : [];
  const targets = snapshots
    .filter((snap) => (snap.exists && !(snap.data() as Partial<MaharajaCatalogueProduct>).deletedAt) || isBuiltInSku(snap.id))
    .map((snap) => snap.ref);
  for (let start = 0; start < targets.length; start += 400) {
    const batch = db.batch();
    for (const ref of targets.slice(start, start + 400)) batch.set(ref, patch, { merge: true });
    await batch.commit();
  }
  return targets.length;
}

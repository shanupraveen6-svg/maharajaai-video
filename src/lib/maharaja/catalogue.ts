import 'server-only';

import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { catalogueCategories, sampleCatalogue, type CatalogueCategoryId, type TryFocusProduct } from '@/lib/tryfocus/sample-data';
import { MAHARAJA_CLIENT_ID } from './config';
import type { MaharajaCatalogueProduct, PublicCatalogueProduct } from './catalogue-types';

const collectionPath = `clientWorkspaces/${MAHARAJA_CLIENT_ID}/catalogueProducts`;

const LOCAL_DEMO_CATALOGUE: MaharajaCatalogueProduct[] = sampleCatalogue.map((item, index) => ({
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
  storagePath,
  garmentReferencePath: storagePath,
  fabricNote: 'Pure Kanchivaram Handloom Silk Saree',
  badge: 'ROYAL SILK',
  newArrival: false,
  eligibleForVideo: true,
  productUrl: '',
  active: true,
  sortOrder: index + 101,
}));

const COMBINED_FALLBACK_CATALOGUE: MaharajaCatalogueProduct[] = [
  ...LOCAL_DEMO_CATALOGUE,
  ...ROOT_SILK_CATALOGUE,
];

function getMockCatalogueMap(): Map<string, MaharajaCatalogueProduct> {
  const store = getMockStore() as any;
  if (!store.catalogueProducts) {
    const seeded = new Map<string, MaharajaCatalogueProduct>();
    for (const item of LOCAL_DEMO_CATALOGUE) {
      seeded.set(item.sku, { ...item });
    }
    store.catalogueProducts = seeded;
  }
  return store.catalogueProducts as Map<string, MaharajaCatalogueProduct>;
}

function normalizeCatalogueProduct(raw: Partial<MaharajaCatalogueProduct>, index = 1): MaharajaCatalogueProduct {
  const category = (catalogueCategories.some((c) => c.id === raw.category) ? raw.category : 'sarees') as CatalogueCategoryId;
  const catMeta = catalogueCategories.find((c) => c.id === category) || catalogueCategories[0];
  const gender = raw.gender === 'men' || raw.audience === 'Men' || catMeta.gender === 'men' ? 'men' : 'women';
  const audience = gender === 'men' ? 'Men' : 'Women';
  const garmentType = raw.garmentType || catMeta.garmentType;
  const sku = String(raw.sku || `TF-${category.toUpperCase().slice(0, 3)}-${index}`).trim();
  const newArrival = typeof raw.newArrival === 'boolean' ? raw.newArrival : raw.badge === 'NEW ARRIVAL';
  const badge = raw.badge || (newArrival ? 'NEW ARRIVAL' : 'ROYAL SILK');
  const storagePath = String(raw.storagePath || '/images/catalogue-demo/kanchivaram-purple-peacock-model.png').trim();
  const garmentReferencePath = String(raw.garmentReferencePath || storagePath).trim();

  return {
    id: raw.id || sku.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    sku,
    title: String(raw.title || sku).trim(),
    price: Math.max(0, Number(raw.price || 0)),
    gender,
    audience,
    category,
    garmentType,
    storagePath,
    garmentReferencePath,
    fabricNote: raw.fabricNote || `${catMeta.label} · Maharaja Collection`,
    badge,
    newArrival,
    eligibleForVideo: raw.eligibleForVideo !== false,
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
    const path = `clients/${MAHARAJA_CLIENT_ID}/catalogue/${safeSku}/${slot}_${Date.now()}.${ext}`;
    const file = bucket.file(path);
    await file.save(buffer, { contentType, public: false });
    return path;
  } catch {
    return trimmed;
  }
}

export async function listCatalogueProducts(
  offset = 0,
  limit = 50,
  options?: { includeInactive?: boolean }
): Promise<{ products: PublicCatalogueProduct[]; total: number }> {
  const includeInactive = options?.includeInactive === true;
  const db = getDb();
  let allProducts: MaharajaCatalogueProduct[] = [];

  if (db) {
    const snapshot = await db.collection(collectionPath).get();
    if (!snapshot.empty) {
      const bySku = new Map<string, MaharajaCatalogueProduct>();
      for (const item of LOCAL_DEMO_CATALOGUE) {
        bySku.set(item.sku, item);
      }
      snapshot.docs.forEach((doc, idx) => {
        const normalized = normalizeCatalogueProduct({ ...(bySku.get(doc.id) || {}), ...(doc.data() as Partial<MaharajaCatalogueProduct>), sku: doc.id }, idx + 1);
        bySku.set(normalized.sku, normalized);
      });
      allProducts = Array.from(bySku.values());
    } else {
      allProducts = [...LOCAL_DEMO_CATALOGUE];
    }
  } else {
    const map = getMockCatalogueMap();
    allProducts = Array.from(map.values()).map((item, idx) => normalizeCatalogueProduct(item, idx + 1));
  }

  const filtered = (includeInactive ? allProducts : allProducts.filter((item) => item.active !== false))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const safeLimit = Math.min(Math.max(1, limit), 100);
  const sliced = filtered.slice(Math.max(0, offset), Math.max(0, offset) + safeLimit);

  const products: PublicCatalogueProduct[] = await Promise.all(
    sliced.map(async ({ storagePath, garmentReferencePath, ...product }) => {
      const imageUrl = await resolveCatalogueImageUrl(storagePath);
      const garmentReferenceUrl = garmentReferencePath
        ? await resolveCatalogueImageUrl(garmentReferencePath)
        : imageUrl;
      return {
        ...product,
        id: product.id || product.sku.toLowerCase(),
        imageUrl,
        garmentReferenceUrl,
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
    const snapshot = await db.collection(collectionPath).doc(cleanSku).get();
    if (snapshot.exists) {
      const product = normalizeCatalogueProduct(snapshot.data() as Partial<MaharajaCatalogueProduct>);
      return product.active ? product : null;
    }
  } else {
    const map = getMockCatalogueMap();
    const mockItem = map.get(cleanSku);
    if (mockItem) {
      return mockItem.active ? mockItem : null;
    }
  }
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
  const record = normalizeCatalogueProduct({
    ...input,
    sku,
    title,
    storagePath,
    garmentReferencePath,
    updatedAt: nowIso,
    createdAt: input.createdAt || nowIso,
  });

  const db = getDb();
  if (db) {
    await db.collection(collectionPath).doc(sku).set(record, { merge: true });
  } else {
    const map = getMockCatalogueMap();
    map.set(sku, record);
  }

  const imageUrl = await resolveCatalogueImageUrl(record.storagePath);
  const garmentReferenceUrl = record.garmentReferencePath
    ? await resolveCatalogueImageUrl(record.garmentReferencePath)
    : imageUrl;

  const { storagePath: _s, garmentReferencePath: _g, ...rest } = record;
  return {
    ...rest,
    id: record.id || record.sku.toLowerCase(),
    imageUrl,
    garmentReferenceUrl,
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
    const snap = await db.collection(collectionPath).doc(cleanSku).get();
    if (snap.exists) {
      existing = normalizeCatalogueProduct(snap.data() as Partial<MaharajaCatalogueProduct>);
    }
  } else {
    existing = getMockCatalogueMap().get(cleanSku);
  }

  if (!existing) {
    existing = COMBINED_FALLBACK_CATALOGUE.find((item) => item.sku === cleanSku);
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
  const cleanSku = String(sku || '').trim();
  if (!cleanSku) throw new Error('SKU is required.');
  const db = getDb();
  if (db) {
    await db.collection(collectionPath).doc(cleanSku).delete();
  } else {
    getMockCatalogueMap().delete(cleanSku);
  }
}

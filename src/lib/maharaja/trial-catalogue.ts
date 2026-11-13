import { bulkUpdateCatalogueFlags, loadAllCatalogueRecords, updateCatalogueProduct } from '@/lib/maharaja/catalogue';
import type { MaharajaCatalogueProduct } from '@/lib/maharaja/catalogue-types';
import { getMaharajaWorkspace, logMaharajaActivity, updateMaharajaSettings } from '@/lib/maharaja/server';
import { allCategoriesFor, findCategory, isWesternCategory, type StoreCategoryLists } from '@/lib/tryfocus/store-categories';
import type { CatalogueAudience, CatalogueCategoryId } from '@/lib/tryfocus/sample-data';

/**
 * Gets a store's existing garments ready for a public trial, with no new photos:
 * 1. Live Try-On: every garment in the audience's non-ethnic categories (up to 5, those with the most
 *    garments). Ethnic wear (sarees, kurtas, lehengas, veshti…) and everything else comes off.
 * 2. AI Video: 3–5 categories per audience, up to 5 priced pieces each (₹3,000+, ending in 99; kids up to
 *    ₹8,000). Pieces already on AI Video with a price (the sarees) stay as they are.
 * 3. AI Video's category list becomes exactly the categories with pieces.
 * 4. A garment filed under another audience's category moves to its own audience's category of that kind.
 * `planTrialCatalogue` only reads; `applyTrialCatalogue` writes the plan. Both run for the bound client.
 */

const AUDIENCES: CatalogueAudience[] = ['women', 'men', 'boys', 'girls'];
const LIVE_CATEGORIES_MAX = 5;
const VIDEO_CATEGORIES_MIN = 3;
const VIDEO_CATEGORIES_MAX = 5;
const VIDEO_PER_CATEGORY = 5;

/** AI Video categories, in the order they are chosen, per audience; any other category fills up to 3. */
const VIDEO_CATEGORIES: Record<CatalogueAudience, string[]> = {
  women: ['sarees', 'lehengas', 'gowns', 'anarkali', 'women-occasion', 'half-sarees', 'salwar-suits'],
  men: ['sherwanis', 'kurta', 'blazers', 'formal-shirts', 'men-occasion', 'casual-shirts'],
  boys: ['boys-sherwani', 'boys-festive', 'boys-kurta', 'boys-silk-shirt', 'boys-party', 'boys-jacket', 'boys-shirt-trouser'],
  girls: ['girls-lehenga', 'girls-pavadai', 'girls-gown', 'girls-party', 'girls-frock', 'girls-festive', 'girls-anarkali'],
};
const KIDS = new Set<CatalogueAudience>(['boys', 'girls']);
/** Bridal and occasion wear sits higher. */
const HIGH_END = new Set(['sarees', 'lehengas', 'women-occasion', 'sherwanis', 'men-occasion', 'boys-sherwani', 'girls-lehenga']);

/** The same SKU always gets the same price, so the preview and the apply agree. */
export function trialPriceFor(sku: string, categoryId: string, audience: CatalogueAudience = 'women') {
  let hash = 2166136261;
  for (const char of sku) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const [low, high] = KIDS.has(audience) ? [3000, 8000] : HIGH_END.has(categoryId) ? [8000, 25000] : [3000, 12000];
  return Math.round((low + (hash % (high - low + 1))) / 100) * 100 - 1;
}

const newestFirst = (a: MaharajaCatalogueProduct, b: MaharajaCatalogueProduct) =>
  String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || (a.sortOrder || 0) - (b.sortOrder || 0);

type Piece = { sku: string; title: string; category: string; categoryLabel: string };

export type TrialPlan = {
  garments: number;
  audiences: Array<{
    audience: CatalogueAudience;
    live: Piece[];
    videoKept: Array<Piece & { price: number }>;
    videoAdded: Array<Piece & { price: number }>;
    videoCategories: Array<{ id: string; label: string }>;
  }>;
  liveOn: string[];
  liveOff: string[];
  videoOff: string[];
  moves: Array<{ sku: string; title: string; gender: CatalogueAudience; from: string; to: string | null; toId: string | null }>;
};

export async function planTrialCatalogue(): Promise<TrialPlan> {
  const workspace = await getMaharajaWorkspace();
  const custom = workspace.customCategories || [];
  const records = (await loadAllCatalogueRecords(false)).filter((item) => item.active !== false).map((item) => ({ ...item }));
  const label = (id: string) => findCategory(id, custom)?.label || id;
  const piece = (item: MaharajaCatalogueProduct): Piece => ({ sku: item.sku, title: item.title, category: item.category, categoryLabel: label(item.category) });

  const moves: TrialPlan['moves'] = [];
  for (const item of records) {
    const cat = findCategory(item.category, custom);
    if (!cat || cat.gender === item.gender) continue;
    const target = allCategoriesFor(item.gender, custom).find((other) => other.garmentType === cat.garmentType);
    moves.push({ sku: item.sku, title: item.title, gender: item.gender, from: cat.label, to: target?.label || null, toId: (target?.id as string) || null });
    if (target) item.category = target.id as CatalogueCategoryId;
  }

  const liveOn = new Set<string>();
  const videoChosen = new Map<CatalogueAudience, string[]>();
  const audiences: TrialPlan['audiences'] = [];
  const count = (audience: CatalogueAudience, id: string) => records.filter((item) => item.gender === audience && item.category === id).length;
  for (const audience of AUDIENCES) {
    // Live Try-On: the non-ethnic categories with the most garments, every garment in them.
    const liveCats = allCategoriesFor(audience, custom)
      .filter((cat) => isWesternCategory(cat.id, custom) && count(audience, cat.id as string) > 0)
      .sort((x, y) => count(audience, y.id as string) - count(audience, x.id as string))
      .slice(0, LIVE_CATEGORIES_MAX)
      .map((cat) => cat.id as string);
    const live = records.filter((item) => item.gender === audience && liveCats.includes(item.category)).sort(newestFirst);
    for (const item of live) liveOn.add(item.sku);

    // AI Video: the first 3–5 listed categories with garments; any other category tops it up to 3.
    const listed = VIDEO_CATEGORIES[audience].filter((id) => count(audience, id) > 0);
    const others = allCategoriesFor(audience, custom).map((cat) => cat.id as string)
      .filter((id) => !listed.includes(id) && count(audience, id) > 0)
      .sort((x, y) => count(audience, y) - count(audience, x));
    const chosen = [...listed.slice(0, VIDEO_CATEGORIES_MAX), ...others].slice(0, Math.max(VIDEO_CATEGORIES_MIN, Math.min(listed.length, VIDEO_CATEGORIES_MAX)));
    videoChosen.set(audience, chosen);
    const kept = records.filter((item) => item.gender === audience && item.eligibleForVideo && item.price > 0 && chosen.includes(item.category));
    const added = chosen.flatMap((id) => records
      .filter((item) => item.gender === audience && item.category === id && !kept.includes(item))
      .sort(newestFirst)
      .slice(0, Math.max(0, VIDEO_PER_CATEGORY - kept.filter((k) => k.category === id).length)));
    audiences.push({
      audience,
      live: live.map(piece),
      videoKept: kept.map((item) => ({ ...piece(item), price: item.price })),
      videoAdded: added.map((item) => ({ ...piece(item), price: item.price >= 3000 ? item.price : trialPriceFor(item.sku, item.category, audience) })),
      videoCategories: chosen.map((id) => ({ id, label: label(id) })),
    });
  }

  return {
    garments: records.length,
    audiences,
    liveOn: records.filter((item) => liveOn.has(item.sku) && item.eligibleForLive !== true).map((item) => item.sku),
    liveOff: records.filter((item) => !liveOn.has(item.sku) && item.eligibleForLive === true).map((item) => item.sku),
    // Pieces on AI Video outside these categories, or without a price, come off (customers only see priced pieces).
    videoOff: records.filter((item) => item.eligibleForVideo && !(item.price > 0 && videoChosen.get(item.gender)?.includes(item.category))).map((item) => item.sku),
    moves,
  };
}

export async function applyTrialCatalogue(plan: TrialPlan, clientId: string) {
  for (const move of plan.moves) if (move.toId) await updateCatalogueProduct(move.sku, { category: move.toId as CatalogueCategoryId, gender: move.gender });
  if (plan.liveOn.length) await bulkUpdateCatalogueFlags(plan.liveOn, { eligibleForLive: true });
  if (plan.liveOff.length) await bulkUpdateCatalogueFlags(plan.liveOff, { eligibleForLive: false });
  if (plan.videoOff.length) await bulkUpdateCatalogueFlags(plan.videoOff, { eligibleForVideo: false });
  const added = plan.audiences.flatMap((row) => row.videoAdded);
  for (const pick of added) await updateCatalogueProduct(pick.sku, { price: pick.price, eligibleForVideo: true });
  const videoCategoryLists: StoreCategoryLists = {};
  for (const row of plan.audiences) videoCategoryLists[row.audience] = row.videoCategories.map((cat) => cat.id as CatalogueCategoryId);
  await updateMaharajaSettings({ videoCategoryLists }, clientId);
  const live = plan.audiences.reduce((sum, row) => sum + row.live.length, 0);
  await logMaharajaActivity('campaign', `Trial catalogue prepared: ${live} on Live Try-On, ${added.length} added to AI Video`, { live, video: added.length }).catch(() => undefined);
  return { live, videoAdded: added.length, moved: plan.moves.filter((move) => move.toId).length };
}

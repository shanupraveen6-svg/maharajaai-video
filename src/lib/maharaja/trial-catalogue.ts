import { bulkUpdateCatalogueFlags, loadAllCatalogueRecords, updateCatalogueProduct } from '@/lib/maharaja/catalogue';
import type { MaharajaCatalogueProduct } from '@/lib/maharaja/catalogue-types';
import { getMaharajaWorkspace, logMaharajaActivity, updateMaharajaSettings } from '@/lib/maharaja/server';
import { allCategoriesFor, findCategory, isWesternCategory, type StoreCategoryLists } from '@/lib/tryfocus/store-categories';
import type { CatalogueAudience, CatalogueCategoryId } from '@/lib/tryfocus/sample-data';

/**
 * Gets a store's existing garments ready for a public trial, with no new photos:
 * 1. Live Try-On: up to 8 western-cut garments per audience, spread across categories, newest first;
 *    every other garment comes off Live Try-On.
 * 2. AI Video: up to 8 more premium pieces per audience from categories Image Try-On handles well, each
 *    with a premium price (₹3,000+, ending in 99). Pieces already on AI Video with a price stay.
 * 3. AI Video's category list becomes exactly the categories with pieces.
 * 4. A garment filed under another audience's category moves to its own audience's category of that kind.
 * `planTrialCatalogue` only reads; `applyTrialCatalogue` writes the plan. Both run for the bound client.
 */

const AUDIENCES: CatalogueAudience[] = ['women', 'men', 'boys', 'girls'];
const LIVE_PER_AUDIENCE = 8;
const VIDEO_PER_AUDIENCE = 8;
const VIDEO_PER_CATEGORY = 4;

/** AI Video categories, most premium first, per audience. */
const VIDEO_CATEGORIES: Record<CatalogueAudience, string[]> = {
  women: ['sarees', 'lehengas', 'women-occasion', 'gowns', 'anarkali', 'half-sarees', 'salwar-suits'],
  men: ['sherwanis', 'men-occasion', 'kurta', 'blazers', 'formal-shirts', 'casual-shirts'],
  boys: ['boys-sherwani', 'boys-festive', 'boys-kurta', 'boys-silk-shirt', 'boys-party', 'boys-jacket', 'boys-shirt-trouser'],
  girls: ['girls-lehenga', 'girls-festive', 'girls-pavadai', 'girls-gown', 'girls-party', 'girls-frock', 'girls-anarkali'],
};
/** Bridal and occasion wear sits higher. */
const HIGH_END = new Set(['sarees', 'lehengas', 'women-occasion', 'sherwanis', 'men-occasion', 'boys-sherwani', 'girls-lehenga']);

/** The same SKU always gets the same price, so the preview and the apply agree. */
export function trialPriceFor(sku: string, categoryId: string) {
  let hash = 2166136261;
  for (const char of sku) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const [low, high] = HIGH_END.has(categoryId) ? [8000, 25000] : [3000, 12000];
  return Math.round((low + (hash % (high - low + 1))) / 100) * 100 - 1;
}

/** Up to `limit` items, one category at a time in turn, so no category crowds out the rest. */
function roundRobin<T>(groups: T[][], limit: number) {
  const picked: T[] = [];
  const queues = groups.map((items) => [...items]);
  while (picked.length < limit && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      if (picked.length >= limit) break;
      const next = queue.shift();
      if (next) picked.push(next);
    }
  }
  return picked;
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
  const audiences: TrialPlan['audiences'] = [];
  for (const audience of AUDIENCES) {
    const western = allCategoriesFor(audience, custom).filter((cat) => isWesternCategory(cat.id, custom));
    const liveGroups = western.map((cat) => records.filter((item) => item.gender === audience && item.category === cat.id).sort(newestFirst));
    const live = roundRobin(liveGroups, LIVE_PER_AUDIENCE);
    for (const item of live) liveOn.add(item.sku);

    const order = VIDEO_CATEGORIES[audience];
    const kept = records.filter((item) => item.gender === audience && item.eligibleForVideo && item.price > 0 && order.includes(item.category));
    // Pieces already priced never use up the quota, so an audience with many sarees still gets gowns or shirts.
    const groups = order.map((id) => records
      .filter((item) => item.gender === audience && item.category === id && !kept.includes(item))
      .sort(newestFirst)
      .slice(0, Math.max(0, VIDEO_PER_CATEGORY - kept.filter((k) => k.category === id).length)));
    const added = roundRobin(groups, VIDEO_PER_AUDIENCE);
    const filled = new Set([...kept, ...added].map((item) => item.category));
    audiences.push({
      audience,
      live: live.map(piece),
      videoKept: kept.map((item) => ({ ...piece(item), price: item.price })),
      videoAdded: added.map((item) => ({ ...piece(item), price: item.price >= 3000 ? item.price : trialPriceFor(item.sku, item.category) })),
      videoCategories: order.filter((id) => filled.has(id)).map((id) => ({ id, label: label(id) })),
    });
  }

  return {
    garments: records.length,
    audiences,
    liveOn: records.filter((item) => liveOn.has(item.sku) && item.eligibleForLive !== true).map((item) => item.sku),
    liveOff: records.filter((item) => !liveOn.has(item.sku) && item.eligibleForLive === true).map((item) => item.sku),
    // Pieces on AI Video outside these categories, or without a price, come off (customers only see priced pieces).
    videoOff: records.filter((item) => item.eligibleForVideo && !(item.price > 0 && VIDEO_CATEGORIES[item.gender]?.includes(item.category))).map((item) => item.sku),
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

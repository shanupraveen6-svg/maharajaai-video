import { bulkUpdateCatalogueFlags, loadAllCatalogueRecords, updateCatalogueProduct, upsertCatalogueProduct } from '@/lib/maharaja/catalogue';
import type { MaharajaCatalogueProduct } from '@/lib/maharaja/catalogue-types';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { TRIAL_CUSTOM_CATEGORIES, TRIAL_GARMENTS, TRIAL_HIDE, TRIAL_MOVES, TRIAL_VIDEO_PICKS } from '@/lib/maharaja/maharaja-collection-preset';
import { getMaharajaWorkspace, logMaharajaActivity, updateMaharajaSettings } from '@/lib/maharaja/server';
import { allCategoriesFor, categoriesFor, findCategory, isWesternCategory, sanitizeCustomCategories, type CustomCategory, type StoreCategoryLists } from '@/lib/tryfocus/store-categories';
import type { CatalogueAudience, CatalogueCategoryId } from '@/lib/tryfocus/sample-data';

/**
 * Gets a store's catalogue ready for a public trial.
 * 1. Live Try-On: every garment in the audience's non-ethnic categories (up to 5, those with the most
 *    garments). Ethnic wear (sarees, kurtas, lehengas, veshti…) comes off.
 * 2. AI Video: 3–5 categories per audience with priced pieces. Pieces already priced (the sarees) stay.
 * 3. AI Video's category list becomes exactly the categories with pieces; every category with garments is
 *    shown to customers.
 * 4. A garment filed under another audience's category moves to its own audience's category of that kind.
 * For Maharaja, the reviewed preset (maharaja-collection-preset.ts) also adds the missing garments, makes the
 * moves the photo review found, hides the gift-box flat lays and sets the AI Video picks with names and prices.
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
  men: ['sherwanis', 'kurta', 'blazers', 'veshti', 'formal-shirts', 'men-occasion', 'casual-shirts'],
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
    /** Image Try-On: every category with garments, and how many. */
    tryOn: Array<{ id: string; label: string; count: number }>;
  }>;
  liveOn: string[];
  liveOff: string[];
  videoOff: string[];
  moves: Array<{ sku: string; title: string; gender: CatalogueAudience; from: string; to: string | null; toId: string | null; newTitle?: string }>;
  /** Maharaja preset only. */
  add: Array<{ sku: string; title: string; gender: CatalogueAudience; category: string; categoryLabel: string; price: number; image: string }>;
  hide: Array<{ sku: string; title: string }>;
  rename: Array<{ sku: string; from: string; to: string }>;
  addCategories: CustomCategory[];
};

export async function planTrialCatalogue(clientId?: string): Promise<TrialPlan> {
  const workspace = await getMaharajaWorkspace();
  const preset = (clientId || workspace.clientId) === MAHARAJA_CLIENT_ID;
  const existingCustom = workspace.customCategories || [];
  const addCategories = preset ? (sanitizeCustomCategories(TRIAL_CUSTOM_CATEGORIES) || []).filter((cat) => !existingCustom.some((item) => item.id === cat.id)) : [];
  const custom = [...existingCustom, ...addCategories];
  const label = (id: string) => findCategory(id, custom)?.label || id;
  const piece = (item: MaharajaCatalogueProduct): Piece => ({ sku: item.sku, title: item.title, category: item.category, categoryLabel: label(item.category) });

  // The catalogue as it will be: hidden gift boxes out, preset garments in, moves made.
  const hideSet = new Set(preset ? TRIAL_HIDE : []);
  const all = await loadAllCatalogueRecords(false);
  const hide = all.filter((item) => hideSet.has(item.sku) && item.active !== false).map((item) => ({ sku: item.sku, title: item.title }));
  const records = all.filter((item) => item.active !== false && !hideSet.has(item.sku)).map((item) => ({ ...item }));
  const add = preset ? TRIAL_GARMENTS.filter((garment) => !records.some((item) => item.sku === garment.sku)) : [];
  for (const garment of add) {
    records.push({ sku: garment.sku, title: garment.title, gender: garment.gender, category: garment.category as CatalogueCategoryId, price: garment.price, eligibleForVideo: garment.price > 0, eligibleForLive: false, active: true, createdAt: new Date().toISOString() } as MaharajaCatalogueProduct);
  }

  const moves: TrialPlan['moves'] = [];
  const rename: TrialPlan['rename'] = [];
  const presetMoves = new Map(preset ? TRIAL_MOVES.map((move) => [move.sku, move]) : []);
  for (const item of records) {
    const planned = presetMoves.get(item.sku);
    if (planned && (planned.category !== item.category || planned.gender !== item.gender)) {
      moves.push({ sku: item.sku, title: item.title, gender: planned.gender, from: label(item.category), to: label(planned.category), toId: planned.category, newTitle: planned.title });
      item.category = planned.category as CatalogueCategoryId;
      item.gender = planned.gender;
      if (planned.title) item.title = planned.title;
      continue;
    }
    const cat = findCategory(item.category, custom);
    if (!cat || cat.gender === item.gender) continue;
    const target = allCategoriesFor(item.gender, custom).find((other) => other.garmentType === cat.garmentType);
    moves.push({ sku: item.sku, title: item.title, gender: item.gender, from: cat.label, to: target?.label || null, toId: (target?.id as string) || null });
    if (target) item.category = target.id as CatalogueCategoryId;
  }

  // AI Video picks from the preset carry a customer-facing name and a price.
  const picks = new Map(preset ? TRIAL_VIDEO_PICKS.map((pick) => [pick.sku, pick]) : []);
  for (const item of records) {
    const pick = picks.get(item.sku);
    if (!pick) continue;
    if (pick.title !== item.title) rename.push({ sku: item.sku, from: item.title, to: pick.title });
    item.title = pick.title;
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

    let kept: MaharajaCatalogueProduct[];
    let added: Array<MaharajaCatalogueProduct & { trialPrice: number }>;
    let chosen: string[];
    if (preset) {
      // Maharaja: the reviewed picks — pieces already priced in these categories, the preset's picks and its
      // new priced garments.
      const order = VIDEO_CATEGORIES[audience];
      const isPick = (item: MaharajaCatalogueProduct) => picks.has(item.sku) || add.some((garment) => garment.sku === item.sku && garment.price > 0);
      kept = records.filter((item) => item.gender === audience && item.eligibleForVideo && item.price > 0 && !isPick(item) && order.includes(item.category));
      added = records.filter((item) => item.gender === audience && isPick(item)).map((item) => ({ ...item, trialPrice: picks.get(item.sku)?.price || add.find((garment) => garment.sku === item.sku)?.price || item.price }));
      const filled = new Set([...kept, ...added].map((item) => item.category as string));
      chosen = [...order.filter((id) => filled.has(id)), ...[...filled].filter((id) => !order.includes(id))].slice(0, VIDEO_CATEGORIES_MAX);
      kept = kept.filter((item) => chosen.includes(item.category));
      added = added.filter((item) => chosen.includes(item.category));
    } else {
      // Other stores: the first 3–5 listed categories with garments; any other category tops it up to 3.
      const listed = VIDEO_CATEGORIES[audience].filter((id) => count(audience, id) > 0);
      const others = allCategoriesFor(audience, custom).map((cat) => cat.id as string)
        .filter((id) => !listed.includes(id) && count(audience, id) > 0)
        .sort((x, y) => count(audience, y) - count(audience, x));
      chosen = [...listed.slice(0, VIDEO_CATEGORIES_MAX), ...others].slice(0, Math.max(VIDEO_CATEGORIES_MIN, Math.min(listed.length, VIDEO_CATEGORIES_MAX)));
      kept = records.filter((item) => item.gender === audience && item.eligibleForVideo && item.price > 0 && chosen.includes(item.category));
      added = chosen.flatMap((id) => records
        .filter((item) => item.gender === audience && item.category === id && !kept.includes(item))
        .sort(newestFirst)
        .slice(0, Math.max(0, VIDEO_PER_CATEGORY - kept.filter((k) => k.category === id).length)))
        .map((item) => ({ ...item, trialPrice: item.price >= 3000 ? item.price : trialPriceFor(item.sku, item.category, audience) }));
    }
    videoChosen.set(audience, chosen);
    const tryOn = categoriesFor(undefined, audience, custom)
      .map((cat) => ({ id: cat.id as string, label: cat.label, count: count(audience, cat.id as string) }))
      .filter((cat) => cat.count > 0);
    audiences.push({
      audience,
      live: live.map(piece),
      videoKept: kept.map((item) => ({ ...piece(item), price: item.price })),
      videoAdded: added.map((item) => ({ ...piece(item), price: item.trialPrice })),
      videoCategories: chosen.map((id) => ({ id, label: label(id) })),
      tryOn,
    });
  }

  const onVideo = new Set(audiences.flatMap((row) => [...row.videoKept, ...row.videoAdded].map((item) => item.sku)));
  return {
    garments: records.length,
    audiences,
    liveOn: records.filter((item) => liveOn.has(item.sku) && item.eligibleForLive !== true && !add.some((garment) => garment.sku === item.sku)).map((item) => item.sku),
    liveOff: records.filter((item) => !liveOn.has(item.sku) && item.eligibleForLive === true).map((item) => item.sku),
    // Anything else on AI Video comes off (customers only see the chosen, priced pieces).
    videoOff: records.filter((item) => item.eligibleForVideo && !onVideo.has(item.sku) && !add.some((garment) => garment.sku === item.sku)).map((item) => item.sku),
    moves,
    add: add.map((garment) => ({ ...garment, categoryLabel: label(garment.category) })),
    hide,
    rename,
    addCategories,
  };
}

export async function applyTrialCatalogue(plan: TrialPlan, clientId: string) {
  const workspace = await getMaharajaWorkspace();
  const custom = [...(workspace.customCategories || []), ...plan.addCategories.filter((cat) => !(workspace.customCategories || []).some((item) => item.id === cat.id))];
  const liveSet = new Set(plan.audiences.flatMap((row) => row.live.map((item) => item.sku)));
  const videoPrice = new Map(plan.audiences.flatMap((row) => row.videoAdded.map((item) => [item.sku, item.price] as const)));

  // Categories first, so the new garments land in categories that exist.
  if (plan.addCategories.length) await updateMaharajaSettings({ customCategories: custom }, clientId);
  for (const garment of plan.add) {
    await upsertCatalogueProduct({
      sku: garment.sku,
      title: garment.title,
      gender: garment.gender,
      category: garment.category as CatalogueCategoryId,
      garmentType: findCategory(garment.category, custom)?.garmentType,
      fabricNote: `${garment.categoryLabel} · Maharaja collection`,
      imageUrl: garment.image,
      garmentReferenceUrl: garment.image,
      price: garment.price,
      eligibleForVideo: garment.price > 0,
      eligibleForLive: liveSet.has(garment.sku),
      active: true,
    });
  }
  for (const move of plan.moves) {
    if (!move.toId) continue;
    await updateCatalogueProduct(move.sku, {
      category: move.toId as CatalogueCategoryId,
      gender: move.gender,
      garmentType: findCategory(move.toId, custom)?.garmentType,
      ...(move.newTitle ? { title: move.newTitle } : {}),
    });
  }
  if (plan.hide.length) await bulkUpdateCatalogueFlags(plan.hide.map((item) => item.sku), { active: false, eligibleForLive: false, eligibleForVideo: false });
  if (plan.liveOn.length) await bulkUpdateCatalogueFlags(plan.liveOn, { eligibleForLive: true });
  if (plan.liveOff.length) await bulkUpdateCatalogueFlags(plan.liveOff, { eligibleForLive: false });
  if (plan.videoOff.length) await bulkUpdateCatalogueFlags(plan.videoOff, { eligibleForVideo: false });
  const newSkus = new Set(plan.add.map((garment) => garment.sku));
  const renamed = new Map(plan.rename.map((item) => [item.sku, item.to]));
  for (const [sku, price] of videoPrice) {
    if (newSkus.has(sku)) continue;
    await updateCatalogueProduct(sku, { price, eligibleForVideo: true, ...(renamed.has(sku) ? { title: renamed.get(sku) } : {}) });
  }

  // AI Video lists exactly its filled categories; customers see every category that has garments.
  const videoCategoryLists: StoreCategoryLists = {};
  const categoryLists: StoreCategoryLists = {};
  for (const row of plan.audiences) {
    videoCategoryLists[row.audience] = row.videoCategories.map((cat) => cat.id as CatalogueCategoryId);
    const shown = categoriesFor(workspace.categoryLists, row.audience, custom).map((cat) => cat.id as string);
    const filled = row.tryOn.map((cat) => cat.id).filter((id) => !shown.includes(id));
    categoryLists[row.audience] = [...shown, ...filled] as CatalogueCategoryId[];
  }
  await updateMaharajaSettings({ videoCategoryLists, ...(workspace.categoryLists ? { categoryLists } : {}) }, clientId);

  const live = plan.audiences.reduce((sum, row) => sum + row.live.length, 0);
  const videoAdded = plan.audiences.reduce((sum, row) => sum + row.videoAdded.length, 0);
  await logMaharajaActivity('campaign', `Catalogue set up: ${plan.add.length} garments added, ${live} on Live Try-On, ${videoAdded} on AI Video`, { added: plan.add.length, live, video: videoAdded }).catch(() => undefined);
  return { live, videoAdded, moved: plan.moves.filter((move) => move.toId).length, added: plan.add.length, hidden: plan.hide.length };
}

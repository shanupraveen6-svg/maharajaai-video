import { catalogueCategories, type CatalogueAudience, type CatalogueCategoryId, type TryFocusProduct } from './sample-data';

export const AUDIENCES: CatalogueAudience[] = ['women', 'men', 'boys', 'girls'];

/** The categories a store shows customers, per audience, in its own order. Missing = every category. */
export type StoreCategoryLists = Partial<Record<CatalogueAudience, CatalogueCategoryId[]>>;

export type GarmentType = TryFocusProduct['garmentType'];

// Widened from the master list's own `as const` literal types, so a store's own category (any label,
// any id) is structurally assignable too.
export type StoreCategory = {
  id: CatalogueCategoryId;
  label: string;
  description: string;
  subtitle: string;
  audience: 'Women' | 'Men' | 'Boys' | 'Girls';
  gender: CatalogueAudience;
  garmentType: GarmentType;
  westernTryOnEligible: boolean;
};

/** A category a single store added itself — not in the shared master list, so it carries its own garment type. */
export type CustomCategory = {
  id: string;
  label: string;
  gender: CatalogueAudience;
  garmentType: GarmentType;
  westernTryOnEligible: boolean;
};

/** A store's own Western wear (WW) setting per category id, over the category's default. */
export type WesternOverrides = Record<string, boolean>;

const MAX_PER_AUDIENCE = 20;
const MAX_CUSTOM_CATEGORIES = 30;

/** Garment types the real-time engine handles well: a new category of one of these starts as Western wear. */
export const WESTERN_GARMENT_TYPES: ReadonlySet<GarmentType> = new Set<GarmentType>(['shirt_pant', 'top', 'trousers', 'tshirt_bottom', 'jacket', 'one_piece']);

const AUDIENCE_LABELS: Record<CatalogueAudience, StoreCategory['audience']> = {
  women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls',
};

/** What a store picks from when it adds a category: every garment type Try-On and AI Video know how to render. */
export const GARMENT_TYPE_OPTIONS: Array<{ id: GarmentType; label: string }> = [
  { id: 'shirt_pant', label: 'Shirt and trousers (western)' },
  { id: 'top', label: 'Top (western)' },
  { id: 'trousers', label: 'Trousers / jeans (western)' },
  { id: 'tshirt_bottom', label: 'T-shirt and bottoms (western)' },
  { id: 'jacket', label: 'Jacket / blazer (western)' },
  { id: 'one_piece', label: 'One-piece — gown, dress or jumpsuit (western)' },
  { id: 'saree', label: 'Saree (draped)' },
  { id: 'half_saree', label: 'Half saree' },
  { id: 'salwar', label: 'Salwar / kurti set' },
  { id: 'lehenga', label: 'Lehenga' },
  { id: 'kurta_dhoti', label: 'Kurta, worn with a dhoti or veshti' },
  { id: 'dhoti_veshti', label: 'Dhoti / veshti' },
  { id: 'pattu_pavadai', label: 'Pattu pavadai (silk skirt set)' },
];

function toStoreCategory(custom: CustomCategory): StoreCategory {
  return {
    id: custom.id,
    label: custom.label,
    description: custom.label,
    subtitle: custom.label,
    audience: AUDIENCE_LABELS[custom.gender],
    gender: custom.gender,
    garmentType: custom.garmentType,
    westernTryOnEligible: custom.westernTryOnEligible,
  };
}

/** Every category an audience can have: the shared master list, then this store's own additions. */
export function allCategoriesFor(audience: CatalogueAudience, customCategories: CustomCategory[] = []): StoreCategory[] {
  const own = customCategories.filter((cat) => cat.gender === audience).map(toStoreCategory);
  return [...catalogueCategories.filter((cat) => cat.gender === audience), ...own];
}

/** One category by id, whether it's a shared master category or a store's own — for upload-time lookups. */
export function findCategory(id: string, customCategories: CustomCategory[] = []): StoreCategory | undefined {
  return catalogueCategories.find((cat) => cat.id === id)
    || customCategories.map(toStoreCategory).find((cat) => cat.id === id);
}

/** What customers see for an audience: the store's list when it set one, otherwise every category. */
export function categoriesFor(lists: StoreCategoryLists | null | undefined, audience: CatalogueAudience, customCategories: CustomCategory[] = []): StoreCategory[] {
  const all = allCategoriesFor(audience, customCategories);
  const chosen = lists?.[audience];
  if (!chosen?.length) return all;
  const picked = chosen
    .map((id) => all.find((cat) => cat.id === id))
    .filter((cat): cat is StoreCategory => Boolean(cat));
  return picked.length ? picked : all;
}

/** Keeps only real categories of the right audience, without repeats; null when an audience would be empty. */
export function sanitizeCategoryLists(value: unknown, customCategories: CustomCategory[] = []): StoreCategoryLists | null {
  if (!value || typeof value !== 'object') return null;
  const result: StoreCategoryLists = {};
  for (const audience of AUDIENCES) {
    const raw = (value as Record<string, unknown>)[audience];
    if (raw === undefined) continue;
    if (!Array.isArray(raw)) return null;
    const allowed = new Set(allCategoriesFor(audience, customCategories).map((cat) => cat.id as string));
    const ids = Array.from(new Set(raw.filter((id): id is string => typeof id === 'string' && allowed.has(id))))
      .slice(0, MAX_PER_AUDIENCE) as CatalogueCategoryId[];
    if (!ids.length) return null;
    result[audience] = ids;
  }
  return result;
}

/**
 * Whether a category is Western wear for this store: its WW switch if the store set one, otherwise the
 * category's own default. Garments uploaded into a Western wear category start on Live Try-On.
 */
export function isWesternCategory(id: string, customCategories: CustomCategory[] = [], overrides: WesternOverrides = {}): boolean {
  if (typeof overrides[id] === 'boolean') return overrides[id];
  return findCategory(id, customCategories)?.westernTryOnEligible === true;
}

/** Keeps only WW switches for categories that exist (shared or the store's own). */
export function sanitizeWesternOverrides(value: unknown, customCategories: CustomCategory[] = []): WesternOverrides | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: WesternOverrides = {};
  for (const [id, on] of Object.entries(value as Record<string, unknown>)) {
    if (typeof on !== 'boolean' || !findCategory(id, customCategories)) continue;
    result[id] = on;
  }
  return result;
}

/** A category id a store can only have made itself: not in the shared master list. */
export function isCustomCategoryId(id: string): boolean {
  return !catalogueCategories.some((cat) => cat.id === id);
}

/** Keeps only well-formed custom categories, one id each, capped so a store can't grow this without limit. */
export function sanitizeCustomCategories(value: unknown): CustomCategory[] | null {
  if (!Array.isArray(value)) return null;
  const garmentTypes = new Set(GARMENT_TYPE_OPTIONS.map((item) => item.id));
  const seen = new Set<string>();
  const result: CustomCategory[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const entry = raw as Record<string, unknown>;
    const id = String(entry.id || '').trim();
    const label = String(entry.label || '').trim().slice(0, 40);
    const gender = entry.gender;
    const garmentType = entry.garmentType;
    if (!/^custom-[a-z0-9-]{3,60}$/.test(id) || !label || !AUDIENCES.includes(gender as CatalogueAudience)
      || typeof garmentType !== 'string' || !garmentTypes.has(garmentType as GarmentType) || seen.has(id)) {
      return null;
    }
    // A custom id must never collide with the master list, or it could silently replace a real category.
    if (!isCustomCategoryId(id)) return null;
    seen.add(id);
    result.push({ id, label, gender: gender as CatalogueAudience, garmentType: garmentType as GarmentType, westernTryOnEligible: entry.westernTryOnEligible === true });
  }
  return result.slice(0, MAX_CUSTOM_CATEGORIES);
}

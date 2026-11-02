import { catalogueCategories, type CatalogueAudience, type CatalogueCategoryId } from './sample-data';

export const AUDIENCES: CatalogueAudience[] = ['women', 'men', 'boys', 'girls'];

/** The categories a store shows customers, per audience, in its own order. Missing = every category. */
export type StoreCategoryLists = Partial<Record<CatalogueAudience, CatalogueCategoryId[]>>;

export type StoreCategory = (typeof catalogueCategories)[number];

const MAX_PER_AUDIENCE = 20;

/** Every category an audience can have, in the shared South Indian popularity order. */
export function allCategoriesFor(audience: CatalogueAudience): StoreCategory[] {
  return catalogueCategories.filter((cat) => cat.gender === audience);
}

/** What customers see for an audience: the store's list when it set one, otherwise every category. */
export function categoriesFor(lists: StoreCategoryLists | null | undefined, audience: CatalogueAudience): StoreCategory[] {
  const all = allCategoriesFor(audience);
  const chosen = lists?.[audience];
  if (!chosen?.length) return all;
  const picked = chosen
    .map((id) => all.find((cat) => cat.id === id))
    .filter((cat): cat is StoreCategory => Boolean(cat));
  return picked.length ? picked : all;
}

/** Keeps only real categories of the right audience, without repeats; null when an audience would be empty. */
export function sanitizeCategoryLists(value: unknown): StoreCategoryLists | null {
  if (!value || typeof value !== 'object') return null;
  const result: StoreCategoryLists = {};
  for (const audience of AUDIENCES) {
    const raw = (value as Record<string, unknown>)[audience];
    if (raw === undefined) continue;
    if (!Array.isArray(raw)) return null;
    const allowed = new Set(allCategoriesFor(audience).map((cat) => cat.id as string));
    const ids = Array.from(new Set(raw.filter((id): id is string => typeof id === 'string' && allowed.has(id))))
      .slice(0, MAX_PER_AUDIENCE) as CatalogueCategoryId[];
    if (!ids.length) return null;
    result[audience] = ids;
  }
  return result;
}

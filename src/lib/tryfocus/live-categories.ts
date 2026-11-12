import { catalogueCategories, type CatalogueAudience, type CatalogueCategoryId } from './sample-data';

/**
 * Western Try-On (Decart Lucy, real time) only works well on fitted, western-cut garments — never a
 * draped or ethnic piece (a saree, lehenga, veshti, kurta set…). Eligibility is a property of the category
 * itself (`westernTryOnEligible` on each entry in `catalogueCategories`), not a per-store or per-garment
 * choice: a shirt is always eligible, a saree never is, so a new upload needs no manual setup to get this
 * right. A store can still switch an individual garment off despite its category being eligible.
 */
export const LIVE_CATEGORIES: Record<CatalogueAudience, Array<{ id: CatalogueCategoryId; label: string }>> =
  (['women', 'men', 'boys', 'girls'] as const).reduce((acc, audience) => {
    acc[audience] = catalogueCategories
      .filter((cat) => cat.gender === audience && cat.westernTryOnEligible)
      .map((cat) => ({ id: cat.id as CatalogueCategoryId, label: cat.label }));
    return acc;
  }, {} as Record<CatalogueAudience, Array<{ id: CatalogueCategoryId; label: string }>>);

/** Whether a category is eligible for Western Try-On at all (the category-level rule). */
export function categoryEligibleForWesternTryOn(categoryId: CatalogueCategoryId): boolean {
  return catalogueCategories.find((cat) => cat.id === categoryId)?.westernTryOnEligible === true;
}

/** Same rule the TV uses to pick Western Try-On garments: the pieces the store switched on for it. */
export function isLiveMirrorReady(item: { eligibleForLive?: boolean }) {
  return item.eligibleForLive === true;
}

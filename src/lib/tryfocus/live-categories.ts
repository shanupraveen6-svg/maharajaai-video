import type { CatalogueAudience, CatalogueCategoryId, TryFocusProduct } from './catalogue-data';

export type LiveMirrorTab = {
  id: string;
  label: string;
  items: TryFocusProduct[];
};

/**
 * Live Try-On (Decart Lucy, real time) shows only the garments the store switched on for it: per garment in
 * the Image Try-On table, or a whole category with the switch above it. Ethnic wear is never offered there.
 */
export function isLiveMirrorReady(item: { eligibleForLive?: boolean }) {
  return item.eligibleForLive === true;
}

/**
 * Interleaves items across category buckets round-robin so a customer tapping "New Arrivals"
 * sees a balanced mix of styles rather than one category back-to-back. Items carrying the
 * NEW ARRIVAL badge lead each bucket in their original order.
 */
function interleaveNewArrivals(buckets: TryFocusProduct[][], maxItems: number): TryFocusProduct[] {
  const orderedBuckets = buckets
    .filter((bucket) => bucket.length > 0)
    .map((bucket) => [
      ...bucket.filter((item) => item.badge === 'NEW ARRIVAL'),
      ...bucket.filter((item) => item.badge !== 'NEW ARRIVAL'),
    ]);
  const result: TryFocusProduct[] = [];
  const seen = new Set<string>();
  let round = 0;

  while (result.length < maxItems) {
    let addedInRound = false;
    for (const bucket of orderedBuckets) {
      const item = bucket[round];
      if (!item) continue;
      addedInRound = true;
      if (seen.has(item.sku)) continue;
      seen.add(item.sku);
      result.push(item);
      if (result.length >= maxItems) break;
    }
    if (!addedInRound) break;
    round += 1;
  }

  return result;
}

/** Groups a flat item list by category in first-seen order and interleaves round-robin. */
export function interleaveByCategory(items: TryFocusProduct[], maxItems = items.length): TryFocusProduct[] {
  const bucketsByCategory = new Map<string, TryFocusProduct[]>();
  for (const item of items) {
    const key = String(item.category || 'other');
    const bucket = bucketsByCategory.get(key);
    if (bucket) bucket.push(item);
    else bucketsByCategory.set(key, [item]);
  }
  return interleaveNewArrivals(Array.from(bucketsByCategory.values()), maxItems);
}

function buildDefaultCategoryTabs(
  audienceItems: TryFocusProduct[],
  gender: CatalogueAudience,
  categories?: Record<CatalogueAudience, Array<{ id: CatalogueCategoryId; label: string }>>,
): LiveMirrorTab[] {
  const inStock = new Set(audienceItems.map((item) => item.category as string));
  const named = (categories?.[gender] || [])
    .filter((cat) => inStock.has(cat.id as string))
    .map((cat) => ({
      id: cat.id as string,
      label: cat.label,
      items: audienceItems.filter((item) => item.category === cat.id),
    }));
  const extra = [...inStock]
    .filter((id) => !named.some((tab) => tab.id === id))
    .map((id) => ({
      id,
      label: audienceItems.find((item) => item.category === id)?.fabricNote?.split(' · ')[0] || id,
      items: audienceItems.filter((item) => item.category === id),
    }));
  return [...named, ...extra];
}

/**
 * Structures Live Try-On category tabs per audience (Western only — no ethnic wear):
 * - Men: Shirts (formal + casual), T-Shirts, Pants, plus a mixed New Arrivals tab across all Men's western categories.
 * - Women: Tops & Tees, Bottoms, Dresses, plus a mixed New Arrivals tab across all Women's western categories.
 * - Boys: Top, Bottom, plus a mixed New Arrivals tab across all Boys' western categories.
 * - Girls: Tops & Tees, Bottoms, Dresses & Sets, plus a mixed New Arrivals tab across all Girls' western categories.
 */
export function buildLiveMirrorTabs(
  items: TryFocusProduct[],
  gender: CatalogueAudience | null,
  categories?: Record<CatalogueAudience, Array<{ id: CatalogueCategoryId; label: string }>>,
): LiveMirrorTab[] {
  if (!gender) return [];
  const audienceItems = items.filter((item) => item.gender === gender);
  if (!audienceItems.length) return [];

  const defaultTabs = buildDefaultCategoryTabs(audienceItems, gender, categories);
  const allCategoryBuckets = defaultTabs.map((tab) => tab.items);

  if (gender === 'men') {
    const coreTabs: LiveMirrorTab[] = [
      {
        id: 'live-men-shirts',
        label: 'Shirts',
        items: audienceItems.filter((i) => i.category === 'formal-shirts' || i.category === 'casual-shirts' || i.category === 'shirts'),
      },
      {
        id: 'live-men-tshirts',
        label: 'T-Shirts',
        items: audienceItems.filter((i) => i.category === 'tshirts'),
      },
      {
        id: 'live-men-pants',
        label: 'Pants',
        items: audienceItems.filter((i) => i.category === 'trousers'),
      },
    ].filter((tab) => tab.items.length > 0);

    if (coreTabs.length > 0) {
      const mixed = interleaveNewArrivals(allCategoryBuckets, 40);
      return [
        ...coreTabs,
        ...(mixed.length ? [{ id: 'live-new-arrivals', label: 'New Arrivals', items: mixed }] : []),
      ];
    }
    return defaultTabs;
  }

  if (gender === 'women') {
    const coreTabs: LiveMirrorTab[] = [
      {
        id: 'live-women-tops',
        label: 'Tops & Tees',
        items: audienceItems.filter((i) => i.category === 'western-tops'),
      },
      {
        id: 'live-women-bottoms',
        label: 'Bottoms',
        items: audienceItems.filter((i) => i.category === 'women-bottoms'),
      },
      {
        id: 'live-women-dresses',
        label: 'Dresses',
        items: audienceItems.filter((i) => i.category === 'women-dresses'),
      },
    ].filter((tab) => tab.items.length > 0);

    if (coreTabs.length > 0) {
      const mixed = interleaveNewArrivals(allCategoryBuckets, 36);
      return [
        ...coreTabs,
        ...(mixed.length ? [{ id: 'live-new-arrivals', label: 'New Arrivals', items: mixed }] : []),
      ];
    }
    return defaultTabs;
  }

  if (gender === 'boys') {
    const coreTabs: LiveMirrorTab[] = [
      {
        id: 'live-boys-top',
        label: 'Top',
        items: audienceItems.filter((i) => i.category === 'boys-top'),
      },
      {
        id: 'live-boys-bottom',
        label: 'Bottom',
        items: audienceItems.filter((i) => i.category === 'boys-bottom'),
      },
    ].filter((tab) => tab.items.length > 0);

    if (coreTabs.length > 0) {
      const mixed = interleaveNewArrivals(allCategoryBuckets, 30);
      return [
        ...coreTabs,
        ...(mixed.length ? [{ id: 'live-new-arrivals', label: 'New Arrivals', items: mixed }] : []),
      ];
    }
    return defaultTabs;
  }

  if (gender === 'girls') {
    const coreTabs: LiveMirrorTab[] = [
      {
        id: 'live-girls-tops',
        label: 'Tops & Tees',
        items: audienceItems.filter((i) => i.category === 'girls-tops'),
      },
      {
        id: 'live-girls-bottoms',
        label: 'Bottoms',
        items: audienceItems.filter((i) => i.category === 'girls-bottoms'),
      },
      {
        id: 'live-girls-dresses',
        label: 'Dresses & Sets',
        items: audienceItems.filter((i) => i.category === 'girls-dresses'),
      },
    ].filter((tab) => tab.items.length > 0);

    if (coreTabs.length > 0) {
      const mixed = interleaveNewArrivals(allCategoryBuckets, 36);
      return [
        ...coreTabs,
        ...(mixed.length ? [{ id: 'live-new-arrivals', label: 'New Arrivals', items: mixed }] : []),
      ];
    }
    return defaultTabs;
  }

  return defaultTabs;
}

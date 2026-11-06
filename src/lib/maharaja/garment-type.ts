import { compatibleGarmentType, garmentTypeFromText, resolveGarmentType, type CustomerCategory, type GarmentType } from '@/lib/maharaja/config';
import { catalogueCategories } from '@/lib/tryfocus/sample-data';

/**
 * Catalogue pieces saved before the categories were corrected still carry the old default type (trousers,
 * T-shirts and blazers as "shirt", gowns and frocks as "lehenga" or "salwar"…). A piece whose stored type is
 * still that old default takes its category's corrected type; a type the store chose itself is kept.
 */
const OLD_CATEGORY_DEFAULTS: Record<string, string> = {
  'western-tops': 'shirt_pant', 'women-bottoms': 'shirt_pant', blouses: 'salwar', gowns: 'lehenga',
  trousers: 'shirt_pant', tshirts: 'shirt_pant', blazers: 'shirt_pant', 'boys-jacket': 'shirt_pant',
  'girls-frock': 'salwar', 'girls-party': 'lehenga', 'girls-pavadai': 'lehenga', 'girls-gown': 'lehenga',
  'half-sarees': 'saree', 'girls-half-saree': 'saree', angavastram: 'kurta_dhoti',
};

export function correctedGarmentType(categoryId: unknown, storedValue: unknown): string | undefined {
  const stored = typeof storedValue === 'string' ? storedValue : undefined;
  if (typeof categoryId !== 'string') return stored;
  const category = catalogueCategories.find((item) => item.id === categoryId);
  if (!category) return stored;
  if (!stored || stored === 'unset' || stored === 'generic' || stored === OLD_CATEGORY_DEFAULTS[categoryId]) return category.garmentType;
  return stored;
}

/**
 * The one garment type a Try-On or portrait uses. In order: the type the store or customer chose (an old
 * default corrected by its category), then the product title, then the staff analysis. A type the customer
 * category cannot wear becomes generic (copy the garment exactly as shown).
 */
export function garmentTypeFor(input: {
  audience: CustomerCategory;
  categoryId?: unknown;
  storedType?: unknown;
  title?: unknown;
  analysis?: string;
  roles?: string[];
}): GarmentType {
  const chosen = correctedGarmentType(input.categoryId, input.storedType);
  const fromTitle = typeof input.title === 'string' ? garmentTypeFromText(input.title) : 'generic';
  const type = chosen && chosen !== 'generic' && chosen !== 'unset'
    ? resolveGarmentType(input.audience, chosen)
    : fromTitle !== 'generic'
      ? resolveGarmentType(input.audience, fromTitle)
      : resolveGarmentType(input.audience, undefined, input.analysis, input.roles);
  return compatibleGarmentType(input.audience, type);
}

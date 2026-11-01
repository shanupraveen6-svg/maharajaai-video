import type { CatalogueAudience, CatalogueCategoryId } from './sample-data';

/** Live Mirror shows bridal and function wear only, four categories per audience (TV and client admin). */
export const LIVE_CATEGORIES: Record<CatalogueAudience, Array<{ id: CatalogueCategoryId; label: string }>> = {
  women: [{ id: 'sarees', label: 'Saree' }, { id: 'lehengas', label: 'Lehenga' }, { id: 'anarkali', label: 'Anarkali' }, { id: 'gowns', label: 'Fusion gown' }],
  men: [{ id: 'veshti', label: 'Dhoti + shirt' }, { id: 'blazers', label: 'Coat suit' }, { id: 'kurta', label: 'Kurta' }, { id: 'angavastram', label: 'Wedding sets' }],
  boys: [{ id: 'boys-veshti', label: 'Pattu veshti' }, { id: 'boys-kurta', label: 'Kurta' }, { id: 'boys-sherwani', label: 'Sherwani' }, { id: 'boys-jacket', label: 'Jacket' }],
  girls: [{ id: 'girls-pavadai', label: 'Pattu pavadai' }, { id: 'girls-lehenga', label: 'Lehenga' }, { id: 'girls-anarkali', label: 'Anarkali' }, { id: 'girls-gown', label: 'Gown' }],
};

/** Same rule the TV uses to pick Live Mirror garments: the pieces the store switched on for Live Mirror. */
export function isLiveMirrorReady(item: { eligibleForLive?: boolean }) {
  return item.eligibleForLive === true;
}

import type { TryFocusProduct } from '@/lib/tryfocus/sample-data';

/**
 * What a shopper's own outfit is, per audience. The try-on prompt needs the garment structure, so
 * every surface (TV, tablet, phone) asks this instead of guessing it from a store item.
 */
/** One garment per Try-On, so each type is a single piece. In order of what South Indian shoppers wear most. */
export const OWN_GARMENT_TYPES: Record<TryFocusProduct['gender'], Array<{ id: string; label: string }>> = {
  women: [
    { id: 'saree', label: 'Saree' },
    { id: 'salwar', label: 'Kurti / salwar' },
    { id: 'two_piece', label: 'Top' },
    { id: 'one_piece', label: 'Gown / dress' },
    { id: 'lehenga', label: 'Lehenga' },
  ],
  men: [
    { id: 'shirt_pant', label: 'Shirt' },
    { id: 'dhoti_veshti', label: 'Veshti / dhoti' },
    { id: 'kurta_dhoti', label: 'Kurta' },
  ],
  girls: [
    { id: 'one_piece', label: 'Frock / dress' },
    { id: 'pattu_pavadai', label: 'Pattu Pavadai' },
    { id: 'lehenga', label: 'Kids Lehenga' },
  ],
  boys: [
    { id: 'shirt_pant', label: 'Shirt' },
    { id: 'boy_ethnic', label: 'Kurta' },
  ],
};

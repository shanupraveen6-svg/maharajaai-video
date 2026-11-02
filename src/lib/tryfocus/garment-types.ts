import type { TryFocusProduct } from '@/lib/tryfocus/sample-data';

/**
 * What a shopper's own outfit is, per audience. The try-on prompt needs the garment structure, so
 * every surface (TV, tablet, phone) asks this instead of guessing it from a store item.
 */
/** In order of what South Indian shoppers wear most, per audience. */
export const OWN_GARMENT_TYPES: Record<TryFocusProduct['gender'], Array<{ id: string; label: string }>> = {
  women: [
    { id: 'saree', label: 'Saree / Silk Saree' },
    { id: 'salwar', label: 'Kurti / Salwar / Anarkali' },
    { id: 'two_piece', label: 'Top & Jeans / Two-Piece Set' },
    { id: 'one_piece', label: 'Gown / Dress' },
    { id: 'lehenga', label: 'Lehenga Choli' },
  ],
  men: [
    { id: 'shirt_pant', label: 'Shirt & Pant' },
    { id: 'dhoti_veshti', label: 'Veshti & Shirt' },
    { id: 'kurta_dhoti', label: 'Kurta & Dhoti / Pyjama' },
  ],
  girls: [
    { id: 'one_piece', label: 'Frock / Dress' },
    { id: 'pattu_pavadai', label: 'Pattu Pavadai' },
    { id: 'lehenga', label: 'Kids Lehenga' },
  ],
  boys: [
    { id: 'shirt_pant', label: 'Shirt & Trousers' },
    { id: 'boy_ethnic', label: 'Kurta Pyjama / Dhoti Set' },
  ],
};

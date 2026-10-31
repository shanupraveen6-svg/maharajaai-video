import type { TryFocusProduct } from '@/lib/tryfocus/sample-data';

/**
 * What a shopper's own outfit is, per audience. The try-on prompt needs the garment structure, so
 * every surface (TV, tablet, phone) asks this instead of guessing it from a store item.
 */
export const OWN_GARMENT_TYPES: Record<TryFocusProduct['gender'], Array<{ id: string; label: string }>> = {
  women: [
    { id: 'saree', label: 'Silk Saree / Saree' },
    { id: 'lehenga', label: 'Lehenga Choli' },
    { id: 'salwar', label: 'Salwar / Anarkali' },
    { id: 'one_piece', label: 'Gown / Dress' },
    { id: 'two_piece', label: 'Two-Piece Set' },
  ],
  men: [
    { id: 'kurta_dhoti', label: 'Kurta & Dhoti / Pyjama' },
    { id: 'dhoti_veshti', label: 'Traditional Veshti & Shirt' },
    { id: 'shirt_pant', label: 'Formal Shirt & Pant' },
  ],
  girls: [
    { id: 'pattu_pavadai', label: 'Pattu Pavadai' },
    { id: 'lehenga', label: 'Kids Lehenga' },
    { id: 'one_piece', label: 'Silk Frock / Dress' },
  ],
  boys: [
    { id: 'boy_ethnic', label: 'Kurta Pyjama / Dhoti Set' },
    { id: 'shirt_pant', label: 'Shirt & Trousers' },
  ],
};

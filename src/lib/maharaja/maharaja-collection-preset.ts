import type { CatalogueAudience } from '@/lib/tryfocus/catalogue-data';
import type { CustomCategory } from '@/lib/tryfocus/store-categories';

/**
 * The Maharaja catalogue setup, applied from TryFocus admin → Plan → Catalogue setup (Maharaja only).
 * Built from a photo-by-photo review of the live catalogue (13 Nov 2026): the garments it adds where a
 * category was missing or thin, the misfiled photos it moves and the gift-box flat lays it hides. Added
 * garments are studio product photos with no people (public/images/maharaja-collection).
 */

export type TrialGarment = { sku: string; title: string; gender: CatalogueAudience; category: string; price: number; image: string };

/** Kids collections now live directly in maharajaKidsCatalogue under master categories. */
export const TRIAL_CUSTOM_CATEGORIES: CustomCategory[] = [];

/** New Image Try-On garments (never on AI Video: AI Video has its own uploads). */
export const TRIAL_GARMENTS: TrialGarment[] = [
  { sku: "MAH-WOMEN-WESTERN-TOPS-1", title: "White Linen Shirt", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-1.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-2", title: "Black Peplum Top", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-2.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-3", title: "Olive Satin Top", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-3.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-4", title: "Striped Crop Top", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-4.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-5", title: "Rust Wrap Top", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-5.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-6", title: "Sky Blue Denim Shirt", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-6.jpg" },
  { sku: "MAH-WOMEN-GOWNS-1", title: "Emerald Satin Evening Gown", gender: "women", category: "gowns", price: 0, image: "/images/maharaja-collection/women-gowns-1.jpg" },
  { sku: "MAH-WOMEN-GOWNS-2", title: "Blush Pink Sequin Gown", gender: "women", category: "gowns", price: 0, image: "/images/maharaja-collection/women-gowns-2.jpg" },
  { sku: "MAH-WOMEN-LEHENGAS-1", title: "Red Bridal Lehenga", gender: "women", category: "lehengas", price: 0, image: "/images/maharaja-collection/women-lehengas-1.jpg" },
  { sku: "MAH-WOMEN-LEHENGAS-2", title: "Pastel Pink Bridal Lehenga", gender: "women", category: "lehengas", price: 0, image: "/images/maharaja-collection/women-lehengas-2.jpg" },
  { sku: "MAH-WOMEN-LEHENGAS-3", title: "Wine Velvet Lehenga", gender: "women", category: "lehengas", price: 0, image: "/images/maharaja-collection/women-lehengas-3.jpg" },
  { sku: "MAH-WOMEN-LEHENGAS-4", title: "Gold Tissue Lehenga", gender: "women", category: "lehengas", price: 0, image: "/images/maharaja-collection/women-lehengas-4.jpg" },
  { sku: "MAH-WOMEN-ANARKALI-1", title: "Maroon Embroidered Anarkali", gender: "women", category: "anarkali", price: 0, image: "/images/maharaja-collection/women-anarkali-1.jpg" },
  { sku: "MAH-WOMEN-ANARKALI-2", title: "Navy Gold Anarkali", gender: "women", category: "anarkali", price: 0, image: "/images/maharaja-collection/women-anarkali-2.jpg" },
  { sku: "MAH-WOMEN-ANARKALI-3", title: "Mint Georgette Anarkali", gender: "women", category: "anarkali", price: 0, image: "/images/maharaja-collection/women-anarkali-3.jpg" },
  { sku: "MAH-WOMEN-ANARKALI-4", title: "Peach Floral Anarkali", gender: "women", category: "anarkali", price: 0, image: "/images/maharaja-collection/women-anarkali-4.jpg" },
  { sku: "MAH-WOMEN-ANARKALI-5", title: "Black Sequin Anarkali", gender: "women", category: "anarkali", price: 0, image: "/images/maharaja-collection/women-anarkali-5.jpg" },
  { sku: "MAH-WOMEN-HALF-SAREES-1", title: "Pink and Green Half Saree", gender: "women", category: "half-sarees", price: 0, image: "/images/maharaja-collection/women-half-sarees-1.jpg" },
  { sku: "MAH-WOMEN-HALF-SAREES-2", title: "Yellow and Maroon Half Saree", gender: "women", category: "half-sarees", price: 0, image: "/images/maharaja-collection/women-half-sarees-2.jpg" },
  { sku: "MAH-WOMEN-HALF-SAREES-3", title: "Lavender Silk Half Saree", gender: "women", category: "half-sarees", price: 0, image: "/images/maharaja-collection/women-half-sarees-3.jpg" },
  { sku: "MAH-WOMEN-HALF-SAREES-4", title: "Orange Pattu Half Saree", gender: "women", category: "half-sarees", price: 0, image: "/images/maharaja-collection/women-half-sarees-4.jpg" },
  { sku: "MAH-MEN-KURTA-1", title: "Ivory Silk Kurta", gender: "men", category: "kurta", price: 0, image: "/images/maharaja-collection/men-kurta-1.jpg" },
  { sku: "MAH-MEN-KURTA-2", title: "Maroon Raw-silk Kurta", gender: "men", category: "kurta", price: 0, image: "/images/maharaja-collection/men-kurta-2.jpg" },
  { sku: "MAH-MEN-KURTA-3", title: "Navy Embroidered Kurta", gender: "men", category: "kurta", price: 0, image: "/images/maharaja-collection/men-kurta-3.jpg" },
  { sku: "MAH-MEN-KURTA-4", title: "Mustard Festive Kurta", gender: "men", category: "kurta", price: 0, image: "/images/maharaja-collection/men-kurta-4.jpg" },
  { sku: "MAH-MEN-KURTA-5", title: "Peach Linen Kurta", gender: "men", category: "kurta", price: 0, image: "/images/maharaja-collection/men-kurta-5.jpg" },
  { sku: "MAH-MEN-KURTA-6", title: "Black Chikan Kurta", gender: "men", category: "kurta", price: 0, image: "/images/maharaja-collection/men-kurta-6.jpg" },
  { sku: "MAH-MEN-SHERWANIS-1", title: "Ivory Gold Wedding Sherwani", gender: "men", category: "sherwanis", price: 0, image: "/images/maharaja-collection/men-sherwanis-1.jpg" },
  { sku: "MAH-MEN-SHERWANIS-2", title: "Royal Maroon Sherwani", gender: "men", category: "sherwanis", price: 0, image: "/images/maharaja-collection/men-sherwanis-2.jpg" },
  { sku: "MAH-MEN-SHERWANIS-3", title: "Navy Brocade Sherwani", gender: "men", category: "sherwanis", price: 0, image: "/images/maharaja-collection/men-sherwanis-3.jpg" },
  { sku: "MAH-MEN-SHERWANIS-4", title: "Champagne Sherwani", gender: "men", category: "sherwanis", price: 0, image: "/images/maharaja-collection/men-sherwanis-4.jpg" },
  { sku: "MAH-MEN-SHERWANIS-5", title: "Bottle Green Velvet Bandhgala", gender: "men", category: "sherwanis", price: 0, image: "/images/maharaja-collection/men-sherwanis-5.jpg" },
  { sku: "MAH-MEN-SHERWANIS-6", title: "Peach Zardozi Sherwani", gender: "men", category: "sherwanis", price: 0, image: "/images/maharaja-collection/men-sherwanis-6.jpg" },
];

/** Photos filed under the wrong audience or category, found in the review. */
export const TRIAL_MOVES: Array<{ sku: string; gender: CatalogueAudience; category: string; title?: string }> = [
  { sku: "MAH-CLIENT-08", gender: 'women', category: 'half-sarees', title: 'Green and Maroon Pattu Half Saree' }, // a half saree in Lehengas
  { sku: "MAH-CLIENT-02", gender: 'women', category: 'anarkali', title: 'Cream and Coral Anarkali' }, // an anarkali frock in Lehengas
];

/** Gift-box flat lays (a folded shirt and veshti in a box): two garments in one photo, not usable for Try-On. Hidden, not deleted. */
export const TRIAL_HIDE: string[] = ["MAH-9F7116-0008", "MAH-9F7116-0019", "MAH-9F7116-0020", "MAH-9F7116-0025", "MAH-9F7116-0034", "MAH-9F7116-0035", "MAH-9F7116-0037", "MAH-9F7116-0041"];

/** Existing Image Try-On garments given a better customer-facing name. If an earlier setup put them on AI Video, they come off it (the price is not used). */
export const TRIAL_VIDEO_PICKS: Array<{ sku: string; title: string; price: number }> = [
  { sku: "MAH-98F832-0004", title: "Emerald Three-piece Suit", price: 18999 },
  { sku: "MAH-98F832-0012", title: "Navy Pinstripe Suit", price: 16999 },
  { sku: "MAH-98F832-0014", title: "Wine Three-piece Suit", price: 19999 },
  { sku: "MAH-98F832-0021", title: "Black Suit with Red Tie", price: 17999 },
  { sku: "MAH-98F832-0006", title: "Charcoal Slim Suit", price: 15999 },
  { sku: "MAH-98F832-0019", title: "Midnight Navy Suit", price: 16499 },
  { sku: "MAH-98F832-0003", title: "Peach Linen Blazer", price: 8999 },
  { sku: "MAH-9F7116-0004", title: "Ivory Shirt and Gold-border Veshti", price: 4999 },
  { sku: "MAH-9F7116-0012", title: "Cream Silk Shirt and Veshti", price: 6499 },
  { sku: "MAH-9F7116-0013", title: "Lavender Silk Shirt and Veshti", price: 5999 },
  { sku: "MAH-9F7116-0026", title: "Peach Shirt and Veshti", price: 4499 },
  { sku: "MAH-9F7116-0036", title: "Black Shirt and Gold-border Veshti", price: 4999 },
  { sku: "MAH-9F7116-0044", title: "Gold Tissue Shirt and Veshti", price: 7999 },
  { sku: "MAH-CLIENT-14", title: "Green Shirt and Veshti", price: 4299 },
  { sku: "MAH-8B1C32-0001", title: "Bottle Green Formal Shirt", price: 3299 },
  { sku: "MAH-8B1C32-0003", title: "Navy Stripe-panel Shirt", price: 3499 },
  { sku: "MAH-8B1C32-0012", title: "Blue Striped Formal Shirt", price: 3199 },
  { sku: "MAH-8B1C32-0019", title: "Rust Formal Shirt", price: 3299 },
  { sku: "MAH-8B1C32-0020", title: "White Formal Shirt", price: 2999 },
  { sku: "MAH-8B1C32-0021", title: "Maroon Formal Shirt", price: 3199 },
  { sku: "MAH-8B1C32-0022", title: "Black Formal Shirt", price: 3499 },
  { sku: "MAH-CLIENT-03", title: "Purple Occasion Dress", price: 6499 },
  { sku: "MAH-CLIENT-09", title: "Rose Wedding Lehenga", price: 32999 },
  { sku: "MAH-CLIENT-21", title: "Blue Floral Occasion Dress", price: 5999 },
  { sku: "MAH-CLIENT-22", title: "Teal Long Occasion Dress", price: 6999 },
  { sku: "MAH-CLIENT-32", title: "Olive Festive Lehenga", price: 21999 },
  { sku: "MAH-CLIENT-34", title: "White Floral Occasion Dress", price: 7499 },
  { sku: "MAH-CLIENT-02", title: "Cream and Coral Anarkali", price: 6999 },
];

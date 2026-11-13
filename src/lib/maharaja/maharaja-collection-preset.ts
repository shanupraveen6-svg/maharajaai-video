import type { CatalogueAudience } from '@/lib/tryfocus/sample-data';

/**
 * The Maharaja catalogue setup, applied from TryFocus admin → Plan → Catalogue setup (Maharaja only).
 * Built from a photo-by-photo review of the live catalogue (13 Nov 2026): the garments it adds where a
 * category was missing or thin, the misfiled photos it moves and the gift-box flat lays it hides. Added
 * garments are studio product photos with no people (public/images/maharaja-collection).
 */

export type TrialGarment = { sku: string; title: string; gender: CatalogueAudience; category: string; price: number; image: string };

/** A girls' western category the master list lacks, so Girls has three Live Try-On categories. */
export const TRIAL_CUSTOM_CATEGORIES = [
  { id: 'custom-tops-jeans-girls', label: 'Tops & Jeans', gender: 'girls' as const, garmentType: 'top' as const, westernTryOnEligible: true },
];

/** New garments. A price means it is also on AI Video. */
export const TRIAL_GARMENTS: TrialGarment[] = [
  { sku: "MAH-BOYS-SHIRT-TROUSER-1", title: "Sky Blue Oxford Shirt", gender: "boys", category: "boys-shirt-trouser", price: 0, image: "/images/maharaja-collection/boys-boys-shirt-trouser-1.jpg" },
  { sku: "MAH-BOYS-SHIRT-TROUSER-2", title: "White Cotton School Shirt", gender: "boys", category: "boys-shirt-trouser", price: 0, image: "/images/maharaja-collection/boys-boys-shirt-trouser-2.jpg" },
  { sku: "MAH-BOYS-SHIRT-TROUSER-3", title: "Olive Check Shirt", gender: "boys", category: "boys-shirt-trouser", price: 0, image: "/images/maharaja-collection/boys-boys-shirt-trouser-3.jpg" },
  { sku: "MAH-BOYS-SHIRT-TROUSER-4", title: "Navy Chino Trousers", gender: "boys", category: "boys-shirt-trouser", price: 0, image: "/images/maharaja-collection/boys-boys-shirt-trouser-4.jpg" },
  { sku: "MAH-BOYS-SHIRT-TROUSER-5", title: "Grey Formal Trousers", gender: "boys", category: "boys-shirt-trouser", price: 0, image: "/images/maharaja-collection/boys-boys-shirt-trouser-5.jpg" },
  { sku: "MAH-BOYS-SHIRT-TROUSER-6", title: "Mint Striped Shirt", gender: "boys", category: "boys-shirt-trouser", price: 0, image: "/images/maharaja-collection/boys-boys-shirt-trouser-6.jpg" },
  { sku: "MAH-BOYS-CASUAL-1", title: "Red Graphic T-Shirt", gender: "boys", category: "boys-casual", price: 0, image: "/images/maharaja-collection/boys-boys-casual-1.jpg" },
  { sku: "MAH-BOYS-CASUAL-2", title: "Navy Polo T-Shirt", gender: "boys", category: "boys-casual", price: 0, image: "/images/maharaja-collection/boys-boys-casual-2.jpg" },
  { sku: "MAH-BOYS-CASUAL-3", title: "Yellow Round-neck T-Shirt", gender: "boys", category: "boys-casual", price: 0, image: "/images/maharaja-collection/boys-boys-casual-3.jpg" },
  { sku: "MAH-BOYS-CASUAL-4", title: "Grey Hooded Sweatshirt", gender: "boys", category: "boys-casual", price: 0, image: "/images/maharaja-collection/boys-boys-casual-4.jpg" },
  { sku: "MAH-BOYS-CASUAL-5", title: "Green Striped T-Shirt", gender: "boys", category: "boys-casual", price: 0, image: "/images/maharaja-collection/boys-boys-casual-5.jpg" },
  { sku: "MAH-BOYS-CASUAL-6", title: "Black Track Pants", gender: "boys", category: "boys-casual", price: 0, image: "/images/maharaja-collection/boys-boys-casual-6.jpg" },
  { sku: "MAH-BOYS-PARTY-1", title: "Navy Satin Party Shirt", gender: "boys", category: "boys-party", price: 3499, image: "/images/maharaja-collection/boys-boys-party-1.jpg" },
  { sku: "MAH-BOYS-PARTY-2", title: "Maroon Velvet Blazer", gender: "boys", category: "boys-party", price: 5999, image: "/images/maharaja-collection/boys-boys-party-2.jpg" },
  { sku: "MAH-BOYS-PARTY-3", title: "Black Party Blazer", gender: "boys", category: "boys-party", price: 5499, image: "/images/maharaja-collection/boys-boys-party-3.jpg" },
  { sku: "MAH-BOYS-PARTY-4", title: "Wine Floral Party Shirt", gender: "boys", category: "boys-party", price: 3299, image: "/images/maharaja-collection/boys-boys-party-4.jpg" },
  { sku: "MAH-BOYS-PARTY-5", title: "Grey Checked Waistcoat", gender: "boys", category: "boys-party", price: 2999, image: "/images/maharaja-collection/boys-boys-party-5.jpg" },
  { sku: "MAH-BOYS-PARTY-6", title: "Royal Blue Mandarin Shirt", gender: "boys", category: "boys-party", price: 3199, image: "/images/maharaja-collection/boys-boys-party-6.jpg" },
  { sku: "MAH-BOYS-KURTA-1", title: "Cream Silk Kurta", gender: "boys", category: "boys-kurta", price: 3499, image: "/images/maharaja-collection/boys-boys-kurta-1.jpg" },
  { sku: "MAH-BOYS-KURTA-2", title: "Mustard Cotton Kurta", gender: "boys", category: "boys-kurta", price: 2999, image: "/images/maharaja-collection/boys-boys-kurta-2.jpg" },
  { sku: "MAH-BOYS-KURTA-3", title: "Maroon Embroidered Kurta", gender: "boys", category: "boys-kurta", price: 4299, image: "/images/maharaja-collection/boys-boys-kurta-3.jpg" },
  { sku: "MAH-BOYS-KURTA-4", title: "Peacock Blue Kurta", gender: "boys", category: "boys-kurta", price: 3799, image: "/images/maharaja-collection/boys-boys-kurta-4.jpg" },
  { sku: "MAH-BOYS-KURTA-5", title: "Ivory Chikan Kurta", gender: "boys", category: "boys-kurta", price: 3999, image: "/images/maharaja-collection/boys-boys-kurta-5.jpg" },
  { sku: "MAH-BOYS-KURTA-6", title: "Saffron Festive Kurta", gender: "boys", category: "boys-kurta", price: 3599, image: "/images/maharaja-collection/boys-boys-kurta-6.jpg" },
  { sku: "MAH-BOYS-SHERWANI-1", title: "Ivory Gold Sherwani", gender: "boys", category: "boys-sherwani", price: 7499, image: "/images/maharaja-collection/boys-boys-sherwani-1.jpg" },
  { sku: "MAH-BOYS-SHERWANI-2", title: "Maroon Velvet Sherwani", gender: "boys", category: "boys-sherwani", price: 7999, image: "/images/maharaja-collection/boys-boys-sherwani-2.jpg" },
  { sku: "MAH-BOYS-SHERWANI-3", title: "Navy Embroidered Sherwani", gender: "boys", category: "boys-sherwani", price: 6999, image: "/images/maharaja-collection/boys-boys-sherwani-3.jpg" },
  { sku: "MAH-BOYS-SHERWANI-4", title: "Peach Brocade Sherwani", gender: "boys", category: "boys-sherwani", price: 6499, image: "/images/maharaja-collection/boys-boys-sherwani-4.jpg" },
  { sku: "MAH-BOYS-SHERWANI-5", title: "Bottle Green Sherwani", gender: "boys", category: "boys-sherwani", price: 6999, image: "/images/maharaja-collection/boys-boys-sherwani-5.jpg" },
  { sku: "MAH-BOYS-SHERWANI-6", title: "Royal Blue Silk Sherwani", gender: "boys", category: "boys-sherwani", price: 7299, image: "/images/maharaja-collection/boys-boys-sherwani-6.jpg" },
  { sku: "MAH-GIRLS-PARTY-1", title: "Pink Tulle Party Dress", gender: "girls", category: "girls-party", price: 3999, image: "/images/maharaja-collection/girls-girls-party-1.jpg" },
  { sku: "MAH-GIRLS-PARTY-2", title: "Lavender Sequin Party Dress", gender: "girls", category: "girls-party", price: 4499, image: "/images/maharaja-collection/girls-girls-party-2.jpg" },
  { sku: "MAH-GIRLS-PARTY-3", title: "Red Velvet Party Frock", gender: "girls", category: "girls-party", price: 3799, image: "/images/maharaja-collection/girls-girls-party-3.jpg" },
  { sku: "MAH-GIRLS-PARTY-4", title: "Sky Blue Layered Party Dress", gender: "girls", category: "girls-party", price: 4199, image: "/images/maharaja-collection/girls-girls-party-4.jpg" },
  { sku: "MAH-GIRLS-PARTY-5", title: "Gold Shimmer Party Dress", gender: "girls", category: "girls-party", price: 4799, image: "/images/maharaja-collection/girls-girls-party-5.jpg" },
  { sku: "MAH-GIRLS-PARTY-6", title: "Mint Floral Party Dress", gender: "girls", category: "girls-party", price: 3599, image: "/images/maharaja-collection/girls-girls-party-6.jpg" },
  { sku: "MAH-GIRLS-GOWN-1", title: "Peach Net Gown", gender: "girls", category: "girls-gown", price: 5499, image: "/images/maharaja-collection/girls-girls-gown-1.jpg" },
  { sku: "MAH-GIRLS-GOWN-2", title: "Royal Blue Satin Gown", gender: "girls", category: "girls-gown", price: 5999, image: "/images/maharaja-collection/girls-girls-gown-2.jpg" },
  { sku: "MAH-GIRLS-GOWN-3", title: "Ivory Lace Gown", gender: "girls", category: "girls-gown", price: 6499, image: "/images/maharaja-collection/girls-girls-gown-3.jpg" },
  { sku: "MAH-GIRLS-GOWN-4", title: "Wine Velvet Gown", gender: "girls", category: "girls-gown", price: 5799, image: "/images/maharaja-collection/girls-girls-gown-4.jpg" },
  { sku: "MAH-GIRLS-GOWN-5", title: "Lilac Flared Gown", gender: "girls", category: "girls-gown", price: 5299, image: "/images/maharaja-collection/girls-girls-gown-5.jpg" },
  { sku: "MAH-GIRLS-GOWN-6", title: "Rose Gold Sequin Gown", gender: "girls", category: "girls-gown", price: 6999, image: "/images/maharaja-collection/girls-girls-gown-6.jpg" },
  { sku: "MAH-GIRLS-TOPS-JEANS-GIRLS-1", title: "Yellow Ruffle Top", gender: "girls", category: "custom-tops-jeans-girls", price: 0, image: "/images/maharaja-collection/girls-custom-tops-jeans-girls-1.jpg" },
  { sku: "MAH-GIRLS-TOPS-JEANS-GIRLS-2", title: "Pink Graphic T-Shirt", gender: "girls", category: "custom-tops-jeans-girls", price: 0, image: "/images/maharaja-collection/girls-custom-tops-jeans-girls-2.jpg" },
  { sku: "MAH-GIRLS-TOPS-JEANS-GIRLS-3", title: "Blue Denim Jeans", gender: "girls", category: "custom-tops-jeans-girls", price: 0, image: "/images/maharaja-collection/girls-custom-tops-jeans-girls-3.jpg" },
  { sku: "MAH-GIRLS-TOPS-JEANS-GIRLS-4", title: "White Puff-sleeve Top", gender: "girls", category: "custom-tops-jeans-girls", price: 0, image: "/images/maharaja-collection/girls-custom-tops-jeans-girls-4.jpg" },
  { sku: "MAH-GIRLS-TOPS-JEANS-GIRLS-5", title: "Blue Striped Top", gender: "girls", category: "custom-tops-jeans-girls", price: 0, image: "/images/maharaja-collection/girls-custom-tops-jeans-girls-5.jpg" },
  { sku: "MAH-GIRLS-TOPS-JEANS-GIRLS-6", title: "Light Blue Jeggings", gender: "girls", category: "custom-tops-jeans-girls", price: 0, image: "/images/maharaja-collection/girls-custom-tops-jeans-girls-6.jpg" },
  { sku: "MAH-GIRLS-PAVADAI-1", title: "Magenta Gold Pattu Pavadai", gender: "girls", category: "girls-pavadai", price: 5999, image: "/images/maharaja-collection/girls-girls-pavadai-1.jpg" },
  { sku: "MAH-GIRLS-PAVADAI-2", title: "Parrot Green Pattu Pavadai", gender: "girls", category: "girls-pavadai", price: 5499, image: "/images/maharaja-collection/girls-girls-pavadai-2.jpg" },
  { sku: "MAH-GIRLS-PAVADAI-3", title: "Mango Yellow Pattu Pavadai", gender: "girls", category: "girls-pavadai", price: 5799, image: "/images/maharaja-collection/girls-girls-pavadai-3.jpg" },
  { sku: "MAH-GIRLS-PAVADAI-4", title: "Peacock Blue Pattu Pavadai", gender: "girls", category: "girls-pavadai", price: 6299, image: "/images/maharaja-collection/girls-girls-pavadai-4.jpg" },
  { sku: "MAH-GIRLS-PAVADAI-5", title: "Red Zari Pattu Pavadai", gender: "girls", category: "girls-pavadai", price: 6499, image: "/images/maharaja-collection/girls-girls-pavadai-5.jpg" },
  { sku: "MAH-GIRLS-PAVADAI-6", title: "Purple Silk Pattu Pavadai", gender: "girls", category: "girls-pavadai", price: 5999, image: "/images/maharaja-collection/girls-girls-pavadai-6.jpg" },
  { sku: "MAH-GIRLS-LEHENGA-1", title: "Pink Embroidered Kids Lehenga", gender: "girls", category: "girls-lehenga", price: 6499, image: "/images/maharaja-collection/girls-girls-lehenga-1.jpg" },
  { sku: "MAH-GIRLS-LEHENGA-2", title: "Red Festive Kids Lehenga", gender: "girls", category: "girls-lehenga", price: 7499, image: "/images/maharaja-collection/girls-girls-lehenga-2.jpg" },
  { sku: "MAH-GIRLS-LEHENGA-3", title: "Teal Mirror-work Lehenga", gender: "girls", category: "girls-lehenga", price: 6999, image: "/images/maharaja-collection/girls-girls-lehenga-3.jpg" },
  { sku: "MAH-GIRLS-LEHENGA-4", title: "Yellow Floral Lehenga", gender: "girls", category: "girls-lehenga", price: 5499, image: "/images/maharaja-collection/girls-girls-lehenga-4.jpg" },
  { sku: "MAH-GIRLS-LEHENGA-5", title: "Orange Zari Lehenga", gender: "girls", category: "girls-lehenga", price: 6799, image: "/images/maharaja-collection/girls-girls-lehenga-5.jpg" },
  { sku: "MAH-GIRLS-LEHENGA-6", title: "Lavender Net Lehenga", gender: "girls", category: "girls-lehenga", price: 5999, image: "/images/maharaja-collection/girls-girls-lehenga-6.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-1", title: "White Linen Shirt", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-1.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-2", title: "Black Peplum Top", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-2.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-3", title: "Olive Satin Top", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-3.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-4", title: "Striped Crop Top", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-4.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-5", title: "Rust Wrap Top", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-5.jpg" },
  { sku: "MAH-WOMEN-WESTERN-TOPS-6", title: "Sky Blue Denim Shirt", gender: "women", category: "western-tops", price: 0, image: "/images/maharaja-collection/women-western-tops-6.jpg" },
  { sku: "MAH-WOMEN-GOWNS-1", title: "Emerald Satin Evening Gown", gender: "women", category: "gowns", price: 8999, image: "/images/maharaja-collection/women-gowns-1.jpg" },
  { sku: "MAH-WOMEN-GOWNS-2", title: "Blush Pink Sequin Gown", gender: "women", category: "gowns", price: 11999, image: "/images/maharaja-collection/women-gowns-2.jpg" },
  { sku: "MAH-WOMEN-WOMEN-BOTTOMS-1", title: "Blue Straight Jeans", gender: "women", category: "women-bottoms", price: 0, image: "/images/maharaja-collection/women-women-bottoms-1.jpg" },
  { sku: "MAH-WOMEN-WOMEN-BOTTOMS-2", title: "Black Formal Trousers", gender: "women", category: "women-bottoms", price: 0, image: "/images/maharaja-collection/women-women-bottoms-2.jpg" },
  { sku: "MAH-WOMEN-WOMEN-BOTTOMS-3", title: "Beige Wide-leg Pants", gender: "women", category: "women-bottoms", price: 0, image: "/images/maharaja-collection/women-women-bottoms-3.jpg" },
  { sku: "MAH-WOMEN-LEHENGAS-1", title: "Red Bridal Lehenga", gender: "women", category: "lehengas", price: 42999, image: "/images/maharaja-collection/women-lehengas-1.jpg" },
  { sku: "MAH-WOMEN-LEHENGAS-2", title: "Pastel Pink Bridal Lehenga", gender: "women", category: "lehengas", price: 36999, image: "/images/maharaja-collection/women-lehengas-2.jpg" },
  { sku: "MAH-WOMEN-LEHENGAS-3", title: "Wine Velvet Lehenga", gender: "women", category: "lehengas", price: 28999, image: "/images/maharaja-collection/women-lehengas-3.jpg" },
  { sku: "MAH-WOMEN-LEHENGAS-4", title: "Gold Tissue Lehenga", gender: "women", category: "lehengas", price: 24999, image: "/images/maharaja-collection/women-lehengas-4.jpg" },
  { sku: "MAH-WOMEN-ANARKALI-1", title: "Maroon Embroidered Anarkali", gender: "women", category: "anarkali", price: 8999, image: "/images/maharaja-collection/women-anarkali-1.jpg" },
  { sku: "MAH-WOMEN-ANARKALI-2", title: "Navy Gold Anarkali", gender: "women", category: "anarkali", price: 7999, image: "/images/maharaja-collection/women-anarkali-2.jpg" },
  { sku: "MAH-WOMEN-ANARKALI-3", title: "Mint Georgette Anarkali", gender: "women", category: "anarkali", price: 6499, image: "/images/maharaja-collection/women-anarkali-3.jpg" },
  { sku: "MAH-WOMEN-ANARKALI-4", title: "Peach Floral Anarkali", gender: "women", category: "anarkali", price: 5999, image: "/images/maharaja-collection/women-anarkali-4.jpg" },
  { sku: "MAH-WOMEN-ANARKALI-5", title: "Black Sequin Anarkali", gender: "women", category: "anarkali", price: 9999, image: "/images/maharaja-collection/women-anarkali-5.jpg" },
  { sku: "MAH-WOMEN-HALF-SAREES-1", title: "Pink and Green Half Saree", gender: "women", category: "half-sarees", price: 0, image: "/images/maharaja-collection/women-half-sarees-1.jpg" },
  { sku: "MAH-WOMEN-HALF-SAREES-2", title: "Yellow and Maroon Half Saree", gender: "women", category: "half-sarees", price: 0, image: "/images/maharaja-collection/women-half-sarees-2.jpg" },
  { sku: "MAH-WOMEN-HALF-SAREES-3", title: "Lavender Silk Half Saree", gender: "women", category: "half-sarees", price: 0, image: "/images/maharaja-collection/women-half-sarees-3.jpg" },
  { sku: "MAH-WOMEN-HALF-SAREES-4", title: "Orange Pattu Half Saree", gender: "women", category: "half-sarees", price: 0, image: "/images/maharaja-collection/women-half-sarees-4.jpg" },
  { sku: "MAH-MEN-KURTA-1", title: "Ivory Silk Kurta", gender: "men", category: "kurta", price: 4999, image: "/images/maharaja-collection/men-kurta-1.jpg" },
  { sku: "MAH-MEN-KURTA-2", title: "Maroon Raw-silk Kurta", gender: "men", category: "kurta", price: 5499, image: "/images/maharaja-collection/men-kurta-2.jpg" },
  { sku: "MAH-MEN-KURTA-3", title: "Navy Embroidered Kurta", gender: "men", category: "kurta", price: 4499, image: "/images/maharaja-collection/men-kurta-3.jpg" },
  { sku: "MAH-MEN-KURTA-4", title: "Mustard Festive Kurta", gender: "men", category: "kurta", price: 3999, image: "/images/maharaja-collection/men-kurta-4.jpg" },
  { sku: "MAH-MEN-KURTA-5", title: "Peach Linen Kurta", gender: "men", category: "kurta", price: 3499, image: "/images/maharaja-collection/men-kurta-5.jpg" },
  { sku: "MAH-MEN-KURTA-6", title: "Black Chikan Kurta", gender: "men", category: "kurta", price: 4299, image: "/images/maharaja-collection/men-kurta-6.jpg" },
  { sku: "MAH-MEN-SHERWANIS-1", title: "Ivory Gold Wedding Sherwani", gender: "men", category: "sherwanis", price: 34999, image: "/images/maharaja-collection/men-sherwanis-1.jpg" },
  { sku: "MAH-MEN-SHERWANIS-2", title: "Royal Maroon Sherwani", gender: "men", category: "sherwanis", price: 29999, image: "/images/maharaja-collection/men-sherwanis-2.jpg" },
  { sku: "MAH-MEN-SHERWANIS-3", title: "Navy Brocade Sherwani", gender: "men", category: "sherwanis", price: 24999, image: "/images/maharaja-collection/men-sherwanis-3.jpg" },
  { sku: "MAH-MEN-SHERWANIS-4", title: "Champagne Sherwani", gender: "men", category: "sherwanis", price: 27999, image: "/images/maharaja-collection/men-sherwanis-4.jpg" },
  { sku: "MAH-MEN-SHERWANIS-5", title: "Bottle Green Velvet Bandhgala", gender: "men", category: "sherwanis", price: 26999, image: "/images/maharaja-collection/men-sherwanis-5.jpg" },
  { sku: "MAH-MEN-SHERWANIS-6", title: "Peach Zardozi Sherwani", gender: "men", category: "sherwanis", price: 31999, image: "/images/maharaja-collection/men-sherwanis-6.jpg" },
];

/** Photos filed under the wrong audience or category, found in the review. */
export const TRIAL_MOVES: Array<{ sku: string; gender: CatalogueAudience; category: string; title?: string }> = [
  { sku: "MAH-8B1C32-0006", gender: 'boys', category: 'boys-shirt-trouser', title: 'Black Utility Shirt' }, // a boy's shirt in Men · Formal Shirts
  { sku: "MAH-8B1C32-0007", gender: 'boys', category: 'boys-casual', title: 'Red Check Half-sleeve Shirt' }, // a kids' shirt in Men · Formal Shirts
  { sku: "MAH-8B1C32-0017", gender: 'boys', category: 'boys-casual', title: 'Red Check Casual Shirt' }, // a kids' shirt in Men · Formal Shirts
  { sku: "MAH-CLIENT-08", gender: 'women', category: 'half-sarees', title: 'Green and Maroon Pattu Half Saree' }, // a half saree in Lehengas
  { sku: "MAH-CLIENT-02", gender: 'women', category: 'anarkali', title: 'Cream and Coral Anarkali' }, // an anarkali frock in Lehengas
  { sku: "MAH-CLIENT-10", gender: 'men', category: 'sherwanis', title: 'Black Embroidered Bandhgala' }, // an embroidered bandhgala in Angavastram Sets
];

/** Gift-box flat lays (a folded shirt and veshti in a box): two garments in one photo, not usable for Try-On. Hidden, not deleted. */
export const TRIAL_HIDE: string[] = ["MAH-9F7116-0008", "MAH-9F7116-0019", "MAH-9F7116-0020", "MAH-9F7116-0025", "MAH-9F7116-0034", "MAH-9F7116-0035", "MAH-9F7116-0037", "MAH-9F7116-0041"];

/** Existing garments put on AI Video for the trial, with a customer-facing name and a price. */
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

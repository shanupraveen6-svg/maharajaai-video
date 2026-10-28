export type TryFocusProduct = {
  id: string;
  title: string;
  category: 'sarees' | 'salwar' | 'lehenga' | 'kurta' | 'veshti' | 'shirts';
  audience: 'Women' | 'Men';
  price: number;
  sku: string;
  imageUrl: string;
  accent: string;
  eligibleForVideo: boolean;
};

type CatalogueSeed = Omit<TryFocusProduct, 'id' | 'sku' | 'price'> & { basePrice: number };

const CATEGORY_SEEDS: CatalogueSeed[] = [
  {
    title: 'Kanchivaram Royal Silk', category: 'sarees', audience: 'Women', basePrice: 18900,
    imageUrl: 'https://www.pothys.com/cdn/shop/files/DSC07545.jpg?v=1772948758&width=910', accent: 'from-fuchsia-700 via-rose-900 to-amber-600', eligibleForVideo: true,
  },
  {
    title: 'Festival Salwar Set', category: 'salwar', audience: 'Women', basePrice: 4490,
    imageUrl: 'https://clothsvilla.com/cdn/shop/products/ShrijiAvadh-Samikshasilk_1_1024x.jpg?v=1698174626', accent: 'from-emerald-700 via-teal-900 to-amber-500', eligibleForVideo: true,
  },
  {
    title: 'Bridal Heritage Lehenga', category: 'lehenga', audience: 'Women', basePrice: 25900,
    imageUrl: 'https://www.mohifashion.com/cdn/shop/files/BB216155Finaln-1.jpg?v=1707977757&width=1066', accent: 'from-red-700 via-rose-950 to-amber-500', eligibleForVideo: true,
  },
  {
    title: 'South Indian Kurta Set', category: 'kurta', audience: 'Men', basePrice: 5490,
    imageUrl: '/images/hero-tryon.jpg', accent: 'from-blue-800 via-indigo-950 to-amber-500', eligibleForVideo: true,
  },
  {
    title: 'Premium Veshti Set', category: 'veshti', audience: 'Men', basePrice: 3890,
    imageUrl: '/images/hero-tryon.jpg', accent: 'from-stone-500 via-stone-900 to-amber-500', eligibleForVideo: false,
  },
  {
    title: 'Festive Linen Shirt', category: 'shirts', audience: 'Men', basePrice: 2790,
    imageUrl: '/images/hero-tryon.jpg', accent: 'from-sky-700 via-slate-900 to-amber-500', eligibleForVideo: false,
  },
];

export const catalogueCategories = [
  { id: 'sarees', label: 'Sarees', description: 'Silk, Kanchivaram & bridal drapes', audience: 'Women' },
  { id: 'salwar', label: 'Salwar', description: 'Festive suits & churidars', audience: 'Women' },
  { id: 'lehenga', label: 'Lehenga', description: 'Bridal & celebration sets', audience: 'Women' },
  { id: 'kurta', label: 'Kurta', description: 'Ethnic sets & wedding wear', audience: 'Men' },
  { id: 'veshti', label: 'Veshti', description: 'Dhoti & traditional sets', audience: 'Men' },
  { id: 'shirts', label: 'Shirts', description: 'Festive shirts & trousers', audience: 'Men' },
] as const;

export const sampleCatalogue: TryFocusProduct[] = CATEGORY_SEEDS.flatMap((seed, seedIndex) =>
  Array.from({ length: 10 }, (_, productIndex) => ({
    id: `${seed.category}-${productIndex + 1}`,
    title: `${seed.title} ${String(productIndex + 1).padStart(2, '0')}`,
    category: seed.category,
    audience: seed.audience,
    price: seed.basePrice + productIndex * (seedIndex % 2 === 0 ? 850 : 420),
    sku: `TF-${seed.category.slice(0, 3).toUpperCase()}-${String(productIndex + 1).padStart(3, '0')}`,
    imageUrl: seed.imageUrl,
    accent: seed.accent,
    eligibleForVideo: seed.eligibleForVideo || productIndex > 5,
  })),
);

export const events = [
  { id: 'diwali', label: 'Royal Diwali', note: 'Warm lamps and fireworks' },
  { id: 'wedding', label: 'Wedding Story', note: 'Heritage celebration' },
  { id: 'maharaja', label: 'Maharaja Moment', note: 'Regal palace style' },
  { id: 'new-arrival', label: 'New Arrival', note: 'Premium fashion reveal' },
] as const;

export const formatINR = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(value);

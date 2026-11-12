/**
 * What a store pays. A store picks a platform and how many credits it wants; the price is shown only as
 * a package total (credits are never priced one by one on screen).
 *  - Software is a one-time fee per platform.
 *  - Credits are pay as you go, paid upfront, valid for 6 months. Each module has a minimum and a maximum
 *    and moves in steps of 500. A platform's modules are all required (see access.ts):
 *      TV = images + AI Video + Live Mirror · Tablet = images + AI Video · Phone = images.
 *  - Credits are priced in bands: each extra credit costs less as the store buys more, so a bigger order
 *    always costs more in total. Band prices hold a 25% / 20% / 15% margin over the AI cost.
 * All amounts are in rupees, before GST.
 */
import type { PackageId } from './access';

export type Platform = 'tv' | 'tablet' | 'phone';
export type CreditModule = 'image' | 'video' | 'live';
export type Credits = Record<CreditModule, number>;

export const PLATFORMS: Platform[] = ['tv', 'tablet', 'phone'];
/** What TryFocus sells: TV or Tablet. Both include the customer's phone (Wall QR Try-On and AI Video made on
 * the phone). Phone on its own is no longer sold; 'phone' stays only so older records still read correctly. */
export const OFFERED_PLATFORMS: Platform[] = ['tv', 'tablet'];

export const PLATFORM_LABELS: Record<Platform, string> = { tv: 'TV', tablet: 'Tablet', phone: 'Phone' };

/** Before GST. Phone is its package fee, ₹20,000 including GST (see PHONE_PACKAGE). */
export const SOFTWARE_FEE: Record<Platform, number> = { tv: 80000, tablet: 50000, phone: 16949 };

/** Modules each platform includes. Every included module must be bought. */
export const PLATFORM_MODULES: Record<Platform, Record<CreditModule, boolean>> = {
  tv: { image: true, video: true, live: true },
  tablet: { image: true, video: false, live: false },
  phone: { image: true, video: false, live: false },
};

export const CREDIT_RANGE: Record<CreditModule, { min: number; max: number; step: number }> = {
  image: { min: 2000, max: 6000, step: 500 },
  video: { min: 500, max: 6000, step: 500 },
  live: { min: 500, max: 6000, step: 500 },
};

export const CREDIT_LABELS: Record<CreditModule, string> = {
  image: 'Try-On images',
  video: 'AI Videos',
  live: 'Live Mirror sessions',
};

export const CREDIT_VALIDITY_MONTHS = 6;
export const GST_RATE = 0.18;

/** Band prices per credit: [up to this many credits, price per credit]. */
const PRICE_BANDS: Record<CreditModule, Array<[number, number]>> = {
  image: [[2000, 10], [4000, 9.4], [6000, 8.9]],
  video: [[1000, 90], [3000, 84], [6000, 79]],
  live: [[1000, 76], [3000, 72], [6000, 68]],
};

/**
 * The Phone package: one ₹20,000 payment that includes 1,000 Try-Ons plus 15% for customer retries
 * (1,150 in all). Top-ups are a flat ₹10 per Try-On, at least 500 at a time.
 */
/** ₹20,000 is the full price including 18% GST: the fee before GST is ₹16,949 (+ ₹3,051 GST = ₹20,000). */
export const PHONE_PACKAGE_PRICE_INCLUDING_GST = 20000;
export const PHONE_PACKAGE = { fee: Math.round(PHONE_PACKAGE_PRICE_INCLUDING_GST / 1.18), credits: 1000, retryPercent: 15 } as const;
export const PHONE_PACKAGE_CREDITS = Math.round(PHONE_PACKAGE.credits * (1 + PHONE_PACKAGE.retryPercent / 100));
/** Phone top-ups: a flat ₹10 per Try-On, at least 500 at a time, in steps of 500 (0 = no top-up). */
export const PHONE_TOPUP_PRICE = 10;
export const PHONE_TOPUP_MIN = 500;
export const PHONE_EXTRA_RANGE = { min: 0, max: 5000, step: 500 } as const;

/** Rupees for Phone top-up credits: a flat ₹10 each. */
export function phoneTopUpTotal(count: number) {
  return Math.max(0, Math.round(count)) * PHONE_TOPUP_PRICE;
}

/** Rupees for each allowed top-up size, for the calculator. */
export function phoneExtraTotalsTable() {
  const table: Record<number, number> = {};
  for (let count = PHONE_EXTRA_RANGE.min; count <= PHONE_EXTRA_RANGE.max; count += PHONE_EXTRA_RANGE.step) table[count] = phoneTopUpTotal(count);
  return table;
}

/** A new client's free start: Try-On credits only, paid for out of TryFocus's GenLook balance. */
export const FREE_TRIAL_IMAGE_CREDITS = 60;

export type PresetId = 'standard' | 'pro' | 'premium';

/** Starting points the calculator opens on; the store can then move each slider. */
export const PRESETS: Record<PresetId, { label: string } & Credits> = {
  standard: { label: 'Standard', image: 2000, video: 500, live: 500 },
  pro: { label: 'Pro', image: 3000, video: 1000, live: 1000 },
  premium: { label: 'Premium', image: 6000, video: 2000, live: 2000 },
};

/** The pricing platform of a booked package: a TV store with a counter tablet is priced as TV. */
export function platformOfPackage(id: PackageId): Platform {
  return id === 'tv' || id === 'tv-tablet' ? 'tv' : id;
}

/** A credit count for a module on a platform: 0 where the platform has no such module, otherwise snapped to a step within range. */
export function clampCredit(platform: Platform, module: CreditModule, value: number) {
  if (!PLATFORM_MODULES[platform][module]) return 0;
  if (platform === 'phone' && module === 'image') {
    // The package's 1,150 credits, plus top-ups of at least 500, in steps of 500.
    const asked = Math.max(0, (Number(value) || 0) - PHONE_PACKAGE_CREDITS);
    // Any top-up is rounded up to the next 500, so it is never below the 500 minimum.
    const extra = asked > 0 ? Math.max(PHONE_TOPUP_MIN, Math.ceil(asked / PHONE_EXTRA_RANGE.step) * PHONE_EXTRA_RANGE.step) : 0;
    return PHONE_PACKAGE_CREDITS + Math.min(PHONE_EXTRA_RANGE.max, extra);
  }
  const { min, max, step } = CREDIT_RANGE[module];
  const number = Number.isFinite(Number(value)) ? Number(value) : min;
  const snapped = Math.round(number / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

export function clampCredits(platform: Platform, credits: Partial<Credits>): Credits {
  return {
    image: clampCredit(platform, 'image', credits.image ?? CREDIT_RANGE.image.min),
    video: clampCredit(platform, 'video', credits.video ?? CREDIT_RANGE.video.min),
    live: clampCredit(platform, 'live', credits.live ?? CREDIT_RANGE.live.min),
  };
}

/** Rupees for `count` credits of one module, priced band by band. */
export function moduleTotal(module: CreditModule, count: number) {
  let total = 0;
  let previousLimit = 0;
  for (const [limit, price] of PRICE_BANDS[module]) {
    const inBand = Math.max(0, Math.min(count, limit) - previousLimit);
    total += inBand * price;
    previousLimit = limit;
  }
  return Math.round(total);
}

/** Every allowed credit count of a module with its rupee total, for a calculator that only adds totals. */
export function moduleTotalsTable(module: CreditModule) {
  const { min, max, step } = CREDIT_RANGE[module];
  const table: Record<number, number> = {};
  for (let count = min; count <= max; count += step) table[count] = moduleTotal(module, count);
  return table;
}

export type Quote = {
  platform: Platform;
  credits: Credits;
  /** Rupees per module for the chosen credits (0 where the platform has no such module). */
  moduleTotals: Credits;
  creditsTotal: number;
  softwareFee: number;
  subtotal: number;
  gst: number;
  total: number;
};

/** The price a store pays: credits (clamped to the platform's rules) plus, for a new store, the software fee. */
export function quote(platform: Platform, credits: Partial<Credits>, { includeSoftware = true } = {}): Quote {
  const clean = clampCredits(platform, credits);
  const moduleTotals: Credits = {
    // Phone: the package's credits come with the ₹20,000; only extra credits are added.
    image: platform === 'phone' ? phoneTopUpTotal(clean.image - PHONE_PACKAGE_CREDITS) : clean.image ? moduleTotal('image', clean.image) : 0,
    video: clean.video ? moduleTotal('video', clean.video) : 0,
    live: clean.live ? moduleTotal('live', clean.live) : 0,
  };
  const creditsTotal = moduleTotals.image + moduleTotals.video + moduleTotals.live;
  const softwareFee = includeSoftware ? SOFTWARE_FEE[platform] : 0;
  const subtotal = creditsTotal + softwareFee;
  const gst = Math.round(subtotal * GST_RATE);
  return { platform, credits: clean, moduleTotals, creditsTotal, softwareFee, subtotal, gst, total: subtotal + gst };
}

/** The preset whose credits match exactly, if any. */
export function presetFor(platform: Platform, credits: Partial<Credits>): PresetId | null {
  const clean = clampCredits(platform, credits);
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const preset = clampCredits(platform, PRESETS[id]);
    if (preset.image === clean.image && preset.video === clean.video && preset.live === clean.live) return id;
  }
  return null;
}

export function formatRupees(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

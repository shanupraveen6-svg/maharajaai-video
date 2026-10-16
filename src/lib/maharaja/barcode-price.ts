export type BarcodePriceResult = {
  amount: number | null;
  source: 'json' | 'url' | 'label' | 'gs1' | 'retail-ean' | 'gemini-vision' | null;
};

const PRICE_KEYS = ['sellingprice', 'saleprice', 'mrp', 'price', 'amount', 'rate'];

// Accepts "1499", "1,499", "2,499.00", "1299.5"
const NUMBER = '([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]+)(?:\\.[0-9]{1,2})?';

function normalizeAmount(value: unknown): number | null {
  const cleaned = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(/,/g, '').replace(/[^0-9.]/g, ''))
      : Number.NaN;
  if (!Number.isFinite(cleaned) || cleaned < 1 || cleaned > 1_000_000) return null;
  return Math.round(cleaned * 100) / 100;
}

function findJsonPrice(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (PRICE_KEYS.includes(key.toLowerCase().replace(/[^a-z]/g, ''))) {
      const amount = normalizeAmount(entry);
      if (amount !== null) return amount;
    }
  }
  return null;
}

/**
 * Reads a price only when it is explicitly marked as a price.
 * A plain product barcode (e.g. EAN-13 SKU) never yields a price.
 */
export function parseBarcodePrice(rawValue: string): BarcodePriceResult {
  const raw = rawValue.trim().slice(0, 4_000);
  if (!raw) return { amount: null, source: null };

  try {
    const amount = findJsonPrice(JSON.parse(raw));
    if (amount !== null) return { amount, source: 'json' };
  } catch {
    // Not JSON.
  }

  try {
    const url = new URL(raw);
    for (const key of ['sellingPrice', 'salePrice', 'mrp', 'price', 'amount', 'rate']) {
      const amount = normalizeAmount(url.searchParams.get(key));
      if (amount !== null) return { amount, source: 'url' };
    }
  } catch {
    // Not a URL.
  }

  // "MRP 1499", "M.R.P. Rs. 2,499.00", "MRP (Incl. of all taxes) Rs.1299/-", "Price: ₹899"
  const labelled = raw.match(new RegExp(`(?:m\\s*\\.?\\s*r\\s*\\.?\\s*p\\b\\.?|\\bprice\\b|\\brate\\b)[^0-9\\n]{0,40}?${NUMBER}`, 'i'))
    // "Rs. 1499", "₹ 1,299", "INR 999"
    || raw.match(new RegExp(`(?:\\brs\\b\\.?|\\binr\\b|₹)\\s*[:\\-]?\\s*${NUMBER}`, 'i'));
  if (labelled) {
    const amount = normalizeAmount(labelled[0].slice(labelled[0].search(/[0-9]/)));
    if (amount !== null) return { amount, source: 'label' };
  }

  // GS1 price AI (392n) — only in explicit GS1 element-string form, never inside a plain EAN.
  const gs1 = raw.match(/\(392([0-3])\)([0-9]{1,15})/) || raw.match(/^01[0-9]{14}392([0-3])([0-9]{1,15})/);
  if (gs1) {
    const amount = normalizeAmount(Number(gs1[2]) / (10 ** Number(gs1[1])));
    if (amount !== null) return { amount, source: 'gs1' };
  }

  // In-store variable-price EAN-13: 2x + 5-digit item + 5-digit paise + check digit.
  if (/^2\d{12}$/.test(raw)) {
    const amount = normalizeAmount(Number(raw.slice(7, 12)) / 100);
    if (amount !== null) return { amount, source: 'retail-ean' };
  }

  return { amount: null, source: null };
}

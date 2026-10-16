export type BarcodePriceResult = {
  amount: number | null;
  source: 'json' | 'url' | 'label' | 'gs1' | 'retail-ean' | null;
};

const PRICE_KEYS = ['sellingprice', 'saleprice', 'mrp', 'price', 'amount', 'rate'];

function normalizeAmount(value: unknown): number | null {
  const cleaned = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(/[^0-9.]/g, ''))
      : Number.NaN;
  if (!Number.isFinite(cleaned) || cleaned < 1 || cleaned > 1_000_000) return null;
  return Math.round(cleaned * 100) / 100;
}

function findJsonPrice(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (PRICE_KEYS.includes(normalizedKey)) {
      const amount = normalizeAmount(entry);
      if (amount !== null) return amount;
    }
  }
  return null;
}

export function parseBarcodePrice(rawValue: string): BarcodePriceResult {
  const raw = rawValue.trim().slice(0, 512);
  if (!raw) return { amount: null, source: null };

  try {
    const amount = findJsonPrice(JSON.parse(raw));
    if (amount !== null) return { amount, source: 'json' };
  } catch {
    // Non-JSON barcode.
  }

  try {
    const url = new URL(raw);
    for (const key of ['sellingPrice', 'salePrice', 'mrp', 'price', 'amount', 'rate']) {
      const amount = normalizeAmount(url.searchParams.get(key));
      if (amount !== null) return { amount, source: 'url' };
    }
  } catch {
    // Non-URL barcode.
  }

  const labelled = raw.match(/(?:selling\s*price|sale\s*price|m\s*\.?\s*r\s*\.?\s*p\s*\.?|price|amount|rate)\s*[:=\-]?\s*(?:inr|rs\.?|₹)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i)
    || raw.match(/(?:inr|rs\.?|₹)\s*[:=\-]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  if (labelled) {
    const amount = normalizeAmount(labelled[1]);
    if (amount !== null) return { amount, source: 'label' };
  }

  // GS1 AI 392n stores a price where n is the implied decimal count.
  const gs1 = raw.match(/(?:\(392([0-3])\)|392([0-3]))([0-9]{1,15})/);
  if (gs1) {
    const decimals = Number(gs1[1] || gs1[2] || 0);
    const amount = normalizeAmount(Number(gs1[3]) / (10 ** decimals));
    if (amount !== null) return { amount, source: 'gs1' };
  }

  // Common in-store variable-price EAN-13 layout: 2x + 5-digit item + 5-digit paise + check digit.
  if (/^2\d{12}$/.test(raw)) {
    const amount = normalizeAmount(Number(raw.slice(7, 12)) / 100);
    if (amount !== null) return { amount, source: 'retail-ean' };
  }

  return { amount: null, source: null };
}

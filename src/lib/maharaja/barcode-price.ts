export type BarcodePriceResult = {
  amount: number | null;
  source: 'json' | 'url' | 'label' | 'gs1' | 'retail-ean' | 'sku-delimiter' | 'numeric' | null;
};

const PRICE_KEYS = ['sellingprice', 'saleprice', 'mrp', 'price', 'amount', 'rate', 'netmrp', 'maxretailprice'];

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
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (PRICE_KEYS.includes(normalizedKey)) {
      const amount = normalizeAmount(entry);
      if (amount !== null) return amount;
    }
  }
  return null;
}

export function parseBarcodePrice(rawValue: string): BarcodePriceResult {
  const raw = rawValue.trim().slice(0, 1024);
  if (!raw) return { amount: null, source: null };

  // 1. JSON Barcode Payload
  try {
    const amount = findJsonPrice(JSON.parse(raw));
    if (amount !== null) return { amount, source: 'json' };
  } catch {
    // Non-JSON barcode.
  }

  // 2. URL Query Params (e.g. ?mrp=1499 or ?price=999)
  try {
    const url = new URL(raw);
    for (const key of ['sellingPrice', 'salePrice', 'mrp', 'price', 'amount', 'rate', 'sp', 'netPrice']) {
      const amount = normalizeAmount(url.searchParams.get(key));
      if (amount !== null) return { amount, source: 'url' };
    }
  } catch {
    // Non-URL barcode.
  }

  // 3. Indian Retail Label Patterns (MRP, Price, Net MRP, Rate, Rs, ₹)
  // Handles: "MRP: ₹1499", "M.R.P. Rs. 2,499.00", "MRP: 1499/-", "NET MRP: 850", "PRICE ₹1299"
  const labelled = raw.match(
    /(?:m\s*\.?\s*r\s*\.?\s*p\s*\.?|max(?:\.|\s+retail)?\s*price|selling\s*price|sale\s*price|net\s*mrp|price|amount|rate|s\.?\s*p\.?)\s*(?:\(?[^)\n\r]*\)?\s*)?[:=\-]?\s*(?:inr|rs\.?|₹)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i
  )
  || raw.match(/(?:inr|rs\.?|₹)\s*[:=\-]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i)
  || raw.match(/([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:\/-|\s*inr|\s*rs\.?|\s*₹)/i);

  if (labelled) {
    const amount = normalizeAmount(labelled[1]);
    if (amount !== null && amount >= 50 && amount <= 500000) return { amount, source: 'label' };
  }

  // 4. GS1 AI (392n / 393n / 390n) Variable Price
  const gs1 = raw.match(/(?:\(392([0-3])\)|392([0-3]))([0-9]{1,15})/);
  if (gs1) {
    const decimals = Number(gs1[1] || gs1[2] || 0);
    const amount = normalizeAmount(Number(gs1[3]) / (10 ** decimals));
    if (amount !== null) return { amount, source: 'gs1' };
  }

  // 5. In-Store Variable-Price EAN-13 (20-29 prefix layout: 2x + item + paise)
  if (/^2\d{12}$/.test(raw)) {
    const amount = normalizeAmount(Number(raw.slice(7, 12)) / 100);
    if (amount !== null && amount >= 50) return { amount, source: 'retail-ean' };
  }

  // 6. Garment SKU Delimited with Price (e.g. "MAH-1499", "MHA_DIW_2499", "SAREE/799", "ITEM-1299-XL")
  const delimited = raw.match(/[_\-/:]([1-9][0-9]{2,4})(?:[_\-/:A-Za-z]|$)/);
  if (delimited) {
    const amount = normalizeAmount(delimited[1]);
    if (amount !== null && amount >= 100 && amount <= 100000) {
      return { amount, source: 'sku-delimiter' };
    }
  }

  // 7. Suffix Embedded Price in Retail Barcode (e.g. 890...01499 where last 4-5 digits represent MRP)
  if (/^\d{8,16}$/.test(raw)) {
    const last5 = Number(raw.slice(-5));
    if (last5 >= 100 && last5 <= 50000 && last5 % 10 === 0) {
      return { amount: last5, source: 'retail-ean' };
    }
  }

  // 8. Pure Numeric String (e.g. manual input or barcode that is purely the price: "1499")
  if (/^\d{3,5}(?:\.\d{1,2})?$/.test(raw)) {
    const amount = normalizeAmount(raw);
    if (amount !== null && amount >= 100 && amount <= 200000) {
      return { amount, source: 'numeric' };
    }
  }

  return { amount: null, source: null };
}

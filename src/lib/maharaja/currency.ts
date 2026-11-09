/**
 * Rupees per dollar, read once per call so `USD_TO_INR` can be set in the environment (default 98: about
 * ₹94 plus a ₹4 buffer). Kept dependency-free so both usage-ledger.ts and api-ledger.ts can import it
 * without creating a circular import between them.
 */
function rate() {
  const value = Number(process.env.USD_TO_INR);
  return Number.isFinite(value) && value > 0 ? value : 98;
}

export function usdToInr(usd: number) {
  return usd * rate();
}

export function inrToUsd(inr: number) {
  return inr / rate();
}

import 'server-only';
import { usdToInr } from './usage-ledger';
import { type Credits, type Quote, PHONE_PACKAGE, PHONE_PACKAGE_CREDITS } from './pricing';

/**
 * Our AI cost behind each credit, for TryFocus admin only (never sent to a store's screens). Each figure is
 * the average of the primary and backup engines, because engines switch automatically when one fails,
 * plus the retries a customer may take (about 15% of results).
 *  - Try-On image: GenLook, fal, FASHN and Gemini averaged.
 *  - AI Video: the portrait (Gemini on fal, Gemini direct) plus a 6-second render (H3 Max at $0.48 with
 *    the Gemini Omni Flash backup at $0.60).
 *  - Live Try-On: one 30-second session on Decart Lucy (billed per second; no retry).
 * Rupees use USD_TO_INR (98: about ₹94 plus a ₹4 buffer), so the profit shown is on the safe side.
 */
const PLANNING_COST_USD = {
  image: 0.068,
  videoPortrait: 0.0735,
  videoRender: 0.54,
  live: 0.6,
} as const;

export const RETRY_ALLOWANCE = 0.15;

export function unitCostInr(): Credits {
  return {
    image: usdToInr(PLANNING_COST_USD.image) * (1 + RETRY_ALLOWANCE),
    video: usdToInr(PLANNING_COST_USD.videoPortrait + PLANNING_COST_USD.videoRender) * (1 + RETRY_ALLOWANCE),
    live: usdToInr(PLANNING_COST_USD.live),
  };
}

export type QuoteMargin = { aiCost: number; creditProfit: number; creditMargin: number; softwareFee: number };

/** AI cost and profit of a quote if the store uses every credit (unused credits only add profit). */
export function quoteMargin(value: Quote): QuoteMargin {
  const unit = unitCostInr();
  if (value.platform === 'phone') {
    // Phone: the ₹20,000 package pays for its 1,000 Try-Ons (the 15% retries are already in the unit cost);
    // extra credits are priced on top.
    const extra = Math.max(0, value.credits.image - PHONE_PACKAGE_CREDITS);
    const aiCost = Math.round((PHONE_PACKAGE.credits + extra) * unit.image);
    const revenue = PHONE_PACKAGE.fee + value.creditsTotal;
    const creditProfit = revenue - aiCost;
    return { aiCost, creditProfit, creditMargin: creditProfit / revenue, softwareFee: value.softwareFee };
  }
  const aiCost = Math.round(value.credits.image * unit.image + value.credits.video * unit.video + value.credits.live * unit.live);
  const creditProfit = value.creditsTotal - aiCost;
  return {
    aiCost,
    creditProfit,
    creditMargin: value.creditsTotal > 0 ? creditProfit / value.creditsTotal : 0,
    softwareFee: value.softwareFee,
  };
}

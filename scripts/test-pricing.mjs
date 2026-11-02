import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.USD_TO_INR = '98';
for (const key of ['AI_COST_TRY_ON_USD', 'AI_COST_VIDEO_PORTRAIT_USD', 'AI_COST_VIDEO_RENDER_USD', 'AI_COST_LIVE_SESSION_USD']) delete process.env[key];

const {
  CREDIT_RANGE, PRESETS, SOFTWARE_FEE, clampCredits, moduleTotal, moduleTotalsTable, platformOfPackage, presetFor, quote,
} = await import('../src/lib/maharaja/pricing.ts');
const { quoteMargin, unitCostInr } = await import('../src/lib/maharaja/pricing-costs.ts');

// Software, one time per platform.
assert.deepEqual(SOFTWARE_FEE, { tv: 80000, tablet: 50000, phone: 20000 });

// Minimums and maximums: images 2,000, AI Video 500, Live Mirror 500; up to 6,000 in steps of 500.
assert.deepEqual(CREDIT_RANGE.image, { min: 2000, max: 6000, step: 500 });
assert.deepEqual(clampCredits('tv', { image: 100, video: 0, live: 99999 }), { image: 2000, video: 500, live: 6000 });
assert.deepEqual(clampCredits('tv', { image: 2740, video: 760, live: 1240 }), { image: 2500, video: 1000, live: 1000 }, 'Snaps to steps of 500');
// Every module a platform includes is required; the others are 0.
assert.deepEqual(clampCredits('tablet', { image: 3000, video: 0, live: 2000 }), { image: 3000, video: 500, live: 0 });
assert.deepEqual(clampCredits('phone', { image: 3150, video: 2000, live: 2000 }), { image: 3150, video: 0, live: 0 }, 'Phone has no AI Video');

// Banded totals: the first 2,000 images at ₹10, the next 2,000 at ₹9.4, the rest at ₹8.9.
assert.equal(moduleTotal('image', 2000), 20000);
assert.equal(moduleTotal('image', 3000), 29400);
assert.equal(moduleTotal('image', 6000), 56600);
assert.equal(moduleTotal('video', 500), 45000);
assert.equal(moduleTotal('video', 2000), 174000);
assert.equal(moduleTotal('live', 500), 38000);
assert.equal(moduleTotal('live', 6000), 424000);

// Buying more always costs more in total, and never more per credit.
for (const module of ['image', 'video', 'live']) {
  const table = moduleTotalsTable(module);
  const counts = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < counts.length; i++) {
    assert.ok(table[counts[i]] > table[counts[i - 1]], `${module} total rises`);
    assert.ok(table[counts[i]] / counts[i] <= table[counts[i - 1]] / counts[i - 1] + 1e-9, `${module} per-credit price never rises`);
  }
}

// The starting packages, as the report states them.
const standardTv = quote('tv', PRESETS.standard, { includeSoftware: false });
assert.equal(standardTv.creditsTotal, 103000);
assert.equal(quote('tablet', PRESETS.standard, { includeSoftware: false }).creditsTotal, 65000);

assert.equal(quote('tv', PRESETS.pro, { includeSoftware: false }).creditsTotal, 195400);
assert.equal(quote('tablet', PRESETS.pro, { includeSoftware: false }).creditsTotal, 119400);

assert.equal(quote('tv', PRESETS.premium, { includeSoftware: false }).creditsTotal, 378600);
assert.equal(quote('tablet', PRESETS.premium, { includeSoftware: false }).creditsTotal, 230600);


// First payment for a TV store: software + Standard + 18% GST.
const firstTv = quote('tv', PRESETS.standard);
assert.equal(firstTv.softwareFee, 80000);
assert.equal(firstTv.subtotal, 183000);
assert.equal(firstTv.gst, 32940);
assert.equal(firstTv.total, 215940);

assert.equal(presetFor('tv', { image: 3000, video: 1000, live: 1000 }), 'pro');
assert.equal(presetFor('phone', { image: 6000, video: 2000, live: 2000 }), 'premium', 'Phone matches on images alone');
assert.equal(presetFor('tv', { image: 6000, video: 500, live: 500 }), null);
assert.equal(platformOfPackage('tv-tablet'), 'tv');

// Our cost per credit at the planning rate (₹98 = about ₹94 plus a ₹4 buffer), engines averaged, 15% retries.
const unit = unitCostInr();
assert.ok(Math.abs(unit.image - 7.66) < 0.01, `image cost ${unit.image}`);
assert.ok(Math.abs(unit.video - 69.14) < 0.05, `video cost ${unit.video}`);
assert.ok(Math.abs(unit.live - 58.8) < 0.01, `live cost ${unit.live}`);
const margin = quoteMargin(standardTv);
assert.ok(margin.creditMargin > 0.22 && margin.creditMargin < 0.24, `Standard TV margin at ₹98 ${margin.creditMargin}`);
// Every calculator choice keeps at least 15% at the real rate (₹94), and over 12% even with the ₹4 buffer.
const everyChoice = () => {
  let lowest = 1;
  for (const platform of ['tv', 'tablet', 'phone']) {
    for (let image = 2000; image <= 6000; image += 500) {
      for (const extra of [500, 3000, 6000]) {
        lowest = Math.min(lowest, quoteMargin(quote(platform, { image, video: extra, live: extra }, { includeSoftware: false })).creditMargin);
      }
    }
  }
  return lowest;
};
assert.ok(everyChoice() >= 0.12, `lowest margin at ₹98 ${everyChoice()}`);
process.env.USD_TO_INR = '94';
assert.ok(everyChoice() >= 0.15, `lowest margin at ₹94 ${everyChoice()}`);
process.env.USD_TO_INR = '98';

console.log('pricing: all checks passed');

// Phone package: ₹20,000 includes 1,000 Try-On credits + 15% retries (1,150); extra credits in 500s, pay as you go.
{
  const pricing = await import('../src/lib/maharaja/pricing.ts');
  assert.equal(pricing.PHONE_PACKAGE_CREDITS, 1150);
  const base = pricing.quote('phone', { image: pricing.PHONE_PACKAGE_CREDITS });
  assert.equal(base.softwareFee, 20000);
  assert.equal(base.creditsTotal, 0, 'The package credits come with the ₹20,000');
  assert.equal(pricing.clampCredits('phone', { image: 100 }).image, 1150, 'Phone never goes below the package');
  const extra = pricing.quote('phone', { image: 1150 + 500 });
  assert.equal(extra.credits.image, 1650);
  assert.equal(extra.creditsTotal, pricing.moduleTotal('image', 500), 'Extra credits are priced at the Try-On rate');
  console.log('✓ Phone package: ₹20,000 with 1,150 Try-On credits, extras pay as you go');
}

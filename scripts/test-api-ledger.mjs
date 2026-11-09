import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const apiLedger = await import('../src/lib/maharaja/api-ledger.ts');
const usageLedger = await import('../src/lib/maharaja/usage-ledger.ts');
const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');

// Nothing logged yet: purchased, used and free all read as zero.
for (const provider of apiLedger.API_PROVIDERS) {
  const { topUps, totalPurchasedUsd, usedUsd } = await apiLedger.getApiLedger(provider);
  assert.deepEqual(topUps, []);
  assert.equal(totalPurchasedUsd, 0);
  assert.equal(usedUsd, 0);
}

// Admin logs what was actually paid to fal: $50, then another $20.
const entry = await apiLedger.addApiTopUp('fal', { amount: 50, currency: 'usd', note: 'Nov top-up' });
assert.equal(entry.usd, 50);
assert.equal(entry.enteredAmount, 50);
assert.equal(entry.enteredCurrency, 'usd');
await apiLedger.addApiTopUp('fal', { amount: 20, currency: 'usd' });
assert.equal((await apiLedger.getApiLedger('fal')).totalPurchasedUsd, 70);
assert.equal(await apiLedger.cachedTotalPurchasedUsd('fal'), 70, 'A fresh top-up is usable at once, not after the 30s cache.');

// Gemini is often paid in rupees: ₹4,900 at the test's ₹98/$1 default converts to exactly $50.
process.env.USD_TO_INR = '98';
const inrEntry = await apiLedger.addApiTopUp('gemini', { amount: 4900, currency: 'inr', note: 'Google Cloud India' });
assert.equal(inrEntry.enteredAmount, 4900);
assert.equal(inrEntry.enteredCurrency, 'inr');
assert.equal(inrEntry.usd, 50, '₹4,900 at ₹98/$1 is exactly $50, which is what Purchased/Used/Free compare in.');
assert.equal((await apiLedger.getApiLedger('gemini')).totalPurchasedUsd, 50);

// FASHN stays untouched by fal's and Gemini's top-ups.
assert.equal((await apiLedger.getApiLedger('fashn')).totalPurchasedUsd, 0);

// recordAiCost attributes spend to the vendor that actually served the call, not a generic bucket.
// video-render and live-session always run through fal, whichever video model was used.
await runWithClient('api-ledger-store', async () => {
  await usageLedger.recordAiCost('video-render', 0.4, 'fal');
  await usageLedger.recordAiCost('live-session', 0.6, 'fal');
  // A Try-On that actually succeeded on Gemini must bill Gemini, not fal or GenLook.
  await usageLedger.recordAiCost('try-on', 0.07, 'gemini');
  // GenLook already tracks its own usage in credits elsewhere: passing 'genlook' here must not add
  // a dollar figure to any vendor's lifetime spend.
  await usageLedger.recordAiCost('try-on', 0.07, 'genlook');
});

assert.equal((await apiLedger.getApiLedger('fal')).usedUsd, 1.0, '0.4 (video) + 0.6 (live) = 1.00, both attributed to fal.');
assert.equal((await apiLedger.getApiLedger('gemini')).usedUsd, 0.07);
assert.equal((await apiLedger.getApiLedger('fashn')).usedUsd, 0, 'FASHN was never the serving vendor, so it stays at zero.');

const falLedger = await apiLedger.getApiLedger('fal');
assert.equal(falLedger.totalPurchasedUsd - falLedger.usedUsd, 69, '70 purchased minus 1.00 used = 69 free.');
const geminiLedger = await apiLedger.getApiLedger('gemini');
assert.equal(Math.round((geminiLedger.totalPurchasedUsd - geminiLedger.usedUsd) * 100) / 100, 49.93, 'The ₹-entered 50 purchased minus 0.07 used = 49.93 free, same as if it had been entered in dollars.');

// A correction (a refund) lowers the running total the same way a top-up raises it.
await apiLedger.addApiTopUp('fal', { amount: -10, currency: 'usd', note: 'refund' });
assert.equal((await apiLedger.getApiLedger('fal')).totalPurchasedUsd, 60);

// A $0 top-up is refused: it would silently do nothing.
await assert.rejects(() => apiLedger.addApiTopUp('fal', { amount: 0, currency: 'usd' }));

console.log('API ledger: top-ups, corrections, and cost attribution to the vendor that actually served each call, all passed.');

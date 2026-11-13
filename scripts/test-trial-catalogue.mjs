import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');
const trial = await import('../src/lib/maharaja/trial-catalogue.ts');
const catalogue = await import('../src/lib/maharaja/catalogue.ts');
const categories = await import('../src/lib/tryfocus/store-categories.ts');

await runWithClient('maharaja', async () => {
  const plan = await trial.planTrialCatalogue();
  for (const row of plan.audiences) {
    for (const piece of row.live) assert.ok(categories.isWesternCategory(piece.category), `${piece.title} is not ethnic wear`);
    assert.ok(new Set(row.live.map((piece) => piece.category)).size <= 5, `${row.audience}: at most 5 Live Try-On categories`);
    assert.ok(row.videoCategories.length <= 5, `${row.audience}: at most 5 AI Video categories`);
    for (const piece of row.videoAdded) {
      assert.ok(piece.price >= 2999 && piece.price % 100 === 99, `${piece.title}: premium price ending in 99 (${piece.price})`);
    }
    for (const cat of row.videoCategories) assert.ok(row.videoAdded.filter((p) => p.category === cat.id).length <= 5, 'at most 5 new per category');
  }
  const women = plan.audiences.find((row) => row.audience === 'women');
  assert.ok(women.videoAdded.some((piece) => piece.category !== 'sarees'), 'Women get more than sarees on AI Video');
  assert.equal(trial.trialPriceFor('ABC', 'sarees'), trial.trialPriceFor('ABC', 'sarees'), 'Same garment, same price');
  assert.ok(trial.trialPriceFor('ABC', 'girls-lehenga', 'girls') <= 7999, 'Kids pieces stay under ₹8,000');


  await trial.applyTrialCatalogue(plan, 'maharaja');
  const again = await trial.planTrialCatalogue();
  assert.equal(again.liveOn.length + again.liveOff.length, 0, 'Applying twice changes nothing more');
  assert.equal(again.moves.length, 0, 'Wrong-audience garments were moved');
  const records = await catalogue.loadAllCatalogueRecords(false);
  assert.equal(records.filter((item) => item.eligibleForLive && item.category === 'sarees').length, 0, 'No saree on Live Try-On');
  for (const row of plan.audiences) {
    for (const id of new Set(row.live.map((p) => p.category))) {
      const inCategory = records.filter((item) => item.gender === row.audience && item.category === id);
      assert.ok(inCategory.every((item) => item.eligibleForLive), `Every ${row.audience} garment in ${id} is on Live Try-On`);
    }
  }
  for (const pick of plan.audiences.flatMap((row) => row.videoAdded)) {
    const saved = records.find((item) => item.sku === pick.sku);
    assert.equal(saved.eligibleForVideo, true);
    assert.equal(saved.price, pick.price);
  }
});
console.log('trial catalogue: all checks passed');

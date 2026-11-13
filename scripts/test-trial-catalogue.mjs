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
const { TRIAL_CUSTOM_CATEGORIES } = await import('../src/lib/maharaja/maharaja-collection-preset.ts');

await runWithClient('maharaja', async () => {
  const plan = await trial.planTrialCatalogue('maharaja');
  for (const row of plan.audiences) {
    for (const piece of row.live) assert.ok(categories.isWesternCategory(piece.category, TRIAL_CUSTOM_CATEGORIES), `${piece.title} is not ethnic wear`);
    assert.ok(new Set(row.live.map((piece) => piece.category)).size <= 5, `${row.audience}: at most 5 Live Try-On categories`);
    assert.ok(row.videoCategories.length <= 5, `${row.audience}: at most 5 AI Video categories`);
    assert.equal(row.videoAdded.length, 0, `${row.audience}: setup never adds AI Video pieces`);
  }
  // AI Video is its own catalogue: no Image Try-On garment is on it, and the new garments are Image Try-On only.
  for (const row of plan.audiences) for (const piece of row.videoKept) assert.ok(!piece.sku.startsWith('MAH-BOYS') && !piece.sku.startsWith('MAH-GIRLS'), 'no added garment on AI Video');
  assert.ok(plan.add.every((garment) => garment.price === 0), 'added garments carry no AI Video price');

  await trial.applyTrialCatalogue(plan, 'maharaja');
  const again = await trial.planTrialCatalogue('maharaja');
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
  for (const garment of plan.add) {
    const saved = records.find((item) => item.sku === garment.sku);
    assert.equal(saved.eligibleForVideo, false, `${garment.title} is Image Try-On only`);
    assert.equal(saved.price, 0);
  }
});
console.log('trial catalogue: all checks passed');

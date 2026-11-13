import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');
const catalogue = await import('../src/lib/maharaja/catalogue.ts');
const categories = await import('../src/lib/tryfocus/store-categories.ts');

// Western wear follows the category: shared defaults, the store's WW switch, and its own categories.
const custom = categories.sanitizeCustomCategories([
  { id: 'custom-jumpsuits-1a2b3c', label: 'Jumpsuits', gender: 'women', garmentType: 'one_piece', westernTryOnEligible: true },
  { id: 'custom-pattu-set-1a2b3c', label: 'Pattu Set', gender: 'girls', garmentType: 'pattu_pavadai', westernTryOnEligible: false },
]);
assert.equal(categories.isWesternCategory('formal-shirts'), true, 'Shirts are Western wear by default');
assert.equal(categories.isWesternCategory('sarees'), false, 'Sarees never are by default');
assert.equal(categories.isWesternCategory('sarees', [], { sarees: true }), true, 'The store’s WW switch wins');
assert.equal(categories.isWesternCategory('formal-shirts', [], { 'formal-shirts': false }), false);
assert.equal(categories.isWesternCategory('custom-jumpsuits-1a2b3c', custom), true, 'A store category carries its own Western wear');
assert.equal(categories.isWesternCategory('custom-pattu-set-1a2b3c', custom), false);
assert.ok(categories.WESTERN_GARMENT_TYPES.has('one_piece') && !categories.WESTERN_GARMENT_TYPES.has('saree'), 'Jumpsuit-type garments start as Western wear, sarees do not');
// AI Video keeps its own short list, independent of Try-On's.
const videoLists = categories.sanitizeCategoryLists({ women: ['sarees', 'lehengas'] }, custom);
assert.deepEqual(videoLists, { women: ['sarees', 'lehengas'] });
assert.deepEqual(categories.categoriesFor(videoLists, 'women', custom).map((cat) => cat.id), ['sarees', 'lehengas']);
assert.ok(categories.categoriesFor({}, 'women', custom).length > 2, 'Try-On keeps every category when it has no list');
assert.deepEqual(categories.sanitizeWesternOverrides({ sarees: true, 'custom-jumpsuits-1a2b3c': false, nonsense: true, kurtis: 'yes' }, custom), { sarees: true, 'custom-jumpsuits-1a2b3c': false }, 'Only real categories and true/false survive');

await runWithClient('catalogue-mgmt-store', async () => {
  // A garment in the store's own category is stored in that category, not turned into a saree.
  const saved = await catalogue.upsertCatalogueProduct({
    sku: 'MGMT-1', title: 'Black Jumpsuit', price: 3999, category: 'custom-jumpsuits-1a2b3c', gender: 'women',
    garmentType: 'one_piece', fabricNote: 'Jumpsuits · Store catalogue', imageUrl: '/images/x.jpg', eligibleForLive: true,
  });
  assert.equal(saved.category, 'custom-jumpsuits-1a2b3c', 'Custom category kept');
  assert.equal(saved.garmentType, 'one_piece');
  assert.equal(saved.gender, 'women');

  await catalogue.upsertCatalogueProduct({ sku: 'MGMT-2', title: 'Blue Shirt', price: 0, category: 'formal-shirts', gender: 'men', imageUrl: '/images/y.jpg' });
  await catalogue.upsertCatalogueProduct({ sku: 'MGMT-3', title: 'Silk Saree', price: 25000, category: 'sarees', gender: 'women', imageUrl: '/images/z.jpg' });

  // Tags, hide and Live Try-On on many garments at once; unknown SKUs are ignored, never half-created.
  assert.equal(await catalogue.bulkUpdateCatalogueFlags(['MGMT-1', 'MGMT-2', 'NOT-THERE'], { trending: true, newArrival: true }), 2);
  let records = await catalogue.loadAllCatalogueRecords(true);
  const one = records.find((item) => item.sku === 'MGMT-1');
  assert.equal(one.trending, true);
  assert.equal(one.newArrival, true);
  assert.equal(one.badge, 'NEW ARRIVAL', 'New arrival keeps the badge the TV filters on');
  assert.equal(records.some((item) => item.sku === 'NOT-THERE'), false);

  await catalogue.bulkUpdateCatalogueFlags(['MGMT-3'], { active: false });
  const visible = await catalogue.listCatalogueProducts(0, 100);
  assert.equal(visible.products.some((item) => item.sku === 'MGMT-3'), false, 'Hidden garments leave the customer catalogue');
  const everything = await catalogue.listCatalogueProducts(0, 100, { includeInactive: true });
  assert.equal(everything.products.some((item) => item.sku === 'MGMT-3'), true, 'but stay in the workspace');

  // The same photo is found again by its fingerprint, so it is never saved twice.
  const hash = 'a'.repeat(64);
  await catalogue.upsertCatalogueProduct({ sku: 'MGMT-4', title: 'Red Gown', price: 9000, category: 'gowns', gender: 'women', imageUrl: '/images/g.jpg', photoHash: hash, eligibleForVideo: true });
  const twin = await catalogue.findCatalogueByPhotoHash(hash);
  assert.equal(twin?.sku, 'MGMT-4', 'An identical photo points at the garment that has it');
  assert.equal(await catalogue.findCatalogueByPhotoHash('b'.repeat(64)), null);

  // Taking a garment off AI Video keeps it in Try-On.
  await catalogue.bulkUpdateCatalogueFlags(['MGMT-4'], { eligibleForVideo: false });
  records = await catalogue.loadAllCatalogueRecords(true);
  const gown = records.find((item) => item.sku === 'MGMT-4');
  assert.equal(gown.eligibleForVideo, false);
  assert.equal(gown.active, true, 'still on Try-On');
  await catalogue.deleteCatalogueProducts(['MGMT-4']);

  // Delete many at once.
  assert.equal(await catalogue.deleteCatalogueProducts(['MGMT-2', 'MGMT-3']), 2);
  records = await catalogue.loadAllCatalogueRecords(true);
  assert.deepEqual(records.map((item) => item.sku).sort(), ['MGMT-1']);
});

console.log('catalogue management: all checks passed');

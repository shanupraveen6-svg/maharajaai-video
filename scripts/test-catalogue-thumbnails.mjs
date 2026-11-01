import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const { default: sharp } = await import('sharp');
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');
const catalogue = await import('../src/lib/maharaja/catalogue.ts');

const photo = await sharp({ create: { width: 1600, height: 2400, channels: 3, background: '#7A1428' } }).jpeg().toBuffer();

await runWithClient('thumb-store', async () => {
  const saved = await catalogue.upsertCatalogueProduct({
    sku: 'THUMB-1', title: 'Bridal Kanchivaram', price: 42000, category: 'sarees', gender: 'women',
    imageUrl: `data:image/jpeg;base64,${photo.toString('base64')}`,
  });
  assert.ok(saved.thumbnailUrl && saved.thumbnailUrl !== saved.imageUrl, 'A stored photo gets its own preview');

  const blobs = [...getMockStore().sessions.entries()].filter(([key]) => key.startsWith('mock_blob_clients/thumb-store/catalogue/THUMB-1/thumb_'));
  assert.equal(blobs.length, 1);
  const meta = await sharp(blobs[0][1].buffer).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 480, 'Preview is 480 px wide');

  // Saving again with the same photo keeps the same preview.
  await catalogue.updateCatalogueProduct('THUMB-1', { price: 45000 });
  const again = [...getMockStore().sessions.keys()].filter((key) => key.startsWith('mock_blob_clients/thumb-store/catalogue/THUMB-1/thumb_'));
  assert.equal(again.length, 1, 'No new preview when the photo is unchanged');

  const { products } = await catalogue.listCatalogueProducts(0, 10, { includeInactive: true });
  const listed = products.find((item) => item.sku === 'THUMB-1');
  assert.ok(listed?.thumbnailUrl && listed.thumbnailUrl !== listed.imageUrl, 'The listing carries the preview');

  const demo = await catalogue.upsertCatalogueProduct({ sku: 'DEMO-1', title: 'Demo', price: 1000, category: 'sarees', gender: 'women', imageUrl: '/images/catalogue-demo/kanchivaram-purple-peacock-model.png' });
  assert.equal(demo.thumbnailUrl, demo.imageUrl, 'Bundled demo images use the photo itself');
});

console.log('catalogue thumbnails: all checks passed');

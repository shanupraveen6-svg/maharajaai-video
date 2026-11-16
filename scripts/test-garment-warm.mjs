import { register } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';

const { genlookSourceFrom } = await import('../src/lib/maharaja/garment-prep.ts');
const { warmGarmentType, warmCatalogueGarments } = await import('../src/lib/maharaja/garment-warm.ts');
const { garmentTypeFor } = await import('../src/lib/maharaja/garment-type.ts');

// The saved Gemini answers are keyed by GenLook's photo bytes: the same source must give the same bytes.
const source = (await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#2a6' } }).jpeg().toBuffer()).toString('base64');
const first = await genlookSourceFrom(source);
assert.equal(await genlookSourceFrom(source), first, 'GenLook photo is byte-for-byte repeatable');
const meta = await sharp(Buffer.from(first, 'base64')).metadata();
assert.equal(Math.max(meta.width, meta.height), 1600, 'Small photos are enlarged to 1600 px for a 2K look');

// The pre-warm works out the same garment type the Try-On route does for the TV's request.
for (const product of [
  { gender: 'boys', category: 'boys-shirt-trouser', garmentType: undefined, title: 'Sky Blue Oxford Shirt', fabricNote: '' },
  { gender: 'women', category: 'women-saree', garmentType: 'saree', title: 'Kanchipuram Silk Saree', fabricNote: 'Pure silk' },
  { gender: 'men', category: 'men-dhoti', garmentType: undefined, title: 'Cotton Veshti', fabricNote: undefined },
]) {
  const template = product.gender === 'boys' ? 'boy' : product.gender === 'girls' ? 'girl' : product.gender;
  const routeType = garmentTypeFor({ audience: template, categoryId: product.category, storedType: product.garmentType, title: product.title, analysis: `${product.title} (${product.fabricNote || ''})`, roles: ['Primary Garment Reference'] });
  assert.equal(warmGarmentType(product), routeType, `Same garment type as the route for ${product.title}`);
}

// Without a database (local mock) the pre-warm does nothing and costs nothing.
assert.deepEqual(await warmCatalogueGarments(), { warmed: 0, left: 0 });

// Wiring: the route and the pre-warm share one set of garment checks; the TV's catalogue read starts it.
const route = fs.readFileSync(new URL('../src/app/api/ai/master-image/route.ts', import.meta.url), 'utf8');
assert.match(route, /from '@\/lib\/maharaja\/garment-prep'/);
assert.match(route, /sourceReferences\.slice\(0, 2\)\.map\(genlookSourceFrom\)/, 'The route makes the GenLook photo the same way');
assert.doesNotMatch(route, /async function prepareGenlookPieces/, 'No second copy of the garment checks in the route');
const catalogue = fs.readFileSync(new URL('../src/app/api/maharaja/catalogue/route.ts', import.meta.url), 'utf8');
assert.match(catalogue, /after\(\(\) => runWithClient\(warmClient, \(\) => maybeWarmCatalogueGarments\(\)\)/, "The TV's catalogue read starts the pre-warm for its own store");
const warm = fs.readFileSync(new URL('../src/lib/maharaja/garment-warm.ts', import.meta.url), 'utf8');
assert.match(warm, /RUN_EVERY_MS = 10 \* 60 \* 1000/, 'At most one run every 10 minutes per store');
console.log('✓ Garment pre-warm: same bytes, same garment type, shared checks, started by the TV catalogue read');

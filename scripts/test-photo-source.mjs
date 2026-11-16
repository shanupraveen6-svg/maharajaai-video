import { register } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
const { storagePathFromSignedUrl, readCataloguePhoto } = await import('../src/lib/maharaja/photo-source.ts');

// Signed links to our own bucket become storage paths; any other link is refused.
const bucket = 'tryfocus-prod.appspot.com';
assert.equal(storagePathFromSignedUrl(`https://storage.googleapis.com/${bucket}/clients/maharaja/catalogue/MAH-1/model_1.jpg?X-Goog-Signature=abc`, bucket), 'clients/maharaja/catalogue/MAH-1/model_1.jpg');
assert.equal(storagePathFromSignedUrl(`https://${bucket}.storage.googleapis.com/clients/maharaja/catalogue/a%20b.jpg?sig=1`, bucket), 'clients/maharaja/catalogue/a b.jpg');
assert.equal(storagePathFromSignedUrl(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/clients%2Fmaharaja%2Fx.jpg?alt=media`, bucket), 'clients/maharaja/x.jpg');
assert.equal(storagePathFromSignedUrl('https://storage.googleapis.com/someone-else/clients/maharaja/x.jpg', bucket), '');
assert.equal(storagePathFromSignedUrl('https://evil.example/clients/maharaja/x.jpg', bucket), '');
assert.equal(storagePathFromSignedUrl('/images/maharaja-collection/x.jpg', bucket), '');
assert.equal(storagePathFromSignedUrl('http://storage.googleapis.com/x/y', bucket), '');

// The Try-On route takes a store garment's photo from the catalogue record by SKU, reads every bundled folder
// under public/images (the Maharaja collection included) and signed links to the store's own storage.
const route = fs.readFileSync(new URL('../src/app/api/ai/master-image/route.ts', import.meta.url), 'utf8');
assert.match(route, /: await catalogueGarmentPath\(body\.catalogueProductId\)/, 'Store garments are read from the catalogue record');
assert.match(route, /sku\.startsWith\('OWN-'\)/, "A customer's own outfit is never looked up in the catalogue");
assert.match(route, /if \(trimmed\.startsWith\('\/images\/'\)\)/, 'Every bundled folder under public/images is readable');
assert.match(route, /ownStoragePath\.startsWith\(`clients\/\$\{activeClientId\(\)\}\/`\)/, "Signed links are limited to this store's own files");
const tv = fs.readFileSync(new URL('../src/components/TryFocusTvExperience.tsx', import.meta.url), 'utf8');
assert.match(tv, /conceptId,\s*catalogueProductId: selectedProduct\.sku,/, 'The TV AI Video portrait names its catalogue piece');
// Bundled garment photos (the Maharaja collection folder included) are read from public/images; paths that
// climb out of it are refused.
const collection = fs.readdirSync(new URL('../public/images/maharaja-collection/', import.meta.url)).find((name) => name.endsWith('.jpg'));
assert.ok((await readCataloguePhoto(`/images/maharaja-collection/${collection}`)).length > 1000, 'A Maharaja collection photo is readable');
await assert.rejects(readCataloguePhoto('/images/../../.env.local'), /Invalid catalogue photo path/);

// Live Try-On reads store garment photos through our own address (storage links are blocked in the browser).
const live = fs.readFileSync(new URL('../src/components/LucyLiveMirror.tsx', import.meta.url), 'utf8');
assert.match(live, /\/api\/maharaja\/catalogue\/photo\?sku=/, 'Live Try-On loads garment photos through /api/maharaja/catalogue/photo');
assert.match(live, /garmentUrlToDataUri\(piece\.garmentReferenceUrl \|\| piece\.imageUrl, piece\.sku\)/);
assert.doesNotMatch(live, /\$\{piece\.fabricNote \|\| piece\.category\}/, 'The Live prompt never shows an internal category id');
const photoRoute = fs.readFileSync(new URL('../src/app/api/maharaja/catalogue/photo/route.ts', import.meta.url), 'utf8');
assert.match(photoRoute, /getCatalogueProduct\(/, 'Only garments in the store catalogue are served');
// The bucket's browser rule is set by the live server (promo uploads, photo reads).
const promos = fs.readFileSync(new URL('../src/app/api/maharaja/promos/route.ts', import.meta.url), 'utf8');
assert.match(promos, /await ensureStorageCors\(\);\s*return NextResponse\.json\(\{ success: true, \.\.\.await createPromoUpload/, 'Promo uploads make sure the bucket allows the browser upload');
console.log('✓ Garment photos: catalogue record by SKU, public/images, own signed links only; Live via our address');

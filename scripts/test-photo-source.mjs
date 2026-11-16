import assert from 'node:assert/strict';
import fs from 'node:fs';
import { storagePathFromSignedUrl } from '../src/lib/maharaja/photo-source.ts';

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
console.log('✓ Garment photos: catalogue record by SKU, public/images, own signed links only');

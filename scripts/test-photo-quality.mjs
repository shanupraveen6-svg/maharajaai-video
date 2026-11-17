import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Garment photos under 800 px give a soft Try-On: new uploads are refused, existing ones are flagged.
const warm = read('src/lib/maharaja/garment-warm.ts');
assert.match(warm, /export const MIN_GARMENT_LONG_SIDE = 800;/);
assert.match(warm, /const WARM_VERSION = [23];/, 'Every garment is measured again once');
assert.match(warm, /longSide, (?:genlookProductId, )?version: answered(?: && registered)? \? WARM_VERSION : 0/, 'The photo size is recorded even when Gemini did not answer');
const analyze = read('src/app/api/maharaja/catalogue/import/analyze/route.ts');
assert.match(analyze, /if \(longSide && longSide < MIN_GARMENT_LONG_SIDE\) \{\s*throw new Error\(`This photo is/, 'Small uploads are refused with their size');
assert.ok(analyze.indexOf('MIN_GARMENT_LONG_SIDE) {') < analyze.indexOf('bucket.file(storagePath).save'), 'Refused before anything is saved');
const admin = read('src/components/MaharajaAdminDashboard.tsx');
assert.match(admin, /Low-quality photo \(\$\{px\} px\)/, 'Each small photo is marked in the catalogue');
assert.match(admin, /too small for a sharp Try-On/);
const upload = read('src/components/CatalogueBulkImport.tsx');
assert.match(upload, /at least 800 px on the long side/);
const check = read('src/app/api/admin/live-check/route.ts');
assert.match(check, /Garment photo quality/);
console.log('✓ Garment photo quality: small uploads refused, existing ones flagged in the catalogue and the Live check');

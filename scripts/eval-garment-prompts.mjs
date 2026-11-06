import { register } from 'node:module';
import fs from 'node:fs';

register('./ts-alias-loader.mjs', import.meta.url);

/**
 * Garment prompt eval: does every way a garment reaches us end with the right garment type, the right rule,
 * the right GenLook listing and the right video noun, with nothing in the prompt that contradicts the photo?
 * Each case has one pass line. The expected answers are what the garment really is, not our own tables, so a
 * table that drifts fails here. Run: node scripts/eval-garment-prompts.mjs  (no network, no credits)
 */
const config = await import('../src/lib/maharaja/config.ts');
const { garmentTypeFor } = await import('../src/lib/maharaja/garment-type.ts');
const { catalogueCategories } = await import('../src/lib/tryfocus/sample-data.ts');
const { OWN_GARMENT_TYPES } = await import('../src/lib/tryfocus/garment-types.ts');
const videoSource = fs.readFileSync(new URL('../src/lib/maharaja/video-concepts.ts', import.meta.url), 'utf8');
const routeSource = fs.readFileSync(new URL('../src/app/api/ai/master-image/route.ts', import.meta.url), 'utf8');

const { GARMENT_TYPE_RULES, GENLOOK_GARMENT_DESCRIPTIONS, buildTryOnPrompt } = config;
const AUDIENCE = { women: 'women', men: 'men', boys: 'boy', girls: 'girl' };
const results = [];
const check = (group, id, pass, detail = '') => results.push({ group, id, pass: Boolean(pass), detail });
const oneOf = (value, expected) => (Array.isArray(expected) ? expected : [expected]).includes(value);

// 1. Every catalogue category resolves to the garment it really holds.
const CATEGORY_TRUTH = {
  sarees: 'saree', kurtis: 'salwar', 'salwar-suits': 'salwar', 'half-sarees': 'half_saree', 'western-tops': 'top',
  'women-bottoms': 'trousers', blouses: 'top', anarkali: 'salwar', gowns: 'one_piece', lehengas: 'lehenga',
  'women-occasion': ['generic', 'lehenga'], 'formal-shirts': 'shirt_pant', 'casual-shirts': 'shirt_pant',
  trousers: 'trousers', tshirts: 'tshirt_bottom', veshti: 'dhoti_veshti', kurta: 'kurta_dhoti',
  angavastram: 'dhoti_veshti', blazers: 'jacket', sherwanis: ['kurta_dhoti', 'generic'], 'men-occasion': ['generic', 'kurta_dhoti'],
  'boys-shirt-trouser': 'shirt_pant', 'boys-casual': ['generic', 'shirt_pant'], 'boys-party': ['generic', 'shirt_pant'],
  'boys-silk-shirt': 'shirt_pant', 'boys-veshti': 'dhoti_veshti', 'boys-dhoti': 'dhoti_veshti',
  'boys-kurta': ['kurta_dhoti', 'boy_ethnic'], 'boys-festive': ['kurta_dhoti', 'boy_ethnic', 'generic'], 'boys-jacket': 'jacket',
  'boys-sherwani': ['kurta_dhoti', 'boy_ethnic', 'generic'], 'girls-frock': 'one_piece', 'girls-party': 'one_piece',
  'girls-pavadai': 'pattu_pavadai', 'girls-gown': 'one_piece', 'girls-kurti': 'salwar', 'girls-salwar': 'salwar',
  'girls-anarkali': 'salwar', 'girls-half-saree': 'half_saree', 'girls-lehenga': 'lehenga', 'girls-festive': ['lehenga', 'generic'],
};
for (const category of catalogueCategories) {
  const audience = AUDIENCE[category.gender];
  const type = garmentTypeFor({ audience, categoryId: category.id, storedType: 'unset' });
  const expected = CATEGORY_TRUTH[category.id];
  check('catalogue category', category.id, expected && oneOf(type, expected), `got ${type}, want ${expected}`);
}

// 2. Pieces saved under the old wrong defaults still come out right.
for (const [categoryId, stored, audience, expected] of [
  ['girls-pavadai', 'lehenga', 'girl', 'pattu_pavadai'], ['trousers', 'shirt_pant', 'men', 'trousers'],
  ['gowns', 'lehenga', 'women', 'one_piece'], ['half-sarees', 'saree', 'women', 'half_saree'],
  ['angavastram', 'kurta_dhoti', 'men', 'dhoti_veshti'], ['sarees', 'saree', 'women', 'saree'],
]) {
  const type = garmentTypeFor({ audience, categoryId, storedType: stored });
  check('old stored type', `${categoryId}:${stored}`, type === expected, `got ${type}, want ${expected}`);
}

// 3. A garment described only in words (staff analysis or a product title) is read correctly.
for (const [audience, analysis, expected] of [
  ['men', "men's beige safari suit", ['generic', 'jacket', 'shirt_pant']],
  ['men', 'white cotton veshti with gold border', 'dhoti_veshti'],
  ['men', 'silk kurta', 'kurta_dhoti'],
  ['women', 'kanchi silk saree with zari pallu', 'saree'],
  ['girl', 'kids pattu pavadai', 'pattu_pavadai'],
  ['women', 'cotton anarkali kurti', 'salwar'],
  ['boy', 'boys silk dhoti', 'dhoti_veshti'],
]) {
  const type = garmentTypeFor({ audience, analysis });
  check('described in words', analysis, oneOf(type, expected), `got ${type}, want ${expected}`);
}

// 4. A customer's own outfit is one garment: its rule never asks for a second piece.
for (const [gender, types] of Object.entries(OWN_GARMENT_TYPES)) {
  for (const own of types) {
    const audience = AUDIENCE[gender];
    const type = garmentTypeFor({ audience, storedType: own.id });
    check('own outfit type', `${gender}:${own.label}`, type === own.id, `got ${type}, want ${own.id}`);
    const rule = GARMENT_TYPE_RULES[type] || '';
    const forcesSecondPiece = /WITH DHOTI OR PYJAMA|kurta-pyjama, sherwani or shirt-and-dhoti set as shown/.test(rule);
    check('own outfit is one piece', `${gender}:${own.label}`, !forcesSecondPiece, forcesSecondPiece ? `rule asks for a set: "${rule.slice(0, 70)}…"` : '');
  }
}

// 5. The Try-On prompt edits only the garment: nothing in it asks to restyle the photo.
const tryOn = buildTryOnPrompt('men', { garmentType: 'shirt_pant' });
check('try-on prompt', 'keeps the photo lighting', /lighting/.test(tryOn) && !/re-light|enhance/i.test(tryOn.replace(/do not extend, crop, zoom or re-light/, '')));
check('try-on prompt', 'one garment, not "combine into one outfit"', !/combine their details into one outfit/.test(tryOn));
const tryOnBranch = routeSource.match(/if \(service === 'try-on'\) \{\s*prompt = `\$\{buildTryOnPrompt[\s\S]*?\} else \{/)?.[0] || '';
const appendedForTryOn = !tryOnBranch || tryOnBranch.includes('garmentFidelityRules');
check('try-on prompt', 'no "professional lighting must enhance" appended to Try-On', !appendedForTryOn);
const banLines = tryOn.split('\n').filter((line) => /^- (Do not|No|Never)\b/.test(line) && line.split(',').length > 8);
check('try-on prompt', 'no long ban list (more than 8 items)', banLines.length === 0, banLines.map((line) => `${line.split(',').length} items`).join('; '));
check('try-on prompt', 'under 3,500 characters', tryOn.length < 3500, `${tryOn.length}`);

// 6. GenLook listing and video noun name the garment actually sent.
for (const type of config.GARMENT_TYPE_VALUES) {
  check('genlook listing', type, Boolean(GENLOOK_GARMENT_DESCRIPTIONS[type]?.title));
}
for (const type of ['kurta_dhoti', 'boy_ethnic']) {
  const description = GENLOOK_GARMENT_DESCRIPTIONS[type].description;
  check('genlook listing', `${type}: bottom only if shown`, /only if/.test(description), description.slice(0, 80));
}
const nounLine = videoSource.match(/const garmentNouns[\s\S]*?\};/)?.[0] || '';
// AI Video uses store pieces only; its veshti and kurta nouns are locked by renders verified in test-prompts.mjs.
check('video noun', 'half saree has its own noun', /half_saree:/.test(nounLine));

// Report.
const groups = [...new Set(results.map((item) => item.group))];
let failed = 0;
for (const group of groups) {
  const items = results.filter((item) => item.group === group);
  const bad = items.filter((item) => !item.pass);
  failed += bad.length;
  console.log(`${bad.length ? '✗' : '✓'} ${group}: ${items.length - bad.length}/${items.length}`);
  for (const item of bad) console.log(`    ✗ ${item.id}  ${item.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;

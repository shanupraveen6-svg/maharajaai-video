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

// 7. Video prompts, checked against each model's own documentation.
const concepts = await import('../src/lib/maharaja/video-concepts.ts');
const { buildVideoTestInput } = await import('../src/lib/maharaja/video-test.ts');
const MASTER = 'https://x/master.jpg';
const OUTFITS = ['https://x/top.jpg', 'https://x/bottom.jpg'];
const DIWALI_PROPS = /kuthu vilakku|\bdiya\b|teak|rear lamps|marigold|kolam diya/i;
const NEGATIVE_WORDS = /\b(no|not|never|don't|avoid)\b/i;
const types = ['saree', 'half_saree', 'salwar', 'lehenga', 'shirt_pant', 'dhoti_veshti', 'kurta_dhoti', 'pattu_pavadai', 'boy_ethnic', 'generic'];
const h3Bad = [], backupBad = [], omniBad = [], gestureBad = [];
for (const concept of concepts.VIDEO_CONCEPTS) {
  for (const eventId of config.EVENT_IDS) {
    for (const raw of types) {
      const type = config.compatibleGarmentType(concept.category, raw);
      for (const count of [1, 2]) {
        const roles = ['top', 'bottom'].slice(0, count);
        const id = `${concept.id}/${eventId}/${type}/${count}`;
        const h3 = buildVideoTestInput('h3-max', MASTER, OUTFITS.slice(0, count), concept.id, roles, eventId, type, false);
        // H3 Max (fal docs): references named "Image N" in list order, image_url is the first frame, no expansion, ≤7000 chars.
        const camera = h3.prompt.match(/CAMERA:[^\n]*/)?.[0] || '';
        if (/\d-\d(\.\d)?s \d-\d/.test(h3.prompt)) h3Bad.push(`${id}: camera timeline written twice`);
        if (eventId !== 'diwali' && DIWALI_PROPS.test(camera)) h3Bad.push(`${id}: camera names Diwali props`);
        if (!/4\.5-6s/.test(h3.prompt.match(/BACKGROUND[^\n]*/)?.[0] || '') && eventId !== 'diwali') h3Bad.push(`${id}: no finale beat`);
        if (h3.prompt.length > 7000) h3Bad.push(`${id}: over 7000 characters`);
        if ((h3.prompt.match(/Image (\d+)/g) || []).some((ref) => Number(ref.split(' ')[1]) > h3.reference_image_urls.length)) h3Bad.push(`${id}: names a missing image`);
        if (concept.category === 'women' && ['salwar', 'lehenga'].includes(type) && /dupatta/.test(h3.prompt)) gestureBad.push(`${id}: gesture invents a dupatta`);
        // Backup: still, smile, slow arc, glowing background; nothing that moves the face.
        const backup = buildVideoTestInput('h3-max', MASTER, OUTFITS.slice(0, count), concept.id, roles, eventId, type, true).prompt;
        if (!/stands still/.test(backup) || !/smile/.test(backup) || !/arc of about 15 degrees/.test(backup) || !/glow/.test(backup)) backupBad.push(`${id}: missing still / smile / arc / glow`);
        if (/laugh|walk|turn around|gesture/i.test(backup)) backupBad.push(`${id}: backup asks for risky motion`);
        // Gemini Omni (Google guide): roles in words, motion only, no "no"/"don't", no control tags.
        const omni = buildVideoTestInput('gemini-omni', MASTER, OUTFITS.slice(0, count), concept.id, roles, eventId, type, false).prompt;
        if (/Image \d|<IMAGE_REF|@\w/.test(omni)) omniBad.push(`${id}: image named by number or tag`);
        if (NEGATIVE_WORDS.test(omni)) omniBad.push(`${id}: uses negative wording "${omni.match(NEGATIVE_WORDS)[0]}"`);
        if (!/first image is the opening frame/.test(omni)) omniBad.push(`${id}: opening frame not stated`);
      }
    }
  }
}
// The customer's chosen look: its location carries into every event, and the video moves a little.
const locationBad = [], movementBad = [], wowBad = [];
for (const concept of concepts.VIDEO_CONCEPTS) {
  for (const eventId of config.EVENT_IDS) {
    const type = config.compatibleGarmentType(concept.category, 'generic');
    const master = concepts.buildVideoMasterPrompt(concept, type, eventId);
    const h3 = buildVideoTestInput('h3-max', MASTER, OUTFITS.slice(0, 1), concept.id, ['top'], eventId, type, false).prompt;
    const place = concept.masterScene.match(/garden|balcony|hall|veranda|corridor|gateway|pathway|arch|courtyard|colonnade/i)?.[0].toLowerCase();
    if (place && !master.toLowerCase().includes(place)) locationBad.push(`${concept.id}/${eventId}: no ${place}`);
    if (!/Around 2-3s|weight shift|weight settle|nod/.test(h3) || !/smile/.test(h3) || !/blink/.test(h3)) movementBad.push(`${concept.id}/${eventId}`);
    if (!/CAMERA:[^\n]*0-1s[^\n]*parallax/.test(h3) || !/BACKGROUND/.test(h3) || !/4\.5-6s/.test(h3.match(/BACKGROUND[\s\S]*/)?.[0] || '')) wowBad.push(`${concept.id}/${eventId}`);
  }
}
// Diwali: H3 opens exactly on the portrait, so every place the video names must be in that portrait.
const SCENE_NOUNS = { colonnade: /colonnade/, veranda: /veranda/, kolam: /kolam|rangoli/, sky: /sky/, doorway: /doorway/, water: /water|tank/, corridor: /corridor/, garden: /garden/, balustrade: /balustrade|rail/, chair: /chair/, lantern: /lantern/, arch: /arch/ };
const sceneBad = [];
// The two looks proven on real renders keep their exact wording (locked in test-prompts.mjs).
for (const concept of concepts.VIDEO_CONCEPTS.filter((item) => !['men-heritage-passage', 'women-golden-courtyard'].includes(item.id))) {
  for (const type of ['saree', 'dhoti_veshti', 'pattu_pavadai', 'boy_ethnic', 'generic']) {
    const garmentType = config.compatibleGarmentType(concept.category, type);
    const master = concepts.buildVideoMasterPrompt(concept, garmentType, 'diwali').toLowerCase();
    const video = buildVideoTestInput('h3-max', MASTER, OUTFITS.slice(0, 1), concept.id, ['top'], 'diwali', garmentType, false).prompt.toLowerCase();
    const moving = `${video.match(/camera:[^\n]*/)?.[0] || ''} ${video.match(/^background[^\n]*/m)?.[0] || ''}`;
    for (const [noun, pattern] of Object.entries(SCENE_NOUNS)) {
      if (pattern.test(moving) && !pattern.test(master)) sceneBad.push(`${concept.id}: video names ${noun}, portrait has none`);
    }
    const first = video.match(/camera: 0-1s[^.]*/)?.[0] || '';
    if (/distant [a-z ]+ at the frame edge/.test(first)) sceneBad.push(`${concept.id}: near-plane detail called distant`);
    if (/smooths the pallu/.test(video) && /rest the left/.test(video)) sceneBad.push(`${concept.id}: right hand crosses to the pallu`);
  }
}
check('diwali looks', 'everything the video names is in its portrait', sceneBad.length === 0, [...new Set(sceneBad)].join('; '));
check('chosen look', "portrait keeps the look's own location in every event", locationBad.length === 0, locationBad.slice(0, 4).join('; '));
check('chosen look', 'video: one small movement, smile and blink', movementBad.length === 0, movementBad.slice(0, 4).join('; '));
check('chosen look', 'video wow: camera move, animated background, finale', wowBad.length === 0, wowBad.slice(0, 4).join('; '));
check('h3 max', 'one clean timeline, event props only, finale, ≤7000 chars, image refs exist', h3Bad.length === 0, h3Bad.slice(0, 4).join('; '));
check('h3 max', 'gesture never invents a dupatta', gestureBad.length === 0, gestureBad.slice(0, 3).join('; '));
check('backup video', 'still, smile, 15° arc, glowing background only', backupBad.length === 0, backupBad.slice(0, 4).join('; '));
check('gemini omni', 'images named in words, positive wording, opens on the portrait', omniBad.length === 0, omniBad.slice(0, 4).join('; '));

// 8. AI Video portrait (Gemini image guide): images referred to by order; the outfit photos are Image 2 and 3.
const block2 = concepts.buildPortraitGarmentBlock(['Shirt', 'Pant / trouser'], 'shirt_pant', 2);
check('portrait', 'top and bottom are Image 2 and Image 3', /Image 2 = SHIRT/.test(block2) && /Image 3 = PANT \/ TROUSER/.test(block2) && !/Garment Image/.test(block2), block2.split('\n').slice(1, 3).join(' | '));
const block1 = concepts.buildPortraitGarmentBlock([], 'saree', 1);
check('portrait', 'one outfit photo is Image 2 with the garment rule', /Image 2 = the garment/.test(block1) && block1.includes(GARMENT_TYPE_RULES.saree));

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

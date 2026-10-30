import { register } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

register('./ts-alias-loader.mjs', import.meta.url);

// Every prompt the product can send is generated here for every category, concept, event,
// garment type, model and reference count, and checked against the provider and safety rules.
const config = await import('../src/lib/maharaja/config.ts');
const concepts = await import('../src/lib/maharaja/video-concepts.ts');
const videoTest = await import('../src/lib/maharaja/video-test.ts');

const { EVENT_IDS, GARMENT_TYPE_VALUES, GARMENT_TYPE_RULES, buildTryOnPrompt, compatibleGarmentType } = config;
const { VIDEO_CONCEPTS, buildVideoMasterPrompt } = concepts;
const { buildVideoTestInput, FAL_VIDEO_MODELS } = videoTest;
const CATEGORIES = ['women', 'men', 'girl', 'boy'];
const MASTER = 'https://storage.example/master.jpg';
const GARMENTS = ['https://storage.example/g1.jpg', 'https://storage.example/g2.jpg'];
let checked = 0;

function assertClean(prompt, label) {
  assert.equal(typeof prompt, 'string', `${label}: prompt must be text`);
  assert.ok(prompt.length > 200, `${label}: prompt is too short`);
  for (const bad of ['undefined', 'null', '[object', '${', 'NaN']) {
    assert.ok(!prompt.includes(bad), `${label}: contains "${bad}"`);
  }
}

// 1. Try-On prompts: explicit garment type wins, incompatible types fall back to "as shown".
for (const category of CATEGORIES) {
  for (const garmentType of GARMENT_TYPE_VALUES) {
    for (const productTitle of ['', 'Kanchivaram Silk Saree', 'Party Frock', 'Cotton T-Shirt']) {
      const prompt = buildTryOnPrompt(category, { garmentType, productTitle, categoryId: '' });
      const label = `try-on ${category}/${garmentType}/${productTitle || 'untitled'}`;
      assertClean(prompt, label);
      const isChild = category === 'girl' || category === 'boy';
      assert.equal(prompt.includes('child-safe'), isChild, `${label}: child safety line`);
      const compatible = compatibleGarmentType(category, garmentType);
      if (garmentType !== 'generic' && garmentType !== 'unset') {
        assert.ok(prompt.includes(GARMENT_TYPE_RULES[compatible]), `${label}: uses the ${compatible} rule`);
      }
      if (compatible === 'tshirt_bottom') assert.ok(!/tailored shirt|button placket/.test(prompt), `${label}: T-shirt is not drawn as a formal shirt`);
      if (!['saree', 'generic', 'unset'].includes(compatible)) assert.ok(!/SAREE:/.test(prompt), `${label}: no saree rule for ${compatible}`);
      checked += 1;
    }
  }
}
assert.equal(compatibleGarmentType('boy', 'pattu_pavadai'), 'generic');
assert.equal(compatibleGarmentType('men', 'saree'), 'generic');
assert.equal(compatibleGarmentType('girl', 'pattu_pavadai'), 'pattu_pavadai');
console.log('✓ Try-On prompts: every category x garment type is valid and category-safe');

// 2. Festival master image prompts (Gemini) for every concept, event and compatible garment.
for (const concept of VIDEO_CONCEPTS) {
  const isChild = concept.category === 'girl' || concept.category === 'boy';
  for (const eventId of EVENT_IDS) {
    for (const rawType of GARMENT_TYPE_VALUES) {
      const garmentType = compatibleGarmentType(concept.category, rawType);
      const prompt = buildVideoMasterPrompt(concept, garmentType, eventId);
      const label = `master ${concept.id}/${eventId}/${garmentType}`;
      assertClean(prompt, label);
      assert.ok(prompt.includes('Image 1 is the real customer'), `${label}: identity reference`);
      assert.ok(prompt.includes('9:16'), `${label}: vertical frame`);
      assert.equal(prompt.includes('age-appropriate'), isChild, `${label}: child safety`);
      if (isChild) assert.ok(prompt.includes('Namaste'), `${label}: child pose`);
      checked += 1;
    }
  }
}
console.log('✓ Master image prompts: all 12 concepts x 6 events x garment types');

// 3. Video prompts for both reference-to-video models, normal and backup, with 0-2 garment references.
for (const model of FAL_VIDEO_MODELS) {
  for (const concept of VIDEO_CONCEPTS) {
    const isChild = concept.category === 'girl' || concept.category === 'boy';
    for (const eventId of EVENT_IDS) {
      for (const garmentType of ['saree', 'kurta_dhoti', 'dhoti_veshti', 'shirt_pant', 'pattu_pavadai', 'boy_ethnic', 'generic']) {
        const type = compatibleGarmentType(concept.category, garmentType);
        for (const garmentCount of [0, 1, 2]) {
          for (const backup of [false, true]) {
            const garments = GARMENTS.slice(0, garmentCount);
            const roles = garments.map((_, index) => `garment detail ${index + 1}`);
            const input = buildVideoTestInput(model.id, MASTER, garments, concept.id, roles, eventId, type, backup);
            const label = `${model.id} ${concept.id}/${eventId}/${type}/${garmentCount} refs${backup ? '/backup' : ''}`;
            assertClean(input.prompt, label);
            assert.equal(input.aspect_ratio, '9:16', `${label}: vertical`);
            assert.equal(input.duration, 6, `${label}: six-second render (Go Live stretches to 9 s)`);
            if (isChild) assert.ok(input.prompt.includes('Namaste'), `${label}: child keeps Namaste`);
            if (isChild) assert.ok(!/on the hip|smooths the pallu/.test(input.prompt), `${label}: no adult gesture for a child`);
            if (concept.category === 'women' && !['saree', 'lehenga', 'salwar'].includes(type)) assert.ok(!/smooths the (pallu|dupatta)/.test(input.prompt), `${label}: gesture matches the garment`);
            if (model.id === 'pixverse-c1') {
              const bytes = Buffer.byteLength(input.prompt, 'utf8');
              assert.ok(bytes <= 2048, `${label}: ${bytes} bytes exceeds PixVerse limit`);
              assert.ok(/^[\x20-\x7E\n]+$/.test(input.prompt), `${label}: ASCII only`);
              const refNames = new Set(input.image_references.map((ref) => ref.ref_name));
              assert.equal(input.image_references[0].image_url, MASTER, `${label}: @customer is the approved master`);
              for (const used of input.prompt.match(/@[a-z0-9]+/g) || []) {
                assert.ok(refNames.has(used.slice(1)), `${label}: ${used} has no matching reference`);
              }
              assert.ok(input.prompt.includes('@customer'), `${label}: names the customer reference`);
              assert.ok(/body size and proportions/.test(input.prompt), `${label}: body size locked`);
              assert.ok(/MOTION GRAPHICS/.test(input.prompt), `${label}: event motion graphics`);
              if (!isChild && !backup) assert.ok(/Around 2-3s/.test(input.prompt), `${label}: one mild gesture`);
              if (!['saree', 'lehenga', 'salwar'].includes(type)) assert.ok(!/pallu|dupatta|\bsaree\b/.test(input.prompt), `${label}: no saree or dupatta wording for ${type}`);
              assert.ok(!/ in [A-Z][a-z]+ /.test(input.prompt.split('\n')[0].replace(/@customer|South Indian|Diwali|Thanjavur|Chettinad|Christmas|Pongal|Ramadan/g, '')), `${label}: scene reads as one sentence`);
            } else {
              assert.equal(input.image_url, MASTER, `${label}: H3 opens on the approved master`);
              assert.equal(input.prompt_expansion_mode, 'disabled', `${label}: exact wording`);
              if (!['men-heritage-passage', 'women-golden-courtyard'].includes(concept.id) && !backup && !['saree', 'lehenga', 'salwar'].includes(type)) {
                assert.ok(!/\bsaree\b|smooths the (pallu|dupatta)/.test(input.prompt), `${label}: wording matches the ${type}`);
              }
              for (const used of input.prompt.match(/Image (\d+)/g) || []) {
                const index = Number(used.split(' ')[1]);
                assert.ok(index >= 1 && index <= input.reference_image_urls.length, `${label}: ${used} has no matching reference`);
              }
            }
            checked += 1;
          }
        }
      }
    }
  }
}
console.log('✓ Video prompts: H3 Max and PixVerse C1, normal and backup, every concept/event/garment/reference count');

// 4. The H3 prompts verified on real renders produce exactly the same text as the committed version.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tryfocus-prompts-'));
const committed = execFileSync('git', ['show', 'HEAD:src/lib/maharaja/video-concepts.ts'], { encoding: 'utf8' });
fs.writeFileSync(path.join(tmp, 'video-concepts.ts'), committed);
const original = await import(path.join(tmp, 'video-concepts.ts'));
for (const conceptId of ['men-heritage-passage', 'women-golden-courtyard']) {
  const concept = concepts.getVideoConcept(conceptId);
  for (const garmentType of ['saree', 'kurta_dhoti', 'dhoti_veshti', 'shirt_pant', 'generic']) {
    for (const roles of [[], ['garment detail 1'], ['garment detail 1', 'garment detail 2']]) {
      assert.equal(
        concepts.buildH3MotionPrompt(concept, roles, 'diwali', 'h3', garmentType),
        original.buildH3MotionPrompt(original.getVideoConcept(conceptId), roles, 'diwali', 'h3', garmentType),
        `${conceptId}/${garmentType}: tested H3 prompt must not change`,
      );
      checked += 1;
    }
    assert.equal(
      concepts.buildVideoMasterPrompt(concept, garmentType, 'diwali'),
      original.buildVideoMasterPrompt(original.getVideoConcept(conceptId), garmentType, 'diwali'),
      `${conceptId}/${garmentType}: tested master prompt must not change`,
    );
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('✓ Tested H3 men and women prompts are byte-for-byte unchanged');

// 5. Go Live plays the 9-second version with 9-second event audio.
const processor = fs.readFileSync(new URL('../src/lib/maharaja/video-processor.ts', import.meta.url), 'utf8');
assert.match(processor, /generateBrandedVideo\(input6sBuffer, 9, audio\)/);
assert.ok(fs.existsSync(new URL('../public/audio/maharaja/live/diwali-hindu-9s.mp3', import.meta.url)));
console.log('✓ Go Live renders the 9-second TV version with 9-second audio');

console.log(`ALL PROMPT VALIDATION PASSED (${checked} prompt combinations checked)`);

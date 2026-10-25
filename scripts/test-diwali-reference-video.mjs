import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);

const { VIDEO_CONCEPTS, VIDEO_PROMPT_ARCHITECTURE_VERSION, buildVideoMasterPrompt, buildH3MotionPrompt } = await import('../src/lib/maharaja/video-concepts.ts');
const { FAL_VIDEO_MODELS, buildVideoTestInput, getVideoTestModel } = await import('../src/lib/maharaja/video-test.ts');

assert.equal(VIDEO_CONCEPTS.length, 12);
assert.equal(VIDEO_PROMPT_ARCHITECTURE_VERSION, 'festival-v4-anchored-hand');
assert.deepEqual(FAL_VIDEO_MODELS.map((model) => model.id), ['h3-max', 'pixverse-c1', 'gemini-omni-1.1']);
assert.equal(getVideoTestModel().id, 'h3-max');

for (const category of ['men', 'women', 'boy', 'girl']) {
  assert.equal(VIDEO_CONCEPTS.filter((concept) => concept.category === category).length, 3);
}

const references = ['https://example.test/master.jpg', 'https://example.test/front.jpg', 'https://example.test/back.jpg'];
const events = ['diwali', 'pongal', 'new-year', 'christmas', 'ramadan', 'birthday'];
for (const concept of VIDEO_CONCEPTS) {
  const master = buildVideoMasterPrompt(concept, 'saree');
  const motion = buildH3MotionPrompt(concept, ['front', 'back']);
  assert.match(master, /preserve facial geometry/i);
  assert.match(master, /physically touching the anchored hand/i);
  assert.match(master, /both feet planted/i);
  assert.match(master, /natural skin texture/i);
  assert.match(master, /catchlights/i);
  assert.match(master, /no makeup/i);
  assert.match(master, /clear of the chest/i);
  assert.match(motion, /approved master is the sole visual authority/i);
  assert.match(motion, /never lift toward chest/i);
  assert.match(motion, /continuous visible contact/i);
  assert.match(motion, /head turn/i);
  assert.match(motion, /seconds 0-2/i);
  assert.doesNotMatch(motion, /take (?:one|a) .*step/i);
  assert.match(motion, /existing lamps and lanterns remain in place/i);
  assert.match(motion, /CAMERA CHOREOGRAPHY:/);
  assert.match(motion, /smile/i);
  if (['girl', 'boy'].includes(concept.category)) assert.match(master, /free of adult glamour/i);

  for (const model of FAL_VIDEO_MODELS) {
    const input = buildVideoTestInput(model.id, references[0], references.slice(1), concept.id, ['front', 'back']);
    assert.equal(input.duration, 6);
    assert.equal(input.aspect_ratio, '9:16');
    assert.match(input.prompt, /Image 1|@master|<IMAGE_REF_0>/);
    assert.match(input.prompt, /smile/i);
    if (model.id === 'h3-max') {
      assert.equal(input.image_url, references[0]);
      assert.deepEqual(input.reference_image_urls, references);
      assert.equal(input.resolution, '768P');
      assert.equal(input.prompt_expansion_mode, 'disabled');
    } else if (model.id === 'pixverse-c1') {
      assert.deepEqual(input.image_references.map((item) => item.image_url), references);
      assert.deepEqual(input.image_references.map((item) => item.ref_name), ['master', 'garment1', 'garment2']);
      assert.equal(input.resolution, '720p');
      assert.equal(input.generate_audio_switch, false);
      assert(Buffer.byteLength(input.prompt, 'utf8') <= 2048, 'PixVerse prompt exceeds 2,048 UTF-8 bytes');
    } else {
      assert.deepEqual(input.image_urls, references);
      assert.equal(input.resolution, '720p');
      assert.match(input.prompt, /<IMAGE_REF_0>/);
    }
  }
  for (const eventId of events) {
    const eventMaster = buildVideoMasterPrompt(concept, 'saree', eventId);
    const eventMotion = buildH3MotionPrompt(concept, ['front', 'back'], false, eventId);
    assert.match(eventMaster, /preserve facial geometry/i);
    assert.match(eventMaster, /physically touching the anchored hand/i);
    assert.match(eventMotion, /same recognizable face/i);
    assert.match(eventMotion, /continuous visible contact/i);
    if (eventId !== 'diwali') {
      assert.doesNotMatch(eventMaster, /diwali|firework|diya/i);
      assert.doesNotMatch(eventMotion, /diwali|firework|diya/i);
    }
    for (const model of FAL_VIDEO_MODELS) {
      const eventInput = buildVideoTestInput(model.id, references[0], references.slice(1), concept.id, ['front', 'back'], eventId);
      assert.equal(eventInput.duration, 6);
      assert.match(eventInput.prompt, new RegExp(eventId === 'new-year' ? 'New Year' : eventId, 'i'));
      if (model.id === 'pixverse-c1') assert(Buffer.byteLength(eventInput.prompt, 'utf8') <= 2048);
    }
  }
}

assert.equal(new Set(VIDEO_CONCEPTS.map((concept) => buildH3MotionPrompt(concept, []).split('CAMERA CHOREOGRAPHY: ')[1]?.split('\n')[0])).size, 12);
console.log('Fal H3 Max, PixVerse C1 and Gemini Omni 1.1 schemas passed for all 12 concepts.');

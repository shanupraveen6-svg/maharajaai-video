import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);

const { VIDEO_CONCEPTS, VIDEO_PROMPT_ARCHITECTURE_VERSION, buildVideoMasterPrompt, buildH3MotionPrompt } = await import('../src/lib/maharaja/video-concepts.ts');
const { FAL_VIDEO_MODELS, buildVideoTestInput, getVideoTestModel } = await import('../src/lib/maharaja/video-test.ts');

assert.equal(VIDEO_CONCEPTS.length, 12);
assert.equal(VIDEO_PROMPT_ARCHITECTURE_VERSION, 'festival-v7-south-indian-cinema');
assert.deepEqual(FAL_VIDEO_MODELS.map((model) => model.id), ['h3-max', 'pixverse-c1']);
assert.equal(getVideoTestModel().id, 'h3-max');
assert.equal(getVideoTestModel('gemini-omni-1.1'), null);

for (const category of ['men', 'women', 'boy', 'girl']) {
  assert.equal(VIDEO_CONCEPTS.filter((concept) => concept.category === category).length, 3);
}

const references = ['https://example.test/master.jpg', 'https://example.test/front.jpg', 'https://example.test/back.jpg'];
const events = ['diwali', 'pongal', 'new-year', 'christmas', 'ramadan', 'birthday'];
for (const concept of VIDEO_CONCEPTS) {
  const master = buildVideoMasterPrompt(concept, 'saree');
  const motion = buildH3MotionPrompt(concept, ['front', 'back']);
  const isChild = ['girl', 'boy'].includes(concept.category);
  assert.match(master, /sole authority for face/i);
  if (isChild) {
    assert.match(master, /palms gently together in a simple Namaste/i);
    assert.match(motion, /child's Namaste pose unchanged/i);
  } else if (['women-golden-courtyard', 'men-heritage-passage'].includes(concept.id)) {
    assert.match(master, /both hands and both feet completely visible/i);
  } else {
    assert.match(master, /supported hand anatomically correct and visibly touching/i);
    assert.match(master, /both feet planted/i);
  }
  assert.match(master, /real skin texture/i);
  assert.match(master, /soft frontal key light/i);
  assert.match(master, /no makeup/i);
  if (!isChild && !['women-golden-courtyard', 'men-heritage-passage'].includes(concept.id)) assert.match(master, /outside the chest and garment/i);
  assert.match(motion, /approved exact opening frame and sole authority/i);
  if (!isChild) assert.match(motion, /hands below waist(?:,| and) away from chest/i);
  if (isChild || ['women-golden-courtyard', 'men-heritage-passage'].includes(concept.id)) {
    assert.doesNotMatch(motion, /supported hand touching that same support throughout/i);
  } else {
    assert.match(motion, /supported hand touching that same support throughout/i);
  }
  assert.match(motion, /subtle breathing/i);
  assert.doesNotMatch(motion, /take (?:one|a) .*step/i);
  assert.match(motion, /BACKGROUND(?: \+ FX)?: Animate throughout|BACKGROUND: Animate only visible Diwali details/i);
  assert.match(motion, /CAMERA: 0-1s/i);
  assert.match(motion, /smile/i);
  assert.match(motion, /parallax/i);
  if (['girl', 'boy'].includes(concept.category)) assert.match(master, /free of adult glamour/i);

  for (const model of FAL_VIDEO_MODELS) {
    const input = buildVideoTestInput(model.id, references[0], references.slice(1), concept.id, ['front', 'back']);
    assert.equal(input.duration, 6);
    assert.equal(input.aspect_ratio, '9:16');
    assert.match(input.prompt, /Image 1|@master|<IMAGE_REF_0>/);
    assert.match(input.prompt, /smile/i);
    if (model.id === 'h3-max') {
      assert.match(input.prompt, /Image 1 is the approved exact opening frame/i);
      assert.match(input.prompt, /CAMERA: 0-1s/i);
      assert.match(input.prompt, /small warm smile/i);
      assert.match(input.prompt, /no slow motion, freeze,/i);
      assert.match(input.prompt, /CAMERA: 0-1s[\s\S]*(?:track|crane|glide|rise|dolly|reveal|arc|lower|pan|push)/i);
      if (isChild) assert.match(input.prompt, /Namaste pose unchanged/i);
      else assert.match(input.prompt, /hands below waist(?:,| and) away from chest/i);
      assert.equal(input.image_url, references[0]);
      assert.deepEqual(input.reference_image_urls, references);
      assert.equal(input.resolution, '768P');
      assert.equal(input.prompt_expansion_mode, 'disabled');
    } else if (model.id === 'pixverse-c1') {
      assert.match(input.prompt, /@master locks the approved opening identity/i);
      assert.match(input.prompt, /small warm smile/i);
      if (isChild) assert.match(input.prompt, /Namaste pose unchanged/i);
      else assert.match(input.prompt, /hands below waist(?:,| and) away from chest/i);
      assert.match(input.prompt, /CAMERA: 0-1s[\s\S]*(?:track|crane|glide|rise|dolly|reveal|arc|lower|pan|push)/i);
      assert.deepEqual(input.image_references.map((item) => item.image_url), references);
      assert.deepEqual(input.image_references.map((item) => item.ref_name), ['master', 'garment1', 'garment2']);
      assert.equal(input.resolution, '720p');
      assert.equal(input.generate_audio_switch, false);
      assert(Buffer.byteLength(input.prompt, 'utf8') <= 2048, 'PixVerse prompt exceeds 2,048 UTF-8 bytes');
    }
  }
  for (const eventId of events) {
    const eventMaster = buildVideoMasterPrompt(concept, 'saree', eventId);
    const eventMotion = buildH3MotionPrompt(concept, ['front', 'back'], eventId);
    assert.match(eventMaster, /sole authority for face/i);
    if (isChild) {
      assert.match(eventMaster, /palms gently together in a simple Namaste/i);
      assert.match(eventMotion, /child's Namaste pose unchanged/i);
    } else if (!['women-golden-courtyard', 'men-heritage-passage'].includes(concept.id)) {
      assert.match(eventMaster, /supported hand anatomically correct and visibly touching/i);
    }
    assert.match(eventMotion, /Preserve the South Indian set from the opening frame, customer identity and exact garment/i);
    if (!isChild && !['women-golden-courtyard', 'men-heritage-passage'].includes(concept.id)) {
      assert.match(eventMotion, /supported hand touching that same support throughout/i);
    }
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

const womenSample = VIDEO_CONCEPTS.find((concept) => concept.id === 'women-golden-courtyard');
const womenImagePrompt = buildVideoMasterPrompt(womenSample, 'saree');
const womenVideoPrompt = buildH3MotionPrompt(womenSample, ['front']);
assert.match(womenImagePrompt, /right hand on the hip/i);
assert.match(womenImagePrompt, /both hands and both feet completely visible/i);
assert.match(womenImagePrompt, /tall brass kuthu vilakku in the near foreground/i);
assert.match(womenVideoPrompt, /brisk stabilized horizontal reveal from behind the near diya stand/i);
assert.match(womenVideoPrompt, /gently dolly closer/i);

const menSample = VIDEO_CONCEPTS.find((concept) => concept.id === 'men-heritage-passage');
const menImagePrompt = buildVideoMasterPrompt(menSample, 'generic');
const menVideoPrompt = buildH3MotionPrompt(menSample, ['front']);
assert.match(menImagePrompt, /For trousers, place both hands naturally at the front pockets/i);
assert.match(menImagePrompt, /both hands and both feet completely visible/i);
assert.match(menVideoPrompt, /modest elevated angle/i);
assert.match(menVideoPrompt, /descend smoothly to eye level while dollying toward the man/i);
assert.match(menVideoPrompt, /dolly back and settle into a centered full-body hero frame/i);
const dhotiImagePrompt = buildVideoMasterPrompt(menSample, 'dhoti_veshti');
const dhotiVideoPrompt = buildH3MotionPrompt(menSample, ['front'], 'diwali', 'h3', 'dhoti_veshti');
assert.match(dhotiImagePrompt, /For a dhoti or veshti, rest the right palm lightly on the broad top of the visible stone pillar/i);
assert.doesNotMatch(dhotiImagePrompt, /trouser pockets/i);
assert.match(dhotiVideoPrompt, /For a dhoti or veshti, keep the right palm on the visible pillar/i);
assert.match(dhotiVideoPrompt, /small natural weight shift/i);
assert.match(dhotiVideoPrompt, /Thanjavur-inspired|South Indian/i);

assert.equal(new Set(VIDEO_CONCEPTS.map((concept) => buildH3MotionPrompt(concept, []).split('CAMERA: ')[1]?.split(' Keep the customer')[0])).size, 12);
for (const concept of VIDEO_CONCEPTS) {
  const h3Prompt = buildH3MotionPrompt(concept, ['front', 'back']);
  const pixversePrompt = buildH3MotionPrompt(concept, ['front', 'back'], 'diwali', 'pixverse')
    .replaceAll('@master', 'Image 1').replaceAll('@garment1', 'Image 2').replaceAll('@garment2', 'Image 3');
  assert.equal(
    pixversePrompt.match(/CAMERA: ([\s\S]*?) Create distinct foreground-to-background parallax/)?.[1],
    h3Prompt.match(/CAMERA: ([\s\S]*?) Create distinct foreground-to-background parallax/)?.[1],
    `${concept.id}: H3 and PixVerse share camera direction`,
  );
  assert.equal(pixversePrompt.match(/BACKGROUND(?: \+ FX)?: ([^\n]+)/)?.[1], h3Prompt.match(/BACKGROUND(?: \+ FX)?: ([^\n]+)/)?.[1], `${concept.id}: H3 and PixVerse share event animation`);
  assert(Buffer.byteLength(pixversePrompt, 'utf8') <= 2048, `${concept.id}: PixVerse prompt exceeds 2,048 UTF-8 bytes`);
}
console.log('H3 Max and PixVerse schemas and shared H3 direction passed for all 12 concepts.');

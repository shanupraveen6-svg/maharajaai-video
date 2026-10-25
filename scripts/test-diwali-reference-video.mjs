import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);
import {
  VIDEO_CONCEPTS,
  VIDEO_PROMPT_ARCHITECTURE_VERSION,
  buildH3MotionPrompt,
  buildVideoMasterPrompt,
} from '../src/lib/maharaja/video-concepts.ts';
import { readFile } from 'node:fs/promises';

const videoAdapterSource = await readFile(new URL('../src/lib/maharaja/video-test.ts', import.meta.url), 'utf8');
const { buildWaveSpeedVideoInput, WAVE_SPEED_TEST_MODELS } = await import('../src/lib/maharaja/video-test.ts');
assert.match(videoAdapterSource, /minimax\/h3-max\/reference-to-video/);
assert.equal(VIDEO_PROMPT_ARCHITECTURE_VERSION, 'diwali-v3-natural-lock');
assert.equal(VIDEO_CONCEPTS.length, 12, 'Exactly twelve production concepts are required.');
assert.equal(WAVE_SPEED_TEST_MODELS.length, 9, 'Exactly nine frozen WaveSpeed R2V models are required.');

for (const category of ['men', 'women', 'boy', 'girl']) {
  assert.equal(VIDEO_CONCEPTS.filter((concept) => concept.category === category).length, 3, `${category} requires three concepts.`);
}

for (const concept of VIDEO_CONCEPTS) {
  const master = buildVideoMasterPrompt(concept, 'generic');
  const motion = buildH3MotionPrompt(concept, ['primary garment']);
  const backup = buildH3MotionPrompt(concept, ['primary garment'], true);
  assert.match(master, /exact facial geometry/i);
  assert.match(master, /hands remain below the waist/i);
  assert.match(master, /no makeup|do not add foundation/i);
  assert.match(motion, /master image is the absolute authority/i);
  assert.match(motion, /No hand may move toward or touch the chest/i);
  assert.match(motion, /No face regeneration/i);
  assert.match(backup, /still photographic layer/i);
  assert.match(master, /8 percent clear headroom/i);
  assert.match(master, /scene preparation only/i);
  assert.doesNotMatch(motion, /exact first-frame coordinates|physical dolly|pedestal rise|perspective drift|rack focus/i);
  assert.match(motion, /relative to the body/i);
  assert.match(motion, /omit any missing object/i);
  assert.match(motion, /Keep the customer sharp/i);
  if (['girl', 'boy'].includes(concept.category)) assert.match(master, /free of adult glamour/i);

  for (const model of WAVE_SPEED_TEST_MODELS) {
    // Test 1: Full 3-garment pass -> MUST be clamped to exactly 2 garments (max 3 total images)
    const input = buildWaveSpeedVideoInput(
      model.inputFormat,
      'https://example.test/master.jpg',
      ['https://example.test/front.jpg', 'https://example.test/back.jpg', 'https://example.test/detail.jpg'],
      concept.id,
      ['front', 'back', 'detail'],
    );

    // Rule 6: Duration, resolution, aspect ratio per provider contract
    assert.equal(input.duration, 6, `${model.id}: duration must be exactly 6 seconds`);
    if (model.inputFormat === 'h3') {
      assert.equal(input.resolution, '768p');
      assert.equal(input.aspect_ratio, '9:16');
      assert.equal(input.generate_audio, undefined, `${model.id}: audio must be omitted (no audio control in schema)`);
      assert.equal(input.sound, undefined);
    } else if (model.inputFormat === 'vidu') {
      assert.equal(input.resolution, '720p');
      assert.equal(input.aspect_ratio, '9:16');
      assert.equal(input.generate_audio, false, `${model.id}: generate_audio must be false`);
    } else if (model.inputFormat === 'kling-o3') {
      assert.equal(input.resolution, undefined, `${model.id}: resolution must be omitted (fixed 720p model)`);
      assert.equal(input.aspect_ratio, '9:16');
      assert.equal(input.sound, false, `${model.id}: sound must be false`);
      assert.equal(input.generate_audio, undefined);
    } else if (model.inputFormat === 'gemini-omni') {
      assert.equal(input.resolution, '720p');
      assert.equal(input.aspect_ratio, '9:16');
      assert.equal(input.generate_audio, undefined, `${model.id}: audio must be omitted (no audio control in schema)`);
    } else if (model.inputFormat === 'pixverse-c1') {
      assert.equal(input.resolution, '720p');
      assert.equal(input.aspect_ratio, '9:16');
      assert.equal(input.generate_audio_switch, false, `${model.id}: generate_audio_switch must be false`);
      assert.equal(input.generate_audio, undefined);
    } else if (model.inputFormat === 'grok-imagine') {
      assert.equal(input.resolution, '720p');
      assert.equal(input.generate_audio, undefined, `${model.id}: audio must be omitted (no audio control in schema)`);
      assert.equal(input.aspect_ratio, undefined);
    } else if (model.inputFormat === 'pruna') {
      assert.equal(input.resolution, '768p', `${model.id}: 768p is nearest supported resolution above 720p`);
      assert.equal(input.aspect_ratio, '9:16');
      assert.equal(input.prompt_upsampler, 'off');
      assert.equal(input.generate_audio, undefined, `${model.id}: audio must be omitted (no audio control in schema)`);
    }

    // Rule 1: Maximum supplied refs = 3, no 4th reference
    const refCount = Array.isArray(input.images) ? input.images.length : Array.isArray(input.reference_images) ? input.reference_images.length : 0;
    assert.equal(refCount, 3, `${model.id}: reference count must be capped at 3`);

    // Verify Master is #1, Garment 1 is #2, Garment 2 is #3, no 4th ref
    if (model.inputFormat === 'pixverse-c1') {
      assert.equal(input.images[0].url, 'https://example.test/master.jpg');
      assert.equal(input.images[0].name, 'master');
      assert.equal(input.images[0].type, 'reference');
      assert.equal(input.images[1].url, 'https://example.test/front.jpg');
      assert.equal(input.images[1].name, 'garment1');
      assert.equal(input.images[2].url, 'https://example.test/back.jpg');
      assert.equal(input.images[2].name, 'garment2');
      assert.equal(input.images.length, 3);
    } else if (model.inputFormat === 'h3') {
      assert.equal(input.reference_images[0], 'https://example.test/master.jpg');
      assert.equal(input.reference_images[1], 'https://example.test/front.jpg');
      assert.equal(input.reference_images[2], 'https://example.test/back.jpg');
      assert.equal(input.reference_images.length, 3);
      assert.equal(input.images, undefined, `${model.id}: h3 must use reference_images field only`);
    } else {
      assert.equal(input.images[0], 'https://example.test/master.jpg');
      assert.equal(input.images[1], 'https://example.test/front.jpg');
      assert.equal(input.images[2], 'https://example.test/back.jpg');
      assert.equal(input.images.length, 3);
      assert.equal(input.reference_images, undefined, `${model.id}: must use images field only`);
    }

    // Rule 3: Provider-specific syntax
    if (model.inputFormat === 'h3') {
      assert.match(input.prompt, /<Picture 1>/);
      assert.match(input.prompt, /<Picture 2>/);
      assert.match(input.prompt, /<Picture 3>/);
      assert.doesNotMatch(input.prompt, /<Picture 4>/);
    } else if (model.inputFormat === 'vidu') {
      assert.match(input.prompt, /Image 1/);
      assert.match(input.prompt, /Image 2/);
      assert.match(input.prompt, /Image 3/);
      assert.doesNotMatch(input.prompt, /Image 4/);
      assert.doesNotMatch(input.prompt, /<Picture/);
      assert.doesNotMatch(input.prompt, /@Image/);
    } else if (model.inputFormat === 'kling-o3') {
      assert.match(input.prompt, /<<<image_1>>>/);
      assert.match(input.prompt, /<<<image_2>>>/);
      assert.match(input.prompt, /<<<image_3>>>/);
      assert.doesNotMatch(input.prompt, /<<<image_4>>>/);
      assert.doesNotMatch(input.prompt, /@Image/);
      assert.doesNotMatch(input.prompt, /<Picture/);
    } else if (model.inputFormat === 'gemini-omni') {
      assert.match(input.prompt, /<IMAGE_REF_0>/);
      assert.match(input.prompt, /<IMAGE_REF_1>/);
      assert.match(input.prompt, /<IMAGE_REF_2>/);
      assert.doesNotMatch(input.prompt, /<IMAGE_REF_3>/);
      assert.doesNotMatch(input.prompt, /<Picture/);
    } else if (model.inputFormat === 'pixverse-c1') {
      assert.match(input.prompt, /@master/);
      assert.match(input.prompt, /@garment1/);
      assert.match(input.prompt, /@garment2/);
      assert.doesNotMatch(input.prompt, /@garment3/);
      assert.doesNotMatch(input.prompt, /<Picture/);
    } else if (model.inputFormat === 'grok-imagine') {
      assert.match(input.prompt, /<IMAGE_0>/);
      assert.match(input.prompt, /<IMAGE_1>/);
      assert.match(input.prompt, /<IMAGE_2>/);
      assert.doesNotMatch(input.prompt, /<IMAGE_3>/);
      assert.doesNotMatch(input.prompt, /<Picture/);
    } else if (model.inputFormat === 'pruna') {
      assert.match(input.prompt, /Master portrait \(Image 1\)/);
      assert.match(input.prompt, /Garment reference 1/);
      assert.match(input.prompt, /Garment reference 2/);
      assert.doesNotMatch(input.prompt, /<Picture/);
      assert.doesNotMatch(input.prompt, /<IMAGE/);
    }

    // Rule 4: Prompt length < 5,000 characters
    assert(input.prompt.length < 5000, `${concept.id}/${model.id}: prompt exceeds 5000 characters (${input.prompt.length})`);
    assert.match(input.prompt, /absolute authority/);
    assert.match(input.prompt, /No hand may move toward or touch the chest/);
    assert.match(input.prompt, /no.*smile/i);

    // Rule 7: Valid JSON schema serialization
    const serialized = JSON.stringify(input);
    assert(serialized.length > 50, `${model.id}: valid serialized JSON payload required`);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.duration, 6);

    // Test 2: Single garment pass -> MUST contain exactly 2 references (master + garment 1)
    const singleGarmentInput = buildWaveSpeedVideoInput(
      model.inputFormat,
      'https://example.test/master.jpg',
      ['https://example.test/single-garment.jpg'],
      concept.id,
      ['pallu'],
    );
    const singleRefCount = Array.isArray(singleGarmentInput.images)
      ? singleGarmentInput.images.length
      : Array.isArray(singleGarmentInput.reference_images)
        ? singleGarmentInput.reference_images.length
        : 0;
    assert.equal(singleRefCount, 2, `${model.id}: single garment input must have exactly 2 references`);
  }
}

assert.match(videoAdapterSource, /duration:\s*6/);
assert.match(videoAdapterSource, /resolution:\s*'768P'/);
assert.match(videoAdapterSource, /aspect_ratio:\s*'9:16'/);
assert.match(videoAdapterSource, /prompt_expansion_mode:\s*'disabled'/);

console.log('WaveSpeed frozen contract tests passed: 9 models, max 3 references, provider-exact schemas, and 12 concepts.');

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
    const input = buildWaveSpeedVideoInput(model.inputFormat, 'https://example.test/master.jpg', ['https://example.test/front.jpg', 'https://example.test/back.jpg', 'https://example.test/detail.jpg'], concept.id, ['front', 'back', 'detail']);
    assert.equal(input.duration, 6);
    assert.equal(input.aspect_ratio, '9:16');
    assert.equal((input.images || input.reference_images).length, 4);
    assert.match(input.prompt, /absolute authority/);
    assert.match(input.prompt, /No hand may move toward or touch the chest/);
    assert.match(input.prompt, /no.*smile/i);
    assert(input.prompt.length < 5000, `${concept.id}/${model.id}: avoid oversized motion prompt`);
    if (model.inputFormat === 'kling') assert.match(input.prompt, /@Image1/);
    if (model.inputFormat === 'vidu') assert.doesNotMatch(input.prompt, /<Picture/);
  }
}

assert.match(videoAdapterSource, /duration:\s*6/);
assert.match(videoAdapterSource, /resolution:\s*'768P'/);
assert.match(videoAdapterSource, /aspect_ratio:\s*'9:16'/);
assert.match(videoAdapterSource, /prompt_expansion_mode:\s*'disabled'/);

console.log('Diwali v3 audit passed: 12 concepts, identity/garment locks, safe hands, and H3 input contract.');

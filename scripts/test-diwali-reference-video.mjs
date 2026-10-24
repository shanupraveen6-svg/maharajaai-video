import assert from 'node:assert/strict';
import {
  VIDEO_CONCEPTS,
  VIDEO_PROMPT_ARCHITECTURE_VERSION,
  buildH3MotionPrompt,
  buildVideoMasterPrompt,
} from '../src/lib/maharaja/video-concepts.ts';
import { readFile } from 'node:fs/promises';

const videoAdapterSource = await readFile(new URL('../src/lib/maharaja/video-test.ts', import.meta.url), 'utf8');
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
}

assert.match(videoAdapterSource, /duration:\s*6/);
assert.match(videoAdapterSource, /resolution:\s*'768P'/);
assert.match(videoAdapterSource, /aspect_ratio:\s*'9:16'/);
assert.match(videoAdapterSource, /prompt_expansion_mode:\s*'disabled'/);

console.log('Diwali v3 audit passed: 12 concepts, identity/garment locks, safe hands, and H3 input contract.');

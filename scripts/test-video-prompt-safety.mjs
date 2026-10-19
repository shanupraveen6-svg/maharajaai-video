import assert from 'node:assert/strict';
import { buildEventVideoPrompt, buildFailSafeVideoPrompt, buildFinalPrompt, buildMasterPrompt, resolveGarmentType } from '../src/lib/maharaja/config.ts';

const categories = ['women', 'men', 'girl', 'boy'];
const events = ['diwali', 'pongal', 'new-year', 'christmas', 'ramadan', 'birthday'];
const styles = ['set-1', 'set-2'];
const forbidden = [
  'micro-saccades',
  'warm festive smile',
  'fabric edges have subtle natural micro-sway',
  'lateral perspective shift',
  'lateral arc',
  'orbit',
  'hero angle',
  'boyish charm',
  'traditional attire',
];

for (const category of categories) {
  for (const event of events) {
    for (const style of styles) {
      const prompt = buildFinalPrompt(buildEventVideoPrompt(category, event, 'prompt-safety', style));
      const lower = prompt.toLowerCase();
      for (const phrase of forbidden) {
        assert.equal(lower.includes(phrase), false, `${category}/${event}/${style} contains risky phrase: ${phrase}`);
      }
      assert.match(prompt, /approved master image/i);
      assert.match(prompt, /slow, elegant optical dolly-in|slow whole-frame optical push/i);
      assert.match(prompt, /only one natural soft blink/i);
      assert.match(prompt, /extremely subtle chest breathing/i);
      assert.match(prompt, /Particles must never cross or obscure the face, body, garment/i);
      assert.match(prompt, /EXECUTION & ANCHOR CONSTRAINTS:/i);
      assert.match(prompt, /Preserve exact identity, facial geometry, smile, gaze, pose, clothing, and accessories/i);
      assert.ok(prompt.length <= 3500, `provider prompt exceeds cap: ${prompt.length}`);
    }
  }
}

const retryPrompt = buildFinalPrompt(buildFailSafeVideoPrompt('women', 'diwali'), undefined, true);
for (const phrase of forbidden) {
  assert.equal(retryPrompt.toLowerCase().includes(phrase), false, `retry contains risky phrase: ${phrase}`);
}
assert.match(retryPrompt, /sole visual authority/i);
assert.match(retryPrompt, /EXECUTION & ANCHOR CONSTRAINTS:/i);
assert.match(retryPrompt, /Preserve the exact person, expression, pose, clothing, and accessories/i);
assert.doesNotMatch(retryPrompt, /soft blink|chest breathing|foreground particles/i);

assert.equal(resolveGarmentType('boy', 'Uploaded garment'), 'generic');
assert.equal(resolveGarmentType('men', 'blue and white shirt'), 'generic');
assert.equal(resolveGarmentType('girl', 'party dress'), 'generic');
assert.equal(resolveGarmentType('women', 'silk shirt'), 'generic');
assert.equal(resolveGarmentType('boy', 'kurta pyjama'), 'boy_ethnic');
assert.equal(resolveGarmentType('women', 'Kanchipuram saree with pallu'), 'saree');

for (const category of categories) {
  for (const event of events) {
    const masterPrompt = buildMasterPrompt(category, event, 'master-safety', 'generic', 'set-1');
    assert.doesNotMatch(masterPrompt, /traditional pattu pavadai|traditional ethnic wear|traditional festive wear|festive attire|modest ethnic wear|cheerful ethnic wear/i);
    assert.match(masterPrompt, /event environment changes only the background/i);
  }
}

console.log('Image and video prompt safety audit passed for generic-garment preservation, 48 normal combinations, and the retry prompt.');

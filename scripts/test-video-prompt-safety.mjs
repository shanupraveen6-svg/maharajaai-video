import assert from 'node:assert/strict';
import { buildEventVideoPrompt, buildFailSafeVideoPrompt, buildFinalPrompt } from '../src/lib/maharaja/config.ts';

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
    }
  }
}

const retryPrompt = buildFinalPrompt(buildFailSafeVideoPrompt('women', 'diwali'), undefined, true);
for (const phrase of forbidden) {
  assert.equal(retryPrompt.toLowerCase().includes(phrase), false, `retry contains risky phrase: ${phrase}`);
}
assert.match(retryPrompt, /sole visual authority/i);
assert.doesNotMatch(retryPrompt, /soft blink|chest breathing|foreground particles/i);

console.log('Video prompt safety audit passed for 48 normal combinations and the retry prompt.');

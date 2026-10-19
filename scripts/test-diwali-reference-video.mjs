import assert from 'node:assert/strict';
import {
  buildDiwaliReferenceVideoPrompt,
  DIWALI_REFERENCE_VIDEO_MODEL,
  getDiwaliReferencePromptId,
} from '../src/lib/maharaja/reference-video.ts';

const categories = ['men', 'women', 'boy', 'girl'];
const promptIds = [];
for (const category of categories) {
  promptIds.push(getDiwaliReferencePromptId(category, 'set-1'));
  promptIds.push(getDiwaliReferencePromptId(category, 'set-2'));
}
promptIds.push(getDiwaliReferencePromptId('women', 'set-1', 1));
promptIds.push(getDiwaliReferencePromptId('women', 'set-1', 2));

assert.equal(DIWALI_REFERENCE_VIDEO_MODEL, 'minimax/h3-max/reference-to-video');
assert.equal(new Set(promptIds).size, 10, 'Eight primary prompts and two backups must be unique.');

const forbiddenClothingGuesses = [
  /\bkurta\b/i,
  /\bsaree\b/i,
  /\bsari\b/i,
  /\bshirt\b/i,
  /\bpants?\b/i,
  /\bgrey\b/i,
  /\bgray\b/i,
  /\bblue\b/i,
  /\bethnic wear\b/i,
  /\bwestern wear\b/i,
  /\btraditional attire\b/i,
];

for (const promptId of promptIds) {
  const prompt = buildDiwaliReferenceVideoPrompt(promptId);
  assert.ok(prompt.length > 900 && prompt.length < 3500, `${promptId} must fit the provider prompt budget.`);
  assert.match(prompt, /approved first-frame image is the final visual authority/i);
  assert.match(prompt, /Image 1 is the original customer identity reference/i);
  assert.match(prompt, /Images 2 onward/i);
  assert.match(prompt, /CUSTOMER AND CLOTHING FIDELITY OVERRIDE EVERY OTHER INSTRUCTION/i);
  for (const forbidden of forbiddenClothingGuesses) {
    assert.doesNotMatch(prompt, forbidden, `${promptId} contains clothing guess ${forbidden}`);
  }
}

console.log('Diwali Reference-to-Video audit passed: 8 primary prompts, 2 backups, no clothing or colour guesses.');

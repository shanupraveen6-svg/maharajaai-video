import assert from 'node:assert/strict';
import fs from 'node:fs';
const { falStatus, falUnavailable } = await import('../src/lib/maharaja/fal-status.ts');

const original = globalThis.fetch;
process.env.FAL_KEY = 'k';
try {
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing' }), { status: 403 });
  assert.equal(await falStatus(true), 'no-balance', 'A locked account reads as no balance, not a bad key');
  assert.equal(falUnavailable('no-balance'), true);
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Invalid key' }), { status: 401 });
  assert.equal(await falStatus(true), 'invalid');
  globalThis.fetch = async () => { throw new TypeError('network'); };
  assert.equal(await falStatus(true), 'unverified');
  assert.equal(falUnavailable('unverified'), false, 'A passing network problem never hides AI Video or Live');
  globalThis.fetch = async () => new Response('{"token":"t"}', { status: 200 });
  assert.equal(await falStatus(true), 'ok');
  globalThis.fetch = async () => { throw new Error('must use the cache'); };
  assert.equal(await falStatus(), 'ok', 'Checked at most every 5 minutes');
} finally {
  globalThis.fetch = original;
}
const route = fs.readFileSync(new URL('../src/app/api/maharaja/catalogue/route.ts', import.meta.url), 'utf8');
assert.doesNotMatch(route, /falUnavailable/, 'AI Video and Live Try-On stay on the TV whatever fal answers (store decision)');
console.log('✓ fal status: a locked account reads as no balance in the health check; the TV keeps every tab');

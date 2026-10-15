// In-process test of the billing-pass video state machine (mock store, no network, no paid providers).
// Run: node scripts/test-pass-state.mjs
// Note: runs without Firebase credentials on purpose, so it exercises the mock-store branch only.
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';

const server = await import('../src/lib/maharaja/server.ts');
const {
  saveVideoPass, getVideoPass, markPassTryOnImageDone, markPassVideoMasterDone, markPassVideoDone,
  markPassRetryApproved, releasePassVideoLock, acquirePassVideoLock,
} = server;

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS: ${label}`);
}

let counter = 0;
async function freshPass() {
  const code = `state_test_${Date.now()}_${counter += 1}`;
  const now = Date.now();
  await saveVideoPass({
    id: code, code, clientId: 'maharaja', phone: '9999999999', phoneMasked: '99******99', billLast4: '0000',
    eventId: 'diwali', status: 'active', createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3600000).toISOString(), expiresAtMs: now + 3600000,
    tryOnImageDone: false, tryOnImageUrl: '', videoMasterDone: false, videoMasterUrl: '',
    videoGenerating: false, videoDone: false, retryUsed: false,
    usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
  });
  return code;
}

const code = await freshPass();

assert(!(await acquirePassVideoLock(code)).ok, 'Lock refused before a video master exists');

await markPassTryOnImageDone(code, 'tryon-url');
let pass = await getVideoPass(code);
assert(pass.tryOnImageDone && pass.tryOnImageUrl === 'tryon-url' && !pass.videoMasterDone, 'Try-On image does not mark the video master as done');
assert(!(await acquirePassVideoLock(code)).ok, 'Lock still refused with only a Try-On image');

await markPassVideoMasterDone(code, 'master-url');
pass = await getVideoPass(code);
assert(pass.videoMasterDone && pass.videoMasterUrl === 'master-url' && pass.tryOnImageUrl === 'tryon-url', 'Both images stored separately');

const first = await acquirePassVideoLock(code);
const second = await acquirePassVideoLock(code);
assert(first.ok && !second.ok && /already being generated/i.test(second.error), 'Second acquire is blocked while the first holds the lock');

await releasePassVideoLock(code);
assert((await acquirePassVideoLock(code)).ok, 'Lock can be re-acquired after a provider rejection releases it');

const racePass = await freshPass();
await markPassVideoMasterDone(racePass, 'master-url');
const racers = await Promise.all(Array.from({ length: 8 }, () => acquirePassVideoLock(racePass)));
assert(racers.filter((result) => result.ok).length === 1, 'Exactly one of 8 simultaneous requests wins the lock');

await markPassVideoDone(code);
pass = await getVideoPass(code);
assert(pass.videoDone === true && pass.videoGenerating === false, 'Provider acceptance sets videoDone=true and clears the lock');
const afterDone = await acquirePassVideoLock(code);
assert(!afterDone.ok && /already completed/i.test(afterDone.error), 'No second video once videoDone=true');

await markPassRetryApproved(code);
pass = await getVideoPass(code);
assert(pass.retryUsed === true && pass.videoDone === false && pass.videoGenerating === false, 'Manager approval sets retryUsed=true and videoDone=false');
assert(pass.videoMasterUrl === 'master-url', 'Retry keeps the same video master');

assert((await acquirePassVideoLock(code)).ok, 'Retry video can start through the normal lock path');
await markPassVideoDone(code);
const afterRetry = await acquirePassVideoLock(code);
assert(!afterRetry.ok && /already completed/i.test(afterRetry.error), 'No further video after the single retry');

const stalePass = await freshPass();
await markPassVideoMasterDone(stalePass, 'master-url');
assert((await acquirePassVideoLock(stalePass)).ok, 'Fresh lock acquired');
assert(!(await acquirePassVideoLock(stalePass)).ok, 'Fresh lock blocks a second request');
// Age the lock beyond the stale window, as if the holding request crashed.
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
const { MAHARAJA_CLIENT_ID } = await import('../src/lib/maharaja/config.ts');
const key = `${MAHARAJA_CLIENT_ID}:${stalePass}`;
const stored = getMockStore().customerPasses.get(key);
getMockStore().customerPasses.set(key, { ...stored, videoGenerating: true, videoGeneratingAtMs: Date.now() - 10 * 60 * 1000 });
assert((await acquirePassVideoLock(stalePass)).ok, 'A stale lock (crashed request) expires and can be re-acquired');

console.log('All pass state-machine checks passed (mock-store branch).');

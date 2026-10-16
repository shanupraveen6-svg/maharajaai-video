// In-process test of the billing-pass video state machine (mock store, no network, no paid providers).
// Run: node scripts/test-pass-state.mjs
// Note: runs without Firebase credentials on purpose, so it exercises the mock-store branch only.
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const server = await import('../src/lib/maharaja/server.ts');
const {
  saveVideoPass, getVideoPass, markPassTryOnImageDone, markPassVideoMasterDone, markPassVideoDone,
  markPassRetryApproved, releasePassVideoLock, acquirePassVideoLock, markPassVideoFailed,
  markPassVideoSubmitted, markPassVideoReady,
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

const jobId1 = 'job_test_001';
await markPassVideoSubmitted(code, jobId1);
pass = await getVideoPass(code);
assert(pass.videoGenerating === true && pass.videoDone === false && pass.activeVideoJobId === jobId1, 'Provider acceptance sets videoGenerating=true, videoDone=false, and binds activeVideoJobId');
const duringRender = await acquirePassVideoLock(code);
assert(!duringRender.ok && /already being generated/i.test(duringRender.error), 'Lock refused while video is rendering');

// Stale job update rejection:
const staleJobId = 'job_test_stale';
await markPassVideoReady(code, staleJobId);
pass = await getVideoPass(code);
assert(pass.videoDone === false && pass.videoGenerating === true, 'Stale job ready does not set videoDone=true');

// Real active job confirms ready:
await markPassVideoReady(code, jobId1);
pass = await getVideoPass(code);
assert(pass.videoDone === true && pass.videoGenerating === false, 'Final video ready sets videoDone=true and clears videoGenerating');
const afterDone = await acquirePassVideoLock(code);
assert(!afterDone.ok && /already completed/i.test(afterDone.error), 'No second video once videoDone=true');

await markPassRetryApproved(code);
pass = await getVideoPass(code);
assert(pass.retryUsed === true && pass.videoDone === false && pass.videoGenerating === false, 'Manager approval sets retryUsed=true and videoDone=false');
assert(pass.videoMasterUrl === 'master-url', 'Retry keeps the same video master');

assert((await acquirePassVideoLock(code, 'job_retry_1')).ok, 'Retry video can start through the normal lock path');
await markPassVideoSubmitted(code, 'job_retry_1');
// Old job from first render tries to update pass during retry:
await markPassVideoReady(code, jobId1);
pass = await getVideoPass(code);
assert(pass.videoDone === false && pass.activeVideoJobId === 'job_retry_1', 'Stale first job cannot complete pass during active retry');
await markPassVideoReady(code, 'job_retry_1');
const afterRetry = await acquirePassVideoLock(code);
assert(!afterRetry.ok && /already completed/i.test(afterRetry.error), 'No further video after the single retry');

const stalePass = await freshPass();
await markPassVideoMasterDone(stalePass, 'master-url');
assert((await acquirePassVideoLock(stalePass, 'job_crash_pre_provider')).ok, 'Fresh lock acquired');
assert(!(await acquirePassVideoLock(stalePass)).ok, 'Fresh lock blocks a second request');

// Age the lock beyond the stale window, simulating a crashed server before provider acceptance (providerAccepted=false):
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
const { MAHARAJA_CLIENT_ID } = await import('../src/lib/maharaja/config.ts');
const key = `${MAHARAJA_CLIENT_ID}:${stalePass}`;
const stored = getMockStore().customerPasses.get(key);
getMockStore().customerPasses.set(key, { ...stored, videoGenerating: true, providerAccepted: false, videoGeneratingAtMs: Date.now() - 10 * 60 * 1000 });
assert((await acquirePassVideoLock(stalePass)).ok, 'A crashed pre-provider lock (providerAccepted=false) expires and can be re-acquired');

// Active provider render with providerAccepted=true does NOT expire even after 10 minutes:
getMockStore().customerPasses.set(key, { ...stored, videoGenerating: true, activeVideoJobId: 'job_render_ongoing', providerAccepted: true, videoGeneratingAtMs: Date.now() - 10 * 60 * 1000 });
assert(!(await acquirePassVideoLock(stalePass)).ok, 'Active provider render with providerAccepted=true does not expire after 3 minutes');

// Atomic acquirePassVideoLock(code, jobId) and releasePassVideoLock:
const atomicPass = await freshPass();
await markPassVideoMasterDone(atomicPass, 'master-url');
const atomicLock = await acquirePassVideoLock(atomicPass, 'job_atomic_123');
assert(atomicLock.ok, 'Atomic lock acquisition succeeded');
const atomicPassDoc = await getVideoPass(atomicPass);
assert(atomicPassDoc.videoGenerating === true && atomicPassDoc.activeVideoJobId === 'job_atomic_123' && atomicPassDoc.providerAccepted === false, 'acquirePassVideoLock atomically sets videoGenerating and activeVideoJobId with providerAccepted=false');
await releasePassVideoLock(atomicPass);
const releasedPassDoc = await getVideoPass(atomicPass);
assert(releasedPassDoc.videoGenerating === false && !releasedPassDoc.activeVideoJobId && releasedPassDoc.providerAccepted === false, 'releasePassVideoLock clears videoGenerating, activeVideoJobId and providerAccepted');

// Test failed render recovery:
const failedRenderPass = await freshPass();
await markPassVideoMasterDone(failedRenderPass, 'master-url');
assert((await acquirePassVideoLock(failedRenderPass, 'job_fail_1')).ok, 'Lock acquired for failed-render test');
await markPassVideoSubmitted(failedRenderPass, 'job_fail_1');
pass = await getVideoPass(failedRenderPass);
assert(pass.videoGenerating === true && pass.providerAccepted === true, 'Initially consumed upon provider acceptance');
await markPassVideoFailed(failedRenderPass, 'job_fail_1');
pass = await getVideoPass(failedRenderPass);
assert(pass.videoDone === false && pass.lastVideoFailed === true && !pass.activeVideoJobId, 'Failed render restores customer video slot and clears activeVideoJobId');
assert((await acquirePassVideoLock(failedRenderPass, 'job_fail_retry')).ok, 'Customer can re-acquire lock after failed render without manager PIN');

console.log('All pass state-machine checks passed (mock-store branch).');

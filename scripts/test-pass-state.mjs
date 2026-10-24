import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';
process.env.NODE_ENV = 'production';
process.env.ENFORCE_REPEAT_LIMITS = 'true';

const {
  saveVideoPass,
  getVideoPass,
  acquirePassImageLock,
  releasePassImageLock,
  markPassVideoMasterDone,
  approvePassVideoMaster,
  acquirePassVideoLock,
  releasePassVideoLock,
  markPassVideoSubmitted,
  markPassVideoReady,
  markPassVideoFailed,
} = await import('../src/lib/maharaja/server.ts');

const code = `PASS_${Date.now()}`;
const now = Date.now();
await saveVideoPass({
  id: code, code, clientId: 'maharaja', phone: '9840012345', phoneMasked: '98******45', billLast4: '1234',
  eventId: 'diwali', status: 'active', createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(), expiresAtMs: now + 3600000,
  tryOnImageDone: false, tryOnImageUrl: '', videoMasterDone: false, videoMasterUrl: '',
  videoMasterApproved: false, videoMasterApprovedUrl: '', videoGenerating: false, videoDone: false,
  retryUsed: false, usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
});

assert.equal((await acquirePassVideoLock(code, 'premature')).ok, false, 'video must wait for a master');
const firstImage = await acquirePassImageLock(code, 'ai-video');
assert.equal(firstImage.ok, true);
assert.equal((await acquirePassImageLock(code, 'ai-video')).ok, false, 'parallel image generation is blocked');
await markPassVideoMasterDone(code, 'master-v3.jpg', {
  conceptId: 'women-golden-courtyard',
  promptArchitectureVersion: 'diwali-v3-natural-lock',
  category: 'women', garmentType: 'saree', garmentRoles: ['primary garment'], referenceSessionId: 'session-v3',
}, firstImage.generationId);
assert.equal((await acquirePassVideoLock(code, 'unapproved')).ok, false, 'video must wait for approval');
await approvePassVideoMaster(code, 'master-v3.jpg');

const jobOne = 'job-one';
assert.equal((await acquirePassVideoLock(code, jobOne)).ok, true);
assert.equal((await acquirePassVideoLock(code, 'parallel')).ok, false, 'parallel video submission is blocked');
await markPassVideoSubmitted(code, jobOne);
await markPassVideoReady(code, 'stale-job');
assert.equal((await getVideoPass(code)).videoDone, false, 'stale completion cannot win');
await markPassVideoReady(code, jobOne);
assert.equal((await getVideoPass(code)).videoDone, true);

const retryJob = 'job-two';
assert.equal((await acquirePassVideoLock(code, retryJob)).ok, true, 'one video retry is available');
await markPassVideoSubmitted(code, retryJob);
await markPassVideoFailed(code, retryJob);
assert.equal((await getVideoPass(code)).videoGenerating, false, 'failed provider restores the lock');
assert.equal((await acquirePassVideoLock(code, retryJob)).ok, true, 'failed attempt can be retried');
await releasePassVideoLock(code, retryJob);

console.log('Current v3 pass state audit passed: approval, fencing, retry, and failure restoration.');

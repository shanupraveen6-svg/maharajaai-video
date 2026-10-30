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
const failedTryOn = await acquirePassImageLock(code, 'try-on');
assert.equal(failedTryOn.ok, true);
await releasePassImageLock(code, failedTryOn.generationId);
assert.equal((await getVideoPass(code)).imageGenerating, false, 'failed Try-On must release its generation lock');
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

const { NextRequest } = await import('next/server');
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
const { issueDisplayToken, DISPLAY_COOKIE } = await import('../src/lib/auth/display.ts');
const { POST: enqueue } = await import('../src/app/api/live/enqueue/route.ts');
const { POST: completeLivePlayback } = await import('../src/app/api/live/complete/route.ts');
const liveSession = 'retention-regression';
const liveJob = 'retention-job';
await saveVideoPass({ ...(await getVideoPass(code)), expiresAt: new Date(Date.now() + 60_000).toISOString(), expiresAtMs: Date.now() + 60_000 });
const store = getMockStore();
store.sessions.set(liveSession, { accessCode: code });
store.sessions.set(`video_test_${liveJob}`, { status: 'ready', sessionId: liveSession, accessCode: code, videoStoragePath: 'final-6s.mp4', liveVideoStoragePath: 'live-9s.mp4' });
const request = () => new NextRequest('http://localhost/api/live/enqueue', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: liveSession, jobId: liveJob, accessCode: code, liveConsent: true, loopConsent: true }),
});
assert.equal((await enqueue(request())).status, 200);
const liveExpiry = store.sessions.get(liveSession).expiresAt;
assert.ok(new Date(liveExpiry).getTime() > Date.now() + 47 * 60 * 60 * 1000, 'One-minute pass still grants a full two-day live replay window.');
assert.ok(new Date(liveExpiry).getTime() <= Date.now() + 48 * 60 * 60 * 1000, 'Live replay retention never exceeds two days.');
assert.equal(store.sessions.get(liveSession).retentionPolicyVersion, 'live-v2');
assert.equal((await enqueue(request())).status, 200);
assert.equal(store.sessions.get(liveSession).expiresAt, liveExpiry, 'Duplicate Go Live must not extend retention.');
assert.equal(store.liveQueue.filter((item) => item.sessionId === liveSession).length, 1);

const queuedLive = store.liveQueue.find((item) => item.sessionId === liveSession);
assert.equal(queuedLive.repeatCount, 2, 'Go Live premiere plays twice before joining the universal pool.');
queuedLive.status = 'reserved';
queuedLive.reservationId = 'live-reservation';
const displayToken = await issueDisplayToken();
const completeRequest = (playNumber) => new NextRequest('http://localhost/api/live/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie: `${DISPLAY_COOKIE}=${displayToken}` },
  body: JSON.stringify({ queueId: queuedLive.id, reservationId: queuedLive.reservationId, playNumber }),
});
const firstPlay = await (await completeLivePlayback(completeRequest(1))).json();
assert.equal(firstPlay.status, 'repeat', 'First Go Live play repeats for its second premiere play.');
const retriedFirstPlay = await (await completeLivePlayback(completeRequest(1))).json();
assert.equal(retriedFirstPlay.status, 'repeat', 'Retry of first completion does not consume the second play.');
const secondPlay = await (await completeLivePlayback(completeRequest(2))).json();
assert.equal(secondPlay.status, 'completed', 'Second Go Live play publishes the replay.');
const retriedSecondPlay = await (await completeLivePlayback(completeRequest(2))).json();
assert.equal(retriedSecondPlay.status, 'completed', 'Retry of second completion is idempotent.');
assert.equal(queuedLive.timesPlayed, 2, 'Exactly two Go Live plays are recorded.');
assert.equal(store.videos.get(queuedLive.videoId).universalPool, true, 'Completed Go Live video joins the universal pool.');

console.log('Current v3 pass state audit passed: approval, fencing, retry, and failure restoration.');

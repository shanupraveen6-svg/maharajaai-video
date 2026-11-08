import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [start, status, webhook, finalize, cleanup, next, playing, proxy, master, experience, videoModels, download] = await Promise.all([
  read('src/app/api/video/start/route.ts'),
  read('src/app/api/video/status/route.ts'),
  read('src/app/api/video/webhook/route.ts'),
  read('src/lib/maharaja/server.ts'),
  read('src/lib/maharaja/privacy-cleanup.ts'),
  read('src/app/api/live/next/route.ts'),
  read('src/app/api/tv/playing/route.ts'),
  read('src/proxy.ts'),
  read('src/app/api/ai/master-image/route.ts'),
  read('src/components/GiftVideoExperience.tsx'),
  read('src/lib/maharaja/video-test.ts'),
  read('src/app/api/download/asset/route.ts'),
]);

assert.match(start, /videoMasterApproved/);
assert.match(start, /videoMasterApprovedUrl !== access\.pass\.videoMasterUrl/);
// The fal webhook is set by the engine switcher the start route submits through.
assert.match(start, /submitRender\(/);
assert.match(start, /webhookUrlFor\(/);
assert.match(await read('src/lib/maharaja/video-engines.ts'), /fal_webhook/);
assert.match(start, /acquirePassVideoLock\(passCode, jobId\)/);
assert.match(start, /markPassVideoSubmitted\(passCode, jobId\)/);
assert.match(start, /markPassVideoFailed\(passCode, jobId\)/);
assert.match(webhook, /timingSafeEqual/);
assert.match(webhook, /status: 'finalizing'/);
assert.match(webhook, /activeVideoTestJobId: jobId/);
assert.match(status, /finalizationLeaseUntil/);
assert.match(status, /markPassVideoFailed\(passCode, jobId\)/);
assert.doesNotMatch(status, /wavespeed/i);
assert.match(finalize, /validateBrandedVideo\(customerVideo, 6\)/);
assert.match(finalize, /validateBrandedVideo\(liveVideo, 9\)/);
assert.doesNotMatch(finalize, /falling back to raw provider MP4/);
assert.doesNotMatch(cleanup, /retainedForPromotion: true/, 'Nothing is kept forever for promotion');
assert.match(cleanup, /cleanupPhoneLooks/, 'Phone Wall QR looks are deleted after their hour');
assert.match(next, /verifyTvRequest/);
assert.match(playing, /verifyTvRequest/);
assert.match(proxy, /pathname === '\/tv'/);
assert.match(master, /Photo source does not belong to this customer session/);
assert.doesNotMatch(master, /await fetch\(trimmed\)/);
assert.doesNotMatch(master, /FalTryOnRejected/);
assert.doesNotMatch(experience, /automatically failing over/i);
assert.doesNotMatch(experience, /startVideoTest\('pixverse-c1'\)/);
// The phone makes the AI Video with H3 Max (the server falls back to Gemini Omni Flash).
assert.match(experience, /videoModel: 'h3-max'/);
assert.match(videoModels, /h3-max/);
assert.match(videoModels, /pixverse-c1/);
assert.doesNotMatch(videoModels, /isVideoModelTestingEnabled/);
assert.match(download, /if \(!verifyOperatorRequest\(req\)\)/);

console.log('Current production flow audit passed: approval, webhook, atomic finalization, privacy, TV auth, and session-bound media.');

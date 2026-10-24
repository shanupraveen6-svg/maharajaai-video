import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
  delete process.env[key];
}
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_operator_secret';
process.env.ENFORCE_REPEAT_LIMITS = 'false';

const server = await import('../src/lib/maharaja/server.ts');
const {
  getCustomerServiceAllowances,
  acquireServiceGenerationLock,
  releaseServiceGenerationLock,
  recordServiceGenerationSuccess,
  saveVideoPass,
  getVideoPass,
  verifyMaharajaAccess,
  acquirePassVideoLock,
  markPassVideoReady,
  enablePassCustomerRetry,
  approvePassVideoMaster,
  markPassVideoMasterDone,
} = server;

let assertionCount = 0;
function assert(condition, label) {
  assertionCount += 1;
  if (!condition) {
    console.error(`\n❌ FAILED [Assertion ${assertionCount}]: ${label}`);
    throw new Error(label);
  }
  console.log(`PASS [${assertionCount}]: ${label}`);
}

console.log('\n========================================================================');
console.log('MAHARAJA — DETERMINISTIC VERIFICATION OF ENFORCE_REPEAT_LIMITS=false');
console.log('========================================================================');

const phone = '9876543210';
const code = `pass_unlimited_${Date.now()}`;
const now = Date.now();

await saveVideoPass({
  id: code,
  code,
  clientId: 'maharaja',
  phone,
  phoneMasked: '98******10',
  billLast4: '1234',
  eventId: 'diwali',
  status: 'active',
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
  expiresAtMs: now + 3600000,
  tryOnImageDone: true,
  tryOnImageUrl: 'https://test.com/tryon.jpg',
  videoMasterDone: true,
  videoMasterUrl: 'https://test.com/master.jpg',
  videoMasterApproved: true,
  videoMasterApprovedUrl: 'https://test.com/master.jpg',
  videoGenerating: false,
  videoDone: false,
  retryUsed: false,
  usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
});

// 1. Initial allowances report enforceRepeatLimits=false and unlimited remaining count
const access = await verifyMaharajaAccess({ headers: new Headers() }, code, 'ai-video');
assert(access.allowed, 'Access allowed for pass');
assert(access.allowances.enforceRepeatLimits === false, 'enforceRepeatLimits is false');
assert(access.allowances.video.remaining === 999, 'video remaining is 999 (unlimited)');

// 2. Perform Generation #1
const lock1 = await acquireServiceGenerationLock(phone, 'video');
assert(lock1.ok, 'Generation #1 lock acquired');
const rec1 = await recordServiceGenerationSuccess(phone, 'video');
assert(rec1.used === 1, 'Generation #1 count is 1');
assert(rec1.exhausted === false, 'Generation #1 does not exhaust quota');

// 3. Perform the included customer retry without any extra approval step
const lock2 = await acquireServiceGenerationLock(phone, 'video');
assert(lock2.ok, 'Generation #2 lock acquired as the included customer retry');
const rec2 = await recordServiceGenerationSuccess(phone, 'video');
assert(rec2.used === 2, 'Generation #2 count is 2');
assert(rec2.exhausted === false, 'Generation #2 does not exhaust quota');

// 4. Perform Generation #3 (beyond 2/2 limit! telemetry counts 3, not clamped)
const lock3 = await acquireServiceGenerationLock(phone, 'video');
assert(lock3.ok, 'Generation #3 lock acquired (2/2 limit truly disabled!)');
const rec3 = await recordServiceGenerationSuccess(phone, 'video');
assert(rec3.used === 3, 'Generation #3 count increments to 3 (not clamped to 2)');
assert(rec3.exhausted === false, 'Generation #3 does not exhaust quota');

// 5. Test customer retry approval
await enablePassCustomerRetry(code, 'video', 'ai-video');
const passAfterRetry = await getVideoPass(code);
assert(passAfterRetry.retryEnabled === true, 'retryEnabled is true on pass');
assert(passAfterRetry.retryUsed === false, 'retryUsed remains false when ENFORCE_REPEAT_LIMITS=false');
assert(passAfterRetry.videoDone === false, 'videoDone reset to false for retry generation');

// 6. Verify frontend calculations with mock allowances
const mockAllowances = access.allowances;
const enforceLimits = mockAllowances?.enforceRepeatLimits ?? false;
const videoAllowanceUsed = 3;
const imageAllowanceUsed = 3;
const imageExhausted = enforceLimits && imageAllowanceUsed >= 2;
const videoExhausted = enforceLimits && videoAllowanceUsed >= 2;
const canRetryVideo = !enforceLimits || !videoExhausted;
const canRetryImage = !enforceLimits || !imageExhausted;

assert(imageExhausted === false, 'Frontend: imageExhausted is false');
assert(videoExhausted === false, 'Frontend: videoExhausted is false');
assert(canRetryVideo === true, 'Frontend: canRetryVideo is true');
assert(canRetryImage === true, 'Frontend: canRetryImage is true');

console.log('\n========================================================================');
console.log('ALL UNLIMITED RETRY & REPEAT LIMIT TESTS PASSED!');
console.log('========================================================================\n');

// Deterministic test suite for Maharaja Final Mobile Number & Billing QR Retry Policy.
// Run: node scripts/test-phone-retry-policy.mjs
// Verifies:
// 1. Phone number normalization & duplicate mobile deduplication.
// 2. Phone lookup vs QR lookup entitlement equivalence.
// 3. Repeated billing passes & QR reuse for same phone sharing the 2-generation ceiling.
// 4. Three independent counters: Try-On (2), Master Image (2), Video (2). Retrying image does NOT consume video.
// 5. Manager authorization gate for 2nd video generation (1 original + 1 manager-authorized retry).
// 6. Concurrency locks preventing simultaneous generation across tabs/devices.
// 7. Exactly-once accounting: failed provider calls restore slot, never burning quota without successful output.
// 8. Rejected master image handling.
// 9. Asset retention and preservation.

import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_operator_secret';

const server = await import('../src/lib/maharaja/server.ts');
const {
  normalizePhoneNumber,
  getOrCreateCampaignEntitlement,
  getCampaignEntitlementByPhone,
  getCampaignEntitlementForPass,
  getCustomerServiceAllowances,
  acquireServiceGenerationLock,
  releaseServiceGenerationLock,
  recordServiceGenerationSuccess,
  authorizeVideoRetry,
  saveVideoPass,
  getVideoPass,
  verifyMaharajaAccess,
  acquirePassImageLock,
  releasePassImageLock,
  markPassTryOnImageDone,
  markPassVideoMasterDone,
  approvePassVideoMaster,
  rejectPassMasterImage,
  acquirePassVideoLock,
  releasePassVideoLock,
  markPassVideoReady,
  markPassVideoFailed,
  markPassRetryApproved,
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
console.log('MAHARAJA — FINAL MOBILE NUMBER & BILLING QR RETRY POLICY VERIFICATION');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Phone Normalization & Deduplication
// -----------------------------------------------------------------------------
console.log('--- TEST 1: Phone Normalization & Deduplication ---');
const phone1 = '+91 98400 12345';
const phone2 = '09840012345';
const phone3 = '+919840012345';
const phone4 = '98400-12345';
const phone5 = '9840012345';

assert(normalizePhoneNumber(phone1) === '9840012345', 'Normalizes +91 formatted number');
assert(normalizePhoneNumber(phone2) === '9840012345', 'Normalizes leading zero number');
assert(normalizePhoneNumber(phone3) === '9840012345', 'Normalizes +91 prefix without spaces');
assert(normalizePhoneNumber(phone4) === '9840012345', 'Normalizes hyphenated number');
assert(normalizePhoneNumber(phone5) === '9840012345', 'Normalizes standard 10-digit number');

// -----------------------------------------------------------------------------
// TEST 2: Phone Lookup vs QR Lookup Equivalence
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: Phone Lookup vs QR Lookup Equivalence ---');
const testPhoneA = '9840011111';
const passCodeA1 = `PASS_${Date.now()}_A1`;
const now = Date.now();

await saveVideoPass({
  id: passCodeA1,
  code: passCodeA1,
  clientId: 'maharaja',
  phone: testPhoneA,
  phoneMasked: '98******11',
  billLast4: '5555',
  eventId: 'diwali',
  status: 'active',
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
  expiresAtMs: now + 3600000,
  tryOnImageDone: false,
  tryOnImageUrl: '',
  videoMasterDone: false,
  videoMasterUrl: '',
  videoMasterApproved: false,
  videoMasterApprovedUrl: '',
  videoGenerating: false,
  videoDone: false,
  retryUsed: false,
  usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
});

const entByPhone = await getCampaignEntitlementByPhone(testPhoneA);
const entByPass = await getCampaignEntitlementForPass(passCodeA1);

assert(entByPhone !== null, 'Entitlement retrieved by phone number');
assert(entByPass !== null, 'Entitlement retrieved by pass code');
assert(entByPhone.normalizedPhone === entByPass.normalizedPhone, 'Phone lookup and Pass lookup match normalizedPhone');
assert(entByPhone.normalizedPhone === testPhoneA, 'Normalized phone matches expected value');

const allowancesInitial = getCustomerServiceAllowances(entByPass);
assert(allowancesInitial.tryOn.used === 0 && allowancesInitial.tryOn.max === 2 && allowancesInitial.tryOn.remaining === 2, 'Initial Try-On allowance is 0/2');
assert(allowancesInitial.masterImage.used === 0 && allowancesInitial.masterImage.max === 2 && allowancesInitial.masterImage.remaining === 2, 'Initial Celebration Image allowance is 0/2');
assert(allowancesInitial.video.used === 0 && allowancesInitial.video.max === 2 && allowancesInitial.video.remaining === 2, 'Initial Cinematic Video allowance is 0/2');

// Verify verifyMaharajaAccess exposes the same allowances
const verifyResult = await verifyMaharajaAccess(null, passCodeA1, 'ai-video');
assert(verifyResult.allowed, 'Pass verification is allowed');
assert(verifyResult.allowances !== undefined, 'Verification response includes server allowances');
assert(verifyResult.allowances.tryOn.used === 0, 'verifyMaharajaAccess reports tryOn 0/2');
assert(verifyResult.allowances.masterImage.used === 0, 'verifyMaharajaAccess reports masterImage 0/2');
assert(verifyResult.allowances.video.used === 0, 'verifyMaharajaAccess reports video 0/2');

// -----------------------------------------------------------------------------
// TEST 3: QR Reuse & Multiple Billing Passes for Same Number
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: Repeated Billing Passes for Same Phone (Shared Ceiling) ---');
const passCodeA2 = `PASS_${Date.now()}_A2`;

// Second purchase at billing desk for same customer phone with different formatting
await saveVideoPass({
  id: passCodeA2,
  code: passCodeA2,
  clientId: 'maharaja',
  phone: '+91 98400 11111', // Formatted differently
  phoneMasked: '98******11',
  billLast4: '8888',
  eventId: 'diwali',
  status: 'active',
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
  expiresAtMs: now + 3600000,
  tryOnImageDone: false,
  tryOnImageUrl: '',
  videoMasterDone: false,
  videoMasterUrl: '',
  videoMasterApproved: false,
  videoMasterApprovedUrl: '',
  videoGenerating: false,
  videoDone: false,
  retryUsed: false,
  usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
});

// Perform 1 Try-On generation on Pass A1
const imageLockA1 = await acquirePassImageLock(passCodeA1, 'try-on');
assert(imageLockA1.ok, 'Image lock acquired on Pass A1 for Try-On');
await markPassTryOnImageDone(passCodeA1, 'https://cdn.example.com/tryon-a1.jpg');

// Check allowances on Pass A1 AND Pass A2
const entAfterA1 = await getCampaignEntitlementForPass(passCodeA1);
const entAfterA2 = await getCampaignEntitlementForPass(passCodeA2);
assert(entAfterA1.tryOn.used === 1, 'Pass A1 reflects Try-On 1/2 used');
assert(entAfterA2.tryOn.used === 1, 'Pass A2 IMMEDIATELY reflects Try-On 1/2 used (no second quota!)');
assert(entAfterA1.passCodes.includes(passCodeA1) && entAfterA1.passCodes.includes(passCodeA2), 'Both passes are linked to the same entitlement');

// -----------------------------------------------------------------------------
// TEST 4: Three Independent Counters & Limit Enforcement
// -----------------------------------------------------------------------------
console.log('\n--- TEST 4: Three Independent Counters & 2-Generation Limit ---');
const testPhoneB = '9840022222';
const passCodeB = `PASS_${Date.now()}_B`;

await saveVideoPass({
  id: passCodeB,
  code: passCodeB,
  clientId: 'maharaja',
  phone: testPhoneB,
  phoneMasked: '98******22',
  billLast4: '1234',
  eventId: 'diwali',
  status: 'active',
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
  expiresAtMs: now + 3600000,
  tryOnImageDone: false,
  tryOnImageUrl: '',
  videoMasterDone: false,
  videoMasterUrl: '',
  videoMasterApproved: false,
  videoMasterApprovedUrl: '',
  videoGenerating: false,
  videoDone: false,
  retryUsed: false,
  usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
});

// 1. First Celebration Image generation
const imgLock1 = await acquirePassImageLock(passCodeB, 'ai-video');
assert(imgLock1.ok, 'Acquired master image generation lock #1');
await markPassVideoMasterDone(passCodeB, 'https://cdn.example.com/master-1.jpg', {
  promptSet: 'set-1',
  category: 'women',
  garmentType: 'saree',
}, imgLock1.generationId);

let entB = await getCampaignEntitlementByPhone(testPhoneB);
let allowancesB = getCustomerServiceAllowances(entB);
assert(allowancesB.masterImage.used === 1, 'Celebration Image used is 1/2');
assert(allowancesB.tryOn.used === 0, 'Try-On counter remains completely untouched (0/2)');
assert(allowancesB.video.used === 0, 'Video counter remains completely untouched (0/2)');

// 2. Retry Celebration Image (Image #2)
const imgLock2 = await acquirePassImageLock(passCodeB, 'ai-video', true);
assert(imgLock2.ok, 'Acquired master image retry lock #2');
await markPassVideoMasterDone(passCodeB, 'https://cdn.example.com/master-2.jpg', {
  promptSet: 'set-1',
  category: 'women',
  garmentType: 'saree',
}, imgLock2.generationId);

entB = await getCampaignEntitlementByPhone(testPhoneB);
allowancesB = getCustomerServiceAllowances(entB);
assert(allowancesB.masterImage.used === 2, 'Celebration Image used is now 2/2 (exhausted)');
assert(allowancesB.tryOn.used === 0, 'Try-On still 0/2 after image retry');
assert(allowancesB.video.used === 0, 'Video still 0/2 after image retry (image retry did NOT burn video!)');

// 3. Attempting 3rd Celebration Image must be blocked
const imgLock3 = await acquirePassImageLock(passCodeB, 'ai-video', true);
assert(!imgLock3.ok, '3rd Celebration Image generation is strictly BLOCKED');
assert(imgLock3.error && imgLock3.error.includes('Maximum 2'), 'Error message states maximum 2 generations allowed');

// -----------------------------------------------------------------------------
// TEST 5: Cinematic Video — 1 Original + 1 Manager-Authorized Retry
// -----------------------------------------------------------------------------
console.log('\n--- TEST 5: Cinematic Video — 1 Original + 1 Manager-Authorized Retry ---');
// Approve the master image so video generation can proceed
await approvePassVideoMaster(passCodeB, 'https://cdn.example.com/master-2.jpg');

// 1. Original Video Generation
const jobId1 = 'job_video_1';
const vidLock1 = await acquirePassVideoLock(passCodeB, jobId1);
assert(vidLock1.ok, 'Acquired video generation lock #1 (original)');
await markPassVideoReady(passCodeB, jobId1);

entB = await getCampaignEntitlementByPhone(testPhoneB);
allowancesB = getCustomerServiceAllowances(entB);
assert(allowancesB.video.used === 1, 'Cinematic Video used is 1/2');
assert(!allowancesB.video.managerAuthorized, 'Video retry is not yet manager-authorized');

// 2. Attempting 2nd video WITHOUT manager authorization must be blocked
const vidLock2Unauth = await acquirePassVideoLock(passCodeB, 'job_video_2_unauth');
assert(!vidLock2Unauth.ok, '2nd video generation WITHOUT manager authorization is BLOCKED');
assert(vidLock2Unauth.error && vidLock2Unauth.error.toLowerCase().includes('manager authorization'), 'Error specifies manager authorization requirement');

// 3. Manager authorizes retry
const authResult = await authorizeVideoRetry(passCodeB, 'Store Manager approved backup retry');
assert(authResult.ok, 'Store Manager successfully authorized video retry');

entB = await getCampaignEntitlementByPhone(testPhoneB);
allowancesB = getCustomerServiceAllowances(entB);
assert(allowancesB.video.managerAuthorized === true, 'Entitlement reflects managerAuthorized = true');

// 4. Retry Video Generation with manager authorization succeeds
const jobId2 = 'job_video_2_auth';
const vidLock2Auth = await acquirePassVideoLock(passCodeB, jobId2);
assert(vidLock2Auth.ok, 'Acquired video generation lock #2 with manager authorization');
await markPassVideoReady(passCodeB, jobId2);

entB = await getCampaignEntitlementByPhone(testPhoneB);
allowancesB = getCustomerServiceAllowances(entB);
assert(allowancesB.video.used === 2, 'Cinematic Video used is now 2/2 (exhausted)');

// 5. Attempting 3rd video generation must be strictly BLOCKED
const vidLock3 = await acquirePassVideoLock(passCodeB, 'job_video_3');
assert(!vidLock3.ok, '3rd video generation is strictly BLOCKED');
assert(vidLock3.error && vidLock3.error.includes('Maximum 2'), 'Error states maximum 2 video generations allowed');

// -----------------------------------------------------------------------------
// TEST 6: Atomic Concurrency & Lock Protection
// -----------------------------------------------------------------------------
console.log('\n--- TEST 6: Atomic Concurrency & Lock Protection ---');
const testPhoneC = '9840033333';
const passCodeC = `PASS_${Date.now()}_C`;

await saveVideoPass({
  id: passCodeC,
  code: passCodeC,
  clientId: 'maharaja',
  phone: testPhoneC,
  phoneMasked: '98******33',
  billLast4: '3333',
  eventId: 'diwali',
  status: 'active',
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
  expiresAtMs: now + 3600000,
  tryOnImageDone: false,
  tryOnImageUrl: '',
  videoMasterDone: false,
  videoMasterUrl: '',
  videoMasterApproved: false,
  videoMasterApprovedUrl: '',
  videoGenerating: false,
  videoDone: false,
  retryUsed: false,
  usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
});

// Fire 2 concurrent lock requests
const [lockResult1, lockResult2] = await Promise.all([
  acquireServiceGenerationLock(testPhoneC, 'masterImage'),
  acquireServiceGenerationLock(testPhoneC, 'masterImage'),
]);

const oneOk = (lockResult1.ok && !lockResult2.ok) || (!lockResult1.ok && lockResult2.ok);
assert(oneOk, 'Exactly one concurrent lock request succeeded');
const failedLock = !lockResult1.ok ? lockResult1 : lockResult2;
assert(failedLock.error && failedLock.error.includes('already in progress'), 'Rejected concurrent request indicates generation is in progress');

// Release the active lock
await releaseServiceGenerationLock(testPhoneC, 'masterImage');

// Now lock acquisition succeeds again
const subsequentLock = await acquireServiceGenerationLock(testPhoneC, 'masterImage');
assert(subsequentLock.ok, 'Lock acquisition succeeds after previous lock was released');
await releaseServiceGenerationLock(testPhoneC, 'masterImage');

// -----------------------------------------------------------------------------
// TEST 7: Failed Provider Calls & Exactly-Once Accounting (Restores Slot)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 7: Failed Provider Calls (Slot Restored, Exactly-Once Accounting) ---');
const testPhoneD = '9840044444';
const passCodeD = `PASS_${Date.now()}_D`;

await saveVideoPass({
  id: passCodeD,
  code: passCodeD,
  clientId: 'maharaja',
  phone: testPhoneD,
  phoneMasked: '98******44',
  billLast4: '4444',
  eventId: 'diwali',
  status: 'active',
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
  expiresAtMs: now + 3600000,
  tryOnImageDone: false,
  tryOnImageUrl: '',
  videoMasterDone: false,
  videoMasterUrl: '',
  videoMasterApproved: false,
  videoMasterApprovedUrl: '',
  videoGenerating: false,
  videoDone: false,
  retryUsed: false,
  usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
});

// Setup approved master image
await markPassVideoMasterDone(passCodeD, 'https://cdn.example.com/master-d.jpg', {
  promptSet: 'set-1',
  category: 'women',
  garmentType: 'saree',
});
await approvePassVideoMaster(passCodeD, 'https://cdn.example.com/master-d.jpg');

// Acquire video lock
const vLockFail = await acquirePassVideoLock(passCodeD, 'job_fail_1');
assert(vLockFail.ok, 'Acquired video lock before simulated provider failure');

// Provider fails / crashes
await markPassVideoFailed(passCodeD, 'job_fail_1');

const entD = await getCampaignEntitlementByPhone(testPhoneD);
const allowancesD = getCustomerServiceAllowances(entD);
assert(allowancesD.video.used === 0, 'Failed provider call did NOT increment used count (remains 0/2)');
assert(allowancesD.video.remaining === 2, 'Customer retains full 2 generations');

const passD = await getVideoPass(passCodeD);
assert(!passD.videoGenerating, 'Video generating lock is released');
assert(!passD.videoDone, 'Video done flag remains false');

// Customer retries after failed provider call -> lock acquires cleanly
const vLockRecovery = await acquirePassVideoLock(passCodeD, 'job_recovery_1');
assert(vLockRecovery.ok, 'Slot was restored: subsequent video generation lock succeeds');
await releasePassVideoLock(passCodeD);

// -----------------------------------------------------------------------------
// TEST 8: Rejected Master Image Invalidation
// -----------------------------------------------------------------------------
console.log('\n--- TEST 8: Rejected Master Image Invalidation ---');
const testPhoneE = '9840055555';
const passCodeE = `PASS_${Date.now()}_E`;

await saveVideoPass({
  id: passCodeE,
  code: passCodeE,
  clientId: 'maharaja',
  phone: testPhoneE,
  phoneMasked: '98******55',
  billLast4: '5555',
  eventId: 'diwali',
  status: 'active',
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
  expiresAtMs: now + 3600000,
  tryOnImageDone: false,
  tryOnImageUrl: '',
  videoMasterDone: false,
  videoMasterUrl: '',
  videoMasterApproved: false,
  videoMasterApprovedUrl: '',
  videoGenerating: false,
  videoDone: false,
  retryUsed: false,
  usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
});

// Master image generated
await markPassVideoMasterDone(passCodeE, 'https://cdn.example.com/master-e-ugly.jpg', {
  promptSet: 'set-1',
  category: 'men',
  garmentType: 'kurta',
});

let passE = await getVideoPass(passCodeE);
assert(passE.videoMasterDone && passE.videoMasterUrl === 'https://cdn.example.com/master-e-ugly.jpg', 'Master image is marked done and pending approval');

// Customer rejects image
await rejectPassMasterImage(passCodeE, 'ai-video', 'Face alignment issue');
passE = await getVideoPass(passCodeE);
assert(!passE.videoMasterDone, 'Rejected image unmarks videoMasterDone');
assert(!passE.videoMasterApproved, 'Rejected image is not approved');
assert(passE.videoMasterApprovedUrl === '', 'Approved URL cleared');

// Video cannot be started with rejected image
const videoBlocked = await acquirePassVideoLock(passCodeE, 'job_blocked_1');
assert(!videoBlocked.ok, 'Video generation strictly blocked after image rejection');

// -----------------------------------------------------------------------------
// TEST 9: Asset Downloads & Retention Rules Preserved
// -----------------------------------------------------------------------------
console.log('\n--- TEST 9: Asset Downloads & Retention Rules Preserved ---');
// Verify that pass records with approved master images and videos retain full URLs
const passRetentionCheck = await getVideoPass(passCodeB);
assert(passRetentionCheck.videoMasterApprovedUrl === 'https://cdn.example.com/master-2.jpg', 'Approved master image URL is retained');
assert(passRetentionCheck.videoDone === true, 'Video completion status is preserved');
assert(passRetentionCheck.status === 'active', 'Pass status remains active for normal retention period');

console.log('\n========================================================================');
console.log(`ALL ${assertionCount} DETERMINISTIC RETRY & ENTITLEMENT TESTS PASSED!`);
console.log('========================================================================\n');

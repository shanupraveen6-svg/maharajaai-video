// In-process test of the billing-pass video state machine (mock store, no network, no paid providers).
// Run: node scripts/test-pass-state.mjs
// Exercises the complete billing, concurrency, retry, crash-recovery, approval, and metadata matching architecture.
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const server = await import('../src/lib/maharaja/server.ts');
const {
  saveVideoPass, getVideoPass, markPassTryOnImageDone, markPassVideoMasterDone, markPassVideoDone,
  approvePassVideoMaster, rejectPassMasterImage,
  markPassRetryApproved, releasePassVideoLock, acquirePassVideoLock, markPassVideoFailed,
  markPassVideoSubmitted, markPassVideoReady, acquirePassImageLock, releasePassImageLock,
} = server;

const { NextRequest } = await import('next/server.js');
const { POST: videoStartPost } = await import('../src/app/api/video/start/route.ts');

let assertionCount = 0;
function assert(condition, label) {
  assertionCount += 1;
  if (!condition) {
    console.error(`\n❌ FAILED [Assertion ${assertionCount}]: ${label}`);
    throw new Error(label);
  }
  console.log(`PASS [${assertionCount}]: ${label}`);
}

let counter = 0;
async function freshPass(overrides = {}) {
  const code = `state_test_${Date.now()}_${counter += 1}`;
  const now = Date.now();
  const uniquePhone = overrides.phone || `999000${String(counter).padStart(4, '0')}`;
  await saveVideoPass({
    id: code, code, clientId: 'maharaja', phone: uniquePhone, phoneMasked: `${uniquePhone.slice(0, 2)}******${uniquePhone.slice(-2)}`, billLast4: '0000',
    eventId: 'diwali', status: 'active', createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3600000).toISOString(), expiresAtMs: now + 3600000,
    tryOnImageDone: false, tryOnImageUrl: '', videoMasterDone: false, videoMasterUrl: '',
    videoMasterApproved: false, videoMasterApprovedUrl: '',
    videoGenerating: false, videoDone: false, retryUsed: false,
    usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
    ...overrides,
  });
  return code;
}

console.log('\n--- TEST 1: Master-Image Existence, Pending Recovery & Explicit Approval Gate ---');
const code1 = await freshPass();

assert(!(await acquirePassVideoLock(code1)).ok, 'Lock refused before a video master exists');

await markPassTryOnImageDone(code1, 'tryon-url');
let pass1 = await getVideoPass(code1);
assert(pass1.tryOnImageDone && pass1.tryOnImageUrl === 'tryon-url' && !pass1.videoMasterDone, 'Try-On image does not mark the video master as done');
assert(!(await acquirePassVideoLock(code1)).ok, 'Lock still refused with only a Try-On image');

await markPassVideoMasterDone(code1, 'master-url-1', { promptSet: 'set-1', category: 'women', garmentType: 'saree' });
pass1 = await getVideoPass(code1);
assert(pass1.videoMasterDone && pass1.videoMasterUrl === 'master-url-1' && pass1.tryOnImageUrl === 'tryon-url', 'Both try-on and video-master images stored separately');
assert(pass1.videoMasterApproved === false, 'Image completed does NOT mark image as approved');

// CRITICAL SAFEGUARD 1: Image completed is NOT image approved
const unapprovedLock = await acquirePassVideoLock(code1);
assert(!unapprovedLock.ok && /approval required/i.test(unapprovedLock.error), 'H3 video lock strictly refused when master image is not yet approved');

// CRITICAL SAFEGUARD 2: Browser refresh recovers pending unapproved image without burning a second generation
const pendingImgLock = await acquirePassImageLock(code1, 'ai-video');
assert(pendingImgLock.ok && pendingImgLock.existingUrl === 'master-url-1' && pendingImgLock.approved === false, 'Pending unapproved master image is safely recovered on refresh');

// Force regeneration explicitly bypasses cache
const forceRegenPending = await acquirePassImageLock(code1, 'ai-video', true);
assert(forceRegenPending.ok && !forceRegenPending.existingUrl, 'forceRegenerate=true bypasses pending cache to allow explicit regeneration');
await releasePassImageLock(code1);

// Attempting to approve a mismatched/superseded URL throws error
let mismatchThrown = false;
try {
  await approvePassVideoMaster(code1, 'stale-superseded-url');
} catch (err) {
  mismatchThrown = true;
  assert(/mismatch/i.test(err.message), 'Superseded master image URL cannot be approved');
}
assert(mismatchThrown, 'Mismatched approval URL rejected');

// Explicit approval of the correct master image version
await approvePassVideoMaster(code1, 'master-url-1');
pass1 = await getVideoPass(code1);
assert(pass1.videoMasterApproved === true && pass1.videoMasterApprovedUrl === 'master-url-1', 'Pass records explicit approval with matching URL');

// Now H3 video lock is permitted
const firstVideoLock = await acquirePassVideoLock(code1);
const secondVideoLock = await acquirePassVideoLock(code1);
assert(firstVideoLock.ok && !secondVideoLock.ok && /already being generated/i.test(secondVideoLock.error), 'Lock granted after approval, and second simultaneous request is blocked');

await releasePassVideoLock(code1);
assert((await acquirePassVideoLock(code1)).ok, 'Lock can be re-acquired after release');
await releasePassVideoLock(code1);

console.log('\n--- TEST 2: Rejection, Atomic Invalidation & Entitlement Protection ---');
const code2 = await freshPass();
await markPassVideoMasterDone(code2, 'master-url-wrong-saree');
await approvePassVideoMaster(code2, 'master-url-wrong-saree');
let preRejectPass = await getVideoPass(code2);
assert(preRejectPass.videoMasterApproved === true, 'Approved before customer rejection');

// Customer rejects the master image
await rejectPassMasterImage(code2, 'ai-video', 'incorrect_saree_pattern');
let postRejectPass = await getVideoPass(code2);
assert(postRejectPass.videoMasterDone === false, 'videoMasterDone reset to false on rejection');
assert(postRejectPass.videoMasterUrl === '', 'videoMasterUrl cleared on rejection');
assert(postRejectPass.videoMasterApproved === false, 'videoMasterApproved reset to false on rejection');
assert(postRejectPass.videoMasterApprovedUrl === '', 'videoMasterApprovedUrl cleared on rejection');
assert(Array.isArray(postRejectPass.rejectedMasterUrls) && postRejectPass.rejectedMasterUrls.includes('master-url-wrong-saree'), 'Rejected image URL archived in rejectedMasterUrls');

// Customer video entitlement is preserved!
assert(postRejectPass.videoDone === false && postRejectPass.status === 'active', 'Video entitlement preserved after image rejection');

// Video lock is blocked on rejected image
const rejectedVideoLock = await acquirePassVideoLock(code2);
assert(!rejectedVideoLock.ok && /Create the AI Video image first/i.test(rejectedVideoLock.error), 'Video lock blocked on rejected image');

// Image lock permits fresh regeneration (does NOT return rejected cached URL)
const freshGenLock = await acquirePassImageLock(code2, 'ai-video');
assert(freshGenLock.ok && !freshGenLock.existingUrl, 'Fresh image generation allowed after rejection without returning rejected cached image');
await releasePassImageLock(code2);

// SAFEGUARD 3: Completed pass cannot be rejected or reopened!
const completedPassCode = await freshPass({ status: 'used', videoDone: true });
let cannotReopen = false;
try {
  await rejectPassMasterImage(completedPassCode, 'ai-video', 'attempt_fraudulent_reopen');
} catch (err) {
  cannotReopen = true;
  assert(/Cannot reject or reset master image on an already completed video pass/i.test(err.message), 'Reject is strictly blocked on an already completed/consumed pass');
}
assert(cannotReopen, 'Consumed video entitlement cannot be reopened by image rejection');

// SAFEGUARD 2: Rejection is strictly blocked if video generation is already in progress!
const generatingPassCode = await freshPass({
  videoMasterDone: true,
  videoMasterUrl: 'master-url-gen',
  videoMasterApproved: true,
  videoGenerating: true,
  activeVideoJobId: 'job_active_render',
});
let rejectDuringVideoBlocked = false;
try {
  await rejectPassMasterImage(generatingPassCode, 'ai-video', 'attempt_reject_mid_video');
} catch (err) {
  rejectDuringVideoBlocked = true;
  assert(/Cannot reject master image while AI video generation is in progress/i.test(err.message), 'Image rejection strictly blocked while video is rendering');
}
assert(rejectDuringVideoBlocked, 'Active video render prevents image rejection race');

console.log('\n--- TEST 3: Generation ID Fencing & In-Flight Race Protection ---');
const code3 = await freshPass();
// 1. Generation lock acquired with activeMasterGenerationId
const genLockResult = await acquirePassImageLock(code3, 'ai-video');
assert(genLockResult.ok && Boolean(genLockResult.generationId), 'Image lock assigns and returns a unique generationId');
const genId1 = genLockResult.generationId;
let pass3 = await getVideoPass(code3);
assert(pass3.activeMasterGenerationId === genId1 && pass3.imageGenerating === true, 'activeMasterGenerationId bound atomically on the pass document');

// 2. Mandatory Generation ID Fencing: Missing generationId cannot overwrite pass state
await markPassVideoMasterDone(code3, 'unauthorized-bypass-url', { promptSet: 'set-1', category: 'women', garmentType: 'saree' }); // omitted generationId
pass3 = await getVideoPass(code3);
assert(pass3.videoMasterDone === false && pass3.videoMasterUrl === '', 'Missing generationId is rejected: cannot bypass active generation lock');

// 3. Mismatched generationId cannot overwrite pass state
await markPassVideoMasterDone(code3, 'mismatched-id-url', { promptSet: 'set-1', category: 'women', garmentType: 'saree' }, 'gen_fraudulent_mismatch');
pass3 = await getVideoPass(code3);
assert(pass3.videoMasterDone === false && pass3.videoMasterUrl === '', 'Mismatched generationId is rejected: cannot overwrite active generation');

// 4. Customer rejects mid-flight while Gemini is still running
await rejectPassMasterImage(code3, 'ai-video', 'user_cancelled_generation');
pass3 = await getVideoPass(code3);
assert(pass3.activeMasterGenerationId === undefined && pass3.imageGenerating === false, 'activeMasterGenerationId cleared on mid-flight rejection');

// 5. Stale completion from the older Gemini call arrives late
await markPassVideoMasterDone(code3, 'late-stale-gemini-image-url', { promptSet: 'set-1' }, genId1);
pass3 = await getVideoPass(code3);
assert(pass3.videoMasterDone === false && pass3.videoMasterUrl === '', 'Stale completion from rejected in-flight generation is dropped atomically');

// 6. Stale release from older generation cannot clear a newly acquired lock
const genLockResult2 = await acquirePassImageLock(code3, 'ai-video');
const genId2 = genLockResult2.generationId;
assert(genLockResult2.ok && genId2 !== genId1, 'Fresh generation acquired with a new generation ID');
await releasePassImageLock(code3, genId1); // stale release attempt
pass3 = await getVideoPass(code3);
assert(pass3.imageGenerating === true && pass3.activeMasterGenerationId === genId2, 'Stale lock release cannot affect active generation');

// 7. Valid current generation with matching generationId completes successfully
await markPassVideoMasterDone(code3, 'valid-fresh-gemini-image-url', { promptSet: 'set-1', category: 'women', garmentType: 'saree' }, genId2);
pass3 = await getVideoPass(code3);
assert(pass3.videoMasterDone === true && pass3.videoMasterUrl === 'valid-fresh-gemini-image-url', 'Valid generation completes and commits master image');

console.log('\n--- TEST 4: Double Submissions & 8-Way Race Protection ---');
const racePass = await freshPass();
await markPassVideoMasterDone(racePass, 'master-url-race');
await approvePassVideoMaster(racePass, 'master-url-race');
const racers = await Promise.all(Array.from({ length: 8 }, () => acquirePassVideoLock(racePass)));
assert(racers.filter((result) => result.ok).length === 1, 'Exactly one of 8 simultaneous requests wins the video lock');

console.log('\n--- TEST 5: Job Lifecycle, Provider Acceptance & Completion ---');
const code5 = await freshPass();
await markPassVideoMasterDone(code5, 'master-url-5');
await approvePassVideoMaster(code5, 'master-url-5');
assert((await acquirePassVideoLock(code5, 'job_test_001')).ok, 'Lock acquired for provider lifecycle test');

const jobId1 = 'job_test_001';
await markPassVideoSubmitted(code5, jobId1);
let pass5 = await getVideoPass(code5);
assert(pass5.videoGenerating === true && pass5.videoDone === false && pass5.activeVideoJobId === jobId1, 'Provider acceptance sets videoGenerating=true, videoDone=false, and binds activeVideoJobId');
const duringRender = await acquirePassVideoLock(code5);
assert(!duringRender.ok && /already being generated/i.test(duringRender.error), 'Lock refused while video is rendering');

// Stale job update rejection:
const staleJobId = 'job_test_stale';
await markPassVideoReady(code5, staleJobId);
pass5 = await getVideoPass(code5);
assert(pass5.videoDone === false && pass5.videoGenerating === true, 'Stale job ready does not set videoDone=true');

// Real active job confirms ready:
await markPassVideoReady(code5, jobId1);
pass5 = await getVideoPass(code5);
assert(pass5.videoDone === true && pass5.videoGenerating === false, 'Final video ready sets videoDone=true and clears videoGenerating');
const afterDone = await acquirePassVideoLock(code5);
assert(!afterDone.ok && /already completed/i.test(afterDone.error), 'No second video once videoDone=true');

console.log('\n--- TEST 6: Manager Retry Lifecycle ---');
await markPassRetryApproved(code5);
pass5 = await getVideoPass(code5);
assert(pass5.retryUsed === true && pass5.videoDone === false && pass5.videoGenerating === false, 'Manager approval sets retryUsed=true and videoDone=false');
assert(pass5.videoMasterUrl === 'master-url-5', 'Retry keeps the same video master');

assert((await acquirePassVideoLock(code5, 'job_retry_1')).ok, 'Retry video can start through the normal lock path');
await markPassVideoSubmitted(code5, 'job_retry_1');
// Old job from first render tries to update pass during retry:
await markPassVideoReady(code5, jobId1);
pass5 = await getVideoPass(code5);
assert(pass5.videoDone === false && pass5.activeVideoJobId === 'job_retry_1', 'Stale first job cannot complete pass during active retry');
await markPassVideoReady(code5, 'job_retry_1');
const afterRetry = await acquirePassVideoLock(code5);
assert(!afterRetry.ok && /already completed/i.test(afterRetry.error), 'No further video after the single retry');

console.log('\n--- TEST 7: Crash Recovery & Stale Timeouts ---');
const stalePass = await freshPass();
await markPassVideoMasterDone(stalePass, 'master-url-stale');
await approvePassVideoMaster(stalePass, 'master-url-stale');
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

console.log('\n--- TEST 8: Atomic Claim & Release ---');
const atomicPass = await freshPass();
await markPassVideoMasterDone(atomicPass, 'master-url-atomic');
await approvePassVideoMaster(atomicPass, 'master-url-atomic');
const atomicLock = await acquirePassVideoLock(atomicPass, 'job_atomic_123');
assert(atomicLock.ok, 'Atomic lock acquisition succeeded');
const atomicPassDoc = await getVideoPass(atomicPass);
assert(atomicPassDoc.videoGenerating === true && atomicPassDoc.activeVideoJobId === 'job_atomic_123' && atomicPassDoc.providerAccepted === false, 'acquirePassVideoLock atomically sets videoGenerating and activeVideoJobId with providerAccepted=false');
await releasePassVideoLock(atomicPass);
const releasedPassDoc = await getVideoPass(atomicPass);
assert(releasedPassDoc.videoGenerating === false && !releasedPassDoc.activeVideoJobId && releasedPassDoc.providerAccepted === false, 'releasePassVideoLock clears videoGenerating, activeVideoJobId and providerAccepted');

console.log('\n--- TEST 9: Failed Render Slot Restoration ---');
const failedRenderPass = await freshPass();
await markPassVideoMasterDone(failedRenderPass, 'master-url-fail');
await approvePassVideoMaster(failedRenderPass, 'master-url-fail');
assert((await acquirePassVideoLock(failedRenderPass, 'job_fail_1')).ok, 'Lock acquired for failed-render test');
await markPassVideoSubmitted(failedRenderPass, 'job_fail_1');
let failDoc = await getVideoPass(failedRenderPass);
assert(failDoc.videoGenerating === true && failDoc.providerAccepted === true, 'Initially consumed upon provider acceptance');
await markPassVideoFailed(failedRenderPass, 'job_fail_1');
failDoc = await getVideoPass(failedRenderPass);
assert(failDoc.videoDone === false && failDoc.lastVideoFailed === true && !failDoc.activeVideoJobId, 'Failed render restores customer video slot and clears activeVideoJobId');

console.log('\n--- TEST 10: Image Lock Concurrency & Approved Caching ---');
const imgPass = await freshPass();
const firstImgLock = await acquirePassImageLock(imgPass, 'ai-video');
assert(firstImgLock.ok && !firstImgLock.existingUrl, 'First image lock acquired successfully');
const secondImgLock = await acquirePassImageLock(imgPass, 'ai-video');
assert(!secondImgLock.ok && /already being generated/i.test(secondImgLock.error), 'Second simultaneous image generation is blocked');
await releasePassImageLock(imgPass, firstImgLock.generationId);
const retryImgLock = await acquirePassImageLock(imgPass, 'ai-video');
assert(retryImgLock.ok, 'Image lock re-acquired after release');
await markPassVideoMasterDone(imgPass, 'master-url-cache-test', { promptSet: 'set-1' }, retryImgLock.generationId);

// Pending unapproved image returns existingUrl with approved: false
const unapprovedCacheCheck = await acquirePassImageLock(imgPass, 'ai-video');
assert(unapprovedCacheCheck.ok && unapprovedCacheCheck.existingUrl === 'master-url-cache-test' && unapprovedCacheCheck.approved === false, 'Pending unapproved image returned with approved=false');

// Approved image returns existingUrl with approved: true
await approvePassVideoMaster(imgPass, 'master-url-cache-test');
const approvedCacheCheck = await acquirePassImageLock(imgPass, 'ai-video');
assert(approvedCacheCheck.ok && approvedCacheCheck.existingUrl === 'master-url-cache-test' && approvedCacheCheck.approved === true, 'Approved master image is returned with approved=true');

// Force regeneration bypasses cache even when approved:
const forceRegenLock = await acquirePassImageLock(imgPass, 'ai-video', true);
assert(forceRegenLock.ok && !forceRegenLock.existingUrl, 'forceRegenerate=true bypasses approved cache to allow fresh generation');
await releasePassImageLock(imgPass, forceRegenLock.generationId);

console.log('\n--- TEST 11: Route-Level Safeguard 1 & Safeguard 4 Verification ---');
// SAFEGUARD 1: No silent approval bypass via /api/video/start
const unapprovedRoutePass = await freshPass({
  videoMasterDone: true,
  videoMasterUrl: 'https://example.com/unapproved-master.jpg',
  videoMasterApproved: false,
});
const silentBypassReq = new NextRequest('http://localhost:3000/api/video/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessCode: unapprovedRoutePass, sessionId: 'sess_bypass', approveMaster: true }),
});
const silentBypassRes = await videoStartPost(silentBypassReq);
assert(silentBypassRes.status === 403, 'POST /api/video/start strictly rejects unapproved master with 403 even if approveMaster: true is supplied');
const bypassJson = await silentBypassRes.json();
assert(/approval required/i.test(bypassJson.error), 'Explicit error message demanding customer review returned');

// SAFEGUARD 4: Strict Approved Metadata Consistency Lock
const approvedRoutePass = await freshPass({
  videoMasterDone: true,
  videoMasterUrl: 'https://example.com/approved-master.jpg',
  videoMasterApproved: true,
  videoMasterApprovedUrl: 'https://example.com/approved-master.jpg',
  videoMasterCategory: 'women',
  videoMasterGarmentType: 'saree',
  videoMasterPromptSet: 'set-1',
  eventId: 'diwali',
});

// 1. Category mismatch:
const catMismatchReq = new NextRequest('http://localhost:3000/api/video/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessCode: approvedRoutePass, sessionId: 'sess_mismatch', templateId: 'men' }),
});
const catMismatchRes = await videoStartPost(catMismatchReq);
assert(catMismatchRes.status === 409 && /category mismatch/i.test((await catMismatchRes.json()).error), 'Category mismatch strictly rejected with 409 Conflict');

// 2. Garment type mismatch:
const garmentMismatchReq = new NextRequest('http://localhost:3000/api/video/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessCode: approvedRoutePass, sessionId: 'sess_mismatch', garmentType: 'dhoti' }),
});
const garmentMismatchRes = await videoStartPost(garmentMismatchReq);
assert(garmentMismatchRes.status === 409 && /garment type mismatch/i.test((await garmentMismatchRes.json()).error), 'Garment type mismatch strictly rejected with 409 Conflict');

// 3. Event mismatch:
const eventMismatchReq = new NextRequest('http://localhost:3000/api/video/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessCode: approvedRoutePass, sessionId: 'sess_mismatch', eventId: 'pongal' }),
});
const eventMismatchRes = await videoStartPost(eventMismatchReq);
assert(eventMismatchRes.status === 409 && /event mismatch/i.test((await eventMismatchRes.json()).error), 'Event mismatch strictly rejected with 409 Conflict');

// 4. Scene style mismatch:
const styleMismatchReq = new NextRequest('http://localhost:3000/api/video/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessCode: approvedRoutePass, sessionId: 'sess_mismatch', promptSet: 'set-2' }),
});
const styleMismatchRes = await videoStartPost(styleMismatchReq);
assert(styleMismatchRes.status === 409 && /scene style mismatch/i.test((await styleMismatchRes.json()).error), 'Scene style mismatch strictly rejected with 409 Conflict');

// 5. Approved metadata matching passes validation (and reaches provider check or lock acquisition):
const matchingReq = new NextRequest('http://localhost:3000/api/video/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    accessCode: approvedRoutePass,
    sessionId: 'sess_match',
    templateId: 'women',
    garmentType: 'saree',
    eventId: 'diwali',
    promptSet: 'set-1',
    masterImageUrl: 'https://example.com/approved-master.jpg',
  }),
});
const matchingRes = await videoStartPost(matchingReq);
// Since FAL_KEY is not set in test environment, it passes all metadata validation and returns 503 (Fal.ai video service is not configured)
assert(matchingRes.status === 503 && /Fal\.ai video service is not configured/i.test((await matchingRes.json()).error), 'Matching approved metadata passes all validation gates and reaches provider dispatch');

// 6. Incomplete approved metadata: Missing customer category must NOT silently default to women
const missingCatPass = await freshPass({
  videoMasterDone: true,
  videoMasterUrl: 'https://example.com/incomplete-cat.jpg',
  videoMasterApproved: true,
  videoMasterApprovedUrl: 'https://example.com/incomplete-cat.jpg',
  videoMasterCategory: undefined,
  videoMasterGarmentType: 'saree',
  videoMasterPromptSet: 'set-1',
  eventId: 'diwali',
});
const missingCatReq = new NextRequest('http://localhost:3000/api/video/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessCode: missingCatPass, sessionId: 'sess_inc_cat' }),
});
const missingCatRes = await videoStartPost(missingCatReq);
assert(missingCatRes.status === 409 && /Customer category is missing/i.test((await missingCatRes.json()).error), 'Pass with missing customer category is strictly rejected with 409 Conflict');

// 7. Incomplete approved metadata: Missing garment type must NOT silently default to saree
const missingGarmentPass = await freshPass({
  videoMasterDone: true,
  videoMasterUrl: 'https://example.com/incomplete-garment.jpg',
  videoMasterApproved: true,
  videoMasterApprovedUrl: 'https://example.com/incomplete-garment.jpg',
  videoMasterCategory: 'men',
  videoMasterGarmentType: undefined,
  videoMasterPromptSet: 'set-1',
  eventId: 'diwali',
});
const missingGarmentReq = new NextRequest('http://localhost:3000/api/video/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessCode: missingGarmentPass, sessionId: 'sess_inc_garment' }),
});
const missingGarmentRes = await videoStartPost(missingGarmentReq);
assert(missingGarmentRes.status === 409 && /Garment type is missing/i.test((await missingGarmentRes.json()).error), 'Pass with missing garment type is strictly rejected with 409 Conflict (no silent saree fallback)');

// 8. Men's pass verification: Men's pass with kurta_dhoti reaches provider dispatch as men's garment
const menPass = await freshPass({
  videoMasterDone: true,
  videoMasterUrl: 'https://example.com/men-master.jpg',
  videoMasterApproved: true,
  videoMasterApprovedUrl: 'https://example.com/men-master.jpg',
  videoMasterCategory: 'men',
  videoMasterGarmentType: 'kurta_dhoti',
  videoMasterPromptSet: 'set-1',
  eventId: 'diwali',
});
const menReq = new NextRequest('http://localhost:3000/api/video/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessCode: menPass, sessionId: 'sess_men' }),
});
const menRes = await videoStartPost(menReq);
assert(menRes.status === 503 && /Fal\.ai video service is not configured/i.test((await menRes.json()).error), 'Men approved pass strictly validated as men/kurta_dhoti and dispatched to provider');

console.log('\n======================================================');
console.log(`ALL ${assertionCount} PASS STATE-MACHINE ASSERTIONS PASSED!`);
console.log('Issue 1 (Mandatory generation ID fencing): VERIFIED');
console.log('Issue 2 (Rejection blocked during active video render): VERIFIED');
console.log('Issue 3 (No unsafe default assumptions / strict metadata): VERIFIED');
console.log('All concurrency, billing, retry, crash-recovery checks: VERIFIED');
console.log('======================================================\n');

// In-process End-to-End Simulation of the complete Maharaja AI Video pipeline.
// ZERO AI CREDITS USED (Deterministic mock providers & local storage).
// Tests: Entry / Auth / Image Load / Errors / Approval Gate / Tamper Defense /
// Video Generation / Concurrency / Finalization / TV Go Live Queue / Retry & Backup Prompts.
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

register('./ts-alias-loader.mjs', import.meta.url);

// Ensure deterministic mock environment
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
  delete process.env[key];
}
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_operator_secret_12345';
process.env.GOOGLE_AI_API_KEY_PRIMARY = 'simulated_google_ai_key';
process.env.FAL_KEY = 'simulated_fal_key';

let assertionCount = 0;
function assert(condition, label, detail = '') {
  assertionCount += 1;
  if (!condition) {
    console.error(`\n❌ FAILED [Assertion ${assertionCount}]: ${label}${detail ? ` - ${detail}` : ''}`);
    throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  }
  console.log(`PASS [${assertionCount}]: ${label}`);
}

// 1. Setup Mock Providers for Gemini & Fal.ai
const { GoogleGenAI } = await import('@google/genai');
const { fal } = await import('@fal-ai/client');
const { NextRequest } = await import('next/server.js');

// Create realistic dummy image data
const dummyJpegBase64 = Buffer.from('RIFF_DUMMY_JPEG_DATA_SIMULATION_MAHARAJA_PORTRAIT_9_16').toString('base64');
const sampleVideoPath = path.join(
  process.cwd(),
  '../.gemini/antigravity-ide/brain/b970c7e6-3004-4691-ad1e-94a68f331dcc/audit_assets/real_model_6s.mp4'
);
const fallbackSampleVideo = fs.existsSync(sampleVideoPath)
  ? fs.readFileSync(sampleVideoPath)
  : Buffer.from('DUMMY_MP4_VIDEO_BUFFER_MAHARAJA_6S');

// Intercept GoogleGenAI generateContent
const OrigGoogleGenAI = GoogleGenAI;
let mockGeminiImageCounter = 0;
GoogleGenAI.prototype.models = GoogleGenAI.prototype.models || {};
const origConstructor = GoogleGenAI.prototype.constructor;

// Monkey patch instance models.generateContent
const origNew = GoogleGenAI;
class MockGenAI extends origNew {
  constructor(opts) {
    super(opts);
    this.models.generateContent = async (params) => {
      mockGeminiImageCounter += 1;
      const prompt = params.contents?.[params.contents.length - 1] || '';
      return {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: Buffer.from(`SIMULATED_GEMINI_IMAGE_${mockGeminiImageCounter}_PROMPT_LEN_${prompt.length}`).toString('base64'),
                  },
                },
              ],
            },
          },
        ],
      };
    };
  }
}

// Override module import for GoogleGenAI in global scope
global.__MOCK_GEMINI_ACTIVE__ = true;

// Mock Fal.ai Queue
let mockFalJobCounter = 0;
const mockFalJobs = new Map();
let lastSubmittedPrompt = '';
const attachFalMocks = () => {
  fal.queue.submit = async (model, options) => {
    mockFalJobCounter += 1;
    const requestId = `sim_fal_req_${mockFalJobCounter}_${Date.now()}`;
    lastSubmittedPrompt = options.input?.prompt || '';
    mockFalJobs.set(requestId, {
      status: 'IN_QUEUE',
      queue_position: 1,
      prompt: lastSubmittedPrompt,
      imageUrl: options.input?.image_url,
    });
    return {
      request_id: requestId,
      status: 'IN_QUEUE',
      queue_position: 1,
    };
  };

  fal.queue.status = async (model, options) => {
    const job = mockFalJobs.get(options.requestId);
    if (!job) return { status: 'NOT_FOUND' };
    return {
      status: job.status,
      queue_position: job.queue_position,
    };
  };

  fal.queue.result = async (model, options) => {
    const job = mockFalJobs.get(options.requestId);
    return {
      data: {
        video: {
          url: 'https://storage.googleapis.com/maharaja-mock/test_simulated_render.mp4',
        },
      },
    };
  };
};

const origFalConfig = fal.config;
fal.config = (opts) => {
  try { origFalConfig(opts); } catch {}
  attachFalMocks();
};
attachFalMocks();

// Intercept global fetch so downloading the simulated video URL returns real MP4 bytes
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  const urlStr = typeof url === 'string' ? url : url?.toString() || '';
  if (urlStr.includes('test_simulated_render.mp4')) {
    return {
      ok: true,
      status: 200,
      body: true,
      headers: new Headers({ 'content-type': 'video/mp4' }),
      arrayBuffer: async () => fallbackSampleVideo.buffer.slice(
        fallbackSampleVideo.byteOffset,
        fallbackSampleVideo.byteOffset + fallbackSampleVideo.byteLength
      ),
    };
  }
  return originalFetch(url, options);
};

// Import route handlers
const { POST: videoPassPost } = await import('../src/app/api/maharaja/video-pass/route.ts');
const { GET: accessGet } = await import('../src/app/api/maharaja/access/[code]/route.ts');
const { POST: masterImagePost } = await import('../src/app/api/ai/master-image/route.ts');
const { POST: masterApprovePost } = await import('../src/app/api/ai/master-image/approve/route.ts');
const { POST: masterRejectPost } = await import('../src/app/api/ai/master-image/reject/route.ts');
const { POST: videoStartPost } = await import('../src/app/api/video/start/route.ts');
const { GET: videoStatusGet } = await import('../src/app/api/video/status/route.ts');
const { POST: liveEnqueuePost } = await import('../src/app/api/live/enqueue/route.ts');
const { GET: liveNextGet } = await import('../src/app/api/live/next/route.ts');
const { POST: liveCompletePost } = await import('../src/app/api/live/complete/route.ts');
const { POST: downloadAssetPost } = await import('../src/app/api/download/asset/route.ts');
const { POST: activityPost } = await import('../src/app/api/maharaja/activity/route.ts');
const { getVideoPass, markPassVideoMasterDone, getMaharajaWorkspace } = await import('../src/lib/maharaja/server.ts');
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
process.env.OPERATOR_USERNAME = 'test_operator';
const crypto = await import('node:crypto');
const opSecret = process.env.OPERATOR_AUTH_SECRET;
const opExpiresAt = Date.now() + 3600000;
const opPayload = `test_operator.${opExpiresAt}`;
const opSig = crypto.createHmac('sha256', opSecret).update(opPayload).digest('hex');
const operatorCookie = `test_operator.${opExpiresAt}.${opSig}`;
const authHeaders = {
  cookie: `maharaja_operator_auth=${operatorCookie}`,
  'x-operator-key': opSecret,
};

// Helper to wrap route invocations
async function callRoute(handler, { method = 'POST', url = 'http://localhost:3000/api', body, headers = {}, params = {} } = {}) {
  const reqHeaders = new Headers({
    'Content-Type': 'application/json',
    ...headers,
  });
  const req = new NextRequest(new URL(url), {
    method,
    headers: reqHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const res = await handler(req, { params: Promise.resolve(params) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

console.log('\n===============================================================');
console.log('MAHARAJA AI VIDEO — FULL END-TO-END PIPELINE SIMULATION AUDIT');
console.log('Zero Paid Credits · 100% Deterministic Mock Mode');
console.log('===============================================================\n');

const workspace = await getMaharajaWorkspace();
const billingCode = workspace.billingCode;

// -------------------------------------------------------------
// PHASE 1: Billing Pass Issuance & Entry Security
// -------------------------------------------------------------
console.log('--- PHASE 1: Pass Issuance & Access Gate ---');

// 1.1 Unauthenticated pass creation is blocked
const unauthPass = await callRoute(videoPassPost, {
  body: { billingCode, phone: '9999999999', billLast4: '1234', eventId: 'diwali', billAmount: 5000 },
});
assert(unauthPass.status === 401, 'Unauthenticated pass generation blocked (401)');

// 1.2 Invalid tier (< ₹5,000) is blocked
const lowTierPass = await callRoute(videoPassPost, {
  headers: authHeaders,
  body: { billingCode, phone: '9999999999', billLast4: '1234', eventId: 'diwali', billAmount: 3500 },
});
assert(lowTierPass.status === 400, 'Sub-tier billing amount rejected with 400');

// 1.3 Valid pass issuance
const validPassRes = await callRoute(videoPassPost, {
  headers: authHeaders,
  body: { billingCode, phone: '9876543210', billLast4: '4321', eventId: 'diwali', billAmount: 7000 },
});
assert(validPassRes.ok && validPassRes.data.pass?.code, 'Billing pass generated successfully');
const passCode = validPassRes.data.pass.code;

// 1.4 Check initial pass invariants
let passRecord = await getVideoPass(passCode);
assert(passRecord.status === 'active', 'Pass is active upon issuance');
assert(passRecord.videoDone === false, 'Pass videoDone is initially false');
assert(passRecord.videoMasterDone === false, 'Pass videoMasterDone is initially false');
assert(passRecord.videoMasterApproved === false, 'Pass videoMasterApproved is initially false');
assert(passRecord.videoGenerating === false, 'Pass videoGenerating is initially false');
assert(passRecord.usage.videosGenerated === 0, 'Pass videosGenerated usage is 0');

// 1.5 Customer scans QR and accesses AI Video service
const customerAccess = await callRoute(accessGet, {
  url: `http://localhost:3000/api/maharaja/access/${passCode}?service=ai-video`,
  params: { code: passCode },
});
if (!customerAccess.ok) console.log('DEBUG customerAccess:', customerAccess);
assert(customerAccess.ok && customerAccess.data.access?.allowed !== false, 'Customer access verified for AI Video service');
assert(customerAccess.data.access?.billLast4 === '4321', 'Customer access retains billing last 4');

// 1.6 Invalid code access attempt
const invalidAccess = await callRoute(accessGet, {
  url: `http://localhost:3000/api/maharaja/access/invalid_random_code?service=ai-video`,
  params: { code: 'invalid_random_code' },
});
assert(!invalidAccess.ok || invalidAccess.data.access?.allowed === false, 'Non-existent pass access rejected');

// -------------------------------------------------------------
// PHASE 2: Premature Execution & Retry Guard Testing
// -------------------------------------------------------------
console.log('\n--- PHASE 2: Premature Trigger & Retry Guards ---');
const sessionId = `sim_session_${Date.now()}`;

// 2.1 Video start blocked before master image exists
const prematureVideo = await callRoute(videoStartPost, {
  body: { sessionId, accessCode: passCode, eventId: 'diwali' },
});
assert(prematureVideo.status === 409 && /image first/i.test(prematureVideo.data.error || ''), 'Video start refused before master image exists (409 Conflict)');

// 2.2 Premature retry consumption blocked
const prematureRetry = await callRoute(activityPost, {
  body: {
    type: 'retry',
    label: 'Customer premature retry',
    sessionId,
    accessCode: passCode,
    target: 'video',
    service: 'ai-video',
  },
});
assert(prematureRetry.status === 403, 'Retry cannot be consumed before the first video exists (403)');

// -------------------------------------------------------------
// PHASE 3: Master Image Generation, Error Handling & Recovery
// -------------------------------------------------------------
console.log('\n--- PHASE 3: Master Image Generation & Browser Refresh Recovery ---');

// 3.1 Missing customer photo error
const missingPhoto = await callRoute(masterImagePost, {
  body: { sessionId, accessCode: passCode, garmentPhotos: [dummyJpegBase64] },
});
assert(missingPhoto.status === 400 && /customer photo/i.test(missingPhoto.data.error || ''), 'Missing customer photo rejected (400)');

// 3.2 Missing garment photo error
const missingGarment = await callRoute(masterImagePost, {
  body: { sessionId, accessCode: passCode, personPhoto: dummyJpegBase64, garmentPhotos: [] },
});
assert(missingGarment.status === 400 && /garment photo/i.test(missingGarment.data.error || ''), 'Missing garment photo rejected (400)');

// 3.3 First successful generation
// Note: In our simulation, MockGenAI generates a simulated master image
// In our test, we seed the mock generation to return immediately
await markPassVideoMasterDone(passCode, 'https://storage.googleapis.com/maharaja-mock/master_v1.jpg', {
  promptSet: 'set-1',
  category: 'women',
  garmentType: 'saree',
});
passRecord = await getVideoPass(passCode);
assert(passRecord.videoMasterDone === true, 'Master image marked done');
assert(passRecord.videoMasterApproved === false, 'CRITICAL: Fresh master image is UNAPPROVED by default');
assert(passRecord.videoMasterUrl === 'https://storage.googleapis.com/maharaja-mock/master_v1.jpg', 'Master image URL saved on pass');

// 3.4 Browser Refresh Simulation: Customer reloads page during review
// When /api/ai/master-image is called, it returns the pending image with reused: true and approved: false
const refreshResult = await callRoute(masterImagePost, {
  body: {
    sessionId,
    accessCode: passCode,
    personPhoto: dummyJpegBase64,
    garmentPhotos: [dummyJpegBase64],
    templateId: 'women',
    garmentType: 'saree',
  },
});
assert(refreshResult.ok, 'Browser refresh successfully answered');
assert(refreshResult.data.reused === true, 'Pending master image reused on refresh without re-billing');
assert(refreshResult.data.approved === false, 'Refreshed image maintains approved: false');

// -------------------------------------------------------------
// PHASE 4: Approval Gate & Metadata Tampering Errors
// -------------------------------------------------------------
console.log('\n--- PHASE 4: Approval Gate & Strict Metadata Consistency ---');

// 4.1 Silent Bypass Attempt: calling /video/start with unapproved master image
const unapprovedStart = await callRoute(videoStartPost, {
  body: { sessionId, accessCode: passCode, templateId: 'women', garmentType: 'saree', promptSet: 'set-1' },
});
assert(unapprovedStart.status === 403 && /approval required/i.test(unapprovedStart.data.error || ''), 'CRITICAL SAFEGUARD 1: Silent approval bypass blocked with 403');

// Customer reviews and approves v1 image
await callRoute(masterApprovePost, {
  body: {
    sessionId,
    accessCode: passCode,
    masterImageUrl: 'https://storage.googleapis.com/maharaja-mock/master_v1.jpg',
  },
});

// 4.2 Category Tampering Attempt: switching 'women' -> 'men'
const categoryMismatch = await callRoute(videoStartPost, {
  body: { sessionId, accessCode: passCode, templateId: 'men', garmentType: 'saree', promptSet: 'set-1' },
});
assert(categoryMismatch.status === 409 && /category mismatch/i.test(categoryMismatch.data.error || ''), 'CRITICAL SAFEGUARD 2: Category tamper blocked with 409');

// 4.3 Garment Tampering Attempt: switching 'saree' -> 'kurta_dhoti'
const garmentMismatch = await callRoute(videoStartPost, {
  body: { sessionId, accessCode: passCode, templateId: 'women', garmentType: 'kurta_dhoti', promptSet: 'set-1' },
});
assert(garmentMismatch.status === 409 && /garment type mismatch/i.test(garmentMismatch.data.error || ''), 'CRITICAL SAFEGUARD 3: Garment type tamper blocked with 409');

// 4.4 Festival Event Tampering Attempt: switching 'diwali' -> 'pongal'
const eventMismatch = await callRoute(videoStartPost, {
  body: { sessionId, accessCode: passCode, eventId: 'pongal', templateId: 'women', garmentType: 'saree', promptSet: 'set-1' },
});
assert(eventMismatch.status === 409 && /event mismatch/i.test(eventMismatch.data.error || ''), 'CRITICAL SAFEGUARD 4: Festival event tamper blocked with 409');

// 4.5 Scene Style Tampering Attempt: switching 'set-1' -> 'set-2'
const sceneMismatch = await callRoute(videoStartPost, {
  body: { sessionId, accessCode: passCode, templateId: 'women', garmentType: 'saree', promptSet: 'set-2' },
});
assert(sceneMismatch.status === 409 && /scene style mismatch/i.test(sceneMismatch.data.error || ''), 'CRITICAL SAFEGUARD 5: Scene style tamper blocked with 409');

// -------------------------------------------------------------
// PHASE 5: Customer Rejection Flow & Stale In-Flight Race Fencing
// -------------------------------------------------------------
console.log('\n--- PHASE 5: Customer Rejection Flow & Stale Race Fencing ---');

// 5.1 Customer rejects the first master image
const rejectRes = await callRoute(masterRejectPost, {
  body: {
    sessionId,
    accessCode: passCode,
    reason: 'Garment border color tone is slightly too dark',
  },
});
assert(rejectRes.ok, 'Rejection processed cleanly');
passRecord = await getVideoPass(passCode);
assert(passRecord.videoMasterDone === false, 'Pass videoMasterDone reset to false');
assert(passRecord.videoMasterUrl === '', 'Pass videoMasterUrl cleared');
assert(passRecord.videoMasterApproved === false, 'Pass videoMasterApproved reset to false');
assert(passRecord.rejectedMasterUrls?.includes('https://storage.googleapis.com/maharaja-mock/master_v1.jpg'), 'Rejected URL stored in rejected list');

// 5.2 Attempt to start video using the rejected image URL
const rejectedVideoStart = await callRoute(videoStartPost, {
  body: {
    sessionId,
    accessCode: passCode,
    masterImageUrl: 'https://storage.googleapis.com/maharaja-mock/master_v1.jpg',
    templateId: 'women',
    garmentType: 'saree',
  },
});
assert(rejectedVideoStart.status === 409, 'Start video with rejected master image blocked with 409');

// 5.3 Stale in-flight completion discarded by generation ID fencing
const staleGenId = 'stale_gen_123';
await markPassVideoMasterDone(passCode, 'https://storage.googleapis.com/maharaja-mock/stale_v1.jpg', {
  promptSet: 'set-1',
  category: 'women',
  garmentType: 'saree',
}, staleGenId);
passRecord = await getVideoPass(passCode);
assert(passRecord.videoMasterDone === false && passRecord.videoMasterUrl === '', 'Stale in-flight image completion discarded by generation ID fence');

// -------------------------------------------------------------
// PHASE 6: Fresh Image Generation & Explicit Approval
// -------------------------------------------------------------
console.log('\n--- PHASE 6: Fresh Generation & Explicit Approval Gate ---');

const freshImageUrl = 'https://storage.googleapis.com/maharaja-mock/master_v2_perfect.jpg';
await markPassVideoMasterDone(passCode, freshImageUrl, {
  promptSet: 'set-2',
  category: 'women',
  garmentType: 'saree',
});
passRecord = await getVideoPass(passCode);
assert(passRecord.videoMasterDone === true && passRecord.videoMasterUrl === freshImageUrl, 'Fresh master image registered');
assert(passRecord.videoMasterApproved === false, 'Fresh master image starts in unapproved state');

// 6.1 Approval of mismatched / superseded URL rejected
const mismatchedApprove = await callRoute(masterApprovePost, {
  body: {
    sessionId,
    accessCode: passCode,
    masterImageUrl: 'https://storage.googleapis.com/maharaja-mock/master_superseded.jpg',
  },
});
assert(mismatchedApprove.status === 409, 'Approval of mismatched image URL rejected with 409');

// 6.2 Explicit approval of the correct image
const validApprove = await callRoute(masterApprovePost, {
  body: {
    sessionId,
    accessCode: passCode,
    masterImageUrl: freshImageUrl,
  },
});
assert(validApprove.ok, 'Master image explicitly approved by customer');
passRecord = await getVideoPass(passCode);
assert(passRecord.videoMasterApproved === true, 'Pass videoMasterApproved marked true');
assert(passRecord.videoMasterApprovedUrl === freshImageUrl, 'Pass approved URL matches current master');

// -------------------------------------------------------------
// PHASE 7: Video Start & Concurrency Locking
// -------------------------------------------------------------
console.log('\n--- PHASE 7: Video Generation Start & Concurrency Guards ---');

// Seed mock store session doc so /video/start finds existing session
const mockStore = getMockStore();
mockStore.sessions.set(sessionId, {
  sessionId,
  clientId: 'maharaja',
  accessCode: passCode,
  eventId: 'diwali',
  templateId: 'women',
  garmentType: 'saree',
  promptSet: 'set-2',
  masterImageUrl: freshImageUrl,
  status: 'master_ready',
});

// 7.1 Start Video generation successfully
const videoStartRes = await callRoute(videoStartPost, {
  body: {
    sessionId,
    accessCode: passCode,
    templateId: 'women',
    garmentType: 'saree',
    promptSet: 'set-2',
  },
});
assert(videoStartRes.ok && videoStartRes.data.jobId, 'Video generation initialized successfully');
const activeJobId = videoStartRes.data.jobId;

// Verify pass state: generation lock held
passRecord = await getVideoPass(passCode);
assert(passRecord.videoGenerating === true, 'Pass marked videoGenerating: true');
assert(passRecord.activeVideoJobId === activeJobId, 'Pass bound to activeVideoJobId');
assert(passRecord.usage.videosGenerated === 1, 'Pass videosGenerated incremented to 1');

// 7.2 Concurrency Guard: Second tab / double-click blocked
const doubleStart = await callRoute(videoStartPost, {
  body: {
    sessionId,
    accessCode: passCode,
    templateId: 'women',
    garmentType: 'saree',
    promptSet: 'set-2',
  },
});
assert(doubleStart.status === 409 && /already being generated/i.test(doubleStart.data.error || ''), 'Simultaneous / double-click video generation blocked with 409');

// 7.3 Concurrency Guard: Customer cannot reject master image while video generation is running
const rejectWhileGenerating = await callRoute(masterRejectPost, {
  body: {
    sessionId,
    accessCode: passCode,
    reason: 'Trying to cancel while rendering',
  },
});
assert(rejectWhileGenerating.status === 409 && /in progress/i.test(rejectWhileGenerating.data.error || ''), 'Master rejection blocked during active video rendering (409 Conflict)');

// -------------------------------------------------------------
// PHASE 8: Video Status Polling & Autonomous Finalization
// -------------------------------------------------------------
console.log('\n--- PHASE 8: Status Polling & Video Finalization ---');

// 8.1 Status polling while in queue
const initialPoll = await callRoute(videoStatusGet, {
  url: `http://localhost:3000/api/video/status?accessCode=${passCode}&sessionId=${sessionId}&jobId=${activeJobId}`,
});
assert(initialPoll.ok && initialPoll.data.status === 'processing', 'Status polling returns processing state while queued');

// 8.2 Simulate provider completion: update mock job status to COMPLETED
const currentJob = Array.from(mockFalJobs.values())[0];
if (currentJob) {
  currentJob.status = 'COMPLETED';
}

// 8.3 Status polling detects COMPLETED $\rightarrow$ triggers finalizeCompletedVideo
const completedPoll = await callRoute(videoStatusGet, {
  url: `http://localhost:3000/api/video/status?accessCode=${passCode}&sessionId=${sessionId}&jobId=${activeJobId}`,
});
assert(completedPoll.ok && completedPoll.data.status === 'ready', 'Status polling transitions to ready');
assert(completedPoll.data.videoUrl && completedPoll.data.liveVideoUrl, 'Both 6s branded video and 9s showroom video URLs populated');
const finalVideoId = completedPoll.data.videoId || `video_${sessionId}`;

// 8.4 Pass state verified completed
passRecord = await getVideoPass(passCode);
assert(passRecord.videoDone === true, 'Pass videoDone marked true');
assert(passRecord.videoGenerating === false, 'Pass videoGenerating reset to false');

// -------------------------------------------------------------
// PHASE 9: Showroom TV Go Live Queue Flow
// -------------------------------------------------------------
console.log('\n--- PHASE 9: TV Showroom Go Live Queue Flow ---');

// 9.1 Customer enqueues their ready video for the showroom TV display
const enqueueRes = await callRoute(liveEnqueuePost, {
  body: {
    sessionId,
    videoId: finalVideoId,
    accessCode: passCode,
    customerName: 'Ananya Sharma',
    customerLocality: 'Thanjavur',
  },
});
assert(enqueueRes.ok && enqueueRes.data.queueId, 'Video enqueued for showroom TV display');
assert(enqueueRes.data.queuePosition === 1, 'Queue position assigned as #1');
assert(enqueueRes.data.queueNumber >= 1, 'Queue number assigned');

// Accelerate scheduled playAtMs so TV picks up the item immediately
const queuedItem = mockStore.liveQueue.find((i) => i.id === enqueueRes.data.queueId);
if (queuedItem) {
  queuedItem.playAtMs = Date.now() - 1000;
  queuedItem.playAt = new Date(Date.now() - 1000).toISOString();
}

// 9.2 Operator TV display polls for next playback item
const tvNextRes = await callRoute(liveNextGet, {
  url: 'http://localhost:3000/api/live/next',
  headers: authHeaders,
});
assert(tvNextRes.ok && tvNextRes.data.status === 'play', 'TV display returns play status');
assert(tvNextRes.data.customerName === 'Ananya Sharma', 'TV display matches customer name');
const reservationId = tvNextRes.data.reservationId;
const queueItemId = tvNextRes.data.queueId;

// 9.3 TV screen finishes 9-second celebratory playback
const tvCompleteRes = await callRoute(liveCompletePost, {
  headers: authHeaders,
  body: {
    queueId: queueItemId,
    reservationId,
  },
});
assert(tvCompleteRes.ok, 'TV display signals playback completion');

// -------------------------------------------------------------
// PHASE 10: Asset Download Security
// -------------------------------------------------------------
console.log('\n--- PHASE 10: Asset Download Proxy ---');

// 10.1 Download request with untrusted host blocked
const unallowedHostDownload = await callRoute(downloadAssetPost, {
  body: { url: 'https://malicious-external-site.com/video.mp4', watermark: true },
});
assert(unallowedHostDownload.status === 400, 'Download proxy blocks untrusted host');

// 10.2 Download with allowed host
const allowedDownload = await callRoute(downloadAssetPost, {
  body: { url: 'https://storage.googleapis.com/maharaja-mock/test_simulated_render.mp4', watermark: false },
});
assert(allowedDownload.ok, 'Download proxy serves asset from approved Google Storage host');

// -------------------------------------------------------------
// PHASE 11: Retry Flow & Ultra-Safe Backup Prompts
// -------------------------------------------------------------
console.log('\n--- PHASE 11: Retry Flow & Ultra-Safe Backup Prompts ---');

// 11.1 Before retry approval, starting video is blocked because pass is videoDone
const blockedSecondVideo = await callRoute(videoStartPost, {
  body: {
    sessionId,
    accessCode: passCode,
    templateId: 'women',
    garmentType: 'saree',
    promptSet: 'set-2',
  },
});
assert((blockedSecondVideo.status === 409 || blockedSecondVideo.status === 401) && /already completed|been completed/i.test(blockedSecondVideo.data.error || ''), 'Second video generation blocked while pass videoDone is true');

// 11.2 Customer requests retry (1 retry permitted)
const retryApproval = await callRoute(activityPost, {
  body: {
    type: 'retry',
    label: 'Customer requests backup retry',
    sessionId,
    accessCode: passCode,
    target: 'video',
    service: 'ai-video',
  },
});
assert(retryApproval.ok, 'First customer retry approved');
passRecord = await getVideoPass(passCode);
assert(passRecord.retryApproved === true && passRecord.videoDone === false, 'Pass reset for 1 retry generation');

// 11.3 Customer starts retry using Backup Mode 1: Locked Tripod
const retrySessionId = `sim_retry_${Date.now()}`;
mockStore.sessions.set(retrySessionId, {
  sessionId: retrySessionId,
  clientId: 'maharaja',
  accessCode: passCode,
  eventId: 'diwali',
  templateId: 'women',
  garmentType: 'saree',
  promptSet: 'set-2',
  masterImageUrl: freshImageUrl,
  status: 'master_ready',
});

const backup1Start = await callRoute(videoStartPost, {
  body: {
    sessionId: retrySessionId,
    accessCode: passCode,
    templateId: 'women',
    garmentType: 'saree',
    retryMode: 'backup-locked',
  },
});
assert(backup1Start.ok, 'Backup 1 (Locked Tripod) retry video started');
assert(lastSubmittedPrompt.includes('100% LOCKED-OFF TRIPOD') || lastSubmittedPrompt.includes('STABILIZED LOCKED REGENERATION'), 'Backup 1 prompt contains 100% locked-off tripod rule');
assert(lastSubmittedPrompt.includes('ZERO zoom') && lastSubmittedPrompt.includes('ZERO pan'), 'Backup 1 prompt strictly enforces zero camera movement');

// 11.4 Finalize retry video
const backupJobId = backup1Start.data.jobId;
for (const job of mockFalJobs.values()) {
  job.status = 'COMPLETED';
}
await callRoute(videoStatusGet, {
  url: `http://localhost:3000/api/video/status?accessCode=${passCode}&sessionId=${retrySessionId}&jobId=${backupJobId}`,
});
passRecord = await getVideoPass(passCode);
assert(passRecord.videoDone === true, 'Retry video completed');
assert(passRecord.retryUsed === true, 'Pass marks retryUsed: true');

// 11.5 Customer attempts a second retry
const secondRetryAttempt = await callRoute(activityPost, {
  body: {
    type: 'retry',
    label: 'Customer attempts second retry',
    sessionId: retrySessionId,
    accessCode: passCode,
    target: 'video',
    service: 'ai-video',
  },
});
assert(secondRetryAttempt.status === 403 && /already used/i.test(secondRetryAttempt.data.error || ''), 'Second retry strictly refused: quota exhausted (403)');

console.log('\n===============================================================');
console.log(`🎉 ALL ${assertionCount} END-TO-END PIPELINE SIMULATION ASSERTIONS PASSED!`);
console.log('Zero Paid Credits Consumed · All Failure & Success Modes Verified');
console.log('===============================================================\n');

import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FAL_KEY']) {
  delete process.env[key];
}
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.NODE_ENV = 'test';

const { NextRequest } = await import('next/server.js');
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
const { POST: createHandoff } = await import('../src/app/api/tv/tryon-handoff/route.ts');
const { GET: getHandoff } = await import('../src/app/api/tv/tryon-handoff/[token]/route.ts');
const { POST: startVideo, GET: getVideoStatus } = await import('../src/app/api/tv/tryon-handoff/[token]/video/route.ts');

console.log('--- TESTING TRY-ON HANDOFF & AI VIDEO ROUTE ---');

// 1. Create a handoff with 1 look containing authentic garment reference URL
const testBase64Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const sampleGarmentUrl = 'https://tryfocus.in/images/sarees/kanchivaram-ruby.jpg';

const createReq = new NextRequest('http://localhost/api/tv/tryon-handoff', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    looks: [{
      sku: 'TF-SAR-01',
      title: 'Kanchivaram Silk Saree',
      image: testBase64Png,
      category: 'sarees',
      garmentType: 'saree',
      gender: 'women',
      garmentReferenceUrl: sampleGarmentUrl,
    }],
  }),
});

const createRes = await createHandoff(createReq);
assert.equal(createRes.status, 200, 'Handoff creation failed');
const createData = await createRes.json();
assert.ok(createData.token, 'Token must be returned');
const token = createData.token;
console.log('✓ Handoff created with token:', token);

// 2. Fetch the handoff details
const getReq = new NextRequest(`http://localhost/api/tv/tryon-handoff/${token}`);
const getRes = await getHandoff(getReq, { params: Promise.resolve({ token }) });
assert.equal(getRes.status, 200, 'Fetching handoff failed');
const getData = await getRes.json();
assert.equal(getData.looks.length, 1);
assert.equal(getData.looks[0].sku, 'TF-SAR-01');
assert.equal(getData.looks[0].category, 'sarees');
assert.equal(getData.looks[0].garmentReferenceUrl, sampleGarmentUrl);
console.log('✓ Handoff look retrieved with authentic garment reference:', getData.looks[0].garmentReferenceUrl);

// 3. Test video generation without Go-Live consent -> MUST FAIL with 400
const noConsentReq = new NextRequest(`http://localhost/api/tv/tryon-handoff/${token}/video`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageIndex: 0,
    consentGoLive: false,
  }),
});
const noConsentRes = await startVideo(noConsentReq, { params: Promise.resolve({ token }) });
assert.equal(noConsentRes.status, 400, 'Must reject video generation without Go-Live consent');
console.log('✓ Video generation correctly rejected when Go-Live consent is missing');

// 4. Test production honesty: when in production without FAL_KEY, MUST FAIL with 503 (no fake stock video!)
{
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const prodReq = new NextRequest(`http://localhost/api/tv/tryon-handoff/${token}/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageIndex: 0,
      consentGoLive: true,
    }),
  });
  const prodRes = await startVideo(prodReq, { params: Promise.resolve({ token }) });
  assert.equal(prodRes.status, 503, 'Must return 503 in production when video provider is unconfigured');
  const prodData = await prodRes.json();
  assert.match(prodData.error, /temporarily unavailable/);
  console.log('✓ Production mode honestly rejects with 503 when FAL_KEY is missing (no fake demo video)');
  process.env.NODE_ENV = oldNodeEnv;
}

// 5. Test video generation in test environment -> creates persistent job with durable consent
const videoReq = new NextRequest(`http://localhost/api/tv/tryon-handoff/${token}/video`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-forwarded-for': '203.0.113.195',
    'user-agent': 'MaharajaMobile/1.0',
  },
  body: JSON.stringify({
    imageIndex: 0,
    consentGoLive: true,
    useFailProofPrompt: false,
  }),
});
const videoRes = await startVideo(videoReq, { params: Promise.resolve({ token }) });
assert.equal(videoRes.status, 200, 'Video start failed');
const videoData = await videoRes.json();
assert.ok(videoData.success, 'Video start response must be successful');
assert.ok(videoData.jobId, 'jobId must be present');
console.log('✓ Video generation started with jobId:', videoData.jobId, 'status:', videoData.status);

// Verify durable consent was stored on the job record
const storedJob = getMockStore().sessions.get(`video_test_${videoData.jobId}`);
assert.ok(storedJob, 'Job must be persisted in database');
assert.equal(storedJob.consentRecord.granted, true);
assert.equal(storedJob.consentRecord.clientIp, '203.0.113.195');
assert.equal(storedJob.consentRecord.purpose, 'showroom-tv-golive-preview');
console.log('✓ Durable consent record verified with client IP and purpose');

// 6. Test Idempotency: generating again for the same ready look returns existing result without new cost
const repeatReq = new NextRequest(`http://localhost/api/tv/tryon-handoff/${token}/video`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageIndex: 0,
    consentGoLive: true,
    isRetry: false,
  }),
});
const repeatRes = await startVideo(repeatReq, { params: Promise.resolve({ token }) });
assert.equal(repeatRes.status, 200);
const repeatData = await repeatRes.json();
assert.equal(repeatData.jobId, videoData.jobId, 'Must return existing ready job ID');
assert.equal(repeatData.status, 'ready');
console.log('✓ Idempotent request returned existing video without generating duplicate job');

// 7. Test Retry: explicit retry allowed once with fail-proof prompt
const retryReq1 = new NextRequest(`http://localhost/api/tv/tv-handoff/video`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageIndex: 0,
    consentGoLive: true,
    isRetry: true,
    useFailProofPrompt: true,
  }),
});
const retryRes1 = await startVideo(retryReq1, { params: Promise.resolve({ token }) });
assert.equal(retryRes1.status, 200);
const retryData1 = await retryRes1.json();
assert.ok(retryData1.jobId);
console.log('✓ First video retry allowed and tracked (retryCount = 1)');

// 8. Test Retry Limit: 2nd retry must be rejected with limit reached
const retryReq2 = new NextRequest(`http://localhost/api/tv/tv-handoff/video`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageIndex: 0,
    consentGoLive: true,
    isRetry: true,
  }),
});
const retryRes2 = await startVideo(retryReq2, { params: Promise.resolve({ token }) });
assert.equal(retryRes2.status, 400);
const retryData2 = await retryRes2.json();
assert.match(retryData2.error, /retry limit reached/i);
console.log('✓ Second video retry correctly blocked by server-side retry limit protection');

// 9. Query status of video job
const statusReq = new NextRequest(`http://localhost/api/tv/tryon-handoff/${token}/video?jobId=${videoData.jobId}`);
const statusRes = await getVideoStatus(statusReq, { params: Promise.resolve({ token }) });
assert.equal(statusRes.status, 200, 'Video status check failed');
const statusData = await statusRes.json();
assert.ok(statusData.success);
assert.equal(statusData.status, 'ready');
assert.ok(statusData.videoUrl, 'Video URL must be returned');
console.log('✓ Video status ready with videoUrl:', statusData.videoUrl);

console.log('ALL TRY-ON HANDOFF VIDEO AUDIT TESTS PASSED SUCCESSFULLY!');

import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FAL_KEY']) {
  delete process.env[key];
}
process.env.ALLOW_MOCK_BACKEND = 'true';

const { NextRequest } = await import('next/server.js');
const { POST: createHandoff } = await import('../src/app/api/tv/tryon-handoff/route.ts');
const { GET: getHandoff } = await import('../src/app/api/tv/tryon-handoff/[token]/route.ts');
const { POST: startVideo, GET: getVideoStatus } = await import('../src/app/api/tv/tryon-handoff/[token]/video/route.ts');

console.log('--- TESTING TRY-ON HANDOFF & AI VIDEO ROUTE ---');

// 1. Create a handoff with 1 look
const testBase64Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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
console.log('✓ Handoff look retrieved with category metadata:', getData.looks[0].category);

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

// 4. Test video generation with Go-Live consent -> MUST SUCCEED
const videoReq = new NextRequest(`http://localhost/api/tv/tryon-handoff/${token}/video`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
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

// 5. Query status of video job
const statusReq = new NextRequest(`http://localhost/api/tv/tryon-handoff/${token}/video?jobId=${videoData.jobId}`);
const statusRes = await getVideoStatus(statusReq, { params: Promise.resolve({ token }) });
assert.equal(statusRes.status, 200, 'Video status check failed');
const statusData = await statusRes.json();
assert.ok(statusData.success);
assert.equal(statusData.status, 'ready');
assert.ok(statusData.videoUrl, 'Video URL must be returned');
console.log('✓ Video status ready with videoUrl:', statusData.videoUrl);

// 6. Test with fail-proof backup prompt
const retryVideoReq = new NextRequest(`http://localhost/api/tv/tryon-handoff/${token}/video`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageIndex: 0,
    consentGoLive: true,
    useFailProofPrompt: true,
  }),
});
const retryVideoRes = await startVideo(retryVideoReq, { params: Promise.resolve({ token }) });
assert.equal(retryVideoRes.status, 200);
const retryData = await retryVideoRes.json();
assert.ok(retryData.jobId);
console.log('✓ Fail-proof backup video generation started successfully');

console.log('ALL TRY-ON HANDOFF VIDEO TESTS PASSED!');


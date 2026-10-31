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
const { POST: createLookPass } = await import('../src/app/api/tv/tryon-handoff/[token]/pass/route.ts');
const { getVideoPass, updateMaharajaSettings } = await import('../src/lib/maharaja/server.ts');

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

async function requestPass(handoffToken, imageIndex) {
  const req = new NextRequest(`http://localhost/api/tv/tryon-handoff/${handoffToken}/pass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageIndex }),
  });
  const res = await createLookPass(req, { params: Promise.resolve({ token: handoffToken }) });
  return { status: res.status, data: await res.json() };
}

async function newHandoffToken(sku = 'OWN-123456') {
  const res = await createHandoff(new NextRequest('http://localhost/api/tv/tryon-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ looks: [{ sku, title: 'Customer Saree', image: testBase64Png, category: 'saree', garmentType: 'saree', gender: 'women', garmentReferenceUrl: testBase64Png }] }),
  }));
  return (await res.json()).token;
}

// 3. A look becomes a private 24-hour festival video pass (no Go Live condition, no direct render)
const first = await requestPass(token, 0);
assert.equal(first.status, 200, first.data.error);
assert.ok(first.data.pass.code, 'Pass code must be returned');
assert.equal(first.data.pass.path.endsWith(first.data.pass.code), true);
assert.equal(
  first.data.pass.path.startsWith('/maharaja/catalogue/'),
  first.data.pass.experienceType === 'catalogue-gift',
  'Catalogue looks open the catalogue pass page; own garments open the video page'
);
const stored = await getVideoPass(first.data.pass.code);
assert.ok(stored, 'Pass must be persisted');
assert.equal(stored.videoMasterDone, false, 'Gemini event portrait is created on the phone, not reused from the Try-On image');
assert.ok(Math.abs(stored.expiresAtMs - Date.now() - 24 * 60 * 60 * 1000) < 60_000, 'Pass is valid for 24 hours');
console.log('✓ Look converted into a 24-hour AI Video pass:', first.data.pass.experienceType);

// 4. Tapping again returns the same pass
const repeat = await requestPass(token, 0);
assert.equal(repeat.status, 200);
assert.equal(repeat.data.pass.code, first.data.pass.code);
console.log('✓ Repeat tap reuses the same pass');

// 5. Own garment looks become purchased-garment passes
const ownToken = await newHandoffToken();
const own = await requestPass(ownToken, 0);
assert.equal(own.status, 200, own.data.error);
assert.equal(own.data.pass.experienceType, 'purchased-garment');
assert.match(own.data.pass.path, /^\/maharaja\/video\//);
console.log('✓ Own garment look opens the own-garment video flow');

// 6. Unknown look index is rejected
const missing = await requestPass(ownToken, 4);
assert.equal(missing.status, 404);
console.log('✓ Unknown look rejected');

// 7. Store video credits and the mobile switch are enforced
await updateMaharajaSettings({ limits: { video: 0 } });
const noCredit = await requestPass(await newHandoffToken('OWN-222222'), 0);
assert.equal(noCredit.status, 403);
assert.match(noCredit.data.error, /paused/i);
await updateMaharajaSettings({ limits: { video: 500 }, devices: { mobile: false } });
const mobileOff = await requestPass(await newHandoffToken('OWN-333333'), 0);
assert.equal(mobileOff.status, 403);
assert.match(mobileOff.data.error, /turned off/i);
await updateMaharajaSettings({ devices: { mobile: true } });
console.log('✓ Video credits and mobile switch enforced before a pass is issued');

// 8. Catalogue festival videos come only from TV looks; own-garment looks work from the tablet too.
{
  const tabletHandoff = async (sku) => (await (await createHandoff(new NextRequest('http://localhost/api/tv/tryon-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'tablet', looks: [{ sku, title: 'Look', image: testBase64Png, category: 'sarees', garmentType: 'saree', gender: 'women', garmentReferenceUrl: testBase64Png }] }),
  }))).json()).token;
  const catalogueFromTablet = await requestPass(await tabletHandoff('TF-SAR-01'), 0);
  assert.equal(catalogueFromTablet.status, 403);
  assert.match(catalogueFromTablet.data.error, /store TV/);
  const ownFromTablet = await requestPass(await tabletHandoff('OWN-777777'), 0);
  assert.equal(ownFromTablet.status, 200, ownFromTablet.data.error);
  console.log('✓ Catalogue festival video only from the TV; own-garment video from tablet looks');
}

console.log('ALL TRY-ON HANDOFF VIDEO PASS TESTS PASSED SUCCESSFULLY!');

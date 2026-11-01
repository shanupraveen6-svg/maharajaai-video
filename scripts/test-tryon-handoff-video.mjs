import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FAL_KEY']) {
  delete process.env[key];
}
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.NODE_ENV = 'test';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

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

const handoffBody = (headers) => new NextRequest('http://localhost/api/tv/tryon-handoff', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify({
    looks: [{
      sku: '8IC53071',
      title: 'Kanchivaram Silk Saree',
      image: testBase64Png,
      category: 'sarees',
      garmentType: 'saree',
      gender: 'women',
      garmentReferenceUrl: sampleGarmentUrl,
    }],
  }),
});

// Only the paired TV or a signed-in counter can store looks.
assert.equal((await createHandoff(handoffBody({}))).status, 401, 'An unsigned handoff upload is refused');
const createRes = await createHandoff(handoffBody({ 'x-operator-key': 'test_secret' }));
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
assert.equal(getData.looks[0].sku, '8IC53071');
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
    headers: { 'Content-Type': 'application/json', 'x-operator-key': 'test_secret' },
    body: JSON.stringify({ looks: [{ sku, title: 'Customer Saree', image: testBase64Png, category: 'saree', garmentType: 'saree', gender: 'women', garmentReferenceUrl: testBase64Png }] }),
  }));
  return (await res.json()).token;
}

// 3. A catalogue look becomes a private 24-hour AI Video pass on the store collection.
const first = await requestPass(token, 0);
assert.equal(first.status, 200, first.data.error);
assert.ok(first.data.pass.code, 'Pass code must be returned');
assert.equal(first.data.pass.experienceType, 'catalogue-gift');
assert.ok(first.data.pass.path.startsWith('/maharaja/catalogue/'), 'Catalogue looks open the catalogue pass page');
const stored = await getVideoPass(first.data.pass.code);
assert.ok(stored, 'Pass must be persisted');
assert.equal(stored.catalogueSku, '8IC53071', 'The look\'s piece is chosen on the pass');
assert.equal(stored.videoMasterDone, false, 'Gemini event portrait is created on the phone, not reused from the Try-On image');
assert.ok(Math.abs(stored.expiresAtMs - Date.now() - 24 * 60 * 60 * 1000) < 60_000, 'Pass is valid for 24 hours');
console.log('✓ Look converted into a 24-hour AI Video pass:', first.data.pass.experienceType);

// 4. Tapping again returns the same pass
const repeat = await requestPass(token, 0);
assert.equal(repeat.status, 200);
assert.equal(repeat.data.pass.code, first.data.pass.code);
console.log('✓ Repeat tap reuses the same pass');

// 5. AI Video is store collection only: an own-outfit look cannot become a video.
const ownToken = await newHandoffToken();
const own = await requestPass(ownToken, 0);
assert.equal(own.status, 403);
assert.match(own.data.error, /store collection/);
const ownView = await (await getHandoff(new NextRequest(`http://localhost/api/tv/tryon-handoff/${ownToken}`), { params: Promise.resolve({ token: ownToken }) })).json();
assert.equal(ownView.looks[0].videoAvailable, false, 'The look page offers no video for an own outfit');
// A catalogue piece that is not set up for AI Video is refused too.
const notInCatalogue = await requestPass(await newHandoffToken('TF-SAR-99'), 0);
assert.equal(notInCatalogue.status, 403);
console.log('✓ Own-outfit and non-AI-Video looks are refused');

// 6. Unknown look index is rejected
const missing = await requestPass(token, 4);
assert.equal(missing.status, 404);
console.log('✓ Unknown look rejected');

// 7. Store video credits are enforced; the Go Live player being off does not stop AI Video.
await updateMaharajaSettings({ limits: { video: 0 } });
const noCredit = await requestPass(await newHandoffToken('8IC53074'), 0);
assert.equal(noCredit.status, 403);
assert.match(noCredit.data.error, /paused/i);
await updateMaharajaSettings({ limits: { video: 500 }, devices: { led: false } });
const goLiveOff = await requestPass(await newHandoffToken('8IC53072'), 0);
assert.equal(goLiveOff.status, 200, goLiveOff.data.error);
await updateMaharajaSettings({ devices: { led: true } });
console.log('✓ Video credits enforced before a pass is issued');

// 8. The tablet makes AI Video from the store collection too (a fresh hour for the handoff rate limit).
globalThis.__MAHARAJA_RATE_LIMITS__?.clear();
{
  const tabletHandoff = async (sku) => (await (await createHandoff(new NextRequest('http://localhost/api/tv/tryon-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-operator-key': 'test_secret' },
    body: JSON.stringify({ source: 'tablet', looks: [{ sku, title: 'Look', image: testBase64Png, category: 'sarees', garmentType: 'saree', gender: 'women', garmentReferenceUrl: testBase64Png }] }),
  }))).json()).token;
  const catalogueFromTablet = await requestPass(await tabletHandoff('8IC53071'), 0);
  assert.equal(catalogueFromTablet.status, 200, catalogueFromTablet.data.error);
  const ownFromTablet = await requestPass(await tabletHandoff('OWN-777777'), 0);
  assert.equal(ownFromTablet.status, 403);
  console.log('✓ Catalogue AI Video from tablet looks; own-outfit looks refused on every device');
}

console.log('ALL TRY-ON HANDOFF VIDEO PASS TESTS PASSED SUCCESSFULLY!');

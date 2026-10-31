import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const { NextRequest } = await import('next/server.js');
const server = await import('../src/lib/maharaja/server.ts');
const { POST: createPass } = await import('../src/app/api/maharaja/video-pass/route.ts');
const { GET: openPass } = await import('../src/app/api/maharaja/access/[code]/route.ts');
const { GET: billingInfo } = await import('../src/app/api/maharaja/billing/[code]/route.ts');

const workspace = await server.getMaharajaWorkspace();
assert.equal(workspace.videoMinPurchase, 5000, 'AI Video counter threshold defaults to Rs 5,000');
await server.updateMaharajaSettings({ videoMinPurchase: 0 });
assert.equal((await server.getMaharajaWorkspace()).videoMinPurchase, 0, 'Client can offer the AI Video on every bill');

const infoRes = await billingInfo(new NextRequest(`http://localhost/api/maharaja/billing/${workspace.billingCode}`), { params: Promise.resolve({ code: workspace.billingCode }) });
const info = await infoRes.json();
assert.equal(info.videoMinPurchase, 0);
assert.equal(info.whatsappEnabled, false, 'WhatsApp stays off until TryFocus connects it for the client');
assert.match(info.openVideoUrl, /video-poster\?code=/);
console.log('✓ Billing counter reads the client threshold, WhatsApp status and permanent QR');

const passRes = await createPass(new NextRequest('http://localhost/api/maharaja/video-pass', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ billingCode: workspace.billingCode, experienceType: 'purchased-garment' }),
}));
const passData = await passRes.json();
assert.equal(passRes.status, 200, passData.error);
const issued = await server.getVideoPass(passData.pass.code);
assert.equal(issued.activateOnScan, true);
assert.equal(issued.activatedAt, undefined, 'An unscanned counter QR is not yet activated');
console.log('✓ "Next customer" issues a private counter pass');

// Simulate a QR shown 3 hours before the customer scans it.
issued.expiresAtMs = Date.now() + 21 * 60 * 60 * 1000;
issued.expiresAt = new Date(issued.expiresAtMs).toISOString();
await server.saveVideoPass(issued);

const open = async () => {
  const res = await openPass(new NextRequest(`http://localhost/api/maharaja/access/${issued.code}?service=ai-video`), { params: Promise.resolve({ code: issued.code }) });
  assert.equal(res.status, 200);
  return (await res.json()).access;
};
const firstOpen = await open();
const activated = await server.getVideoPass(issued.code);
assert.ok(activated.activatedAt, 'First scan activates the pass');
assert.ok(Math.abs(activated.expiresAtMs - Date.now() - 24 * 60 * 60 * 1000) < 60_000, 'Validity is 24 hours from the first scan');
assert.equal(firstOpen.expiresAt, activated.expiresAt);
const secondOpen = await open();
assert.equal(secondOpen.expiresAt, activated.expiresAt, 'Later scans keep the original 24-hour window');
console.log('✓ 24-hour validity starts at first scan and is not extended by re-scans');

await server.updateMaharajaSettings({ videoMinPurchase: 5000 });

// Parallel Try-On credits never exceed the client's limit, and failed generations give the credit back.
const before = Number((await server.getMaharajaWorkspace()).usage.tryOnGenerated || 0);
const results = await Promise.all(Array.from({ length: 5 }, () => server.reserveMaharajaUsage('tryOnGenerated', before + 3)));
assert.equal(results.filter(Boolean).length, 3, 'Only the remaining 3 credits can be reserved');
await server.releaseMaharajaUsage('tryOnGenerated');
assert.equal(await server.reserveMaharajaUsage('tryOnGenerated', before + 3), true, 'A released credit can be used again');
assert.equal(await server.reserveMaharajaUsage('tryOnGenerated', 0), false, 'A zero limit means the service is off');
console.log('✓ Credit reservation is limit-safe and released credits return to the store');
// AI Video rules: own-garment passes download only; catalogue (TV) passes may Go Live.
{
  const res = await createPass(new NextRequest('http://localhost/api/maharaja/video-pass', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billingCode: workspace.billingCode, experienceType: 'catalogue-gift' }),
  }));
  const counterPass = await server.getVideoPass((await res.json()).pass.code);
  assert.equal(counterPass.experienceType, 'purchased-garment', 'Counter passes are always own-garment');
  assert.equal(server.passAllowsGoLive(counterPass), false, 'Own-garment videos cannot Go Live');
  assert.equal(server.passAllowsGoLive({ experienceType: 'catalogue-gift' }), true, 'TV catalogue videos can Go Live');
  const enqueueSource = (await import('node:fs')).readFileSync(new URL('../src/app/api/live/enqueue/route.ts', import.meta.url), 'utf8');
  assert.match(enqueueSource, /if \(!passAllowsGoLive\(access\.pass\)\)/, 'The server refuses Go Live for own-garment passes');

  // Phone lock: the first phone keeps the pass; another phone is refused.
  const openOn = async (deviceId) => (await openPass(new NextRequest(`http://localhost/api/maharaja/access/${counterPass.code}?service=ai-video&deviceId=${deviceId}`), { params: Promise.resolve({ code: counterPass.code }) })).status;
  assert.equal(await openOn('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 200);
  assert.equal(await openOn('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 200, 'The same phone can reopen it');
  assert.equal(await openOn('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 403, 'Another phone is refused');

  // Instagram: username or link becomes a profile link; Maharaja keeps its account by default.
  assert.equal(server.normalizeInstagramUrl('@sri.readymade'), 'https://www.instagram.com/sri.readymade/');
  assert.equal(server.normalizeInstagramUrl('https://instagram.com/sri_readymade?igsh=x'), 'https://www.instagram.com/sri_readymade/');
  assert.equal(server.normalizeInstagramUrl('not a handle!'), '');
  assert.match(server.instagramUrlFor(await server.getMaharajaWorkspace()), /majestic__maharaja/);

  // TV asks for bill digits exactly when an AI Video minimum is set.
  assert.equal(server.videoLimitSet({ videoMinPurchase: 5000 }), true);
  assert.equal(server.videoLimitSet({ videoMinPurchase: 0 }), false);
  console.log('✓ Go Live only for TV catalogue videos; phone lock; store Instagram; TV bill digits follow the limit');
}
console.log('COUNTER PASS TESTS PASSED');

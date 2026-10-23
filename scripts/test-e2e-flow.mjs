import pkg from '@next/env';
const { loadEnvConfig } = pkg;

loadEnvConfig(process.cwd());

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const OPERATOR_USERNAME = process.env.OPERATOR_USERNAME;
const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD;

if (!OPERATOR_USERNAME || !OPERATOR_PASSWORD) {
  throw new Error('OPERATOR_USERNAME and OPERATOR_PASSWORD are required for the end-to-end check.');
}

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`PASS: ${label}`);
}

async function json(response) {
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function run() {
  const home = await fetch(`${BASE_URL}/`);
  const homeHtml = await home.text();
  assert(home.ok && homeHtml.includes('id="store-select"'), 'TryFocus client selector loads');

  const login = await fetch(`${BASE_URL}/api/operator/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: OPERATOR_USERNAME, password: OPERATOR_PASSWORD }),
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
  assert(login.ok && cookie.includes('maharaja_operator_auth='), 'Operator login issues HttpOnly session');

  const workspaceResult = await json(await fetch(`${BASE_URL}/api/maharaja/workspace`, { headers: { cookie } }));
  assert(workspaceResult.response.ok && workspaceResult.data.workspace?.tryOnCode, 'Maharaja workspace API loads');
  assert(Array.isArray(workspaceResult.data.workspace?.analytics?.days), 'Retail analytics payload is available');
  assert(typeof workspaceResult.data.workspace?.analytics?.luxuryThreshold === 'number', 'Analytics includes configurable luxury threshold');
  const { tryOnCode, billingCode } = workspaceResult.data.workspace;

  const missingTryOnQr = await json(await fetch(`${BASE_URL}/api/ai/analyze-price-tag`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode: '', deviceId: `missingqr${Date.now()}`, printedText: 'MRP Rs. 799' }),
  }));
  assert(missingTryOnQr.response.status === 401, 'Try-On cannot be unlocked without the permanent Maharaja QR');

  const unauthenticatedBilling = await json(await fetch(`${BASE_URL}/api/maharaja/video-pass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billingCode, phone: '9999999999', billLast4: '5678', eventId: 'diwali', billAmount: 5000 }),
  }));
  assert(unauthenticatedBilling.response.status === 401, 'Public link cannot generate pass without authenticated biller/operator access');

  const invalidTier = await json(await fetch(`${BASE_URL}/api/maharaja/video-pass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ billingCode, phone: '9999999999', billLast4: '5678', eventId: 'diwali', billAmount: 1000 }),
  }));
  assert(invalidTier.response.status === 400, 'Biller must select a valid ₹5,000+, ₹7,000+, or ₹10,000+ tier');

  // Biller Role Test: Creates customer pass with operator cookie
  const passResult = await json(await fetch(`${BASE_URL}/api/maharaja/video-pass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ billingCode, phone: '9999999999', billLast4: '5678', eventId: 'diwali', billAmount: 5000 }),
  }));
  assert(passResult.response.ok && passResult.data.pass?.code, 'Biller creates customer AI Video QR');
  const customerPassCode = passResult.data.pass.code;

  // Billing-QR Customer Role Test: Customer with billing pass accesses ai-video
  const customerPassAccess = await json(await fetch(`${BASE_URL}/api/maharaja/access/${customerPassCode}?service=ai-video`));
  assert(customerPassAccess.response.ok && customerPassAccess.data.access?.service === 'ai-video' && customerPassAccess.data.access?.billLast4 === '5678', 'Billing-QR customer accesses AI Video service');

  // Wall-QR Customer Role Test: scans a locally decoded Rs 799 barcode
  const deviceId = `e2edevice${Date.now()}`;
  const tagResult = await json(await fetch(`${BASE_URL}/api/ai/analyze-price-tag`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode: tryOnCode, deviceId, barcode: '', printedText: 'Maximum Retail Price: Rs. 799.00', format: 'PRINTED_MRP' }),
  }));
  assert(tagResult.response.ok && tagResult.data.analysis?.eligible && tagResult.data.grant?.token, 'Printed Rs 799 MRP grants one Try-On without requiring a readable barcode');

  const post = async (path, body) => json(await fetch(`${BASE_URL}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));

  // Retry remains blocked until a paid generation has actually completed.
  const earlyRetry = await post('/api/maharaja/activity', {
    type: 'retry', label: 'Customer AI Video retry', sessionId: `e2e_retry_${Date.now()}`,
    accessCode: customerPassCode, target: 'video', service: 'ai-video',
  });
  assert(earlyRetry.response.status === 403 && /after the first AI Video/i.test(earlyRetry.data.error || ''), 'No-PIN retry cannot be consumed before the first video exists');

  // ---- /video/start guards that never reach the paid provider ----
  const pass2Result = await json(await fetch(`${BASE_URL}/api/maharaja/video-pass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ billingCode, phone: '9888888888', billLast4: '1234', eventId: 'diwali', billAmount: 7000 }),
  }));
  const pass2Code = pass2Result.data.pass?.code;
  assert(pass2Result.response.ok && pass2Code, 'Biller creates a second AI Video QR');
  const noMasterStart = await post('/api/video/start', {
    sessionId: `e2e_nomaster_${Date.now()}`, accessCode: pass2Code, eventId: 'diwali', isRetry: true,
    masterImageUrl: 'https://example.invalid/try-on.jpg', conceptPrompt: 'x',
  });
  assert(noMasterStart.response.status === 409 && /image first/i.test(noMasterStart.data.error || ''), 'Video cannot start without a stored video master, even with a spoofed Try-On image and isRetry:true');

  // Verify the single production prompt architecture.
  const { buildTryOnPrompt } = await import('../src/lib/maharaja/config.ts');
  const { VIDEO_CONCEPTS, buildVideoMasterPrompt, buildH3MotionPrompt } = await import('../src/lib/maharaja/video-concepts.ts');

  // Try-On prompt is garment-only; the festival scene belongs to the video master prompt only
  for (const cat of ['women', 'men', 'girl', 'boy']) {
    const tryOnPrompt = buildTryOnPrompt(cat);
    assert(/No festival environment/.test(tryOnPrompt) && /clean neutral fashion studio/.test(tryOnPrompt), `${cat}: Try-On prompt is plain/neutral`);
    assert(!/golden|Diwali|lamp-lit|rangoli/i.test(tryOnPrompt), `${cat}: Try-On prompt has no festival scene wording`);
    assert(/Do not add makeup/.test(tryOnPrompt) && /doll-like appearance/.test(tryOnPrompt), `${cat}: Try-On preserves natural customer identity`);
  }

  for (const concept of VIDEO_CONCEPTS) {
    const masterPrompt = buildVideoMasterPrompt(concept, 'generic');
    const motionPrompt = buildH3MotionPrompt(concept, ['garment front']);
    assert(/exact facial geometry/i.test(masterPrompt) && /exact garment/i.test(masterPrompt), `${concept.id}: Identity and garment lock enforced`);
    assert(/Do not add foundation/.test(masterPrompt) && /doll-like appearance/.test(masterPrompt), `${concept.id}: Master keeps natural skin without makeup`);
    assert(/outer thighs/.test(concept.finalPose) && !/Namaste|clasped|hip|wrist/i.test(concept.finalPose), `${concept.id}: Hands stay safely beside the thighs`);
    assert(/still photographic layer/.test(motionPrompt) && /No hand may move toward or touch the chest/.test(motionPrompt), `${concept.id}: H3 freezes customer and hand pose`);
    assert(/CAMERA CHOREOGRAPHY:/.test(motionPrompt) && /BACKGROUND ANIMATION:/.test(motionPrompt) && /CINEMATIC EFFECTS:/.test(motionPrompt), `${concept.id}: Camera, background and effects remain explicit`);
  }

  // Admin Logout Test
  const logout = await fetch(`${BASE_URL}/api/operator/logout`, { method: 'POST', headers: { cookie } });
  const clearedCookie = logout.headers.get('set-cookie') || '';
  assert(logout.ok && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(clearedCookie), 'Operator logout invalidates session cookie');
}

run().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});

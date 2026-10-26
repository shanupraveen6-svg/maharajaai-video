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

  const pairing = await fetch(`${BASE_URL}/api/tv/pair`, { method: 'POST', headers: { cookie } });
  const displayCookie = pairing.headers.get('set-cookie')?.split(';')[0] || '';
  assert(pairing.ok && displayCookie.startsWith('maharaja_display_auth='), 'Staff can pair a display independently of the operator session');
  const displayPage = await fetch(`${BASE_URL}/maharaja/tv`, { headers: { cookie: displayCookie }, redirect: 'manual' });
  assert(displayPage.ok, 'Paired display opens TV without an operator cookie');
  const displayLibrary = await fetch(`${BASE_URL}/api/live/replays`, { headers: { cookie: displayCookie } });
  assert(displayLibrary.ok, 'Paired display can read the replay library');
  const displayAdmin = await fetch(`${BASE_URL}/api/maharaja/workspace`, { headers: { cookie: displayCookie } });
  assert(displayAdmin.status === 401, 'Paired display cannot access the client admin API');
  const displayPublish = await fetch(`${BASE_URL}/api/live/replays`, { method: 'POST', headers: { cookie: displayCookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert(displayPublish.status === 401, 'Paired display cannot publish stored videos');
  await fetch(`${BASE_URL}/api/tv/pair`, { method: 'DELETE', headers: { cookie } });
  const revokedLibrary = await fetch(`${BASE_URL}/api/live/replays`, { headers: { cookie: displayCookie } });
  assert(revokedLibrary.status === 401, 'Revoked display immediately loses replay access');

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

  const invalidPhone = await json(await fetch(`${BASE_URL}/api/maharaja/video-pass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ billingCode, phone: '123' }),
  }));
  assert(invalidPhone.response.status === 400, 'Phone-only billing rejects invalid phone numbers');

  // Biller Role Test: Creates customer pass with operator cookie
  const passResult = await json(await fetch(`${BASE_URL}/api/maharaja/video-pass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ billingCode, phone: '9999999999', billLast4: '5678', eventId: 'diwali', billAmount: 5000 }),
  }));
  assert(passResult.response.ok && passResult.data.pass?.code, 'Biller creates customer AI Video QR');
  const customerPassCode = passResult.data.pass.code;

  // Stop at garment-type confirmation, before any upload reads or paid calls.
  for (const count of [1, 2, 3, 4]) {
    const validation = await json(await fetch(`${BASE_URL}/api/ai/master-image`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'e2e_photo_limit', accessCode: customerPassCode, service: 'try-on', templateId: 'women',
        processingConsent: true, consentVersion: '2026-10-privacy-v2', garmentTypeConfirmed: false,
        personPhotoStoragePath: 'clients/maharaja/sessions/e2e_photo_limit/person/photo.jpg',
        garmentPhotoStoragePaths: Array.from({ length: count }, (_, i) => `clients/maharaja/sessions/e2e_photo_limit/garment/${i}.jpg`),
      }),
    }));
    assert(validation.response.status === 400 && (count > 1
      ? /first Try-On uses exactly one garment/i.test(validation.data.error)
      : /confirm the garment type/i.test(validation.data.error)), `${count} garment reference(s): API enforces the first Try-On's single-garment limit before generation`, `${validation.response.status}: ${validation.data.error}`);
  }

  // Billing-QR Customer Role Test: Customer with billing pass accesses ai-video
  const customerPassAccess = await json(await fetch(`${BASE_URL}/api/maharaja/access/${customerPassCode}?service=ai-video`));
  assert(customerPassAccess.response.ok && customerPassAccess.data.access?.service === 'ai-video', 'Phone-only billing QR opens the customer AI Video service');

  // Wall-QR Customer Role Test: scans a locally decoded Rs 799 barcode
  const deviceId = `e2edevice${Date.now()}`;
  const tagResult = await json(await fetch(`${BASE_URL}/api/ai/analyze-price-tag`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode: tryOnCode, deviceId, barcode: '', printedText: 'Maximum Retail Price: Rs. 799.00', format: 'PRINTED_MRP', confirmed: true }),
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
    assert(/recognizable facial geometry/i.test(masterPrompt) && /exact garment/i.test(masterPrompt), `${concept.id}: Identity and garment lock enforced`);
    assert(/No makeup/.test(masterPrompt) && /doll-like finish/.test(masterPrompt), `${concept.id}: Master keeps natural skin without makeup`);
    if (['women-golden-courtyard', 'men-heritage-passage'].includes(concept.id)) {
      assert(/both hands and both feet completely visible/i.test(masterPrompt), `${concept.id}: Sample pose keeps full body visible`);
    } else {
      assert(/supported hand anatomically correct and visibly touching/i.test(masterPrompt) && /both hands stay below the waist/i.test(masterPrompt), `${concept.id}: Master supports the hand and keeps it below the waist`);
    }
    assert(/smile/.test(motionPrompt) && /both hands stay below waist, away from chest/.test(motionPrompt), `${concept.id}: Film permits natural expression while keeping hands safely below the waist`);
    assert(/CAMERA: 0-1s/.test(motionPrompt) && /BACKGROUND(?: \+ FX)?: Animate throughout|BACKGROUND: Animate only visible/.test(motionPrompt) && /Effects stay behind/.test(motionPrompt), `${concept.id}: Camera, background and effects remain explicit`);
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

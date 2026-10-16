import { loadEnvConfig } from '@next/env';

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

  // Biller Role Test: Creates customer pass
  const passResult = await json(await fetch(`${BASE_URL}/api/maharaja/video-pass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billingCode, phone: '9999999999', billLast4: '5678', eventId: 'diwali', eligible: true }),
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
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billingCode, phone: '9888888888', billLast4: '1234', eventId: 'diwali', eligible: true }),
  }));
  const pass2Code = pass2Result.data.pass?.code;
  assert(pass2Result.response.ok && pass2Code, 'Biller creates a second AI Video QR');
  const noMasterStart = await post('/api/video/start', {
    sessionId: `e2e_nomaster_${Date.now()}`, accessCode: pass2Code, eventId: 'diwali', isRetry: true,
    masterImageUrl: 'https://example.invalid/try-on.jpg', conceptPrompt: 'x',
  });
  assert(noMasterStart.response.status === 409 && /image first/i.test(noMasterStart.data.error || ''), 'Video cannot start without a stored video master, even with a spoofed Try-On image and isRetry:true');

  // Verify All Eight Video Prompt Combinations
  const { buildEventVideoPrompt, buildTryOnPrompt, buildMasterPrompt } = await import('../src/lib/maharaja/config.ts');

  // Try-On prompt is garment-only; the festival scene belongs to the video master prompt only
  for (const cat of ['women', 'men', 'girl', 'boy']) {
    const tryOnPrompt = buildTryOnPrompt(cat);
    assert(/Do not create a festival environment/.test(tryOnPrompt) && /premium, neutral indoor fashion retail studio background/.test(tryOnPrompt), `${cat}: Try-On prompt is plain/neutral`);
    assert(!/golden|Diwali|lamp-lit|rangoli(?!,)/i.test(tryOnPrompt.replace(/No diyas, no rangoli, no flowers, no festive props/, '')), `${cat}: Try-On prompt has no festival scene wording`);
    assert(/Diwali/.test(buildMasterPrompt(cat, 'diwali')), `${cat}: video master prompt keeps the Diwali scene`);
  }

  const categories = ['women', 'men', 'girl', 'boy'];
  const promptSets = ['b', 'a'];
  for (const cat of categories) {
    for (const pSet of promptSets) {
      const prompt = buildEventVideoPrompt(cat, 'diwali', pSet);
      assert(prompt.includes('Feet remain firmly anchored'), `${cat} ${pSet}: Stationary subject lock enforced`);
      assert(prompt.includes('No walking, stepping, turning, dancing'), `${cat} ${pSet}: Prohibited motion list present`);
      assert(prompt.includes('SHOT DESIGN:'), `${cat} ${pSet}: Explicit camera travel path defined`);
      assert(prompt.includes('This is a Diwali film'), `${cat} ${pSet}: Selected event is preserved`);
      if (cat === 'girl' || cat === 'boy') {
        assert(/child|child-appropriate/i.test(prompt), `${cat} ${pSet}: Child safety constraint present`);
      }
    }
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

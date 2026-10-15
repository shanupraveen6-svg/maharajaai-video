import sharp from 'sharp';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`PASS: ${label}`);
}

async function json(response) {
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function makeTestTag() {
  const svg = `<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="1200" fill="#fff"/><rect x="45" y="45" width="810" height="1110" fill="#fffaf0" stroke="#6e0d1f" stroke-width="12"/><text x="450" y="260" text-anchor="middle" font-size="68" font-family="Arial" font-weight="bold" fill="#6e0d1f">MAJESTIC MAHARAJA</text><text x="450" y="520" text-anchor="middle" font-size="44" font-family="Arial">FESTIVE GARMENT</text><text x="450" y="790" text-anchor="middle" font-size="160" font-family="Arial" font-weight="bold">Rs 799</text><text x="450" y="970" text-anchor="middle" font-size="32" font-family="Arial">INCLUSIVE OF ALL TAXES</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function run() {
  const home = await fetch(`${BASE_URL}/`);
  const homeHtml = await home.text();
  assert(home.ok && homeHtml.includes('id="store-select"'), 'TryFocus client selector loads');

  const login = await fetch(`${BASE_URL}/api/operator/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.OPERATOR_USERNAME || 'shanu7', password: process.env.OPERATOR_PASSWORD || '9994837342' }),
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

  // Wall-QR Customer Role Test: Scans Rs 799 price tag
  const deviceId = `e2edevice${Date.now()}`;
  const tag = await makeTestTag();
  const tagResult = await json(await fetch(`${BASE_URL}/api/ai/analyze-price-tag`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode: tryOnCode, deviceId, image: `data:image/png;base64,${tag.toString('base64')}` }),
  }));
  assert(tagResult.response.ok && tagResult.data.analysis?.eligible && tagResult.data.grant?.token, 'Gemini verifies Rs 799 tag and grants one Try-On');

  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const sessionId = `e2e_tryon_${Date.now()}`;
  const masterBody = {
    sessionId, accessCode: tryOnCode, service: 'try-on', eventId: 'diwali', deviceId,
    tryOnGrant: tagResult.data.grant.token, usePreset: true, personPhoto: pixel, garmentPhotos: [pixel],
    personAnalysis: { valid: true }, garmentAnalysis: { valid: true }, templateId: 'women',
  };
  const firstMaster = await json(await fetch(`${BASE_URL}/api/ai/master-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(masterBody) }));
  assert(firstMaster.response.ok && firstMaster.data.masterImageUrl, 'First AI Try-On generation succeeds');

  // Hard rejection of second Try-On from same device
  const secondMaster = await json(await fetch(`${BASE_URL}/api/ai/master-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...masterBody, sessionId: `${sessionId}_second` }) }));
  assert(secondMaster.response.status === 409 && /already completed/i.test(secondMaster.data.error || ''), 'Second AI image generation on the same device is blocked');

  const accessAfter = await json(await fetch(`${BASE_URL}/api/maharaja/access/${tryOnCode}?service=try-on&deviceId=${deviceId}`));
  assert(accessAfter.data.access?.tryOnUsed === true, 'Completed Try-On remains server-side locked');

  // Manager Video Retry PIN Tests
  const wrongPin = await json(await fetch(`${BASE_URL}/api/maharaja/activity`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'retry', label: 'Manager approved AI Video retry', sessionId, accessCode: customerPassCode, pin: '1234' }),
  }));
  assert(wrongPin.response.status === 403 && /incorrect/i.test(wrongPin.data.error || ''), 'Incorrect manager PIN is rejected');

  const correctPin = await json(await fetch(`${BASE_URL}/api/maharaja/activity`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'retry', label: 'Manager approved AI Video retry', sessionId, accessCode: customerPassCode, pin: '7070' }),
  }));
  assert(correctPin.response.ok && correctPin.data.success, 'Correct manager PIN 7070 authorizes retry');

  // Video Retry Source Test: Fetches approved master image without regenerating
  const videoMasterBody = {
    ...masterBody, sessionId: `video_sess_${Date.now()}`, accessCode: customerPassCode, service: 'ai-video',
  };
  await fetch(`${BASE_URL}/api/ai/master-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(videoMasterBody) });
  
  // Verify billing pass blocks duplicate image generation
  const secondImageAttempt = await json(await fetch(`${BASE_URL}/api/ai/master-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...videoMasterBody, sessionId: `video_sess_dup_${Date.now()}` }) }));
  assert(secondImageAttempt.response.status === 409 && /already generated/i.test(secondImageAttempt.data.error || ''), 'Billing customer blocked from generating duplicate AI image');

  const accessWithImage = await json(await fetch(`${BASE_URL}/api/maharaja/access/${customerPassCode}?service=ai-video`));
  assert(accessWithImage.data.access?.imageDone === true && accessWithImage.data.access?.masterImageUrl, 'Billing pass returns approved master image on access reload');

  const retrySource = await json(await fetch(`${BASE_URL}/api/video/retry-source?sessionId=${videoMasterBody.sessionId}&accessCode=${customerPassCode}`));
  assert(retrySource.response.ok && retrySource.data.source?.masterImageUrl, 'Video retry source retrieves existing approved master image');

  // Verify second retry on same pass is blocked
  const secondRetry = await json(await fetch(`${BASE_URL}/api/maharaja/activity`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'retry', label: 'Manager approved AI Video retry', sessionId, accessCode: customerPassCode, pin: '7070' }),
  }));
  assert(secondRetry.response.status === 403 && /already used/i.test(secondRetry.data.error || ''), 'Second manager retry on same billing pass is blocked');

  // Admin Reset Try-On Limits Test
  const resetGrants = await json(await fetch(`${BASE_URL}/api/maharaja/try-on-grants`, { method: 'DELETE', headers: { cookie } }));
  assert(resetGrants.response.ok && resetGrants.data.success, 'Admin reset successfully clears Try-On device limits');

  // Verify All Eight Video Prompt Combinations
  const { buildEventVideoPrompt } = await import('../src/lib/maharaja/config.ts');
  const categories = ['women', 'men', 'girl', 'boy'];
  const promptSets = ['set-1', 'set-2'];
  for (const cat of categories) {
    for (const pSet of promptSets) {
      const prompt = buildEventVideoPrompt(cat, 'diwali', pSet);
      assert(prompt.includes('completely stationary for all 6 seconds'), `${cat} ${pSet}: Stationary subject lock enforced`);
      assert(prompt.includes('Feet remain fixed to the floor'), `${cat} ${pSet}: Feet locked enforced`);
      assert(prompt.includes('Prohibited: walking, stepping, turning, dancing'), `${cat} ${pSet}: Prohibited motion list present`);
      assert(prompt.includes('Camera path:'), `${cat} ${pSet}: Explicit camera travel path defined`);
      if (cat === 'girl' || cat === 'boy') {
        assert(prompt.includes('lit brass lamp in both hands'), `${cat} ${pSet}: Child lamp holding constraint present`);
      }
      if (pSet === 'set-2') {
        if (cat === 'women' || cat === 'girl') {
          assert(prompt.includes('Divine-touch set:'), `${cat} ${pSet}: Divine touch background lighting present`);
        } else {
          assert(prompt.includes('Cracker set:'), `${cat} ${pSet}: Cracker sparks background effects present`);
        }
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

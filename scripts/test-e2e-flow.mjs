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
  const { tryOnCode, billingCode } = workspaceResult.data.workspace;

  const passResult = await json(await fetch(`${BASE_URL}/api/maharaja/video-pass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billingCode, phone: '9999999999', billLast4: '5678', eventId: 'diwali', eligible: true }),
  }));
  assert(passResult.response.ok && passResult.data.pass?.code, 'Biller creates customer AI Video QR');

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

  const secondMaster = await json(await fetch(`${BASE_URL}/api/ai/master-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...masterBody, sessionId: `${sessionId}_second` }) }));
  assert(secondMaster.response.status === 409 && /already completed/i.test(secondMaster.data.error || ''), 'Second AI image generation on the same device is blocked');

  const accessAfter = await json(await fetch(`${BASE_URL}/api/maharaja/access/${tryOnCode}?service=try-on&deviceId=${deviceId}`));
  assert(accessAfter.data.access?.tryOnUsed === true, 'Completed Try-On remains server-side locked');

  const logout = await fetch(`${BASE_URL}/api/operator/logout`, { method: 'POST', headers: { cookie } });
  const clearedCookie = logout.headers.get('set-cookie') || '';
  assert(logout.ok && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(clearedCookie), 'Operator logout invalidates session cookie');
}

run().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});

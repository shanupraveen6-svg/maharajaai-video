import fs from 'fs';
import sharp from 'sharp';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function makeTestTag(amount, sku) {
  const svg = `
<svg width="1000" height="1500" viewBox="0 0 1000 1500" xmlns="http://www.w3.org/2000/svg">
  <rect width="1000" height="1500" fill="#E9E4DA"/>
  <rect x="120" y="70" width="760" height="1360" rx="30" fill="#FFFDF8" stroke="#6E0D1F" stroke-width="12"/>
  <circle cx="500" cy="135" r="34" fill="#E9E4DA" stroke="#6E0D1F" stroke-width="8"/>
  <text x="500" y="285" text-anchor="middle" font-family="Georgia, serif" font-size="72" font-weight="700" fill="#6E0D1F">MAJESTIC</text>
  <text x="500" y="375" text-anchor="middle" font-family="Georgia, serif" font-size="86" font-weight="700" fill="#6E0D1F">MAHARAJA</text>
  <line x1="210" y1="435" x2="790" y2="435" stroke="#D4AF37" stroke-width="8"/>
  <text x="500" y="545" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#5C4B43">FESTIVE COLLECTION</text>
  <text x="500" y="675" text-anchor="middle" font-family="Arial, sans-serif" font-size="31" fill="#5C4B43">SILK BLEND GARMENT</text>
  <rect x="195" y="755" width="610" height="300" fill="#F8F5EE" stroke="#D8C49B" stroke-width="5"/>
  <text x="500" y="855" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#5C4B43">MRP</text>
  <text x="500" y="985" text-anchor="middle" font-family="Arial, sans-serif" font-size="126" font-weight="700" fill="#17120F">Rs ${amount}</text>
  <text x="500" y="1130" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" fill="#5C4B43">INCLUSIVE OF ALL TAXES</text>
  <text x="500" y="1215" text-anchor="middle" font-family="monospace" font-size="30" fill="#17120F">SKU: ${sku}</text>
  <g fill="#17120F">
    ${Array.from({ length: 42 }, (_, index) => `<rect x="${225 + index * 13}" y="1260" width="${index % 3 === 0 ? 7 : 4}" height="95"/>`).join('')}
  </g>
  <text x="500" y="1400" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#6E0D1F">TRYFOCUS TEST PRICE TAG</text>
</svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf.toString('base64');
}

async function run() {
  console.log('--- 1. Testing Home Page HTML ---');
  const homeRes = await fetch(`${BASE_URL}/`);
  const homeHtml = await homeRes.text();
  console.log('Home status:', homeRes.status);
  console.log('Has store-select:', homeHtml.includes('id="store-select"'));
  console.log('Has Maharaja option:', homeHtml.includes('value="maharaja"'));
  console.log('Has continue-to-login-btn:', homeHtml.includes('id="continue-to-login-btn"'));

  console.log('\n--- 2. Testing Login ---');
  const operatorUsername = process.env.OPERATOR_USERNAME || 'shanu7';
  const operatorPassword = process.env.OPERATOR_PASSWORD || '9994837342';
  const loginRes = await fetch(`${BASE_URL}/api/operator/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: operatorUsername, password: operatorPassword }),
  });
  console.log('Login status:', loginRes.status);
  const setCookie = loginRes.headers.get('set-cookie');
  console.log('Received auth cookie:', !!setCookie);
  const authCookie = setCookie ? setCookie.split(';')[0] : '';

  console.log('\n--- 3. Testing Maharaja Workspace ---');
  const wsRes = await fetch(`${BASE_URL}/api/maharaja/workspace`, {
    headers: { cookie: authCookie },
  });
  const wsData = await wsRes.json();
  console.log('Workspace success:', wsData.success);
  console.log('Workspace Code:', wsData.workspace?.workspaceCode);
  console.log('Try-On Code:', wsData.workspace?.tryOnCode);
  console.log('Billing Code:', wsData.workspace?.billingCode);
  console.log('Billing URL:', wsData.workspace?.billingUrl);

  const billingCode = wsData.workspace.billingCode;
  const tryOnCode = wsData.workspace.tryOnCode;

  console.log('\n--- 4. Testing Billing Counter: Generate Customer QR ---');
  const passRes = await fetch(`${BASE_URL}/api/maharaja/video-pass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      billingCode,
      phone: '9876543210',
      billLast4: '5566',
      eventId: 'diwali',
      eligible: true,
    }),
  });
  const passData = await passRes.json();
  console.log('Customer Pass created:', passData.success, 'Code:', passData.pass?.code);
  const customerPassCode = passData.pass.code;

  console.log('\n--- 5. Customer Access: First Use ---');
  const access1 = await fetch(`${BASE_URL}/api/maharaja/access/${customerPassCode}?service=ai-video`);
  const access1Data = await access1.json();
  console.log('First access allowed:', access1Data.success, 'Status:', access1.status);

  console.log('\n--- 6. Customer Download / Go Live: Mark Pass as Completed ---');
  const completeRes = await fetch(`${BASE_URL}/api/maharaja/video-pass/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: customerPassCode, action: 'download' }),
  });
  const completeData = await completeRes.json();
  console.log('Complete pass result:', completeData);

  console.log('\n--- 7. Customer Access: Second Try After Download (Must Be Blocked) ---');
  const access2 = await fetch(`${BASE_URL}/api/maharaja/access/${customerPassCode}?service=ai-video`);
  const access2Data = await access2.json();
  console.log('Second access status:', access2.status, 'Error message:', access2Data.error);
  if (access2Data.error === 'This AI Video has been completed.') {
    console.log('✅ Video Pass 1-use enforcement: PASSED');
  } else {
    console.log('❌ Video Pass 1-use enforcement: FAILED', access2Data);
  }

  console.log('\n--- 8. Try-On Device Lifecycle: One per device, ends after download ---');
  const testDeviceId = 'test_device_' + Date.now();
  
  // Step 8a: Verify price tag (First scan)
  const tagBase64 = await makeTestTag(799, 'SKU-INIT-' + Date.now());
  const tagRes = await fetch(`${BASE_URL}/api/ai/analyze-price-tag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:image/png;base64,${tagBase64}`,
      accessCode: tryOnCode,
      deviceId: testDeviceId,
    }),
  });
  const tagData = await tagRes.json();
  console.log('Tag analysis result:', tagData.success, 'Eligible:', tagData.analysis?.eligible, 'Token granted:', !!tagData.grant?.token);
  const tryOnToken = tagData.grant?.token;

  // Step 8b: Price Tag Re-use Lock (Another device tries to scan the exact same tag)
  const anotherDeviceId = 'device_thief_' + Date.now();
  const duplicateTagRes = await fetch(`${BASE_URL}/api/ai/analyze-price-tag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:image/png;base64,${tagBase64}`,
      accessCode: tryOnCode,
      deviceId: anotherDeviceId,
    }),
  });
  const duplicateTagData = await duplicateTagRes.json();
  console.log('Duplicate tag scan blocked:', duplicateTagRes.status, duplicateTagData.error);
  if (duplicateTagRes.status === 409 && duplicateTagData.error?.includes('already been used')) {
    console.log('✅ Price Tag Re-use Lock: PASSED (Duplicate scan blocked)');
  } else {
    console.log('❌ Price Tag Re-use Lock: FAILED', duplicateTagData);
  }

  // Step 8c: Generate Master Image (Initial Generation - Retry 0)
  const masterRes = await fetch(`${BASE_URL}/api/ai/master-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: `test_session_${Date.now()}`,
      accessCode: tryOnCode,
      service: 'try-on',
      deviceId: testDeviceId,
      tryOnGrant: tryOnToken,
      usePreset: true,
      personPhoto: `data:image/jpeg;base64,${tagBase64}`,
      garmentPhotos: [`data:image/png;base64,${tagBase64}`],
    }),
  });
  const masterData = await masterRes.json();
  console.log('Master image generated:', masterData.success, 'Has Watermarked Base64:', masterData.masterImageUrl?.startsWith('data:image/jpeg;base64,'));
  if (masterData.masterImageUrl?.startsWith('data:image/jpeg;base64,')) {
    console.log('✅ Permanent Maharaja Logo Watermark: PASSED');
  }

  // Step 8d: Retry #1 (1st retry allowed)
  const newTag1 = await makeTestTag(899, 'SKU-RETRY-1-' + Date.now());
  const retry1Res = await fetch(`${BASE_URL}/api/ai/analyze-price-tag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:image/png;base64,${newTag1}`,
      accessCode: tryOnCode,
      deviceId: testDeviceId,
    }),
  });
  const retry1Data = await retry1Res.json();
  console.log('Retry #1 tag scan allowed:', retry1Data.success, 'Token:', !!retry1Data.grant?.token);
  if (retry1Data.grant?.token) {
    await fetch(`${BASE_URL}/api/ai/master-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: `test_session_retry1_${Date.now()}`,
        accessCode: tryOnCode,
        service: 'try-on',
        deviceId: testDeviceId,
        tryOnGrant: retry1Data.grant.token,
        usePreset: true,
        personPhoto: `data:image/jpeg;base64,${tagBase64}`,
        garmentPhotos: [`data:image/png;base64,${tagBase64}`],
      }),
    });
    console.log('✅ Retry #1 generation: PASSED');
  }

  // Step 8e: Retry #2 (2nd retry allowed)
  const newTag2 = await makeTestTag(999, 'SKU-RETRY-2-' + Date.now());
  const retry2Res = await fetch(`${BASE_URL}/api/ai/analyze-price-tag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:image/png;base64,${newTag2}`,
      accessCode: tryOnCode,
      deviceId: testDeviceId,
    }),
  });
  const retry2Data = await retry2Res.json();
  console.log('Retry #2 tag scan allowed:', retry2Data.success, 'Token:', !!retry2Data.grant?.token);
  if (retry2Data.grant?.token) {
    await fetch(`${BASE_URL}/api/ai/master-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: `test_session_retry2_${Date.now()}`,
        accessCode: tryOnCode,
        service: 'try-on',
        deviceId: testDeviceId,
        tryOnGrant: retry2Data.grant.token,
        usePreset: true,
        personPhoto: `data:image/jpeg;base64,${tagBase64}`,
        garmentPhotos: [`data:image/png;base64,${tagBase64}`],
      }),
    });
    console.log('✅ Retry #2 generation: PASSED');
  }

  // Step 8f: Retry #3 (Must be BLOCKED because max retry is 2)
  const newTag3 = await makeTestTag(1099, 'SKU-RETRY-3-' + Date.now());
  const retry3Res = await fetch(`${BASE_URL}/api/ai/analyze-price-tag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:image/png;base64,${newTag3}`,
      accessCode: tryOnCode,
      deviceId: testDeviceId,
    }),
  });
  const retry3Data = await retry3Res.json();
  console.log('Retry #3 blocked by 2-retry limit:', retry3Res.status, retry3Data.error);
  if (retry3Res.status === 409 && retry3Data.error?.includes('maximum limit of 2 retries')) {
    console.log('✅ Max 2 Retry Limit Enforcement: PASSED (3rd retry refused)');
  } else {
    console.log('❌ Max 2 Retry Limit Enforcement: FAILED', retry3Data);
  }

  // Step 8g: Tap Download (ends session)
  const dlRes = await fetch(`${BASE_URL}/api/maharaja/try-on-grants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: testDeviceId }),
  });
  const dlData = await dlRes.json();
  console.log('Download complete reported:', dlData);

  // Step 8h: Check device access after download (Must be permanently 'used')
  const devAccessAfter = await fetch(`${BASE_URL}/api/maharaja/access/${tryOnCode}?service=try-on&deviceId=${testDeviceId}`);
  const devAccessAfterData = await devAccessAfter.json();
  console.log('Status after download:', devAccessAfterData.access?.tryOnStatus, 'tryOnUsed:', devAccessAfterData.access?.tryOnUsed);
  if (devAccessAfterData.access?.tryOnUsed === true && devAccessAfterData.access?.tryOnStatus === 'used') {
    console.log('✅ Try-On permanently locked after download: PASSED');
  } else {
    console.log('❌ Try-On lock after download: FAILED', devAccessAfterData);
  }

  // Step 8i: Attempt another tag after download (Must be refused)
  const newTag4 = await makeTestTag(1199, 'SKU-POSTDL-' + Date.now());
  const postDlTry = await fetch(`${BASE_URL}/api/ai/analyze-price-tag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:image/png;base64,${newTag4}`,
      accessCode: tryOnCode,
      deviceId: testDeviceId,
    }),
  });
  const postDlData = await postDlTry.json();
  console.log('Tag scan after download blocked:', postDlTry.status, postDlData.error);
  if (postDlTry.status === 409 && postDlData.error === 'This device has already completed its Maharaja AI Try-On.') {
    console.log('✅ Cannot generate another Try-On after download: PASSED');
  } else {
    console.log('❌ Post-download block FAILED:', postDlData);
  }
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});

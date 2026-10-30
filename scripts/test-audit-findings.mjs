import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FAL_KEY']) {
  delete process.env[key];
}
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'audit-test-secret';

const { NextRequest } = await import('next/server.js');
const { POST: publishCatalogue } = await import('../src/app/api/maharaja/catalogue/import/publish/route.ts');
const { POST: createPhotoTransfer } = await import('../src/app/api/tv/photo-transfer/route.ts');
const { GET: getPhotoTransfer, DELETE: deletePhotoTransfer } = await import('../src/app/api/tv/photo-transfer/[token]/route.ts');
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
const { upsertCatalogueProduct } = await import('../src/lib/maharaja/catalogue.ts');

console.log('--- RUNNING AUDIT FINDINGS VERIFICATION TESTS ---');

// 1. Finding 4: Test server-side AI Video price validation (> ₹0 required)
{
  console.log('1. Testing AI Video price validation server-side...');
  const batchId = 'batch-test-audit-1234';
  const req = new NextRequest('http://localhost/api/maharaja/catalogue/import/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-operator-key': 'audit-test-secret',
    },
    body: JSON.stringify({
      batchId,
      items: [
        {
          sku: 'MAH-TEST-ZERO-PRICE',
          title: 'Zero Price Video Saree',
          category: 'sarees',
          storagePath: `clients/maharaja/catalogue-imports/${batchId}/item1.jpg`,
          price: 0,
          eligibleForVideo: true, // Invalid: price is 0
        },
      ],
    }),
  });

  const res = await publishCatalogue(req);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.results[0].success, false);
  assert.match(data.results[0].error, /greater than ₹0/);
  console.log('✓ Zero-price AI video garment correctly rejected by server API');
}

// 2. Finding 3: Test server-side duplicate SKU collision protection
{
  console.log('2. Testing server-side SKU collision protection...');
  const existingSku = 'MAH-EXISTING-SKU-999';
  await upsertCatalogueProduct({
    sku: existingSku,
    title: 'Pre-existing Garment',
    price: 3999,
    category: 'sarees',
    gender: 'women',
    audience: 'Women',
    garmentType: 'saree',
    storagePath: 'dummy/path.jpg',
    newArrival: false,
    eligibleForVideo: false,
    active: true,
    sortOrder: 1,
  });

  const batchId = 'batch-test-audit-5678';
  const req = new NextRequest('http://localhost/api/maharaja/catalogue/import/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-operator-key': 'audit-test-secret',
    },
    body: JSON.stringify({
      batchId,
      items: [
        {
          sku: existingSku, // Collides with existing product
          title: 'Duplicate Garment Attempt',
          category: 'sarees',
          storagePath: `clients/maharaja/catalogue-imports/${batchId}/item2.jpg`,
          price: 2500,
          eligibleForVideo: false,
        },
      ],
    }),
  });

  const res = await publishCatalogue(req);
  const data = await res.json();
  assert.equal(data.results[0].success, false);
  assert.match(data.results[0].error, /already exists/);
  console.log('✓ Duplicate SKU collision correctly blocked from overwriting existing products');
}

// 3. Finding 5: Test Photo Transfer cancellation & expiry cleanup
{
  console.log('3. Testing Photo Transfer cleanup...');
  // Create transfer with operator key to satisfy verifyTvRequest
  const createRes = await createPhotoTransfer(new NextRequest('http://localhost/api/tv/photo-transfer', {
    method: 'POST',
    headers: { 'x-operator-key': 'audit-test-secret' },
  }));
  const transfer = await createRes.json();
  assert.ok(transfer.token);
  assert.ok(transfer.receiver);

  // Check it exists
  const checkReq = new NextRequest(`http://localhost/api/tv/photo-transfer/${transfer.token}`, {
    headers: { 'x-transfer-receiver': transfer.receiver },
  });
  const checkRes = await getPhotoTransfer(checkReq, { params: Promise.resolve({ token: transfer.token }) });
  assert.equal(checkRes.status, 200);

  // Delete/cancel
  const delReq = new NextRequest(`http://localhost/api/tv/photo-transfer/${transfer.token}`, {
    method: 'DELETE',
    headers: { 'x-transfer-receiver': transfer.receiver },
  });
  const delRes = await deletePhotoTransfer(delReq, { params: Promise.resolve({ token: transfer.token }) });
  assert.equal(delRes.status, 200);

  // Verify deleted from store
  assert.equal(getMockStore().sessions.get(`photo_transfer_${transfer.token}`), undefined);
  console.log('✓ Photo transfer cancellation successfully cleans up server-side transfer record');
}

console.log('ALL AUDIT VERIFICATION TESTS PASSED SUCCESSFULLY!');

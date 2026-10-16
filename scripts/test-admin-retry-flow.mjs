import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';

const server = await import('../src/lib/maharaja/server.ts');
const {
  saveVideoPass,
  getVideoPass,
  expireActivePassesForPhone,
  logMaharajaActivity,
  incrementMaharajaUsage,
  listMaharajaActivity,
} = server;

function assert(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

async function runTest() {
  console.log('--- Testing 1 Phone = 1 Active Pass & Retry Invalidation ---');
  const phone = '9876543210';
  const billLast4 = '1234';

  // 1. Create first pass
  const pass1 = {
    id: 'pass_test_1',
    code: 'pass_test_1',
    clientId: 'maharaja',
    phone,
    phoneMasked: '98******10',
    billLast4,
    eventId: 'diwali',
    status: 'active',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    expiresAtMs: Date.now() + 3600000,
    usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
  };
  await saveVideoPass(pass1);

  const retrieved1 = await getVideoPass('pass_test_1');
  assert(retrieved1?.status === 'active', 'Pass 1 initial status is active');

  // 2. Retry with same phone number -> expire existing active pass
  console.log('\n--- Simulating Biller Retry for Same Phone Number ---');
  const expiredCount = await expireActivePassesForPhone(phone);
  assert(expiredCount === 1, 'Expired 1 previous active pass for phone');

  const pass1AfterRetry = await getVideoPass('pass_test_1');
  assert(pass1AfterRetry?.status === 'expired', 'Pass 1 status is marked expired');
  assert(pass1AfterRetry?.expiredReason === 'superseded_by_retry', 'Pass 1 has expiredReason superseded_by_retry');

  // 3. Create Pass 2 (the retried new code for same phone)
  const pass2 = {
    id: 'pass_test_2_new',
    code: 'pass_test_2_new',
    clientId: 'maharaja',
    phone,
    phoneMasked: '98******10',
    billLast4,
    eventId: 'diwali',
    status: 'active',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    expiresAtMs: Date.now() + 3600000,
    usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
  };
  await saveVideoPass(pass2);
  const retrieved2 = await getVideoPass('pass_test_2_new');
  assert(retrieved2?.status === 'active', 'Pass 2 with new ID is active');

  // 4. Test Go-Live Activity logging with customerName, phone, videoUrl
  console.log('\n--- Testing Go-Live Activity Logging ---');
  await logMaharajaActivity('go-live', 'Customer Praveen joined live-screen queue', {
    sessionId: 'session_999',
    queueNumber: 1,
    customerName: 'Praveen Kumar',
    phone: '9876543210',
    phoneMasked: '98******10',
    videoUrl: 'https://storage.googleapis.com/test/video.mp4',
  });

  const activities = await listMaharajaActivity(10);
  const goLive = activities.find((a) => a.type === 'go-live');
  assert(!!goLive, 'Go-Live activity recorded in activity store');
  assert(goLive.metadata?.videoUrl === 'https://storage.googleapis.com/test/video.mp4', 'Go-Live activity metadata contains videoUrl');
  assert(goLive.metadata?.customerName === 'Praveen Kumar', 'Go-Live activity metadata contains customerName');
  assert(goLive.metadata?.phoneMasked === '98******10', 'Go-Live activity metadata contains phoneMasked');

  console.log('\n🎉 ALL RETRY & AUDIT VERIFICATION TESTS PASSED!');
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

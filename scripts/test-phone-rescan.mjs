import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);
process.env.ALLOW_MOCK_BACKEND = 'true';
const { NextRequest } = await import('next/server');
const server = await import('../src/lib/maharaja/server.ts');
const { GET } = await import('../src/app/api/maharaja/access/[code]/route.ts');

const workspace = await server.getMaharajaWorkspace();
const code = workspace.tryOnCode;
const deviceId = 'phone-rescan-device-0001';
const scan = async () => (await (await GET(new NextRequest(`http://localhost/api/maharaja/access/${code}?service=try-on&deviceId=${deviceId}`), { params: Promise.resolve({ code }) })).json()).access;

// First scan: nothing made yet, the flow starts.
let access = await scan();
assert.equal(Boolean(access.lookMade), false);

// The phone makes its look.
const grant = await server.issueTryOnGrant(deviceId, 0, true);
await server.reserveTryOnGrant(deviceId, grant.token, 'session-1', true);
await server.finishTryOnGrant(deviceId, 'session-1', true);
access = await scan();
assert.equal(access.lookMade, true, 'A re-scan after a look never starts over');

// The customer opens ⋯ Try once more but leaves before finishing: still no start screen.
await server.enableTryOnDeviceCustomerRetry(deviceId);
access = await scan();
assert.equal(access.lookMade, true, 'An unfinished retry still opens on the look / Follow and Share');
assert.equal(access.retryPending, true, 'The unfinished retry can be picked up again from ⋯');

// Saved to the phone: the re-scan shows Follow us and Share.
await server.markTryOnDeviceDownloaded(deviceId);
access = await scan();
assert.equal(access.lookDownloaded, true);

console.log('✓ A phone that made a look reopens on it (or on Follow and Share), never on the start screen');

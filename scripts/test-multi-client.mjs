import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';
process.env.OPERATOR_USERNAME = 'tryfocus';
process.env.OPERATOR_PASSWORD = 'tryfocus-pass';

const { NextRequest } = await import('next/server.js');
const server = await import('../src/lib/maharaja/server.ts');
const { runWithClient, liveScreenId } = await import('../src/lib/maharaja/client-context.ts');
const { setClientAccount } = await import('../src/lib/auth/client-accounts.ts');
const { getOperatorSession } = await import('../src/lib/auth/operator.ts');
const catalogue = await import('../src/lib/maharaja/catalogue.ts');
const { POST: login } = await import('../src/app/api/operator/login/route.ts');
const { GET: listClients } = await import('../src/app/api/admin/clients/route.ts');
const workspaceRoute = await import('../src/app/api/maharaja/workspace/route.ts');
const { POST: createPass } = await import('../src/app/api/maharaja/video-pass/route.ts');

const SRI = 'srireadymade';

// 1. TryFocus creates a mobile-only client with its own laptop login.
const sri = await server.upsertClientWorkspace({ clientId: SRI, name: 'Sri Readymade', campaignEnabled: true, devices: { tv: false, tablet: true, mobile: true, led: false }, limits: { image: 100, video: 20, live: 0 } });
assert.equal(sri.clientId, SRI);
await setClientAccount(SRI, 'srireadymade', 'sri-laptop-2026');
await assert.rejects(() => setClientAccount('maharaja', 'srireadymade', 'another-pass-1'), /another client/);
console.log('✓ Client workspace and its own login created by TryFocus');

async function cookieFor(username, password) {
  const res = await login(new NextRequest('http://localhost/api/operator/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }));
  return { status: res.status, body: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const sriLogin = await cookieFor('srireadymade', 'sri-laptop-2026');
assert.equal(sriLogin.status, 200);
assert.equal(sriLogin.body.role, 'client');
assert.equal(sriLogin.body.clientId, SRI);
assert.equal((await cookieFor('srireadymade', 'wrong-password')).status, 401);
const adminLogin = await cookieFor('tryfocus', 'tryfocus-pass');
assert.equal(adminLogin.body.role, 'admin');
const asReq = (url, cookie, init = {}) => new NextRequest(url, { ...init, headers: { ...(init.headers || {}), cookie } });
assert.deepEqual(getOperatorSession(asReq('http://localhost/', sriLogin.cookie)), { role: 'client', username: 'srireadymade', clientId: SRI });
console.log('✓ Client login signs in as a client session; wrong password is rejected');

// 2. A client login cannot open TryFocus admin or another client's workspace, nor change credits.
assert.equal((await listClients(asReq('http://localhost/api/admin/clients', sriLogin.cookie))).status, 401);
assert.equal((await listClients(asReq('http://localhost/api/admin/clients', adminLogin.cookie))).status, 200);
const sriWorkspace = await (await workspaceRoute.GET(asReq('http://localhost/api/maharaja/workspace?workspaceCode=workspace', sriLogin.cookie))).json();
assert.equal(sriWorkspace.workspace.clientId, SRI, 'Asking for Maharaja still returns the client\'s own workspace');
const creditPatch = await workspaceRoute.PATCH(asReq('http://localhost/api/maharaja/workspace', sriLogin.cookie, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limits: { image: 99999 } }) }));
assert.equal(creditPatch.status, 403);
const allowedPatch = await workspaceRoute.PATCH(asReq('http://localhost/api/maharaja/workspace', sriLogin.cookie, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoMinPurchase: 3000 }) }));
assert.equal(allowedPatch.status, 200);
assert.equal((await server.getClientWorkspaceById(SRI)).videoMinPurchase, 3000);
assert.equal((await server.getClientWorkspaceById('maharaja')).videoMinPurchase, 5000, 'Maharaja settings untouched');
console.log('✓ Client login is locked to its own workspace and cannot change credits');

// 3. QR passes belong to the client whose QR issued them.
const passRes = await createPass(new NextRequest('http://localhost/api/maharaja/video-pass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'video-poster', billingCode: sri.openVideoCode, experienceType: 'purchased-garment' }) }));
const passData = await passRes.json();
assert.equal(passRes.status, 200, passData.error);
const access = await server.verifyMaharajaAccess(new NextRequest('http://localhost/'), passData.pass.code, 'ai-video');
assert.equal(access.allowed, true);
assert.equal(access.clientId, SRI);
assert.equal(access.workspace.clientName, 'Sri Readymade');
assert.equal((await server.getVideoPass(passData.pass.code, SRI)).clientId, SRI, 'Pass stored in the client\'s workspace');
const tryOnAccess = await server.verifyMaharajaAccess(new NextRequest('http://localhost/'), sri.tryOnCode, 'try-on');
assert.equal(tryOnAccess.clientId, SRI);
console.log('✓ Poster and try-on QR codes resolve to the client that printed them');

// 4. Credits, catalogue and Go Live queue are separate per client.
const maharajaUsed = Number((await server.getClientWorkspaceById('maharaja')).usage.tryOnGenerated || 0);
await runWithClient(SRI, async () => {
  assert.equal(await server.reserveMaharajaUsage('tryOnGenerated', 100), true);
  await catalogue.upsertCatalogueProduct({ sku: 'SRI-001', title: 'Sri Cotton Kurta', price: 1499, category: 'kurta', gender: 'men', imageUrl: 'https://example.com/k.jpg' });
  const sriProducts = (await catalogue.listCatalogueProducts(0, 500)).products.map((item) => item.sku);
  assert.deepEqual(sriProducts, ['SRI-001'], 'A new client sees only its own garments');
  assert.equal(liveScreenId(), 'srireadymade-main');
});
assert.equal(Number((await server.getClientWorkspaceById(SRI)).usage.tryOnGenerated), 1);
assert.equal(Number((await server.getClientWorkspaceById('maharaja')).usage.tryOnGenerated || 0), maharajaUsed, 'Maharaja credits untouched');
const maharajaSkus = (await runWithClient('maharaja', () => catalogue.listCatalogueProducts(0, 500))).products.map((item) => item.sku);
assert.ok(!maharajaSkus.includes('SRI-001') && maharajaSkus.length > 0, 'Maharaja keeps its own catalogue');
assert.equal(runWithClient('maharaja', () => liveScreenId()), 'maharaja-main');
console.log('✓ Credits, catalogue and Go Live queue are isolated per client');

// 5. A mobile-only client can switch mobile off like any other device.
await runWithClient(SRI, () => server.updateMaharajaSettings({ devices: { mobile: false } }, SRI));
const blocked = await createPass(new NextRequest('http://localhost/api/maharaja/video-pass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'video-poster', billingCode: sri.openVideoCode }) }));
assert.equal(blocked.status, 403);
console.log('✓ Device switches apply per client');

console.log('MULTI-CLIENT ISOLATION TESTS PASSED');

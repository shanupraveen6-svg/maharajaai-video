import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test-secret-for-store-login-0123456789';
process.env.OPERATOR_USERNAME = 'tryfocus-admin';
process.env.OPERATOR_PASSWORD = 'admin-pass';
const { NextRequest } = await import('next/server');
const { setClientAccount } = await import('../src/lib/auth/client-accounts.ts');
const { upsertClientWorkspace } = await import('../src/lib/maharaja/server.ts');
const { POST } = await import('../src/app/api/operator/login/route.ts');

await upsertClientWorkspace({ id: 'planet-g', name: 'Planet G', branch: 'Thanjavur' });
await setClientAccount('maharaja', 'maharaja-staff', 'maharaja-pass-1');
await setClientAccount('planet-g', 'planetg-staff', 'planetg-pass-1');

let ip = 0;
const login = (body) => POST(new NextRequest('http://localhost/api/operator/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${++ip}` }, body: JSON.stringify(body),
}));

// Planet G chosen, Maharaja's login: refused.
const wrong = await login({ username: 'maharaja-staff', password: 'maharaja-pass-1', store: 'planet-g' });
assert.equal(wrong.status, 401, 'Another store\'s login is refused for the chosen store');
assert.match((await wrong.json()).error, /not for Planet G/);

// Planet G chosen, Planet G's login: opens Planet G.
const right = await login({ username: 'planetg-staff', password: 'planetg-pass-1', store: 'planet-g' });
assert.equal(right.status, 200);
assert.equal((await right.json()).clientId, 'planet-g');

// TryFocus admin from Planet G's sign-in: sent to Planet G's workspace, not Maharaja.
const admin = await login({ username: 'tryfocus-admin', password: 'admin-pass', store: 'planet-g' });
const adminData = await admin.json();
assert.equal(admin.status, 200);
assert.match(adminData.next, /^\/maharaja\/[A-Za-z0-9_-]+$/);
assert.notEqual(adminData.next, '/maharaja/workspace');

// No store chosen (direct sign-in page): a store login still opens its own store.
const direct = await login({ username: 'maharaja-staff', password: 'maharaja-pass-1' });
assert.equal((await direct.json()).clientId, 'maharaja');

console.log('✓ A login opens only the store it belongs to; the chosen store is enforced');

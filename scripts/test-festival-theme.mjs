import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';

const server = await import('../src/lib/maharaja/server.ts');
const save = server.updateMaharajaSettings;
assert.equal(typeof save, 'function', 'the settings save function exists');

// The store's festival is saved and read back (it used to be forced back to Diwali on save and on read).
for (const festival of ['christmas', 'new-year', 'pongal', 'diwali']) {
  await save({ activeEvents: [festival], defaultEvent: festival });
  const workspace = await server.getMaharajaWorkspace();
  assert.equal(workspace.defaultEvent, festival, `${festival} stays selected after saving`);
}
// A festival that is not offered (Ramadan, Birthday) never sticks.
await save({ activeEvents: ['ramadan'], defaultEvent: 'ramadan' });
assert.equal((await server.getMaharajaWorkspace()).defaultEvent, 'diwali');
console.log('Festival theme saves and reads back for Diwali, Christmas, New Year and Pongal.');

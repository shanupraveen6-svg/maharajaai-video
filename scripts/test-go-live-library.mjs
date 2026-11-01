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
const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');
const { setClientAccount } = await import('../src/lib/auth/client-accounts.ts');
const library = await import('../src/lib/maharaja/go-live-library.ts');
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
const { POST: login } = await import('../src/app/api/operator/login/route.ts');
const { GET: getReplays, DELETE: deleteReplays } = await import('../src/app/api/live/replays/route.ts');

const A = 'kanchi-silks';
const B = 'velu-textiles';
for (const [id, name, branch] of [[A, 'Kanchi Silks', 'Kanchipuram · Main'], [B, 'Velu Textiles', 'Madurai · East']]) {
  await server.upsertClientWorkspace({ clientId: id, name, branch, campaignEnabled: true, devices: { tv: true, tablet: false, mobile: true, led: true }, modules: { image: true, video: true, live: true }, limits: { image: 2000, video: 500, live: 500 } });
}
await setClientAccount(A, 'kanchistaff', 'kanchi-pass-2026');
const loginRes = await login(new NextRequest('http://localhost/api/operator/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'kanchistaff', password: 'kanchi-pass-2026' }) }));
const staffCookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];

// Each store's Go Live videos live in its own library.
const now = new Date().toISOString();
const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
await runWithClient(A, () => library.saveGoLiveEntry({ id: 'video_a1', sessionId: 'a1', storagePath: `clients/${A}/sessions/a1/video/final-6s.mp4`, status: 'ready', published: true, replayEnabled: true, createdAt: now, expiresAt: later }));
await runWithClient(A, () => library.saveGoLiveEntry({ id: 'video_a2', sessionId: 'a2', storagePath: `clients/${A}/sessions/a2/video/final-6s.mp4`, status: 'ready', published: false, replayEnabled: false, createdAt: now, expiresAt: later }));
await runWithClient(B, () => library.saveGoLiveEntry({ id: 'video_b1', sessionId: 'b1', storagePath: `clients/${B}/sessions/b1/video/final-6s.mp4`, status: 'ready', published: true, replayEnabled: true, createdAt: now, expiresAt: later }));
// An expired customer video never replays.
await runWithClient(A, () => library.saveGoLiveEntry({ id: 'video_old', sessionId: 'old', storagePath: `clients/${A}/sessions/old/video/final-6s.mp4`, status: 'ready', published: true, replayEnabled: true, createdAt: now, expiresAt: '2020-01-01T00:00:00.000Z' }));
assert.equal((await library.listGoLiveEntries(A)).length, 3);
assert.equal((await library.listGoLiveEntries(B)).length, 1);

const screen = (clientId) => new NextRequest('http://localhost/api/live/replays?limit=50', { headers: { 'x-golive-screen': server.goLiveCodeFor(clientId) } });
const aItems = (await (await getReplays(screen(A))).json()).items;
assert.deepEqual(aItems.map((item) => item.videoId), ['video_a1'], 'A screen plays only its published, unexpired videos');
assert.equal(aItems[0].customerLocality, 'Kanchipuram', 'A non-Maharaja store shows its own city, not Thanjavur');
const bItems = (await (await getReplays(screen(B))).json()).items;
assert.deepEqual(bItems.map((item) => item.videoId), ['video_b1'], 'Another store never sees these videos');
console.log('✓ Each store reads only its own Go Live library');

// A store's staff can delete only their own store's videos.
const deleteAs = (cookie, sessionIds) => deleteReplays(new NextRequest('http://localhost/api/live/replays', { method: 'DELETE', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ sessionIds }) }));
assert.equal((await deleteAs(staffCookie, ['b1'])).status, 200);
assert.equal((await library.listGoLiveEntries(B)).length, 1, 'Deleting another store\'s session id leaves its library untouched');
assert.equal((await deleteAs(staffCookie, ['a1', '../../etc'])).status, 200);
assert.deepEqual((await library.listGoLiveEntries(A)).map((entry) => entry.id).sort(), ['video_a2', 'video_old'], 'The store\'s own video leaves its library');
assert.equal((await deleteAs('', ['a2'])).status, 401, 'Deleting needs a staff login');
console.log('✓ Deleting is limited to the signed-in store');

// Showcase folders listed for a refresh: the store's own folders; Maharaja adds its root demo folders.
assert.ok(library.showcasePrefixesFor(A).every((prefix) => prefix.startsWith(`clients/${A}/`)));
assert.ok(library.showcasePrefixesFor('maharaja').includes('live-testing/'));
// An entry from a shared video record keeps what the screen needs.
const entry = library.goLiveEntryFromVideo({ id: 'video_x', sessionId: 'x', storagePath: 'clients/x/sessions/x/video/final-6s.mp4', liveStoragePath: 'clients/x/sessions/x/video/live-9s.mp4', published: true, replayEnabled: true, durationSeconds: 9, playbackMode: 'embedded' });
assert.deepEqual([entry.liveStoragePath, entry.durationSeconds, entry.playbackMode, entry.published], ['clients/x/sessions/x/video/live-9s.mp4', 9, 'embedded', true]);
assert.ok(getMockStore().goLive instanceof Map);
console.log('GO LIVE LIBRARY TESTS PASSED');

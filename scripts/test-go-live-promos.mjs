import { register } from 'node:module';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const { default: ffmpegPath } = await import('ffmpeg-static');
const { NextRequest } = await import('next/server.js');
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
const server = await import('../src/lib/maharaja/server.ts');
const { runWithClient, liveScreenId } = await import('../src/lib/maharaja/client-context.ts');
const promos = await import('../src/lib/maharaja/promos.ts');

const SRI = 'srireadymade';
await server.upsertClientWorkspace({ clientId: SRI, name: 'Sri Readymade', campaignEnabled: true, devices: { tv: true, tablet: false, mobile: true, led: true }, limits: { image: 100, video: 20, live: 0 } });

// 1. Each workspace has its own permanent Go Live link, and it opens only that workspace's screen.
const maharajaCode = server.goLiveCodeFor('maharaja');
const sriCode = server.goLiveCodeFor(SRI);
assert.notEqual(maharajaCode, sriCode);
assert.equal(server.goLiveCodeFor(SRI), sriCode, 'The link is permanent');
const screen = (code) => new NextRequest('http://localhost/api/live/next', { headers: { 'x-golive-screen': code } });
assert.equal(await server.goLiveClientId(screen(sriCode)), SRI);
assert.equal(await server.goLiveClientId(screen(maharajaCode)), 'maharaja');
assert.equal(await server.goLiveClientId(screen('x'.repeat(24))), null, 'Unknown codes open nothing');
assert.equal(await server.resolveRequestClientId(screen(sriCode)), SRI, 'Playback calls bind to the screen\'s workspace');
assert.equal(runWithClient(SRI, () => liveScreenId()), 'srireadymade-main', 'Sri plays only its own Go Live queue');
const links = server.getWorkspaceLinks(await server.getClientWorkspaceById(SRI)).links;
assert.equal(links.goLive, `https://www.tryfocus.in/tv?screen=${sriCode}`);
console.log('✓ Each workspace has its own permanent Go Live link');

await server.updateMaharajaSettings({ limits: { video: 0 } }, SRI);
assert.equal(await server.goLiveClientId(screen(sriCode)), null, 'No AI Video in the plan, no Go Live screen');
await server.updateMaharajaSettings({ limits: { video: 20 }, campaignEnabled: false }, SRI);
assert.equal(await server.goLiveClientId(screen(sriCode)), null, 'A paused workspace stops its screen');
await server.updateMaharajaSettings({ campaignEnabled: true }, SRI);
console.log('✓ The link stops when AI Video is off or the workspace is paused');

// 2. Promo videos: real files checked for type, size, length and portrait frame.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tryfocus-promo-'));
const makeVideo = (name, size, seconds) => {
  const file = path.join(tmp, name);
  execFileSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=10`, '-t', String(seconds), '-pix_fmt', 'yuv420p', '-y', file]);
  return fs.readFileSync(file);
};
const portrait = makeVideo('portrait.mp4', '360x640', 6);
const landscape = makeVideo('landscape.mp4', '640x360', 6);
const tooShort = makeVideo('short.mp4', '360x640', 2);

async function uploadPromo(buffer, title) {
  const start = await promos.createPromoUpload('video/mp4', buffer.length);
  getMockStore().sessions.set(`mock_blob_${start.storagePath}`, { buffer, contentType: 'video/mp4' });
  return promos.confirmPromoUpload(start.id, title, 'video/mp4');
}

await runWithClient(SRI, async () => {
  await assert.rejects(() => promos.createPromoUpload('image/png', 1000), /MP4, WebM or MOV/);
  await assert.rejects(() => promos.createPromoUpload('video/mp4', 60 * 1024 * 1024), /limit is 50 MB/);
  await assert.rejects(() => uploadPromo(landscape, 'Wide'), /portrait/);
  await assert.rejects(() => uploadPromo(tooShort, 'Short'), /5 to 60 seconds/);
  assert.equal((await promos.listPromoVideos()).length, 0, 'Rejected files are not kept');
  assert.equal([...getMockStore().sessions.keys()].filter((key) => key.startsWith(`mock_blob_clients/${SRI}/promos/`)).length, 0, 'Rejected files are deleted from storage');

  const first = await uploadPromo(portrait, 'Diwali offer');
  assert.equal(first.title, 'Diwali offer');
  assert.ok(first.durationSeconds >= 5.5 && first.durationSeconds <= 6.5);
  assert.ok(first.height > first.width);
  await uploadPromo(portrait, 'New arrivals');
  await uploadPromo(portrait, 'Wedding collection');
  await assert.rejects(() => promos.createPromoUpload('video/mp4', portrait.length), /already have 3/);
  const playlist = await promos.promoPlaylist();
  assert.equal(playlist.length, 3);
  assert.ok(playlist.every((item) => item.videoUrl));
  await promos.deletePromoVideo(first.id);
  assert.equal((await promos.listPromoVideos()).length, 2);
});
console.log('✓ Promos: type, 50 MB, 5-60 s and portrait checked on the real file; at most 3; delete works');

assert.equal((await runWithClient('maharaja', () => promos.listPromoVideos())).length, 0, 'Maharaja never sees Sri\'s promos');
assert.equal(promos.PROMO_LIMITS.everyCustomerVideos, 10);
console.log('✓ Promos are separate per workspace; one plays after every 10 customer videos');

// 3. Player rule: one promo after every 10 customer videos, then resume where the loop left off.
const { isPromoDue, resumeIndexAfterPromo } = await import('../src/lib/maharaja/tv-pool.ts');
assert.equal(isPromoDue(9, 10, 3, 'replay'), false);
assert.equal(isPromoDue(10, 10, 3, 'replay'), true);
assert.equal(isPromoDue(10, 10, 0, 'replay'), false, 'No promos uploaded, nothing interrupts the loop');
assert.equal(isPromoDue(25, 10, 3, 'promo'), false, 'Never two promos in a row');
const loop = ['a', 'b', 'c'].map((queueId) => ({ queueId, source: 'replay' }));
assert.equal(resumeIndexAfterPromo(loop, 'b'), 2);
assert.equal(resumeIndexAfterPromo(loop, 'c'), 0);
assert.equal(resumeIndexAfterPromo(loop, 'gone'), 0);
let customerPlays = 0;
let promoTurn = 0;
const played = [];
for (let step = 0; step < 33; step += 1) {
  if (isPromoDue(customerPlays, 10, 3, played.at(-1)?.startsWith('promo') ? 'promo' : 'replay')) {
    played.push(`promo${promoTurn % 3}`);
    promoTurn += 1;
    customerPlays = 0;
  } else {
    played.push('customer');
    customerPlays += 1;
  }
}
assert.deepEqual(played.map((item, index) => item.startsWith('promo') ? index : -1).filter((index) => index >= 0), [10, 21, 32]);
assert.deepEqual(played.filter((item) => item.startsWith('promo')), ['promo0', 'promo1', 'promo2']);
console.log('✓ Player plays promo 1, 2, 3 in turn after every 10 customer videos');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('GO LIVE AND PROMO TESTS PASSED');

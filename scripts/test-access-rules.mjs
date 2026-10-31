import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const { resolveAccess } = await import('../src/lib/maharaja/access.ts');
const { moduleLimit } = await import('../src/lib/maharaja/server.ts');

const allDevices = { tv: true, tablet: true, mobile: true, led: true };
const allModules = { image: true, live: true, video: true };

// Everything on: everything runs.
let access = resolveAccess(allDevices, allModules);
assert.deepEqual(access.modules, allModules);
assert.equal(access.goLive, true);
assert.equal(access.catalogueVideo, true);

// TV off: Live Mirror, catalogue AI Video and Go Live stop; own-garment AI Video and image try-on keep running.
access = resolveAccess({ ...allDevices, tv: false }, allModules);
assert.equal(access.modules.live, false);
assert.match(access.blockedBy.live, /TV/);
assert.equal(access.catalogueVideo, false);
assert.equal(access.goLive, false);
assert.equal(access.modules.video, true);
assert.equal(access.ownGarmentVideo, true);
assert.equal(access.modules.image, true);

// Go Live switched off: only catalogue AI Video stops.
access = resolveAccess({ ...allDevices, led: false }, allModules);
assert.equal(access.modules.video, true);
assert.equal(access.ownGarmentVideo, true);
assert.equal(access.catalogueVideo, false);
assert.equal(access.goLive, false);

// Customer Mobile is always included, even if stored as off.
access = resolveAccess({ ...allDevices, mobile: false }, allModules);
assert.equal(access.modules.video, true);
assert.equal(access.modules.image, true);

// Phone-only (no TV, no tablet): image try-on and own-garment AI Video run.
access = resolveAccess({ tv: false, tablet: false, mobile: true, led: false }, allModules);
assert.deepEqual([access.modules.image, access.modules.video, access.modules.live, access.goLive], [true, true, false, false]);

// AI Video module off: Go Live off too.
access = resolveAccess(allDevices, { ...allModules, video: false });
assert.equal(access.goLive, false);
assert.equal(access.blockedBy.video, undefined);

// Server credits follow the same rules.
const limits = { image: 4000, live: 500, video: 500 };
assert.equal(moduleLimit({ limits, modules: allModules, devices: { ...allDevices, tv: false } }, 'live'), 0);
assert.equal(moduleLimit({ limits, modules: allModules, devices: { ...allDevices, led: false } }, 'video'), 500, 'Own-garment video keeps its credits');
assert.equal(moduleLimit({ limits, modules: allModules, devices: allDevices }, 'video'), 500);
assert.equal(moduleLimit({ limits, modules: allModules }, 'live'), 500);

console.log('access rules: all checks passed');

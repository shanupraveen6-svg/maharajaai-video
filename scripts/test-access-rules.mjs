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

// TV off: Live Mirror and catalogue AI Video stop; counter AI Video and image try-on keep running.
access = resolveAccess({ ...allDevices, tv: false }, allModules);
assert.equal(access.modules.live, false);
assert.match(access.blockedBy.live, /TV/);
assert.equal(access.catalogueVideo, false);
assert.equal(access.modules.video, true);
assert.equal(access.modules.image, true);

// Go Live player off: all AI Video stops.
access = resolveAccess({ ...allDevices, led: false }, allModules);
assert.equal(access.modules.video, false);
assert.equal(access.goLive, false);
assert.match(access.blockedBy.video, /Go Live player/);

// Customer Mobile off: AI Video stops (videos finish on the phone).
access = resolveAccess({ ...allDevices, mobile: false }, allModules);
assert.equal(access.modules.video, false);
assert.match(access.blockedBy.video, /Customer Mobile/);

// AI Video module off: Go Live off too, and no "blocked" reason (it was not bought).
access = resolveAccess(allDevices, { ...allModules, video: false });
assert.equal(access.goLive, false);
assert.equal(access.blockedBy.video, undefined);

// No screens at all: image try-on stops.
access = resolveAccess({ tv: false, tablet: false, mobile: false, led: true }, allModules);
assert.equal(access.modules.image, false);

// Server credits follow the same rules.
const limits = { image: 4000, live: 500, video: 500 };
assert.equal(moduleLimit({ limits, modules: allModules, devices: { ...allDevices, tv: false } }, 'live'), 0);
assert.equal(moduleLimit({ limits, modules: allModules, devices: { ...allDevices, led: false } }, 'video'), 0);
assert.equal(moduleLimit({ limits, modules: allModules, devices: allDevices }, 'video'), 500);
assert.equal(moduleLimit({ limits, modules: allModules }, 'live'), 500);

console.log('access rules: all checks passed');

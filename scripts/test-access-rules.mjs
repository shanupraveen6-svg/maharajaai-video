import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const { CREDIT_PACKAGES, OFFERED_PACKAGES, PACKAGES, packageOf, packageLabel, resolveAccess } = await import('../src/lib/maharaja/access.ts');
const { moduleLimit } = await import('../src/lib/maharaja/server.ts');

const allDevices = { tv: true, tablet: true, mobile: true, led: true };
const allModules = { image: true, live: true, video: true };

// Everything on: everything runs.
let access = resolveAccess(allDevices, allModules);
assert.deepEqual(access.modules, allModules);
assert.equal(access.goLive, true);
assert.equal(access.catalogueVideo, true);

// No TV (a tablet store): Live Mirror and AI Video on the TV stop; the gift QR and Go Live keep running.
access = resolveAccess({ ...allDevices, tv: false }, allModules);
assert.equal(access.modules.live, false);
assert.match(access.blockedBy.live, /TV/);
assert.equal(access.catalogueVideo, false);
assert.equal(access.goLive, true, 'Go Live plays on the store LED screen without the TV');
assert.equal(access.ownGarmentVideo, true);
assert.equal(access.modules.image, true);

// Go Live player switched off: AI Video still runs everywhere, download only.
access = resolveAccess({ ...allDevices, led: false }, allModules);
assert.equal(access.modules.video, true);
assert.equal(access.catalogueVideo, true);
assert.equal(access.goLive, false);
assert.match(access.blockedBy.video, /download/);

// The customer's phone is always included, even if stored as off.
access = resolveAccess({ ...allDevices, mobile: false }, allModules);
assert.equal(access.modules.video, true);
assert.equal(access.modules.image, true);

// Without the tablet the counter page is the biller's AI Video QR only.
assert.equal(resolveAccess(PACKAGES.tv.devices, allModules).counterTryOn, false);
assert.equal(resolveAccess(allDevices, allModules).counterTryOn, true);

// Screens: TV, tablet or both; Live Mirror needs the TV; Go Live comes with AI Video on either.
assert.deepEqual(OFFERED_PACKAGES, ['tv', 'tablet', 'tv-tablet']);
assert.equal(packageOf(PACKAGES.tablet.devices), 'tablet');
assert.equal(packageOf(PACKAGES.tv.devices), 'tv');
assert.equal(packageOf(PACKAGES['tv-tablet'].devices), 'tv-tablet');
assert.equal(packageLabel(PACKAGES['tv-tablet'].devices), 'TV and tablet');
access = resolveAccess(PACKAGES.tv.devices, allModules);
assert.deepEqual([access.goLive, access.catalogueVideo, access.modules.live, access.counterTryOn], [true, true, true, false]);
access = resolveAccess(PACKAGES.tablet.devices, allModules);
assert.deepEqual([access.goLive, access.catalogueVideo, access.modules.live, access.counterTryOn, access.ownGarmentVideo], [true, false, false, true, true]);
access = resolveAccess(PACKAGES.tv.devices, { image: true, live: false, video: false });
assert.deepEqual([access.modules.live, access.modules.video, access.goLive], [false, false, false], 'Try-On only: no add-ons, no Go Live');

// Credit packages cover all three experiences.
assert.deepEqual([CREDIT_PACKAGES.one.image, CREDIT_PACKAGES.one.video, CREDIT_PACKAGES.one.live], [3000, 1000, 1000]);
assert.deepEqual([CREDIT_PACKAGES.two.image, CREDIT_PACKAGES.two.video, CREDIT_PACKAGES.two.live], [5000, 2000, 2000]);

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

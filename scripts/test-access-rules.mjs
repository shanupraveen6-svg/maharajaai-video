import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const { OFFERED_PACKAGES, PACKAGES, modulesForPackage, packageOf, packageLabel, resolveAccess } = await import('../src/lib/maharaja/access.ts');
const { moduleLimit } = await import('../src/lib/maharaja/server.ts');

const allDevices = { tv: true, tablet: true, mobile: true, led: true };
const allModules = { image: true, live: true, video: true };

// Everything on: everything runs, but AI Video never uses an own-outfit photo.
let access = resolveAccess(allDevices, allModules);
assert.deepEqual(access.modules, allModules);
assert.equal(access.goLive, true);
assert.equal(access.catalogueVideo, true);
assert.equal(access.ownGarmentVideo, false, 'AI Video is made from the store collection only');

// Tablet-only store: Try-On only. AI Video only starts on the TV, so a Tablet-only store has none.
access = resolveAccess(PACKAGES.tablet.devices, modulesForPackage('tablet'));
assert.deepEqual(access.modules, { image: true, video: false, live: false });
assert.equal(access.catalogueVideo, false, 'AI Video needs the TV; the tablet alone does not make it');
assert.equal(access.goLive, false);
assert.equal(access.counterTryOn, true);
// A tablet store that still has Live Mirror or AI Video switched on is blocked: both need the TV.
access = resolveAccess(PACKAGES.tablet.devices, allModules);
assert.equal(access.modules.live, false);
assert.match(access.blockedBy.live, /TV/);
assert.equal(access.modules.video, false);
assert.match(access.blockedBy.video, /TV/);

// TV store: all three.
access = resolveAccess(PACKAGES.tv.devices, modulesForPackage('tv'));
assert.deepEqual(access.modules, { image: true, video: true, live: true });
assert.deepEqual([access.goLive, access.catalogueVideo, access.counterTryOn], [true, true, false]);

// Phone store: Try-On only. No AI Video and so no Go Live, even if the module was left on.
access = resolveAccess(PACKAGES.phone.devices, allModules);
assert.deepEqual(access.modules, { image: true, video: false, live: false });
assert.equal(access.goLive, false);
assert.equal(access.catalogueVideo, false);
assert.match(access.blockedBy.video, /TV/);
assert.deepEqual(modulesForPackage('phone'), { image: true, video: false, live: false });

// Go Live player switched off: AI Video still runs, download only.
access = resolveAccess({ ...allDevices, led: false }, allModules);
assert.equal(access.modules.video, true);
assert.equal(access.goLive, false);
assert.match(access.blockedBy.video, /download/);

// The customer's phone is always included, even if stored as off.
access = resolveAccess({ ...allDevices, mobile: false }, allModules);
assert.equal(access.modules.video, true);
assert.equal(access.modules.image, true);

// Staff Try-On on the counter needs the tablet; a TV-only store has no counter page at all.
assert.equal(resolveAccess(PACKAGES.tv.devices, allModules).counterTryOn, false);
assert.equal(resolveAccess(allDevices, allModules).counterTryOn, true);

// Packages sold: TV and Tablet (each with the customer's phone). The phone-only package stays readable for older stores.
assert.deepEqual(OFFERED_PACKAGES, ['tv', 'tablet']);
assert.equal(packageOf(PACKAGES.tablet.devices), 'tablet');
assert.equal(packageOf(PACKAGES.tv.devices), 'tv');
assert.equal(packageOf(PACKAGES.phone.devices), 'phone');
assert.equal(packageOf(PACKAGES['tv-tablet'].devices), 'tv-tablet');
assert.equal(packageLabel(PACKAGES['tv-tablet'].devices), 'TV and tablet');
assert.deepEqual(modulesForPackage('tv-tablet'), { image: true, video: true, live: true }, 'TV in the mix still grants AI Video');

// A module TryFocus paused stays off.
access = resolveAccess(PACKAGES.tv.devices, { image: true, live: false, video: false });
assert.deepEqual([access.modules.live, access.modules.video, access.goLive], [false, false, false]);
access = resolveAccess(allDevices, { ...allModules, video: false });
assert.equal(access.goLive, false);
assert.equal(access.blockedBy.video, undefined);

// Server credits follow the same rules.
const limits = { image: 4000, live: 500, video: 500 };
assert.equal(moduleLimit({ limits, modules: allModules, devices: { ...allDevices, tv: false } }, 'live'), 0);
assert.equal(moduleLimit({ limits, modules: allModules, devices: { ...allDevices, led: false } }, 'video'), 500, 'AI Video keeps its credits without the Go Live player');
assert.equal(moduleLimit({ limits, modules: allModules, devices: allDevices }, 'video'), 500);
assert.equal(moduleLimit({ limits, modules: allModules }, 'live'), 500);
assert.equal(moduleLimit({ limits, modules: allModules, devices: PACKAGES.phone.devices }, 'video'), 0, 'A phone store has no AI Video credits');
assert.equal(moduleLimit({ limits, modules: allModules, devices: PACKAGES.phone.devices }, 'image'), 4000);

console.log('access rules: all checks passed');

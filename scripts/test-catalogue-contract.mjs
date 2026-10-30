import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'catalogue-contract-test-secret';
delete process.env.FIREBASE_PROJECT_ID;
delete process.env.FIREBASE_CLIENT_EMAIL;
delete process.env.FIREBASE_PRIVATE_KEY;

const server = await import('../src/lib/maharaja/server.ts');
const firebase = await import('../src/lib/firebase/admin.ts');

const now = Date.now();
const pass = {
  id: 'catalogue-test', code: 'catalogue-test', clientId: 'maharaja', phone: '9876543210', phoneMasked: '98******10',
  experienceType: 'catalogue-gift', catalogueSku: '8IC53071', catalogueTitle: 'Test Silk Saree', cataloguePrice: 37000,
  catalogueStoragePath: 'clients/maharaja/catalogue/silk-sarees/8IC53071/reference.jpg', billLast4: '', eventId: 'diwali',
  status: 'active', createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 86400000).toISOString(), expiresAtMs: now + 86400000,
  usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
};
await server.saveVideoPass(pass);
assert.equal(await server.getCampaignEntitlementForPass(pass.code), null, 'Catalogue Gift must not consume purchased-garment phone entitlement.');
const access = await server.verifyMaharajaAccess({ headers: new Headers() }, pass.code, 'ai-video');
assert.equal(access.allowed, true);
assert.equal(access.pass.experienceType, 'catalogue-gift');
assert.equal(access.allowances.enforceRepeatLimits, true, 'Catalogue Gift always enforces original + one retry.');

const store = firebase.getMockStore();
store.customerPasses.set(`maharaja:${pass.code}`, { ...pass, usage: { ...pass.usage, videosGenerated: 2 } });
const thirdVideo = await server.acquireServiceGenerationLock(pass.code, 'video');
assert.equal(thirdVideo.ok, false, 'Third Catalogue Gift video must be blocked.');

const resultSource = fs.readFileSync(new URL('../src/app/result/[sessionId]/ResultClient.tsx', import.meta.url), 'utf8');
assert.match(resultSource, /allowGoLive/);
const passSource = fs.readFileSync(new URL('../src/app/api/maharaja/video-pass/route.ts', import.meta.url), 'utf8');
assert.doesNotMatch(passSource, /\[5000, 7000, 10000\]/);
// Catalogue gifts cover every audience (women, men, girl, boy) and may Go Live with consent.
const experienceSource = fs.readFileSync(new URL('../src/components/MaharajaExperience.tsx', import.meta.url), 'utf8');
assert.match(experienceSource, /selectableCategories: CustomerCategory\[\] = \['women', 'men', 'girl', 'boy'\]/);
assert.match(experienceSource, /Choose your Diwali visual set/);

console.log('Catalogue contract passed: isolated quota, one retry, all four audiences, and phone-only issue.');

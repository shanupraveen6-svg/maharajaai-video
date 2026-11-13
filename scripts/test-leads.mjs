import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const { NextRequest } = await import('next/server.js');
const server = await import('../src/lib/maharaja/server.ts');
const leads = await import('../src/lib/maharaja/leads.ts');
const { POST: postLead, GET: getLeads } = await import('../src/app/api/maharaja/leads/route.ts');
const { POST: createHandoff } = await import('../src/app/api/tv/tryon-handoff/route.ts');
const { GET: getHandoff } = await import('../src/app/api/tv/tryon-handoff/[token]/route.ts');
const { POST: downloadAsset } = await import('../src/app/api/download/asset/route.ts');

// Numbers: a 10-digit Indian mobile in any common spelling.
assert.equal(leads.normalizeIndianMobile('+91 98765 43210'), '9876543210');
assert.equal(leads.normalizeIndianMobile('098765-43210'), '9876543210');
assert.equal(leads.normalizeIndianMobile('919876543210'), '9876543210');
assert.equal(leads.normalizeIndianMobile('12345 67890'), '', 'Indian mobiles start with 6 to 9');
assert.equal(leads.normalizeIndianMobile('98765'), '');
console.log('✓ WhatsApp numbers are checked');

// Tokens: signed for one store, refused when changed or for another store.
const token = leads.issueLeadToken('maharaja', 'abc');
assert.deepEqual(leads.verifyLeadToken(token, 'maharaja'), { clientId: 'maharaja', leadId: 'abc' });
assert.equal(leads.verifyLeadToken(token, 'other-store'), null);
assert.equal(leads.verifyLeadToken(`${token}x`, 'maharaja'), null);
assert.equal(leads.verifyLeadToken(leads.issueLeadToken('maharaja', 'abc', Date.now() - 2 * 24 * 60 * 60 * 1000), 'maharaja'), null, 'Tokens expire after a day');
console.log('✓ Lead tokens are signed, per store and expiring');

const workspace = await server.getMaharajaWorkspace();
const lead = (body) => postLead(new NextRequest('http://localhost/api/maharaja/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

// The wall QR (Try-On) code is a valid place to download from.
let res = await lead({ kind: 'pass', ref: workspace.tryOnCode, source: 'try-on', phone: '98765 43210', marketingConsent: false });
let body = await res.json();
assert.equal(res.status, 200, body.error);
assert.ok(leads.verifyLeadToken(body.token, 'maharaja'));
assert.equal(body.phoneMasked, '98******10');
// Same number again, now allowing offers: one record, consent recorded.
res = await lead({ kind: 'pass', ref: workspace.tryOnCode, source: 'try-on', phone: '+919876543210', marketingConsent: true });
assert.equal(res.status, 200);
let list = await leads.listLeads('maharaja');
assert.equal(list.length, 1, 'One record per number');
assert.equal(list[0].marketingConsent, true);
// A later visit without ticking does not take consent away.
await lead({ kind: 'pass', ref: workspace.tryOnCode, source: 'try-on', phone: '9876543210', marketingConsent: false });
assert.equal((await leads.listLeads('maharaja'))[0].marketingConsent, true);
console.log('✓ One lead per number; offers only with the tick, kept until the customer asks to stop');

assert.equal((await lead({ kind: 'pass', ref: workspace.tryOnCode, source: 'try-on', phone: '12345' })).status, 400, 'An invalid number is refused');
assert.equal((await lead({ kind: 'looks', ref: 'A'.repeat(32), source: 'tv-looks', phone: '9876543210' })).status, 404, 'An unknown link is refused');
assert.equal((await lead({ kind: 'nothing', ref: 'x', phone: '9876543210' })).status, 400);
console.log('✓ Leads are taken only for live links');

// TV looks: viewing is open, saving needs the lead token.
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const handoff = await (await createHandoff(new NextRequest('http://localhost/api/tv/tryon-handoff', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-operator-key': 'test_secret' },
  body: JSON.stringify({ looks: [{ sku: '8IC53071', title: 'Saree', image: png, category: 'sarees', garmentType: 'saree', gender: 'women' }] }),
}))).json();
const look = (query) => getHandoff(new NextRequest(`http://localhost/api/tv/tryon-handoff/${handoff.token}?${query}`), { params: Promise.resolve({ token: handoff.token }) });
assert.equal((await look('image=0')).status, 200, 'Viewing a look needs no number');
assert.equal((await look('image=0&download=1')).status, 428, 'Saving a look needs the number first');
const looksLead = await (await lead({ kind: 'looks', ref: handoff.token, source: 'tv-looks', phone: '9123456780' })).json();
assert.equal((await look(`image=0&download=1&lead=${encodeURIComponent(looksLead.token)}`)).status, 200);
assert.equal((await look(`image=0&download=1&lead=${encodeURIComponent(leads.issueLeadToken('other-store', 'x'))}`)).status, 428, 'Another store\'s token does not work');
console.log('✓ TV looks save only after the WhatsApp number');

// AI Video download route: a customer download without the token is refused.
const passRes = await (await import('../src/app/api/maharaja/video-pass/route.ts')).POST(new NextRequest('http://localhost/api/maharaja/video-pass', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billingCode: workspace.billingCode }),
}));
const passCode = (await passRes.json()).pass.code;
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
getMockStore().sessions.set('lead-test-session', { accessCode: passCode, masterStoragePath: 'clients/maharaja/sessions/lead-test-session/master.jpg' });
const asset = (extra) => downloadAsset(new NextRequest('http://localhost/api/download/asset', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'lead-test-session', accessCode: passCode, kind: 'image', ...extra }),
}));
const refused = await asset({});
assert.equal(refused.status, 428);
assert.equal((await refused.json()).leadRequired, true);
assert.equal((await lead({ kind: 'pass', ref: passCode, source: 'ai-video', phone: '9988776655' })).status, 400, 'AI Video also asks for a name and city');
const passLead = await (await lead({ kind: 'pass', ref: passCode, source: 'ai-video', phone: '9988776655', name: '  Priya   R ', city: 'Madurai' })).json();
const saved = (await leads.listLeads('maharaja')).find((item) => item.phone === '9988776655');
assert.equal(saved?.name, 'Priya R', 'Name kept, tidied');
assert.equal(saved?.city, 'Madurai');
assert.notEqual((await asset({ leadToken: passLead.token })).status, 428, 'With the token the download goes ahead');
console.log('✓ AI Video downloads need the WhatsApp number');

// The store's staff see and export their customers; nobody else does.
assert.equal((await getLeads(new NextRequest('http://localhost/api/maharaja/leads'))).status, 401);
const staff = new NextRequest('http://localhost/api/maharaja/leads?format=csv', { headers: { 'x-operator-key': 'test_secret' } });
const csv = await (await getLeads(staff)).text();
assert.match(csv, /WhatsApp number,Name,City,Offers allowed/);
assert.match(csv, /\n919988776655,Priya R,Madurai,/);
assert.match(csv, /\n919876543210,,,Yes,/);
assert.ok(leads.leadsCsv([{ id: 'x', phone: '9876543210', marketingConsent: false, sources: ['=HYPERLINK("x")'], downloads: 0, firstSeenAt: '', lastSeenAt: '' }]).includes(`"'=HYPERLINK(""x"")"`), 'Formula-like text is neutralised');
const otherStore = await leads.listLeads('some-other-store');
assert.equal(otherStore.length, 0, 'Leads stay inside their store');
console.log('LEADS TESTS PASSED');

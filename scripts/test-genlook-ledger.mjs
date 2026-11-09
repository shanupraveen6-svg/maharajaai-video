import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';
process.env.GENLOOK_API_KEY = 'test_genlook_key';

const ledger = await import('../src/lib/maharaja/genlook-ledger.ts');
const server = await import('../src/lib/maharaja/server.ts');
const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');
const { MAHARAJA_CLIENT_ID } = await import('../src/lib/maharaja/config.ts');

// GenLook's own balance API is never called by these checks (no network in this test); any call would
// throw, which the pool math must tolerate (liveApiBalance is then just left out).
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('No network in this test.'); };

// Nothing logged yet: the pool is empty, so the shared pool grants nothing.
assert.deepEqual((await ledger.getGenlookLedger()).topUps, []);
await runWithClient(MAHARAJA_CLIENT_ID, async () => {
  assert.equal(await server.reserveGenlookCredit(), false, 'No top-up logged yet: the shared pool has nothing to give.');
});

// Admin logs a 500-credit top-up (what was actually paid for), optionally with the dollar amount.
const entry = await ledger.addGenlookTopUp({ credits: 500, paidUsd: 50, note: 'Nov top-up' });
assert.equal(entry.credits, 500);
assert.equal(entry.paidUsd, 50);
let total = (await ledger.getGenlookLedger()).totalPurchased;
assert.equal(total, 500, 'The running total is the sum of every top-up.');

// A second top-up adds to the running total rather than replacing it.
await ledger.addGenlookTopUp({ credits: 200 });
total = (await ledger.getGenlookLedger()).totalPurchased;
assert.equal(total, 700);
const history = (await ledger.getGenlookLedger()).topUps;
assert.equal(history.length, 2);
assert.ok(history[0].at >= history[1].at, 'Newest top-up first.');

// Maharaja (the shared-pool store) can now draw against the 700 purchased, until the pool reads empty.
await runWithClient(MAHARAJA_CLIENT_ID, async () => {
  for (let i = 0; i < 700; i++) {
    assert.equal(await server.reserveGenlookCredit(), true, `credit ${i + 1} of 700 should still be free`);
  }
  // The 700th credit used up the whole purchased total: nothing is left for a 701st.
  assert.equal(await server.reserveGenlookCredit(), false, 'The pool is exhausted once every purchased credit is used.');
  const pool = await server.freeGenlookCredits();
  assert.equal(pool.purchased, 700);
  assert.equal(pool.usedEverywhere, 700);
  assert.equal(pool.free, 0);
});

// A store with locked credits never touches the shared pool, and its unused allowance is set aside out
// of the pool for every other store — even one it never uses.
await server.upsertClientWorkspace({ id: 'genlook-locked-store', name: 'Locked Store', genlookCredits: 10 });
await runWithClient('genlook-locked-store', async () => {
  const ws = await server.getMaharajaWorkspace();
  assert.equal(server.usesFreeGenlookPool(ws), false);
});
await runWithClient(MAHARAJA_CLIENT_ID, async () => {
  const pool = await server.freeGenlookCredits();
  assert.equal(pool.locked, 10, 'The locked store’s unused allowance is reserved out of the shared pool.');
  // free can go negative: it means a store's locked promise now exceeds what GenLook was actually paid
  // for, which is exactly the "top up GenLook" warning admin shows.
  assert.equal(pool.free, -10, 'The pool was already exhausted on usage alone; locking 10 more pushes it negative.');
});

// Logging a correction (a refund) lowers the running total the same way a top-up raises it.
await ledger.addGenlookTopUp({ credits: -50, note: 'refund' });
total = (await ledger.getGenlookLedger()).totalPurchased;
assert.equal(total, 650);

// A top-up of 0 credits is refused: it would silently do nothing, so it is caught instead.
await assert.rejects(() => ledger.addGenlookTopUp({ credits: 0 }));

globalThis.fetch = originalFetch;
console.log('GenLook ledger: top-up log, running total, correction, and the shared pool reading from it, all passed.');

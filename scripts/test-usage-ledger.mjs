import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';
delete process.env.AI_DAILY_CAP_CLIENT_USD;
delete process.env.AI_DAILY_CAP_PLATFORM_USD;

const ledger = await import('../src/lib/maharaja/usage-ledger.ts');
const server = await import('../src/lib/maharaja/server.ts');
const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');

await server.upsertClientWorkspace({ id: 'ledger-a', name: 'Ledger A' });
await server.upsertClientWorkspace({ id: 'ledger-b', name: 'Ledger B' });

// Usage counters also land in this month's report, and a released credit is taken back out.
await runWithClient('ledger-a', async () => {
  await server.incrementMaharajaUsage('tryOnScans');
  assert.equal(await server.reserveMaharajaUsage('tryOnGenerated', 10), true);
  assert.equal(await server.reserveMaharajaUsage('tryOnGenerated', 10), true);
  await server.releaseMaharajaUsage('tryOnGenerated');
  const report = await ledger.monthlyReport();
  assert.equal(report.counts.tryOnScans, 1);
  assert.equal(report.counts.tryOnGenerated, 1);
  assert.match(report.month, /^\d{4}-\d{2}$/);
});

// Costs add up per client and across the platform.
await runWithClient('ledger-a', () => ledger.recordAiCost('video-render', 0.48));
await runWithClient('ledger-a', () => ledger.recordAiCost('try-on'));
await runWithClient('ledger-b', () => ledger.recordAiCost('live-session', 1));
const a = await ledger.spendToday('ledger-a');
assert.ok(Math.abs(a.clientUsd - (0.48 + ledger.aiCostUsd('try-on'))) < 1e-9);
assert.ok(Math.abs(a.platformUsd - (1.48 + ledger.aiCostUsd('try-on'))) < 1e-9);
assert.equal((await ledger.monthlyReport('ledger-b')).costUsdByKind['live-session'], 1);

// No caps set: everything runs.
assert.equal(await ledger.spendAllowed('ledger-a'), true);

// Stores have no daily cap (they bought a package): an old client cap setting is ignored.
process.env.AI_DAILY_CAP_CLIENT_USD = '0.5';
assert.equal(await ledger.spendAllowed('ledger-a'), true, 'No daily cap per store');
delete process.env.AI_DAILY_CAP_CLIENT_USD;
// The platform's safety cap stops everyone.
process.env.AI_DAILY_CAP_PLATFORM_USD = '1';
assert.equal(await ledger.spendAllowed('ledger-a'), false, 'The platform cap stops every client');
process.env.AI_DAILY_CAP_PLATFORM_USD = '100';
assert.equal(await ledger.spendAllowed('ledger-a'), true);

// Credit notices: 50%, 70%, 90%, 95% and finished, each once.
const credits = await import('../src/lib/maharaja/credits.ts');
assert.equal(credits.crossedCreditStep(49, 50, 100), 50);
assert.equal(credits.crossedCreditStep(50, 51, 100), null);
assert.equal(credits.crossedCreditStep(69, 70, 100), 70);
assert.equal(credits.crossedCreditStep(89, 90, 100), 90);
assert.equal(credits.crossedCreditStep(94, 95, 100), 95);
assert.equal(credits.crossedCreditStep(99, 100, 100), 100);
assert.equal(credits.crossedCreditStep(0, 1, 1), 100, 'A one-credit package jumps straight to finished');
assert.equal(credits.creditLevel(1000, 2000), 'half');
assert.equal(credits.creditLevel(1400, 2000), 'low');
assert.equal(credits.creditLevel(1800, 2000), 'critical');
assert.equal(credits.creditLevel(1900, 2000), 'final');
assert.equal(credits.creditLevel(2000, 2000), 'exhausted');
assert.equal(credits.creditLevel(999, 2000), 'ok');

// Cost estimates follow the environment.
process.env.AI_COST_TRY_ON_USD = '0.07';
assert.equal(ledger.aiCostUsd('try-on'), 0.07);
assert.equal(ledger.istDay(new Date('2026-10-31T19:00:00Z')), '2026-11-01', 'Days follow India time');

console.log('usage ledger: all checks passed');

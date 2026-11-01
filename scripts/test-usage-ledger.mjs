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

// A client cap stops only that client; the platform cap stops everyone.
process.env.AI_DAILY_CAP_CLIENT_USD = '0.5';
assert.equal(await ledger.spendAllowed('ledger-a'), false, 'Client A is over its cap');
assert.equal(await ledger.spendAllowed('ledger-b'), false, 'Client B (1.00) is also over the 0.50 cap');
process.env.AI_DAILY_CAP_CLIENT_USD = '5';
process.env.AI_DAILY_CAP_PLATFORM_USD = '1';
assert.equal(await ledger.spendAllowed('ledger-a'), false, 'The platform cap stops every client');
process.env.AI_DAILY_CAP_PLATFORM_USD = '100';
assert.equal(await ledger.spendAllowed('ledger-a'), true);

// Cost estimates follow the environment.
process.env.AI_COST_TRY_ON_USD = '0.07';
assert.equal(ledger.aiCostUsd('try-on'), 0.07);
assert.equal(ledger.istDay(new Date('2026-10-31T19:00:00Z')), '2026-11-01', 'Days follow India time');

console.log('usage ledger: all checks passed');

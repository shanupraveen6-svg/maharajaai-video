// Sets up a store catalogue for Image Try-On, Live Try-On and AI Video (see src/lib/maharaja/trial-catalogue.ts).
// The same thing runs from TryFocus admin → Plan → Trial catalogue, which is how live data is changed.
//
//   node scripts/prepare-trial-catalogue.mjs --mock            → preview on the local mock store
//   node scripts/prepare-trial-catalogue.mjs --mock --apply    → apply it there (tests)
//   npm run catalogue:trial [-- --apply] [-- --workspace=<id>] → against the database in .env.local
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const mock = args.includes('--mock');
const clientId = (args.find((arg) => arg.startsWith('--workspace=')) || '--workspace=maharaja').split('=')[1];
if (mock) {
  for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
  process.env.ALLOW_MOCK_BACKEND = 'true';
}

const { getDb } = await import('../src/lib/firebase/admin.ts');
if (!mock && !getDb()) {
  console.error('No live database login on this machine, so nothing here would reach your real catalogue.\nUse TryFocus admin → the store → Plan → Catalogue setup, or pass --mock to try it locally.');
  process.exit(1);
}
const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');
const trial = await import('../src/lib/maharaja/trial-catalogue.ts');

await runWithClient(clientId, async () => {
  const plan = await trial.planTrialCatalogue(clientId);
  console.log(`${clientId}: ${plan.garments} garments showing.${apply ? '' : ' Preview only — add --apply to save.'}\n`);
  for (const row of plan.audiences) {
    console.log(row.audience.toUpperCase());
    console.log(`  Live Try-On (${row.live.length}): ${row.live.map((p) => `${p.title} [${p.categoryLabel}]`).join(' · ') || 'none'}`);
    console.log(`  AI Video: ${row.videoKept.length} already + ${row.videoAdded.length} new: ${row.videoAdded.map((p) => `${p.title} [${p.categoryLabel}] ₹${p.price.toLocaleString('en-IN')}`).join(' · ') || '—'}`);
    console.log(`  AI Video categories: ${row.videoCategories.map((cat) => cat.label).join(', ') || 'none'}\n`);
  }
  console.log(`Changes: ${plan.liveOn.length} on Live Try-On, ${plan.liveOff.length} off, ${plan.videoOff.length} off AI Video, ${plan.moves.length} to move.`);
  for (const move of plan.moves) console.log(`  Move: ${move.title} (${move.gender}) ${move.from} → ${move.to || 'no matching category, left as is'}`);
  if (apply) console.log('\nSaved:', await trial.applyTrialCatalogue(plan, clientId));
});

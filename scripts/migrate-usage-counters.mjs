// Moves usage counters written as literal top-level fields ("usage.tryOnGenerated") into the
// nested `usage` map that credit limits read. Earlier code used set() with dotted keys, which
// Firestore stores as field names containing a dot rather than as nested paths.
//
// Dry run (default, read-only):  node --env-file=.env.local scripts/migrate-usage-counters.mjs
// Apply the changes:             node --env-file=.env.local scripts/migrate-usage-counters.mjs --apply
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Firebase credentials are missing. Run with --env-file=.env.local.');
  process.exit(1);
}

const app = getApps()[0] || initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

async function migrateDoc(ref) {
  const data = (await ref.get()).data() || {};
  const dotted = Object.keys(data).filter((key) => key.startsWith('usage.') && typeof data[key] === 'number');
  if (!dotted.length) return 0;
  const update = {};
  for (const key of dotted) {
    const field = key.slice('usage.'.length);
    const current = Number(data.usage?.[field] || 0);
    const stray = Number(data[key] || 0);
    console.log(`  ${ref.path}: usage.${field} ${current} + stray ${stray} = ${current + stray}`);
    update[field] = current + stray;
  }
  if (apply) {
    // FieldPath addresses the literal dotted field names so they can be deleted.
    const deletes = dotted.flatMap((key) => [new FieldPath(key), FieldValue.delete()]);
    await ref.set({ usage: update }, { merge: true });
    await ref.update(...deletes);
  }
  return dotted.length;
}

let total = 0;
const workspaces = await db.collection('clientWorkspaces').get();
console.log(`${apply ? 'APPLYING' : 'DRY RUN'} · project ${projectId} · ${workspaces.size} client workspace(s)`);
for (const workspace of workspaces.docs) {
  total += await migrateDoc(workspace.ref);
  const passes = await workspace.ref.collection('customerPasses').get();
  for (const pass of passes.docs) total += await migrateDoc(pass.ref);
}
console.log(total
  ? `${total} stray counter field(s) ${apply ? 'merged and removed' : 'found; rerun with --apply to merge them'}.`
  : 'No stray counter fields found; usage counters are already nested.');

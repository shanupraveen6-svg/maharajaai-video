import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);
const { cleanupExpiredSessions } = await import('../src/lib/maharaja/privacy-cleanup.ts');
const sessions = new Map();
const rateLimits = new Map(Array.from({ length: 250 }, (_, i) => [`rate-${i}`, {}]));
const expiry = '2020-01-01T00:00:00.000Z';
for (let i = 0; i < 505; i++) sessions.set(`promo-${String(i).padStart(4, '0')}`, { expiresAt: expiry, promotionConsent: true, retentionPolicyVersion: 'live-v2' });
sessions.set('legacy-live', { expiresAt: expiry, liveConsent: true });
sessions.set('orphan-live', { expiresAt: expiry });
sessions.set('private-expired', { expiresAt: expiry });
let progress;
let pages = 0;
const deletions = [];
const handoffs = new Map([['expired-phone-handoff', {}]]);
const ref = (id) => ({ id, set: async (patch) => {
  const session = sessions.get(id);
  Object.assign(session, patch);
  if (typeof patch.expiresAt === 'object') delete session.expiresAt;
} });
const db = {
  doc: () => ({ get: async () => ({ data: () => progress }), set: async (value) => { progress = value; }, delete: async () => { progress = undefined; } }),
  collection(name) {
    if (name === 'videos') return { doc: (id) => ({ id, get: async () => ({ exists: false }) }) };
    let cursor = '';
    const query = {
      where: () => query, orderBy: () => query, limit: () => query,
      startAfter: (_expiry, id) => { cursor = id; return query; },
      get: async () => {
        if (name === 'tvPhotoTransfers') return { docs: [] };
        if (name === 'tvTryOnHandoffs') return { docs: [...handoffs.keys()].map((id) => ({ id, ref: { delete: async () => handoffs.delete(id) } })) };
        if (name === 'liveQueue') return { empty: true, docs: [] };
        if (name === 'securityRateLimits') {
          const docs = [...rateLimits.keys()].slice(0, 200).map((id) => ({ ref: { id } }));
          return { empty: docs.length === 0, docs, size: docs.length };
        }
        pages++;
        const docs = [...sessions].filter(([id, value]) => value.expiresAt && id > cursor).sort(([a], [b]) => a.localeCompare(b)).slice(0, 100)
          .map(([id, value]) => ({ id, data: () => ({ ...value }), ref: ref(id) }));
        return { docs, empty: docs.length === 0 };
      },
    };
    return query;
  },
  batch() {
    const ids = [];
    return { delete: (value) => ids.push(value.id), commit: async () => ids.forEach((id) => { sessions.delete(id); rateLimits.delete(id); }) };
  },
};
const bucket = {
  file: (name) => ({ exists: async () => [name.includes('/orphan-live/')] }),
  deleteFiles: async ({ prefix }) => { deletions.push(prefix); },
};
const result = await cleanupExpiredSessions(db, bucket);
assert.equal(result.deleted, 1);
assert.equal(result.retainedForPromotion, 505);
assert.equal(result.preservedLive, 2);
assert.equal(result.failed, 0);
assert.equal(handoffs.size, 0, 'Expired phone handoff records are deleted.');
assert.ok(deletions.includes('clients/maharaja/tryon-handoffs/expired-phone-handoff/'), 'Expired phone images are deleted with their handoff.');
assert.equal(result.expiredRateLimits, 250, 'Numeric expiry also removes old rate-limit records across pages.');
assert.ok(pages >= 6, 'Cleanup must cross the old 500-record ceiling.');
assert.ok(sessions.has('legacy-live') && sessions.has('orphan-live'));
assert.ok(!deletions.some((path) => /legacy-live|orphan-live/.test(path)));
assert.equal(progress, undefined, 'Completed sweep resets the cursor.');
const again = await cleanupExpiredSessions(db, bucket);
assert.equal(again.retainedForPromotion, 0, 'Retained records must leave the expiry query.');
console.log('Cleanup passed: >500 records, promotion retention, legacy/orphan live preservation, and repeat sweep.');

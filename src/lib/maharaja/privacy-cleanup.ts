import type { Firestore } from 'firebase-admin/firestore';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import { MAHARAJA_CLIENT_ID } from './config';

export async function cleanupExpiredSessions(db: Firestore, bucket: Bucket) {
  const nowIso = new Date().toISOString();
  let expiredTvHandoffs = 0;
  const photoTransfers = await db.collection('tvPhotoTransfers').where('expiresAtMs', '<=', Date.now()).limit(100).get();
  for (const transfer of photoTransfers.docs) {
    await bucket.deleteFiles({ prefix: `clients/${MAHARAJA_CLIENT_ID}/photo-transfers/${transfer.id}/`, force: true });
    await transfer.ref.delete();
  }
  const handoffs = await db.collection('tvTryOnHandoffs').where('expiresAtMs', '<=', Date.now()).limit(100).get();
  for (const handoff of handoffs.docs) {
    await bucket.deleteFiles({ prefix: `clients/${MAHARAJA_CLIENT_ID}/tryon-handoffs/${handoff.id}/`, force: true });
    await handoff.ref.delete();
    expiredTvHandoffs += 1;
  }
  let expiredRateLimits = 0;
  const rateDeadline = Date.now() + 20_000;
  // Also handles old records without Timestamp expiry while Cloud TTL is pending.
  while (Date.now() < rateDeadline) {
    const expired = await db
      .collection('securityRateLimits')
      .where('resetAtMs', '<=', Date.now() - 24 * 60 * 60 * 1000)
      .limit(200)
      .get();
    if (expired.empty) break;
    const batch = db.batch();
    expired.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    expiredRateLimits += expired.size;
  }
  const progressRef = db.doc('appControl/privacy-cleanup');
  let progress = (await progressRef.get()).data();
  let deleted = 0;
  let retainedForPromotion = 0;
  let preservedLive = 0;
  let failed = 0;
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    let query = db
      .collection('sessions')
      .where('expiresAt', '<=', nowIso)
      .orderBy('expiresAt')
      .orderBy(FieldPath.documentId())
      .limit(100);
    if (
      typeof progress?.expiresAt === 'string' &&
      typeof progress?.sessionId === 'string'
    ) {
      query = query.startAfter(progress.expiresAt, progress.sessionId);
    }
    const snapshot = await query.get();
    if (snapshot.empty) {
      await progressRef.delete();
      break;
    }
    for (const doc of snapshot.docs) {
      const session = doc.data();
      const sessionId = doc.id;
      if (Date.now() >= deadline) break;
      try {
        // Keep the existing showroom library intact. New live submissions carry an
        // explicit retention policy; older live records are never deleted here.
        const video = await db
          .collection('videos')
          .doc(`video_${sessionId}`)
          .get();
        const queue = await db
          .collection('liveQueue')
          .where('sessionId', '==', sessionId)
          .get();
        const [hasStoredLiveVideo] =
          session.retentionPolicyVersion !== 'live-v2'
            ? await bucket
                .file(
                  `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/video/live-9s.mp4`,
                )
                .exists()
            : [false];
        const legacyLive =
          session.retentionPolicyVersion !== 'live-v2' &&
          (session.liveConsent === true ||
            video.exists ||
            !queue.empty ||
            hasStoredLiveVideo);
        if (legacyLive) {
          preservedLive += 1;
        } else if (session.promotionConsent === true) {
          await Promise.all([
            bucket.deleteFiles({
              prefix: `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/person/`,
              force: true,
            }),
            bucket.deleteFiles({
              prefix: `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/garment/`,
              force: true,
            }),
            bucket.deleteFiles({
              prefix: `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/`,
              force: true,
            }),
            bucket.deleteFiles({
              prefix: `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/video-tests/`,
              force: true,
            }),
          ]);
          await doc.ref.set(
            {
              accessCode: null,
              personPhotoStoragePath: null,
              garmentPhotoStoragePaths: [],
              masterStoragePath: null,
              sourceMediaDeletedAt: nowIso,
              retainedForPromotion: true,
              expiresAt: FieldValue.delete(),
              updatedAt: nowIso,
            },
            { merge: true },
          );
          retainedForPromotion += 1;
        } else {
          await bucket.deleteFiles({
            prefix: `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/`,
            force: true,
          });
          const batch = db.batch();
          queue.docs.forEach((item) => batch.delete(item.ref));
          batch.delete(db.collection('videos').doc(`video_${sessionId}`));
          batch.delete(doc.ref);
          await batch.commit();
          deleted += 1;
        }
      } catch (error) {
        failed += 1;
        console.error('Privacy cleanup session failed', { sessionId, error });
      }
      // Advance even past retained or failed records; wrap on the next empty page
      // so one record cannot starve the rest and failures are retried on a new pass.
      progress = { expiresAt: session.expiresAt, sessionId, updatedAt: nowIso };
      await progressRef.set(progress);
    }
  }

  return {
    success: failed === 0,
    expiredTvHandoffs,
    deleted,
    retainedForPromotion,
    preservedLive,
    failed,
    checkedAt: nowIso,
    expiredRateLimits,
  };
}

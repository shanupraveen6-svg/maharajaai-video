import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'tv-universal-loop-test-secret';

const { resolveStoredVideoPaths } = await import('../src/lib/maharaja/storage-video.ts');
const { isApprovedDemoVideoPath, mergeTvPool, nextTvPoolIndex } = await import('../src/lib/maharaja/tv-pool.ts');

const demos = Array.from({ length: 11 }, (_, index) => ({
  queueId: `replay_demo_${index + 1}`,
  videoId: `demo_${index + 1}`,
  storagePath: `demos/demo-${index + 1}.mp4`,
  source: 'replay',
}));
const duplicate = { ...demos[4], queueId: 'duplicate_queue_id' };
const pool = mergeTvPool([], [...demos, duplicate]);
assert.equal(pool.length, 11, 'same stored video must appear once');

const observed = [];
let current = null;
for (let index = 0; index < 11; index += 1) {
  const nextIndex = nextTvPoolIndex(pool, current);
  current = pool[nextIndex].queueId;
  observed.push(current);
}
assert.deepEqual(observed, demos.map((item) => item.queueId), 'all 11 demos must play serially once');
assert.equal(nextTvPoolIndex(pool, current), 0, 'rotation must wrap to the first video');

const live = {
  queueId: 'live_customer_1',
  videoId: 'video_customer_1',
  storagePath: 'clients/maharaja/sessions/customer-1/video/live-9s.mp4',
  source: 'live',
};
const withLive = mergeTvPool(pool, [live]);
assert.equal(withLive.length, 12);
assert.equal(withLive.at(-1).source, 'live');
const afterPromotion = mergeTvPool(
  pool,
  [{ ...live, queueId: 'replay_video_customer_1', source: 'replay' }],
);
assert.equal(afterPromotion.length, 12, 'completed live video must join the universal pool once');
assert.equal(afterPromotion.at(-1).source, 'replay');

assert.equal(isApprovedDemoVideoPath('legacy-demo.MP4'), true);
assert.equal(isApprovedDemoVideoPath('showcase/diwali/demo.webm'), true);
assert.equal(isApprovedDemoVideoPath('clients/maharaja/live-testing/demo.mov'), true);
assert.equal(isApprovedDemoVideoPath('clients/maharaja/sessions/private/video/final-6s.mp4'), false);

const metadata = new Map([
  ['sessions/a/video/live-9s.mp4', null],
  ['sessions/a/video/final-6s.mp4', { size: '1024', contentType: 'video/mp4' }],
  ['demos/broken.mp4', null],
]);
const bucket = {
  file(path) {
    return {
      async getMetadata() {
        const value = metadata.get(path);
        if (!value) {
          const error = new Error('missing');
          error.code = 404;
          throw error;
        }
        return [value];
      },
    };
  },
};
const resolved = await resolveStoredVideoPaths(bucket, [
  { id: 'a', liveStoragePath: 'sessions/a/video/live-9s.mp4', storagePath: 'sessions/a/video/final-6s.mp4' },
  { id: 'broken', storagePath: 'demos/broken.mp4' },
]);
assert.equal(resolved.length, 1, 'broken video must be skipped without blocking healthy videos');
assert.equal(resolved[0].resolvedStoragePath, 'sessions/a/video/final-6s.mp4', 'missing 9s rendition must fall back to valid 6s MP4');

const { NextRequest } = await import('next/server');
const { getMockStore } = await import('../src/lib/firebase/admin.ts');
const { issueDisplayToken, DISPLAY_COOKIE } = await import('../src/lib/auth/display.ts');
const { GET: getReplays } = await import('../src/app/api/live/replays/route.ts');
const { POST: completeLive } = await import('../src/app/api/live/complete/route.ts');
const store = getMockStore();
store.videos.clear();
store.liveQueue.length = 0;
demos.forEach((item, index) => store.videos.set(item.videoId, {
  id: item.videoId,
  sessionId: `demo-session-${index + 1}`,
  storagePath: item.storagePath,
  universalPool: true,
  status: 'ready',
  createdAt: new Date(2026, 0, index + 1).toISOString(),
}));
const token = await issueDisplayToken();
const authenticatedRequest = (url, init = {}) => new NextRequest(url, {
  ...init,
  headers: { ...(init.headers || {}), cookie: `${DISPLAY_COOKIE}=${token}` },
});
const initialResponse = await getReplays(authenticatedRequest('http://localhost/api/live/replays?limit=200'));
const initialBody = await initialResponse.json();
assert.equal(initialResponse.status, 200);
assert.equal(initialBody.items.length, 11, 'replay API must return all 11 stored demos');
assert.equal(new Set(initialBody.items.map((item) => item.storagePath)).size, 11);

store.videos.set('video_customer_1', {
  id: 'video_customer_1',
  sessionId: 'customer-1',
  storagePath: live.storagePath,
  status: 'ready',
});
store.liveQueue.push({
  id: live.queueId,
  screenId: 'maharaja-main',
  videoId: 'video_customer_1',
  sessionId: 'customer-1',
  status: 'playing',
  priority: 100,
  repeatCount: 2,
  timesPlayed: 1,
  reservationId: 'reservation-customer-1',
  createdAt: new Date().toISOString(),
});
const completeResponse = await completeLive(authenticatedRequest('http://localhost/api/live/complete', {
  method: 'POST',
  body: JSON.stringify({
    queueId: live.queueId,
    reservationId: 'reservation-customer-1',
    playNumber: 2,
  }),
}));
assert.equal(completeResponse.status, 200);
assert.equal((await completeResponse.json()).status, 'completed');
assert.equal(store.videos.get('video_customer_1').universalPool, true);
const finalResponse = await getReplays(authenticatedRequest('http://localhost/api/live/replays?limit=200'));
const finalBody = await finalResponse.json();
assert.equal(finalBody.items.length, 12, 'completed live customer video must join all 11 demos');
assert.equal(new Set(finalBody.items.map((item) => item.storagePath)).size, 12);

console.log('Universal TV pool passed: 11 serial demos, route delivery, dedupe, two-play live promotion to 12, privacy boundary, broken skip, and rendition fallback.');

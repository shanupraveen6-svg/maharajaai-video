import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'VIDEO_ENGINE_ORDER']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';

const engines = await import('../src/lib/maharaja/video-engines.ts');
const { getMockStore } = await import('../src/lib/firebase/admin.ts');

// Order: H3 Max first, Gemini Omni last; a configured order is honoured and unknown names dropped.
assert.deepEqual(engines.videoEngineOrder(), ['h3-max', 'gemini-omni'], 'H3 Max, with Gemini Omni as the ultimate backup');
process.env.VIDEO_ENGINE_ORDER = 'pixverse-c1, nope, h3-max, pixverse-c1';
assert.deepEqual(engines.videoEngineOrder(), ['pixverse-c1', 'h3-max']);
delete process.env.VIDEO_ENGINE_ORDER;
console.log('✓ Engine order');

// Resting: 3 failures in 10 minutes rest an engine for 15 minutes.
const now = Date.now();
assert.equal(engines.engineResting([now - 1000, now - 2000], now), false);
assert.equal(engines.engineResting([now - 1000, now - 2000, now - 3000], now), true);
assert.equal(engines.engineResting([now - 16 * 60_000, now - 17 * 60_000, now - 18 * 60_000], now), false, 'Old failures do not count');
for (let i = 0; i < 3; i++) await engines.recordEngineFailure('h3-max');
assert.deepEqual(await engines.availableEngines(), ['gemini-omni'], 'A resting engine is skipped');
assert.deepEqual(await engines.availableEngines(['h3-max', 'pixverse-c1', 'vidu-q4', 'gemini-omni']), ['pixverse-c1', 'vidu-q4', 'gemini-omni']);
for (const id of ['pixverse-c1', 'vidu-q4', 'gemini-omni']) for (let i = 0; i < 3; i++) await engines.recordEngineFailure(id);
assert.equal((await engines.availableEngines()).length, 2, 'When every engine rests, all are tried rather than none');
for (const id of ['h3-max', 'pixverse-c1', 'vidu-q4', 'gemini-omni']) await engines.recordEngineSuccess(id);
assert.equal((await engines.availableEngines()).length, 2, 'A success clears the failures');
console.log('✓ Engines rest after repeated failures');

const request = {
  masterUrl: 'https://storage.example/master.jpg',
  garmentUrls: ['https://storage.example/garment.jpg'],
  conceptId: 'women-golden-courtyard',
  garmentRoles: ['front'],
  eventId: 'diwali',
  garmentType: 'saree',
  retryRender: false,
};
const originalFetch = globalThis.fetch;
const calls = [];
const accept = (model) => new Response(JSON.stringify({
  request_id: `req_${model}`,
  status_url: `https://queue.fal.run/${model}/requests/req_${model}/status`,
  response_url: `https://queue.fal.run/${model}/requests/req_${model}`,
}), { status: 200 });
try {
  // Submission: H3 refuses, PixVerse accepts. The webhook URL is passed to fal.
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    calls.push({ target, init });
    if (target.includes('minimax/h3-max')) return new Response(JSON.stringify({ detail: 'overloaded' }), { status: 503 });
    return accept(target.split('queue.fal.run/')[1].split('?')[0]);
  };
  const submitted = await engines.submitRender({ chain: ['h3-max', 'pixverse-c1', 'gemini-omni'], request, webhookUrl: 'https://app.example/api/video/webhook?jobId=j&token=t', falKey: 'k' });
  assert.equal(submitted.engine.id, 'pixverse-c1', 'The next engine takes a refused job at once');
  assert.equal(submitted.attempts.length, 2);
  assert.match(submitted.attempts[0].error, /503/);
  assert.equal(new URL(calls[1].target).searchParams.get('fal_webhook'), 'https://app.example/api/video/webhook?jobId=j&token=t');
  assert.ok(JSON.parse(calls[1].init.body).image_references, 'PixVerse gets its own input format');
  console.log('✓ A refused submission moves to the next engine');

  // Every engine refuses: one clear error with every attempt.
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  await assert.rejects(engines.submitRender({ chain: ['vidu-q4', 'gemini-omni'], request, webhookUrl: 'https://app.example/w', falKey: 'k' }), (error) => error.attempts.length === 2);
  for (const id of ['vidu-q4', 'gemini-omni', 'h3-max']) await engines.recordEngineSuccess(id);

  // A failed render moves the same job to the next engine with a fresh webhook secret.
  globalThis.fetch = async (url) => accept(String(url).split('queue.fal.run/')[1].split('?')[0]);
  const job = {
    jobId: 'vtest_switch', modelId: 'h3-max', engineChain: ['h3-max', 'vidu-q4', 'gemini-omni'], renderRequest: request,
    requestId: 'req_old', webhookTokenHash: 'old', engineAttempts: [{ engine: 'h3-max', at: new Date().toISOString(), requestId: 'req_old' }],
  };
  getMockStore().sessions.set('video_test_vtest_switch', job);
  const moved = await engines.failOverVideoJob(job, { origin: 'https://app.example', falKey: 'k', reason: 'render failed' });
  assert.equal(moved.modelId, 'vidu-q4');
  assert.equal(moved.status, 'submitted');
  assert.notEqual(moved.webhookTokenHash, 'old', 'A new webhook secret, so a late callback from the old engine is refused');
  assert.equal(moved.engineAttempts[0].error, 'render failed');
  assert.equal(getMockStore().sessions.get('video_test_vtest_switch').modelId, 'vidu-q4');
  // The last engine failing ends the job.
  assert.equal(await engines.failOverVideoJob({ ...job, modelId: 'gemini-omni' }, { origin: 'https://app.example', falKey: 'k', reason: 'x' }), null);
  console.log('✓ A failed render moves the same job to the next engine; the last failure ends it');

  // Queue timeout: a request still waiting can be cancelled through fal's cancel URL.
  assert.equal(engines.cancelUrlFor('https://queue.fal.run/minimax/h3-max/requests/abc/status'), 'https://queue.fal.run/minimax/h3-max/requests/abc/cancel');
  assert.equal(engines.cancelUrlFor('https://evil.example/x'), '');
  globalThis.fetch = async (url, init) => { assert.equal(init.method, 'PUT'); return new Response('{}', { status: 202 }); };
  assert.equal(await engines.cancelQueuedRender('https://queue.fal.run/m/requests/abc/status', 'k'), true);
  globalThis.fetch = async () => new Response('{"detail":"already started"}', { status: 400 });
  assert.equal(await engines.cancelQueuedRender('https://queue.fal.run/m/requests/abc/status', 'k'), false, 'A started render is never cancelled');
  console.log('✓ Queue timeout cancels only a render that has not started');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('VIDEO ENGINE TESTS PASSED');

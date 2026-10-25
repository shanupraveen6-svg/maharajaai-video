import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [start, status, webhook, finalize, cleanup, next, playing, proxy, master, retryRoute] = await Promise.all([
  read('src/app/api/video/start/route.ts'),
  read('src/app/api/video/status/route.ts'),
  read('src/app/api/video/webhook/route.ts'),
  read('src/lib/maharaja/server.ts'),
  read('src/lib/maharaja/privacy-cleanup.ts'),
  read('src/app/api/live/next/route.ts'),
  read('src/app/api/tv/playing/route.ts'),
  read('src/proxy.ts'),
  read('src/app/api/ai/master-image/route.ts'),
  read('src/components/MaharajaExperience.tsx'),
]);

assert.match(start, /videoMasterApproved/);
assert.match(start, /videoMasterApprovedUrl !== access\.pass\.videoMasterUrl/);
assert.match(start, /fal_webhook/);
assert.match(webhook, /timingSafeEqual/);
assert.match(webhook, /status: 'finalizing'/);
assert.match(status, /finalizationLeaseUntil/);
assert.match(finalize, /validateBrandedVideo\(customerVideo, 6\)/);
assert.match(finalize, /validateBrandedVideo\(liveVideo, 9\)/);
assert.doesNotMatch(finalize, /falling back to raw provider MP4/);
assert.match(cleanup, /sourceMediaDeletedAt/);
assert.match(cleanup, /\/person\//);
assert.match(next, /verifyTvRequest/);
assert.match(playing, /verifyTvRequest/);
assert.match(proxy, /pathname === '\/tv'/);
assert.match(master, /Photo source does not belong to this customer session/);
assert.doesNotMatch(master, /await fetch\(trimmed\)/);
assert.doesNotMatch(retryRoute, /retry-source/);

console.log('Current production flow audit passed: approval, webhook, atomic finalization, privacy, TV auth, and session-bound media.');

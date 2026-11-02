import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
process.env.ALLOW_MOCK_BACKEND = 'true';
process.env.OPERATOR_AUTH_SECRET = 'test_secret';

const { getMockStore } = await import('../src/lib/firebase/admin.ts');
const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');
const recordings = await import('../src/lib/maharaja/mirror-recordings.ts');

// A finished Live Mirror session: reserve, upload, confirm, then the customer's QR reads it.
await runWithClient('maharaja', async () => {
  await assert.rejects(recordings.createMirrorUpload('video/avi', 100), /format/);
  await assert.rejects(recordings.createMirrorUpload('video/webm', 0), /empty/);
  await assert.rejects(recordings.createMirrorUpload('video/webm', 61 * 1024 * 1024), /too large/);

  const start = await recordings.createMirrorUpload('video/webm;codecs=vp9', 1234);
  assert.equal(start.contentType, 'video/webm', 'Codec details are dropped from the stored type');
  await assert.rejects(recordings.confirmMirrorRecording(start.id, start.contentType, 'Saree'), /did not finish/);

  const path = decodeURIComponent(new URL(start.uploadUrl, 'http://localhost').searchParams.get('path'));
  assert.match(path, /^clients\/maharaja\/mirror-recordings\/[A-Za-z0-9_-]{24}\/session\.webm$/);
  getMockStore().sessions.set(`mock_blob_${path}`, { buffer: Buffer.alloc(1234), contentType: 'video/webm' });

  const record = await recordings.confirmMirrorRecording(start.id, start.contentType, 'Kanchivaram saree · Lehenga');
  assert.equal(record.clientId, 'maharaja');
  assert.ok(record.expiresAtMs > Date.now() + 55 * 60 * 1000 && record.expiresAtMs <= Date.now() + 60 * 60 * 1000, 'The video link lasts 1 hour');

  const read = await recordings.readMirrorRecording(start.id);
  assert.equal(read?.garmentTitle, 'Kanchivaram saree · Lehenga');
  const urls = await recordings.mirrorRecordingUrls(read);
  assert.ok(urls.videoUrl && urls.downloadUrl);

  assert.equal(await recordings.readMirrorRecording('not-a-real-id'), null);
  getMockStore().sessions.set(`mirror_recording_${start.id}`, { ...record, expiresAtMs: Date.now() - 1 });
  assert.equal(await recordings.readMirrorRecording(start.id), null, 'An expired video is no longer served');
});

console.log('mirror recording: all checks passed');

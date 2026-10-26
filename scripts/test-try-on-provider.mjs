import assert from 'node:assert/strict';
import { buildFalTryOnInput, generateFalTryOn } from '../src/lib/maharaja/try-on-provider.ts';

const input = buildFalTryOnInput('person', 'garment');
assert.equal(input.person_image_url, 'data:image/jpeg;base64,person');
assert.equal(input.clothing_image_url, 'data:image/jpeg;base64,garment');
assert.equal(input.preserve_pose, true);
assert.equal(input.aspect_ratio.ratio, '9:16');
assert.equal(Object.keys(input).filter((key) => key.includes('image')).length, 2);

const originalFetch = globalThis.fetch;
try {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (requests.length === 1) return Response.json({ images: [{ url: 'https://v3.fal.media/files/example/result.png' }] });
    return new Response(Buffer.from('mock-image'), { status: 200, headers: { 'content-type': 'image/png' } });
  };
  const result = await generateFalTryOn('person', 'garment', 'test-key');
  assert.equal(result.toString(), 'mock-image');
  assert.equal(requests[0].url, 'https://fal.run/fal-ai/image-apps-v2/virtual-try-on');
  assert.equal(JSON.parse(requests[0].options.body).clothing_image_url, input.clothing_image_url);
  assert.equal(requests.length, 2);

  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  await assert.rejects(
    generateFalTryOn('person', 'garment', 'test-key'),
    /Fal Try-On did not complete \(503\)/,
  );

  globalThis.fetch = async () => { throw new TypeError('Network outcome unknown'); };
  await assert.rejects(generateFalTryOn('person', 'garment', 'test-key'), TypeError);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Fal Try-On input and no-double-call error paths passed without provider requests.');

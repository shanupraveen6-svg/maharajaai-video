import assert from 'node:assert/strict';
import { generateGenlookTryOn, canFallbackFromGenlook } from '../src/lib/maharaja/genlook-provider.ts';

// 1x1 8-bit PNG base64
const samplePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const sampleProduct = {
  externalId: 'test-garment-001',
  title: 'Test Saree',
  description: 'Test Kanchivaram Saree',
};

const originalFetch = globalThis.fetch;

try {
  // Test 1: Successful synchronous generation flow
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/images/upload')) {
      return Response.json({ imageId: 'img-mock-123' }, { status: 200 });
    }
    if (String(url).endsWith('/try-on/sync')) {
      return Response.json({ resultImageUrl: 'https://cdn.genlook.app/results/look-123.jpg' }, { status: 200 });
    }
    if (String(url).startsWith('https://cdn.genlook.app/results/')) {
      return new Response(Buffer.from('mock-genlook-result-jpeg-data'), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': '30' },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await generateGenlookTryOn(samplePngBase64, samplePngBase64, 'test-gk-key', sampleProduct);
  assert.equal(result.toString(), 'mock-genlook-result-jpeg-data');
  assert.equal(requests.length, 3);
  assert.equal(requests[0].options.headers['x-api-key'], 'test-gk-key');
  assert.equal(requests[1].options.headers['x-api-key'], 'test-gk-key');

  // Test 2: Asynchronous 202 Polling flow
  requests.length = 0;
  let pollCount = 0;
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/images/upload')) {
      return Response.json({ imageId: 'img-mock-456' }, { status: 200 });
    }
    if (String(url).endsWith('/try-on/sync')) {
      return Response.json({ generationId: 'gen-async-789' }, { status: 202 });
    }
    if (String(url).includes('/generations/gen-async-789')) {
      pollCount++;
      if (pollCount === 1) {
        return Response.json({ status: 'PROCESSING' }, { status: 200 });
      }
      return Response.json({ status: 'COMPLETED', resultImageUrl: 'https://cdn.genlook.app/results/poll-finish.jpg' }, { status: 200 });
    }
    if (String(url).startsWith('https://cdn.genlook.app/results/poll-finish.jpg')) {
      return new Response(Buffer.from('mock-polled-result'), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const pollResult = await generateGenlookTryOn(samplePngBase64, samplePngBase64, 'test-gk-key', sampleProduct);
  assert.equal(pollResult.toString(), 'mock-polled-result');
  assert.equal(pollCount, 2);

  // Test 3: Untrusted result URL protection (SSRF guard)
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/images/upload')) return Response.json({ imageId: 'img-1' }, { status: 200 });
    if (String(url).endsWith('/try-on/sync')) return Response.json({ resultImageUrl: 'http://169.254.169.254/latest/meta-data/' }, { status: 200 });
    throw new Error('Should not reach here');
  };

  await assert.rejects(
    generateGenlookTryOn(samplePngBase64, samplePngBase64, 'test-gk-key', sampleProduct),
    (err) => {
      assert.equal(canFallbackFromGenlook(err), false);
      return /untrusted result location/.test(err.message);
    }
  );

  // Test 4: Explicit client rejection allows fallback to backup provider
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/images/upload')) return Response.json({ error: 'invalid image' }, { status: 400 });
    throw new Error('Should not reach here');
  };

  await assert.rejects(
    generateGenlookTryOn(samplePngBase64, samplePngBase64, 'test-gk-key', sampleProduct),
    (err) => {
      assert.equal(canFallbackFromGenlook(err), true);
      return /rejected the customer image/.test(err.message);
    }
  );

  // Test 5: Uncertain timeout / network failure forbids fallback to prevent duplicate billing
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/images/upload')) return Response.json({ imageId: 'img-1' }, { status: 200 });
    if (String(url).endsWith('/try-on/sync')) {
      throw new TypeError('Connection terminated');
    }
  };

  await assert.rejects(
    generateGenlookTryOn(samplePngBase64, samplePngBase64, 'test-gk-key', sampleProduct),
    (err) => {
      assert.equal(canFallbackFromGenlook(err), false);
      return /generation outcome is uncertain/.test(err.message);
    }
  );

} finally {
  globalThis.fetch = originalFetch;
}

console.log('✓ All GenLook provider unit tests (sync, 202 poll, SSRF security, fallback guard) passed.');

import assert from 'node:assert/strict';
import { generateGenlookTryOn, canFallbackFromGenlook, canRetryGenlook, genlookCreditsPerLook, genlookResolution } from '../src/lib/maharaja/genlook-provider.ts';

// 1x1 8-bit PNG base64
const samplePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const sampleProduct = {
  externalId: 'test-garment-001',
  title: 'Test Saree',
  description: 'Test Kanchivaram Saree',
};

const originalFetch = globalThis.fetch;
let syncRequest = null;

try {
  // Test 1: Successful synchronous generation flow
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/images/upload')) {
      return Response.json({ imageId: 'img-mock-123' }, { status: 200 });
    }
    if (String(url).endsWith('/try-on/sync')) {
      syncRequest = JSON.parse(String(options?.body?.get?.('data') || '{}'));
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

  // Test 5: a dropped connection while GenLook makes the look: maybe charged (credit kept), never resent to GenLook
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
      return /did not answer in time/.test(err.message);
    }
  );

  // Test 6: GenLook busy (429) or a server error is a passing problem: safe to send again, nothing charged
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/images/upload')) return Response.json({ imageId: 'img-1' }, { status: 200 });
    if (String(url).endsWith('/try-on/sync')) return Response.json({ code: 'RATE_LIMITED' }, { status: 429 });
  };
  await assert.rejects(generateGenlookTryOn(samplePngBase64, samplePngBase64, 'test-gk-key', sampleProduct), (err) => {
    assert.equal(canFallbackFromGenlook(err), true);
    assert.equal(canRetryGenlook(err), true);
    return true;
  });

  // Test 7: a dropped upload is sent again by itself; a dropped result download is fetched again
  {
    let uploads = 0;
    let downloads = 0;
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/images/upload')) { uploads += 1; if (uploads === 1) throw new TypeError('reset'); return Response.json({ imageId: 'img-1' }, { status: 200 }); }
      if (String(url).endsWith('/try-on/sync')) return Response.json({ resultImageUrl: 'https://cdn.genlook.app/r.jpg' }, { status: 200 });
      downloads += 1;
      if (downloads === 1) throw new TypeError('reset');
      return new Response(Buffer.from('look'), { status: 200 });
    };
    const look = await generateGenlookTryOn(samplePngBase64, samplePngBase64, 'test-gk-key', sampleProduct);
    assert.equal(look.toString(), 'look');
    assert.equal(uploads, 2, 'The dropped upload was sent again');
    assert.equal(downloads, 2, 'The dropped download was fetched again');
  }

} finally {
  globalThis.fetch = originalFetch;
}

// A sharp look for a 43-inch TV: 2K by default (2 credits), the plain size only when asked for.
assert.equal(syncRequest?.output?.resolution, '2k', 'GenLook is asked for a 2K result');
assert.equal(syncRequest?.output?.watermark, false);
assert.equal(genlookCreditsPerLook(), 2, 'A 2K look uses 2 GenLook credits');
process.env.GENLOOK_RESOLUTION = 'default';
assert.equal(genlookResolution(), 'default');
assert.equal(genlookCreditsPerLook(), 1);
delete process.env.GENLOOK_RESOLUTION;

console.log('✓ All GenLook provider unit tests (sync, 202 poll, SSRF security, fallback guard) passed.');


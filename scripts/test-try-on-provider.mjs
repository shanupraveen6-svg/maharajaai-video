import assert from 'node:assert/strict';

// Engines run in order with Gemini as the last backup, and the privacy policy discloses every provider.
{
  const fs = await import('node:fs');
  const { tryOnEngineOrder } = await import('../src/lib/maharaja/try-on-provider.ts');
  assert.deepEqual(tryOnEngineOrder(''), ['genlook', 'fashn', 'gemini'], 'Default order keeps GenLook first, no fal Try-On');
  assert.deepEqual(tryOnEngineOrder('fashn'), ['fashn', 'gemini'], 'Gemini is always the last backup');
  assert.deepEqual(tryOnEngineOrder('gemini,unknown,fal,genlook,genlook'), ['gemini', 'genlook'], 'Unknown (fal included) and repeated names are ignored');
  const route = fs.readFileSync(new URL('../src/app/api/ai/master-image/route.ts', import.meta.url), 'utf8');
  assert.match(route, /tryOnEngineOrder\(\)/, 'The Try-On route follows the engine order');
  assert.doesNotMatch(route, /generateFalTryOn|engine === 'fal'/, 'fal virtual try-on is no longer a Try-On engine');
  assert.match(route, /if \(!canFallbackFromGenlook\(error\)\) \{\s*(?:\/\/[^\n]*\s*)*genlookOutcomeUncertain = true;\s*throw error;/, 'An uncertain GenLook outcome never falls through (no double charge)');
  assert.match(route, /CONSENT_VERSIONS = \['2026-11-privacy-v4', '2026-10-privacy-v3'\]/, 'Screens open across a release keep working');
  const policy = fs.readFileSync(new URL('../src/app/privacy/page.tsx', import.meta.url), 'utf8');
  assert.match(policy, /\(GenLook or FASHN\)/);
  assert.match(policy, /Google Gemini as the last backup/);
  assert.match(policy, /Your WhatsApp number/);
  assert.match(policy, /2026-11-privacy-v4/);
  console.log('✓ Engine order with the Gemini backup, disclosed in the privacy policy');
}

// FASHN: submit, poll, decode the base64 image; a failed prediction is reported (FASHN does not bill it).
{
  const { buildFashnInput, generateFashnTryOn } = await import('../src/lib/maharaja/fashn-provider.ts');
  const input = buildFashnInput('PERSON', 'GARMENT');
  assert.equal(input.model_name, 'tryon-v1.6');
  assert.equal(input.inputs.model_image, 'data:image/jpeg;base64,PERSON');
  assert.equal(input.inputs.garment_image, 'data:image/jpeg;base64,GARMENT');
  assert.equal(input.inputs.return_base64, true);
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => originalTimeout(fn, 0);
  try {
    const image = Buffer.from('jpeg-bytes').toString('base64');
    let polls = 0;
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/run')) {
        assert.equal(init.headers.Authorization, 'Bearer fashn-key');
        return new Response(JSON.stringify({ id: 'pred_1', error: null }), { status: 200 });
      }
      polls += 1;
      return new Response(JSON.stringify(polls < 2 ? { id: 'pred_1', status: 'processing' } : { id: 'pred_1', status: 'completed', output: [`data:image/jpeg;base64,${image}`] }), { status: 200 });
    };
    assert.equal((await generateFashnTryOn('p', 'g', 'fashn-key')).toString(), 'jpeg-bytes');
    globalThis.fetch = async (url) => String(url).endsWith('/run')
      ? new Response(JSON.stringify({ id: 'pred_2' }), { status: 200 })
      : new Response(JSON.stringify({ id: 'pred_2', status: 'failed', error: { name: 'ImageLoadError', message: 'bad image' } }), { status: 200 });
    await assert.rejects(generateFashnTryOn('p', 'g', 'fashn-key'), /failed: bad image/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'UnauthorizedAccess' }), { status: 401 });
    await assert.rejects(generateFashnTryOn('p', 'g', 'bad-key'), /not accepted \(401/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimeout;
  }
  console.log('✓ FASHN Try-On: submit, poll, decode; failures reported without a second request');
}

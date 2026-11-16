import assert from 'node:assert/strict';

// Engines run in order with Gemini as the last backup, and the privacy policy discloses every provider.
{
  const fs = await import('node:fs');
  const { tryOnEngineOrder } = await import('../src/lib/maharaja/try-on-provider.ts');
  assert.deepEqual(tryOnEngineOrder(''), ['genlook', 'gemini'], 'GenLook first, Gemini the backup: no fal or FASHN Try-On');
  assert.deepEqual(tryOnEngineOrder('fashn,genlook'), ['genlook', 'gemini'], 'Removed engines are ignored; Gemini is always the last backup');
  assert.deepEqual(tryOnEngineOrder('gemini,unknown,fal,genlook,genlook'), ['gemini', 'genlook'], 'Unknown (fal included) and repeated names are ignored');
  const route = fs.readFileSync(new URL('../src/app/api/ai/master-image/route.ts', import.meta.url), 'utf8');
  assert.match(route, /tryOnEngineOrder\(\)/, 'The Try-On route follows the engine order');
  assert.doesNotMatch(route, /generateFalTryOn|engine === 'fal'/, 'fal virtual try-on is no longer a Try-On engine');
  assert.doesNotMatch(route, /genlookOutcomeUncertain = true;\s*throw error;/, 'No GenLook problem stops the chain: the backup engine always runs');
  assert.match(route, /if \(!canFallbackFromGenlook\(error\)\) \{ genlookOutcomeUncertain = true; break; \}/, 'A look GenLook may have made is never sent to GenLook twice');
  assert.match(route, /\[primaryModel, primaryModel, otherModel\]/, 'Gemini as the last engine tries again, then on the other Nano Banana model');
  const client = fs.readFileSync(new URL('../src/lib/maharaja/master-image-client.ts', import.meta.url), 'utf8');
  assert.match(client, /\[500, 502, 504\]\.includes\(response\.status\)/, 'A server failure is sent once more from the screen');
  assert.match(route, /CONSENT_VERSIONS = \['2026-11-privacy-v4', '2026-10-privacy-v3'\]/, 'Screens open across a release keep working');
  const policy = fs.readFileSync(new URL('../src/app/privacy/page.tsx', import.meta.url), 'utf8');
  assert.match(policy, /sent to GenLook to create your look/);
  assert.doesNotMatch(policy, /FASHN|PixVerse|Vidu/, 'The policy names only the services in use');
  assert.match(policy, /Google Gemini as the backup/);
  assert.match(policy, /Your WhatsApp number/);
  assert.match(policy, /2026-11-privacy-v4/);
  console.log('✓ Engine order with the Gemini backup, disclosed in the privacy policy');
}

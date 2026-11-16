// Checks the live site after a deploy, from outside, reading only public parts (no login, no AI spend):
// the version, every engine's health, the server region and database speed, the catalogue and a garment photo.
// Usage: npm run smoke:live   (BASE_URL to point at another deployment)
const base = process.env.BASE_URL || 'https://www.tryfocus.in';
const results = [];
async function check(name, task) {
  const started = Date.now();
  try { results.push({ name, ok: true, note: await task(), ms: Date.now() - started }); }
  catch (error) { results.push({ name, ok: false, note: error.message, ms: Date.now() - started }); }
}
const json = async (path) => { const response = await fetch(`${base}${path}`, { cache: 'no-store' }); if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`); return response.json(); };

await check('Version', async () => (await json('/api/version')).version.slice(0, 7));
await check('Engines', async () => {
  const health = await json('/api/health');
  const bad = ['genlook', 'gemini', 'fal'].filter((engine) => health[engine] !== 'ok').map((engine) => `${engine}: ${health[engine]}`);
  if (bad.length) throw new Error(bad.join(', '));
  return 'GenLook, Gemini and fal ok';
});
await check('Server region and database', async () => {
  const latency = await json('/api/health?latency=1');
  if (latency.firestoreReadMs > 150) throw new Error(`database read ${latency.firestoreReadMs} ms from ${latency.serverRegion} (database in ${latency.databaseLocation})`);
  return `${latency.serverRegion}, database read ${latency.firestoreReadMs} ms`;
});
let sku = '';
await check('Catalogue', async () => {
  const catalogue = await json('/api/maharaja/catalogue?offset=0&limit=5');
  if (!catalogue.products?.length) throw new Error('no garments');
  sku = catalogue.products[0].sku;
  return `${catalogue.total} garments`;
});
await check('Garment photo', async () => {
  const response = await fetch(`${base}/api/maharaja/catalogue/photo?sku=${encodeURIComponent(sku)}`, { cache: 'no-store' });
  const bytes = (await response.arrayBuffer()).byteLength;
  if (!response.ok || !String(response.headers.get('content-type')).startsWith('image/') || bytes < 1000) throw new Error(`HTTP ${response.status}, ${bytes} bytes`);
  return `${Math.round(bytes / 1024)} KB`;
});

for (const result of results) console.log(`${result.ok ? '✓' : '✗'} ${result.name}: ${result.note} (${result.ms} ms)`);
process.exit(results.every((result) => result.ok) ? 0 : 1);

// Bridal quality check: runs one Try-On per garment photo in a folder against a live TryFocus site,
// then writes an HTML page with each garment beside its result, so a person can judge zari, border,
// pallu and colour before a model or prompt change goes to stores. Each garment uses one Try-On credit
// of the signed-in client. Live Mirror is real-time and is checked by hand on the TV.
//
//   node scripts/bridal-quality-check.mjs --base https://tryfocus.in --user <login> --password <pw> \
//     --person ./person.jpg --garments ./bridal-set [--type saree] [--who women] [--surface tablet|tv]
//
// Keep each run's report: comparing two runs side by side shows whether a change made results better.
import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (
  value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs
), []));
for (const key of ['base', 'user', 'password', 'person', 'garments']) {
  if (!args[key]) throw new Error(`--${key} is required. See the top of this file for usage.`);
}
const base = args.base.replace(/\/$/, '');
const garmentType = args.type || 'saree';
const who = args.who || 'women';
const surface = args.surface === 'tv' ? 'tv' : 'tablet';

const login = await fetch(`${base}/api/operator/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: args.user, password: args.password }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
if (!login.ok || !cookie) throw new Error(`Sign-in failed (${login.status}).`);

const dataUrl = async (file) => {
  const ext = path.extname(file).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${type};base64,${(await fs.readFile(file)).toString('base64')}`;
};
const personPhoto = await dataUrl(args.person);
const garmentFiles = (await fs.readdir(args.garments))
  .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
  .sort()
  .map((name) => path.join(args.garments, name));
if (!garmentFiles.length) throw new Error('No garment photos (.jpg, .png, .webp) in the --garments folder.');

const rows = [];
for (const [index, file] of garmentFiles.entries()) {
  const name = path.basename(file);
  const started = Date.now();
  process.stdout.write(`${index + 1}/${garmentFiles.length} ${name}… `);
  const garmentPhoto = await dataUrl(file);
  const response = await fetch(`${base}/api/ai/master-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      sessionId: `quality_${Date.now()}_${index}`,
      service: 'try-on',
      surface,
      templateId: who === 'boys' ? 'boy' : who === 'girls' ? 'girl' : who,
      catalogueProductId: `QC-${index + 1}`,
      catalogueProductTitle: name,
      garmentType,
      garmentTypeConfirmed: true,
      processingConsent: true,
      consentVersion: '2026-10-privacy-v3',
      personPhoto,
      garmentPhotos: [garmentPhoto],
      garmentRoles: ['Primary Garment Reference'],
      garmentAnalysis: `Quality check: ${name}`,
    }),
  });
  const data = await response.json().catch(() => ({}));
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  rows.push({ name, garmentPhoto, result: data.masterImageUrl || '', error: data.masterImageUrl ? '' : data.error || `HTTP ${response.status}`, seconds });
  console.log(data.masterImageUrl ? `ok (${seconds}s)` : `failed: ${rows.at(-1).error}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.resolve(`quality-check-${stamp}.html`);
const escape = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
await fs.writeFile(out, `<!doctype html><meta charset="utf-8"><title>Bridal quality check ${stamp}</title>
<style>body{font-family:system-ui;margin:24px;background:#f4f5f2;color:#161918}h1{font-size:22px}
.row{display:grid;grid-template-columns:200px 1fr 1fr;gap:16px;align-items:start;background:#fff;border-radius:16px;padding:16px;margin:12px 0}
img{width:100%;border-radius:12px;background:#eee}.err{color:#b42318}.score{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
label{font-size:13px;border:1px solid #ccc;border-radius:999px;padding:4px 10px}</style>
<h1>Bridal quality check · ${escape(base)} · ${escape(garmentType)} · ${new Date().toLocaleString('en-IN')}</h1>
<p>${rows.filter((row) => row.result).length} of ${rows.length} looks made. Tick what is right in each result.</p>
${rows.map((row) => `<div class="row"><div><b>${escape(row.name)}</b><p>${row.seconds}s</p>
<div class="score">${['Colour', 'Border', 'Zari', 'Pallu / drape', 'Face kept'].map((item) => `<label><input type="checkbox"> ${item}</label>`).join('')}</div></div>
<img src="${row.garmentPhoto}" alt="Garment">${row.result ? `<img src="${row.result}" alt="Result">` : `<p class="err">${escape(row.error)}</p>`}</div>`).join('\n')}`);
console.log(`Report: ${out}`);

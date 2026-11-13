// Gets a store's existing garments ready for the public trial. No new photos.
//
//   npm run catalogue:trial                 → shows what would change (nothing is written)
//   npm run catalogue:trial -- --apply      → writes it
//   … -- --workspace=<clientId>             → another store (default: maharaja)
//   … -- --mock                             → runs on the local mock store (for tests)
//
// 1. Live Try-On: up to 8 western-cut garments per audience (shirts, tops, gowns, trousers, kids' shirts…),
//    spread across categories, newest first. Every other garment is switched off for Live Try-On.
// 2. AI Video: up to 8 premium pieces per audience from the categories Image Try-On handles well,
//    each with a premium price (₹3,000+, ending in 99). Pieces already on AI Video with a price stay.
// 3. AI Video's category list becomes exactly the categories that end up with pieces.
// 4. A garment filed under another audience's category (a Men shirt in Women · Jeans & Bottoms) moves to
//    its own audience's category of the same kind.
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const mock = args.includes('--mock');
const clientId = (args.find((arg) => arg.startsWith('--workspace=')) || '--workspace=maharaja').split('=')[1];

if (mock) {
  for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) delete process.env[key];
  process.env.ALLOW_MOCK_BACKEND = 'true';
} else {
  for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
    if (!process.env[key]) throw new Error(`${key} is required (run with --env-file=.env.local, or pass --mock).`);
  }
}

const server = await import('../src/lib/maharaja/server.ts');
const catalogue = await import('../src/lib/maharaja/catalogue.ts');
const categories = await import('../src/lib/tryfocus/store-categories.ts');
const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');

const AUDIENCES = ['women', 'men', 'boys', 'girls'];
const LIVE_PER_AUDIENCE = 8;
const VIDEO_PER_AUDIENCE = 8;
const VIDEO_PER_CATEGORY = 4;

/** AI Video categories, most premium first, per audience. Only these are used for the trial. */
const VIDEO_CATEGORIES = {
  women: ['sarees', 'lehengas', 'women-occasion', 'gowns', 'anarkali', 'half-sarees', 'salwar-suits'],
  men: ['sherwanis', 'men-occasion', 'kurta', 'blazers', 'formal-shirts', 'casual-shirts'],
  boys: ['boys-sherwani', 'boys-festive', 'boys-kurta', 'boys-silk-shirt', 'boys-party', 'boys-jacket', 'boys-shirt-trouser'],
  girls: ['girls-lehenga', 'girls-festive', 'girls-pavadai', 'girls-gown', 'girls-party', 'girls-frock', 'girls-anarkali'],
};
/** Bridal and occasion wear sits higher. */
const HIGH_END = new Set(['sarees', 'lehengas', 'women-occasion', 'sherwanis', 'men-occasion', 'boys-sherwani', 'girls-lehenga']);

/** The same SKU always gets the same price, so the preview and --apply agree. */
function priceFor(sku, categoryId) {
  let hash = 2166136261;
  for (const char of sku) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const [low, high] = HIGH_END.has(categoryId) ? [8000, 25000] : [3000, 12000];
  const hundreds = Math.round((low + (hash % (high - low + 1))) / 100);
  return hundreds * 100 - 1;
}

/** Takes up to `limit` items, one category at a time in turn, so no category crowds out the rest. */
function roundRobin(groups, limit, perGroup = Infinity) {
  const picked = [];
  const queues = groups.map((items) => items.slice(0, perGroup));
  while (picked.length < limit && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      if (picked.length >= limit) break;
      const next = queue.shift();
      if (next) picked.push(next);
    }
  }
  return picked;
}

const newestFirst = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || (a.sortOrder || 0) - (b.sortOrder || 0);
const rupees = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

await runWithClient(clientId, async () => {
  const workspace = await server.getMaharajaWorkspace();
  const custom = workspace.customCategories || [];
  const records = (await catalogue.loadAllCatalogueRecords(false)).filter((item) => item.active !== false);
  const label = (id) => categories.findCategory(id, custom)?.label || id;
  console.log(`${workspace.clientName || clientId}: ${records.length} garments showing.${apply ? '' : ' Preview only — nothing is written. Add --apply to save.'}\n`);

  // 4. Wrong audience first, so the picks below see each garment in its right place.
  const moves = [];
  for (const item of records) {
    const cat = categories.findCategory(item.category, custom);
    if (!cat || cat.gender === item.gender) continue;
    const target = categories.allCategoriesFor(item.gender, custom).find((other) => other.garmentType === cat.garmentType);
    moves.push({ item, from: cat, to: target });
    if (target) item.category = target.id;
  }

  // 1. Live Try-On.
  const liveOn = new Set();
  for (const audience of AUDIENCES) {
    const western = categories.allCategoriesFor(audience, custom).filter((cat) => categories.isWesternCategory(cat.id, custom));
    const groups = western.map((cat) => records.filter((item) => item.gender === audience && item.category === cat.id).sort(newestFirst));
    for (const item of roundRobin(groups, LIVE_PER_AUDIENCE)) liveOn.add(item.sku);
  }
  const liveSwitchOn = records.filter((item) => liveOn.has(item.sku) && item.eligibleForLive !== true);
  const liveSwitchOff = records.filter((item) => !liveOn.has(item.sku) && item.eligibleForLive === true);

  // 2. AI Video.
  const videoPicks = [];
  const videoLists = {};
  for (const audience of AUDIENCES) {
    const order = VIDEO_CATEGORIES[audience];
    const kept = records.filter((item) => item.gender === audience && item.eligibleForVideo && item.price > 0 && order.includes(item.category));
    const groups = order.map((id) => records
      .filter((item) => item.gender === audience && item.category === id && !kept.includes(item))
      .sort(newestFirst)
      .slice(0, Math.max(0, VIDEO_PER_CATEGORY - kept.filter((k) => k.category === id).length)));
    // Pieces already priced never use up the quota, so an audience with many sarees still gets gowns or shirts.
    const added = roundRobin(groups, VIDEO_PER_AUDIENCE);
    for (const item of added) videoPicks.push({ item, price: item.price >= 3000 ? item.price : priceFor(item.sku, item.category) });
    const finalCats = new Set([...kept, ...added].map((item) => item.category));
    videoLists[audience] = order.filter((id) => finalCats.has(id));
  }
  // Pieces on AI Video outside the trial categories, or without a price, come off (customers only see priced pieces).
  const videoOff = records.filter((item) => item.eligibleForVideo && !(item.price > 0 && VIDEO_CATEGORIES[item.gender]?.includes(item.category)));

  // The preview.
  for (const audience of AUDIENCES) {
    const live = records.filter((item) => item.gender === audience && liveOn.has(item.sku));
    console.log(`${audience.toUpperCase()}`);
    console.log(`  Live Try-On (${live.length}): ${live.map((item) => `${item.title} [${label(item.category)}]`).join(' · ') || 'none — no western-cut garments'}`);
    const kept = records.filter((item) => item.gender === audience && item.eligibleForVideo && item.price > 0 && VIDEO_CATEGORIES[audience].includes(item.category));
    const added = videoPicks.filter((pick) => pick.item.gender === audience);
    console.log(`  AI Video (${kept.length + added.length}): ${[
      ...kept.map((item) => `${item.title} [${label(item.category)}] ${rupees(item.price)} (already)`),
      ...added.map((pick) => `${pick.item.title} [${label(pick.item.category)}] ${rupees(pick.price)}`),
    ].join(' · ') || 'none — no garments in the AI Video categories'}`);
    console.log(`  AI Video categories: ${videoLists[audience].map(label).join(', ') || 'none'}\n`);
  }
  console.log(`Changes: ${liveSwitchOn.length} on Live Try-On, ${liveSwitchOff.length} off Live Try-On, ${videoPicks.length} added to AI Video, ${videoOff.length} off AI Video, ${moves.filter((move) => move.to).length} moved to their own audience.`);
  for (const move of moves) console.log(`  Move: ${move.item.title} (${move.item.gender}) ${move.from.label} → ${move.to ? move.to.label : 'no matching category, left as is'}`);

  if (!apply) return;

  for (const move of moves) if (move.to) await catalogue.updateCatalogueProduct(move.item.sku, { category: move.to.id, gender: move.item.gender });
  if (liveSwitchOn.length) await catalogue.bulkUpdateCatalogueFlags(liveSwitchOn.map((item) => item.sku), { eligibleForLive: true });
  if (liveSwitchOff.length) await catalogue.bulkUpdateCatalogueFlags(liveSwitchOff.map((item) => item.sku), { eligibleForLive: false });
  if (videoOff.length) await catalogue.bulkUpdateCatalogueFlags(videoOff.map((item) => item.sku), { eligibleForVideo: false });
  for (const pick of videoPicks) await catalogue.updateCatalogueProduct(pick.item.sku, { price: pick.price, eligibleForVideo: true });
  await server.updateMaharajaSettings({ videoCategoryLists: videoLists }, clientId);
  await server.logMaharajaActivity('campaign', `Trial catalogue prepared: ${liveOn.size} on Live Try-On, ${videoPicks.length} added to AI Video`, { live: liveOn.size, video: videoPicks.length }).catch(() => undefined);
  console.log('\nSaved.');
});

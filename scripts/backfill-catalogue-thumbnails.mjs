// Makes the small grid previews for garments saved before thumbnails existed.
// Run once against production: npm run catalogue:thumbnails
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_STORAGE_BUCKET']) {
  if (!process.env[key]) throw new Error(`${key} is required (run with --env-file=.env.local).`);
}

const server = await import('../src/lib/maharaja/server.ts');
const catalogue = await import('../src/lib/maharaja/catalogue.ts');
const { runWithClient } = await import('../src/lib/maharaja/client-context.ts');

let made = 0;
let skipped = 0;
for (const workspace of await server.listClientWorkspaces()) {
  await runWithClient(workspace.clientId, async () => {
    for (let offset = 0; ; offset += 100) {
      const { products, total } = await catalogue.listCatalogueProducts(offset, 100, { includeInactive: true });
      for (const product of products) {
        // A product without its own preview reports the full photo as its thumbnail.
        if (product.thumbnailUrl && product.thumbnailUrl !== product.imageUrl) { skipped += 1; continue; }
        const saved = await catalogue.updateCatalogueProduct(product.sku, {}).catch((error) => {
          console.warn(`${workspace.clientId} ${product.sku}: ${error.message}`);
          return null;
        });
        if (saved && saved.thumbnailUrl !== saved.imageUrl) made += 1;
        else skipped += 1;
      }
      if (offset + 100 >= total) break;
    }
  });
}
console.log(`Thumbnails made: ${made}. Already had one or not in storage: ${skipped}.`);

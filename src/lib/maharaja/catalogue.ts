import 'server-only';

import { getDb, getSignedPlaybackUrl } from '@/lib/firebase/admin';
import { MAHARAJA_CLIENT_ID } from './config';
import type { MaharajaCatalogueProduct, PublicCatalogueProduct } from './catalogue-types';

const collectionPath = `clientWorkspaces/${MAHARAJA_CLIENT_ID}/catalogueProducts`;

export async function listCatalogueProducts(): Promise<PublicCatalogueProduct[]> {
  const db = getDb();
  if (!db) return [];
  const snapshot = await db.collection(collectionPath).where('active', '==', true).get();
  const products = snapshot.docs
    .map((doc) => doc.data() as MaharajaCatalogueProduct)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  return Promise.all(products.map(async ({ storagePath: _storagePath, ...product }) => ({
    ...product,
    imageUrl: await getSignedPlaybackUrl(_storagePath),
  })));
}

export async function getCatalogueProduct(sku: string): Promise<MaharajaCatalogueProduct | null> {
  const db = getDb();
  if (!db || !sku) return null;
  const snapshot = await db.collection(collectionPath).doc(sku).get();
  if (!snapshot.exists) return null;
  const product = snapshot.data() as MaharajaCatalogueProduct;
  return product.active ? product : null;
}

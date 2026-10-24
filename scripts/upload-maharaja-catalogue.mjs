import fs from 'node:fs/promises';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const sourceDir = process.argv[2] || '/Users/shanupraveen/Downloads/silk_sarees_collages';
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
if (!projectId || !clientEmail || !privateKey || !storageBucket) throw new Error('Firebase Admin environment variables are required.');

const app = getApps()[0] || initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const summary = JSON.parse(await fs.readFile(path.join(sourceDir, 'summary.json'), 'utf8'));

for (const item of summary) {
  const sku = String(item.sku || '').trim();
  if (!sku) throw new Error(`Missing SKU for catalogue item ${item.number}`);
  const localPath = path.join(sourceDir, item.collageFilename);
  const storagePath = `clients/maharaja/catalogue/silk-sarees/${sku}/reference.jpg`;
  await bucket.upload(localPath, {
    destination: storagePath,
    resumable: false,
    metadata: { contentType: 'image/jpeg', cacheControl: 'public,max-age=86400' },
  });
  const price = Number(String(item.price || '').replace(/[^0-9.]/g, ''));
  const now = new Date().toISOString();
  await db.collection('clientWorkspaces/maharaja/catalogueProducts').doc(sku).set({
    sku,
    title: String(item.title || '').trim(),
    price,
    storagePath,
    productUrl: String(item.productUrl || ''),
    active: true,
    sortOrder: Number(item.number || 0),
    updatedAt: now,
    createdAt: now,
  }, { merge: true });
  process.stdout.write(`Uploaded ${sku}\n`);
}

process.stdout.write(`Catalogue upload complete: ${summary.length} products.\n`);

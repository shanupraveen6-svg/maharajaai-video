import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';


const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
  privateKey = privateKey.slice(1, -1);
}
privateKey = privateKey.replace(/\\n/g, '\n');
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket,
  });
}

const db = getFirestore();
const bucket = getStorage().bucket();

async function check() {
  console.log('--- RECENT VIDEOS IN FIRESTORE ---');
  const videosSnap = await db.collection('videos').orderBy('createdAt', 'desc').limit(15).get();
  videosSnap.docs.forEach((doc, idx) => {
    const d = doc.data();
    console.log(`[${idx}] id: ${doc.id}, sessionId: ${d.sessionId}, createdAt: ${d.createdAt}, status: ${d.status}, storagePath: ${d.storagePath || d.liveStoragePath}, customerName: ${d.customerName}`);
  });

  console.log('\n--- LIVE QUEUE ITEMS ---');
  const queueSnap = await db.collection('liveQueue').orderBy('createdAt', 'desc').limit(10).get();
  queueSnap.docs.forEach((doc, idx) => {
    const d = doc.data();
    console.log(`[${idx}] id: ${doc.id}, videoId: ${d.videoId}, status: ${d.status}, createdAt: ${d.createdAt}, startedAt: ${d.startedAt}, completedAt: ${d.completedAt}, customerName: ${d.customerName}`);
  });

  console.log('\n--- STORAGE FILES UNDER sessions/ ---');
  const [files] = await bucket.getFiles({ prefix: 'clients/maharaja/sessions/' });
  const videoFiles = files.filter(f => f.name.endsWith('.mp4'));
  console.log(`Found ${videoFiles.length} video files in clients/maharaja/sessions/:`);
  videoFiles.slice(-10).forEach(f => {
    console.log(`  ${f.name} (created: ${f.metadata.timeCreated})`);
  });

  const [rootSessionsFiles] = await bucket.getFiles({ prefix: 'sessions/' });
  const rootVideoFiles = rootSessionsFiles.filter(f => f.name.endsWith('.mp4'));
  console.log(`Found ${rootVideoFiles.length} video files in sessions/:`);
  rootVideoFiles.forEach(f => {
    console.log(`  ${f.name} (created: ${f.metadata.timeCreated})`);
  });
}

check().catch(console.error);

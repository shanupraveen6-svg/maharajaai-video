import fs from 'fs';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const root = process.cwd();
const serviceAccountPath = path.join(root, 'maharaja-799bb-firebase-adminsdk-fbsvc-5a37832166.json');
const bucketName = 'maharaja-799bb.firebasestorage.app';

const files = [
  'gemini_generated_video_24beb20e.mp4',
  'gemini_generated_video_90da8075.mp4',
  'gemini_generated_video_216dd83b.mp4',
  'gemini_generated_video_417e8421.mp4',
  'gemini_generated_video_9038ee79.mp4',
  'gemini_generated_video_9915f017.mp4',
  'gemini_generated_video_a0cf7a17.mp4',
];

function replayIdFromFile(fileName) {
  return `seed_${fileName.replace(/^gemini_generated_video_/, '').replace(/\.mp4$/i, '')}`;
}

async function main() {
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Missing Firebase service account: ${serviceAccountPath}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: bucketName,
    });
  }

  const bucket = getStorage().bucket(bucketName);
  const db = getFirestore();
  const uploaded = [];

  for (const [index, fileName] of files.entries()) {
    const localPath = path.join('/Users/shanupraveen/Downloads', fileName);
    if (!fs.existsSync(localPath)) {
      throw new Error(`Missing local replay video: ${localPath}`);
    }

    const replaySessionId = replayIdFromFile(fileName);
    const videoId = `video_${replaySessionId}`;
    const storagePath = `sessions/${replaySessionId}/video/final.mp4`;

    await bucket.upload(localPath, {
      destination: storagePath,
      metadata: {
        contentType: 'video/mp4',
        cacheControl: 'public, max-age=3600',
        metadata: {
          seededReplay: 'true',
          originalFileName: fileName,
        },
      },
    });

    const createdAt = new Date(Date.now() + index * 1000).toISOString();
    await db.collection('videos').doc(videoId).set({
      id: videoId,
      sessionId: replaySessionId,
      storagePath,
      status: 'ready',
      source: 'seeded-tv-replay',
      originalFileName: fileName,
      createdAt,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    uploaded.push({ videoId, replaySessionId, storagePath, fileName });
    console.log(`Uploaded ${fileName} -> ${storagePath}`);
  }

  console.log(JSON.stringify({ success: true, count: uploaded.length, uploaded }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

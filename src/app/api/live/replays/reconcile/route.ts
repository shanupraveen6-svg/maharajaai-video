import { NextRequest, NextResponse } from 'next/server';
import { getDb, getStorageBucket } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCandidate(path: string, contentType: string) {
  if (!(contentType.startsWith('video/') || /\.mp4$/i.test(path))) return false;
  if (path.includes('/video-tests/') || path.includes('/input-')) return false;
  return !path.includes('/') || /\/video\/(final-6s|live-9s)\.mp4$/i.test(path);
}

export async function GET(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Operator access is required.' }, { status: 401 });
  }
  const db = getDb();
  const bucket = getStorageBucket();
  if (!db || !bucket) return NextResponse.json({ success: false, error: 'Production Firebase is unavailable.' }, { status: 503 });

  const [files, existing] = await Promise.all([bucket.getFiles(), db.collection('videos').get()]);
  const known = new Set<string>();
  existing.docs.forEach((doc) => {
    const value = doc.data();
    if (value.storagePath) known.add(String(value.storagePath));
    if (value.liveStoragePath) known.add(String(value.liveStoragePath));
  });
  const candidates = files[0]
    .filter((file: any) => isCandidate(file.name, String(file.metadata?.contentType || '')) && !known.has(file.name))
    .map((file: any) => ({
      storagePath: file.name,
      contentType: file.metadata?.contentType || 'video/mp4',
      createdAt: file.metadata?.timeCreated || file.metadata?.updated || null,
      size: Number(file.metadata?.size || 0),
      action: 'Review then import explicitly; this endpoint never publishes media automatically.',
    }));
  return NextResponse.json({ success: true, candidates, scannedAt: new Date().toISOString() });
}

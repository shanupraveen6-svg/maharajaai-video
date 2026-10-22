import { NextRequest, NextResponse } from 'next/server';
import { getDb, getStorageBucket } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { logMaharajaActivity } from '@/lib/maharaja/server';
import { createHash } from 'crypto';

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

export async function POST(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Operator access is required.' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const storagePath = typeof body?.storagePath === 'string' ? body.storagePath.trim() : '';
  if (!storagePath) return NextResponse.json({ success: false, error: 'storagePath is required.' }, { status: 400 });
  const db = getDb();
  const bucket = getStorageBucket();
  if (!db || !bucket) return NextResponse.json({ success: false, error: 'Production Firebase is unavailable.' }, { status: 503 });
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) return NextResponse.json({ success: false, error: 'The selected storage video no longer exists.' }, { status: 404 });
  const [metadata] = await file.getMetadata();
  const contentType = String(metadata.contentType || '');
  if (!isCandidate(storagePath, contentType)) {
    return NextResponse.json({ success: false, error: 'Only a final customer or root showcase MP4 can be imported.' }, { status: 400 });
  }
  const id = `imported_${createHash('sha256').update(storagePath).digest('hex').slice(0, 28)}`;
  const sessionId = storagePath.match(/sessions\/([^/]+)\//)?.[1] || `stored_${id.slice(-12)}`;
  const isLiveAsset = /\/video\/live-9s\.mp4$/i.test(storagePath);
  await db.collection('videos').doc(id).set({
    id, sessionId, storagePath, ...(isLiveAsset ? { liveStoragePath: storagePath } : {}),
    status: 'ready', published: body?.publish === true, replayEnabled: body?.publish === true,
    isRepairedStorageRecord: true, displayName: 'Maharaja Stored Video', contentType: contentType || 'video/mp4',
    playbackMode: 'embedded', hasEmbeddedAudio: true,
    createdAt: metadata.timeCreated || new Date().toISOString(), repairedAt: new Date().toISOString(),
  }, { merge: true });
  await logMaharajaActivity('video', `Storage video imported${body?.publish === true ? ' to TV replay' : ' for review'}`, { storagePath, videoId: id, stage: 'storage-repair' });
  return NextResponse.json({ success: true, videoId: id, published: body?.publish === true });
}

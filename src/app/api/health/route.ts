import { NextRequest, NextResponse } from 'next/server';
import { getBackendMode, getDb, getStorageBucket, isRealFirebaseAvailable } from '@/lib/firebase/admin';
import { isSupportedVideoPath } from '@/lib/maharaja/video-playback';
import { AI_CONFIG } from '@/lib/ai/config';
import { getGenlookCredits } from '@/lib/maharaja/genlook-provider';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const checkedAt = new Date().toISOString();
  const db = getDb();
  const bucket = getStorageBucket();

  if (!isRealFirebaseAvailable() || !db || !bucket) {
    return NextResponse.json({
      success: false,
      status: 'degraded',
      backend: getBackendMode(),
      firebase: false,
      storage: false,
      checkedAt,
    }, { status: 503 });
  }

  try {
    const includeMedia = req.nextUrl.searchParams.get('media') === '1';
    const [, , storedFilesResult] = await Promise.all([
      db.collection('appControl').doc('health').get(),
      bucket.getMetadata(),
      includeMedia ? bucket.getFiles({ prefix: '' }) : Promise.resolve([[]]),
    ]);
    const storedFiles = storedFilesResult[0] || [];
    const storedVideoCount = includeMedia
      ? storedFiles.filter((file: any) => {
          const path = String(file.name || '');
          const contentType = String(file.metadata?.contentType || '');
          return isSupportedVideoPath(path) || contentType.startsWith('video/');
        }).length
      : undefined;
    // The Try-On engine's key: ok, invalid or missing (never the balance, which is admin-only).
    const genlookKey = AI_CONFIG.GENLOOK_API_KEY;
    const genlook = !genlookKey ? 'missing' : (await getGenlookCredits(genlookKey)).ok ? 'ok' : 'invalid';
    return NextResponse.json({
      success: true,
      status: 'healthy',
      genlook,
      backend: getBackendMode(),
      firebase: true,
      storage: true,
      ...(includeMedia ? { storedVideoCount, tvPlayableVideoCount: storedVideoCount } : {}),
      checkedAt,
    });
  } catch (error) {
    console.error('Production health check failed:', error);
    return NextResponse.json({
      success: false,
      status: 'degraded',
      backend: getBackendMode(),
      firebase: Boolean(db),
      storage: Boolean(bucket),
      checkedAt,
    }, { status: 503 });
  }
}

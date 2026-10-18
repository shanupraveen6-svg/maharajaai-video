import { NextResponse } from 'next/server';
import { getBackendMode, getDb, getStorageBucket, isRealFirebaseAvailable } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
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
    await Promise.all([
      db.collection('appControl').doc('health').get(),
      bucket.getMetadata(),
    ]);
    return NextResponse.json({
      success: true,
      status: 'healthy',
      backend: getBackendMode(),
      firebase: true,
      storage: true,
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

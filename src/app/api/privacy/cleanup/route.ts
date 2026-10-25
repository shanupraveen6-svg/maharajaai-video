import { NextRequest, NextResponse } from 'next/server';
import { getDb, getStorageBucket } from '@/lib/firebase/admin';
import { cleanupExpiredSessions } from '@/lib/maharaja/privacy-cleanup';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }
  const db = getDb();
  const bucket = getStorageBucket();
  if (!db || !bucket) {
    return NextResponse.json({ success: false, error: 'Production Firebase is not configured.' }, { status: 503 });
  }
  const result = await cleanupExpiredSessions(db, bucket);
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

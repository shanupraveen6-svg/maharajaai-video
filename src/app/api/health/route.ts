import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getApp } from 'firebase-admin/app';
import { getBackendMode, getDb, getStorageBucket, isRealFirebaseAvailable } from '@/lib/firebase/admin';
import { isSupportedVideoPath } from '@/lib/maharaja/video-playback';
import { AI_CONFIG } from '@/lib/ai/config';
import { getGenlookCredits } from '@/lib/maharaja/genlook-provider';

export const dynamic = 'force-dynamic';

type EngineStatus = 'ok' | 'invalid' | 'missing' | 'unverified';

/**
 * fal's token-mint endpoint, not a generation: this is the same call /api/fal/realtime-token makes
 * before every Live Try-On session, and it is free whether or not the token is ever used. A 401 here
 * means the key itself is wrong; any other failure (network, fal being down) reads as 'unverified'
 * rather than 'invalid', so a passing outage never looks like a bad key.
 */
async function checkFal(): Promise<EngineStatus> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) return 'missing';
  try {
    const response = await fetch('https://rest.fal.ai/tokens/', {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed_apps: ['lucy2-vton'], token_expiration: 1 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 401 || response.status === 403) return 'invalid';
    return response.ok ? 'ok' : 'unverified';
  } catch {
    return 'unverified';
  }
}

/**
 * ai.models.get() reads a model's metadata; it does not generate anything and is not billed, so this
 * confirms the Gemini key and project are reachable without spending a token or using the free-tier
 * image quota that a real generation would need.
 */
async function checkGemini(): Promise<EngineStatus> {
  const key = AI_CONFIG.PRIMARY_API_KEY;
  if (!key) return 'missing';
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    await ai.models.get({ model: AI_CONFIG.GEMINI_IMAGE_MODEL });
    return 'ok';
  } catch (error: any) {
    const status = Number(error?.status || error?.code || 0);
    if (status === 401 || status === 403) return 'invalid';
    return 'unverified';
  }
}

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

  // `?latency=1`: where the server runs, where storage lives, and the round-trip time from the server to the
  // database, storage and each AI service (milliseconds). For choosing the server region; no data is returned.
  if (req.nextUrl.searchParams.get('latency') === '1') {
    const time = async (task: () => Promise<unknown>) => { const started = Date.now(); await task().catch(() => undefined); return Date.now() - started; };
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    await db.collection('appControl').doc('health').get().catch(() => undefined);
    const firestoreReads: number[] = [];
    for (let i = 0; i < 5; i += 1) firestoreReads.push(await time(() => db.collection('appControl').doc('health').get()));
    const [meta] = await bucket.getMetadata().catch(() => [{} as Record<string, unknown>]);
    const storageReads: number[] = [];
    for (let i = 0; i < 3; i += 1) storageReads.push(await time(() => bucket.getMetadata()));
    const genlookKey = AI_CONFIG.GENLOOK_API_KEY;
    // The database's own location (Firestore's databases.get), read with the server's service account.
    let databaseLocation = 'unknown';
    try {
      const token = await getApp().options.credential?.getAccessToken();
      const projectId = process.env.FIREBASE_PROJECT_ID;
      if (token?.access_token && projectId) {
        const info = await (await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(8_000) })).json();
        if (typeof info?.locationId === 'string') databaseLocation = info.locationId;
      }
    } catch {
      // stays unknown
    }
    return NextResponse.json({
      success: true,
      serverRegion: process.env.VERCEL_REGION || 'unknown',
      databaseLocation,
      storageLocation: String((meta as { location?: string }).location || 'unknown'),
      storageLocationType: String((meta as { locationType?: string }).locationType || 'unknown'),
      firestoreReadMs: median(firestoreReads),
      storageCallMs: median(storageReads),
      genlookMs: genlookKey ? await time(() => getGenlookCredits(genlookKey)) : null,
      geminiMs: await time(() => checkGemini()),
      falMs: await time(() => checkFal()),
      checkedAt,
    }, { headers: { 'Cache-Control': 'no-store' } });
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
    const genlook: EngineStatus = !genlookKey ? 'missing' : (await getGenlookCredits(genlookKey)).ok ? 'ok' : 'invalid';
    // fal and Gemini are checked live, for free, the same way.
    const [fal, gemini] = await Promise.all([checkFal(), checkGemini()]);
    return NextResponse.json({
      success: true,
      status: 'healthy',
      genlook,
      fal,
      gemini,
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

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getStorageBucket } from '@/lib/firebase/admin';
import { getGenlookCredits } from '@/lib/maharaja/genlook-provider';
import { falStatus } from '@/lib/maharaja/fal-status';
import { loadAllCatalogueRecords } from '@/lib/maharaja/catalogue';
import { readCataloguePhoto } from '@/lib/maharaja/photo-source';
import { garmentPhotoSizes, MIN_GARMENT_LONG_SIDE } from '@/lib/maharaja/garment-warm';
import { liveScreenId, runWithClient } from '@/lib/maharaja/client-context';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { spendToday } from '@/lib/maharaja/usage-ledger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Check = { id: string; name: string; ok: boolean; ms: number; note: string };

async function run(id: string, name: string, task: () => Promise<string>): Promise<Check> {
  const started = Date.now();
  try {
    return { id, name, ok: true, ms: Date.now() - started, note: await task() };
  } catch (error) {
    return { id, name, ok: false, ms: Date.now() - started, note: error instanceof Error ? error.message.slice(0, 160) : 'Failed' };
  }
}

/**
 * TryFocus admin → Live check: every service a customer's look depends on, checked on the live server in a
 * few seconds — the database, storage, a real store garment photo, Gemini (a real garment check on a bundled
 * photo, about ₹0.2), GenLook and fal. What the local tests cannot see (they run on stand-in data).
 */
export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) return NextResponse.json({ success: false, error: 'Please sign in to TryFocus admin.' }, { status: 401 });
  const checks = await Promise.all([
    run('database', 'Database (Firestore)', async () => {
      const db = getDb();
      if (!db) throw new Error('Not connected');
      await db.collection('appControl').doc('health').get();
      return 'Reading';
    }),
    run('storage', 'File storage', async () => {
      const bucket = getStorageBucket();
      if (!bucket) throw new Error('Not connected');
      await bucket.getMetadata();
      return 'Reachable';
    }),
    run('garment-photo', 'Store garment photo', async () => {
      const product = (await loadAllCatalogueRecords(false)).find((item) => item.storagePath);
      if (!product) throw new Error('No garments in the catalogue');
      const bytes = (await readCataloguePhoto(product.garmentReferencePath || product.storagePath)).length;
      if (!bytes) throw new Error(`${product.title}: photo is empty`);
      return `${product.title} reads`;
    }),
    run('gemini', 'Gemini (garment check)', async () => {
      const key = AI_CONFIG.PRIMARY_API_KEY?.trim();
      if (!key) throw new Error('No key');
      const sample = await fs.readdir(path.join(process.cwd(), 'public', 'images', 'maharaja-collection')).then((names) => names.find((name) => name.startsWith('women-lehengas')));
      if (!sample) throw new Error('Sample photo missing');
      const image = (await sharp(path.join(process.cwd(), 'public', 'images', 'maharaja-collection', sample)).resize(512, 512, { fit: 'inside' }).jpeg().toBuffer()).toString('base64');
      const response = await new GoogleGenAI({ apiKey: key }).models.generateContent({
        model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
        contents: [{ inlineData: { mimeType: 'image/jpeg', data: image } }, 'Name the garment in this photo in one or two words.'],
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, abortSignal: AbortSignal.timeout(15_000) },
      });
      const answer = (response.text || '').trim();
      if (!answer) throw new Error('No answer');
      return `Saw: ${answer.slice(0, 40)}`;
    }),
    run('genlook', 'GenLook (Try-On)', async () => {
      const key = AI_CONFIG.GENLOOK_API_KEY?.trim();
      if (!key) throw new Error('No key');
      const result = await getGenlookCredits(key);
      if (!result.ok) throw new Error(result.error);
      if (result.creditBalance < 2) throw new Error(`Only ${result.creditBalance} credits left — top up GenLook`);
      return `${result.creditBalance.toLocaleString('en-IN')} credits`;
    }),
    run('photo-quality', 'Garment photo quality (Maharaja)', async () => {
      const sizes = Object.values(await runWithClient(MAHARAJA_CLIENT_ID, () => garmentPhotoSizes()));
      if (!sizes.length) return 'Not measured yet (measured in the background)';
      const soft = sizes.filter((px) => px < MIN_GARMENT_LONG_SIDE).length;
      if (soft) throw new Error(`${soft} of ${sizes.length} photos under ${MIN_GARMENT_LONG_SIDE} px — Try-On on them looks soft`);
      return `All ${sizes.length} photos ${MIN_GARMENT_LONG_SIDE} px or larger`;
    }),
    run('go-live-index', 'Go Live queue (database index)', async () => {
      const db = getDb();
      if (!db) throw new Error('Not connected');
      // The same filtered, ordered read the Go Live player makes; without its index Firestore refuses it.
      await runWithClient(MAHARAJA_CLIENT_ID, () => db.collection('liveQueue')
        .where('screenId', '==', liveScreenId()).where('status', '==', 'queued').orderBy('createdAt').limit(1).get());
      return 'Index in place';
    }),
    run('cleanup', 'Privacy cleanup (expired photos and videos)', async () => {
      const db = getDb();
      if (!db) throw new Error('Not connected');
      const last = Number((await db.doc('appControl/privacy-sweep').get()).data()?.lastRunAtMs || 0);
      if (!last) return 'Not run yet (starts with store traffic)';
      const hours = (Date.now() - last) / 3_600_000;
      if (hours > 24) throw new Error(`Last ran ${Math.round(hours)} hours ago — check the Vercel cron and store traffic`);
      return hours < 1 ? `Ran ${Math.max(1, Math.round(hours * 60))} min ago` : `Ran ${Math.round(hours)} h ago`;
    }),
    run('spend-cap', 'Daily AI safety stop', async () => {
      const today = await runWithClient(MAHARAJA_CLIENT_ID, () => spendToday());
      if (!today.caps.platform) return 'Switched off (AI_DAILY_CAP_PLATFORM_USD=0)';
      const used = Math.round((today.platformUsd / today.caps.platform) * 100);
      if (used >= 100) throw new Error('Reached for today — AI calls are paused until midnight; raise AI_DAILY_CAP_PLATFORM_USD if this is real use');
      return `${used}% of today's limit used`;
    }),
    run('fal', 'fal (AI Video, Live Try-On)', async () => {
      const status = await falStatus(true);
      if (status === 'no-balance') throw new Error('Out of balance — top up at fal.ai/dashboard/billing');
      if (status === 'invalid') throw new Error('Key refused');
      if (status === 'missing') throw new Error('No key');
      if (status === 'unverified') throw new Error('Could not reach fal');
      return 'Ready';
    }),
  ]);
  return NextResponse.json({ success: true, checks, server: process.env.VERCEL_REGION || 'local', checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}

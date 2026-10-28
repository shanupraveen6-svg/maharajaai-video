import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIFETIME_MS = 15 * 60 * 1000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

type IncomingLook = { sku: string; title: string; image: string };

function decodeImage(image: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match) throw new Error('A generated image is missing or invalid.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('A generated image exceeds the 3 MB handoff limit.');
  const validJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const validPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const validWebp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!(validJpeg || validPng || validWebp)) throw new Error('A generated image could not be verified.');
  return { bytes, contentType: validPng ? 'image/png' : validWebp ? 'image/webp' : 'image/jpeg' };
}

export async function POST(req: NextRequest) {
  try {
    const rate = await enforceRateLimit(req, 'tv-tryon-handoff', 6, 10 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: 'Too many handoffs. Please wait before trying again.' }, { status: 429 });
    const body = await req.json();
    if (!Array.isArray(body.looks) || body.looks.length < 1 || body.looks.length > 5) {
      return NextResponse.json({ error: 'Select one to five completed looks.' }, { status: 400 });
    }
    const looks = (body.looks as IncomingLook[]).map((look) => ({
      sku: String(look.sku || '').slice(0, 60),
      title: String(look.title || '').slice(0, 120),
      ...decodeImage(look.image),
    }));
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAtMs = Date.now() + LIFETIME_MS;
    const db = getDb();
    const bucket = getStorageBucket();
    if (db && bucket) {
      const paths = looks.map((_, index) => `clients/maharaja/tryon-handoffs/${token}/${index}`);
      try {
        await Promise.all(looks.map((look, index) => bucket.file(paths[index]).save(look.bytes, {
          contentType: look.contentType,
          public: false,
          metadata: { cacheControl: 'private, no-store' },
        })));
        await db.collection('tvTryOnHandoffs').doc(token).set({
          expiresAtMs,
          expiresAt: new Date(expiresAtMs).toISOString(),
          looks: looks.map((look, index) => ({ sku: look.sku, title: look.title, contentType: look.contentType, path: paths[index] })),
        });
      } catch (error) {
        await bucket.deleteFiles({ prefix: `clients/maharaja/tryon-handoffs/${token}/`, force: true }).catch(() => undefined);
        throw error;
      }
    } else if (!db) {
      getMockStore().sessions.set(`tv_handoff_${token}`, { expiresAtMs, looks });
    } else {
      return NextResponse.json({ error: 'Private handoff storage is unavailable.' }, { status: 503 });
    }
    return NextResponse.json({ token, expiresAt: new Date(expiresAtMs).toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create private handoff.' }, { status: 400 });
  }
}

import sharp from 'sharp';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { AI_CONFIG } from '@/lib/ai/config';
import { readPhotoTransfer, savePhotoTransfer } from '@/lib/maharaja/photo-transfer';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { guardRoute } from '@/lib/http/guard';

type Context = { params: Promise<{ token: string }> };
const headers = { 'Cache-Control': 'private, no-store' };

/**
 * Scanner 0 for phone QR uploads: uses Gemini Flash to verify the shopper is standing upright
 * and front-facing (rejecting sitting, crouching, lying down, back-facing, multi-person, or
 * blurry/face-only photos) so poor postures never waste Try-On credits or produce distorted looks.
 */
async function analyzeCustomerPosture(bytes: Buffer): Promise<{ valid: boolean; reason?: string }> {
  const apiKey = AI_CONFIG.PRIMARY_API_KEY?.trim();
  if (!apiKey || bytes.length < 2048) return { valid: true };
  try {
    const resized = await sharp(bytes)
      .rotate()
      .resize(768, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
      contents: [
        { inlineData: { mimeType: 'image/jpeg', data: resized.toString('base64') } },
        'Analyze this customer photo for a virtual clothing try-on kiosk. Check: (1) Is there exactly one main person visible? (2) Is the person STANDING upright and facing generally towards the camera (at least upper body from waist/hips up or full body visible)? Reject if the person is sitting, seated on a chair/sofa/bed/floor, crouching, lying down, bent over, turned away showing their back, only a close-up face/head selfie with no torso, or if the image is too blurry/dark. Return JSON: {"valid": boolean, "posture": "standing"|"sitting"|"other"|"no_person"|"multiple_people"|"face_only"|"unclear", "reason": "short polite instruction for the customer if invalid"}.',
      ],
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: AbortSignal.timeout(12_000),
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    if (parsed?.valid === false) {
      return {
        valid: false,
        reason: String(parsed.reason || 'Please upload a clear front-facing photo where you are standing upright (not sitting).'),
      };
    }
    return { valid: true };
  } catch (error) {
    console.warn('Phone photo posture check skipped:', error instanceof Error ? error.message : error);
    return { valid: true };
  }
}

async function postHandler(req: NextRequest, context: Context) {
  const { token } = await context.params;
  const record = await readPhotoTransfer(token);
  if (!record) return NextResponse.json({ valid: false, reason: 'This upload QR has expired.' }, { status: 404, headers });
  const form = await req.formData();
  const file = form.get('photo');
  if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ valid: false, reason: 'Choose a photo under 2 MB.' }, { status: 400, headers });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return NextResponse.json({ valid: false, reason: 'Please choose a valid JPEG, PNG or WebP photo.' }, { status: 400, headers });
  }
  const check = await analyzeCustomerPosture(bytes);
  return NextResponse.json({ valid: check.valid, reason: check.reason }, { status: 200, headers });
}
async function getHandler(req: NextRequest, context: Context) {
  const { token } = await context.params;
  const record = await readPhotoTransfer(token);
  if (!record) return NextResponse.json({ error: 'This upload QR has expired. Request a new one on the display.' }, { status: 404, headers });
  if (req.headers.get('x-transfer-receiver') !== record.receiver) return NextResponse.json({ status: record.status }, { headers });
  let image = record.image;
  if (record.status === 'ready' && record.path) {
    const bucket = getStorageBucket();
    if (!bucket) return NextResponse.json({ error: 'Private photo storage is unavailable.' }, { status: 503, headers });
    const [bytes] = await bucket.file(record.path).download();
    image = `data:${record.contentType};base64,${bytes.toString('base64')}`;
  }
  return NextResponse.json({ status: record.status, image }, { headers });
}
async function patchHandler(req: NextRequest, context: Context) {
  const { token } = await context.params;
  const record = await readPhotoTransfer(token);
  if (!record) return NextResponse.json({ error: 'This upload QR has expired.' }, { status: 404, headers });
  if (record.status !== 'waiting') return NextResponse.json({ error: 'The photo has already been sent.' }, { status: 409, headers });
  const form = await req.formData();
  const file = form.get('photo');
  if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'Choose a photo under 2 MB.' }, { status: 400, headers });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return NextResponse.json({ error: 'Please choose a valid photo.' }, { status: 400, headers });
  if (form.get('prechecked') !== '1') {
    const check = await analyzeCustomerPosture(bytes);
    if (!check.valid) return NextResponse.json({ error: check.reason }, { status: 422, headers });
  }
  const bucket = getStorageBucket();
  const path = `clients/${record.clientId || 'maharaja'}/photo-transfers/${token}/photo.jpg`;
  if (bucket) {
    await bucket.file(path).save(bytes, { contentType: 'image/jpeg', public: false, metadata: { cacheControl: 'private, no-store' } });
    await savePhotoTransfer(token, { ...record, status: 'ready', path, contentType: 'image/jpeg' });
  } else await savePhotoTransfer(token, { ...record, status: 'ready', image: `data:image/jpeg;base64,${bytes.toString('base64')}` });
  return NextResponse.json({ success: true }, { headers });
}
async function deleteHandler(req: NextRequest, context: Context) {
  const { token } = await context.params;
  const record = await readPhotoTransfer(token);
  if (!record || req.headers.get('x-transfer-receiver') !== record.receiver) return NextResponse.json({ error: 'Transfer not found.' }, { status: 404, headers });
  if (record.path) await getStorageBucket()?.file(record.path).delete({ ignoreNotFound: true });
  const db = getDb();
  if (db) await db.collection('tvPhotoTransfers').doc(token).delete();
  else getMockStore().sessions.delete(`photo_transfer_${token}`);
  return NextResponse.json({ success: true }, { headers });
}

export const GET = guardRoute(getHandler, 'tv/photo-transfer/[token] GET');
export const POST = guardRoute(postHandler, 'tv/photo-transfer/[token] POST');
export const PATCH = guardRoute(patchHandler, 'tv/photo-transfer/[token] PATCH');
export const DELETE = guardRoute(deleteHandler, 'tv/photo-transfer/[token] DELETE');

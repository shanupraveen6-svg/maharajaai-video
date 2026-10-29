import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getStorageBucket } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { catalogueCategories } from '@/lib/tryfocus/sample-data';

export const maxDuration = 60;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const BATCH_PATTERN = /^[a-z0-9-]{12,64}$/i;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function imageType(bytes: Buffer, declared: string) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  const actual = jpeg ? 'image/jpeg' : png ? 'image/png' : webp ? 'image/webp' : '';
  if (!actual || !MIME_TYPES.has(declared) || actual !== declared) throw new Error('Only valid JPEG, PNG or WebP garment photos are accepted.');
  return actual;
}

async function classify(bytes: Buffer, mimeType: string, filename: string) {
  const key = AI_CONFIG.PRIMARY_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!key) return { category: null, confidence: 0, note: 'Gemini is not configured. Choose a category manually.' };
  const choices = catalogueCategories.map((item) => `${item.id}: ${item.audience} ${item.label}`).join('\n');
  const ai = new GoogleGenAI({ apiKey: key });
  try {
    const result = await ai.models.generateContent({
      model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
      contents: [
        { inlineData: { mimeType, data: bytes.toString('base64') } },
        `Classify the garment in this retail product photo. Filename: ${filename}. Choose exactly one category from:\n${choices}\nIf the garment is not clearly in one of these South Indian categories, set category to null. Do not invent product price, fabric, SKU or age. Return JSON only: {"category": string|null, "confidence": number, "note": string}. Confidence is 0 to 1.`,
      ],
      config: { responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse(result.text || '{}');
    const category = catalogueCategories.find((item) => item.id === parsed.category)?.id || null;
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    return { category: confidence >= 0.7 ? category : null, confidence, note: String(parsed.note || '').slice(0, 180) };
  } catch {
    return { category: null, confidence: 0, note: 'AI analysis failed. Retry or choose a category manually.' };
  }
}

export async function POST(req: NextRequest) {
  if (!verifyOperatorRequest(req)) return NextResponse.json({ error: 'Operator sign-in required.' }, { status: 401 });
  try {
    const bucket = getStorageBucket();
    if (!bucket) return NextResponse.json({ error: 'Private catalogue storage is unavailable.' }, { status: 503 });
    const contentType = req.headers.get('content-type') || '';
    let batchId = '';
    let storagePath = '';
    let filename = '';
    let bytes: Buffer;
    let mimeType: string;
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      batchId = String(form.get('batchId') || '');
      const file = form.get('file');
      if (!BATCH_PATTERN.test(batchId) || !(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES) throw new Error('Choose a valid batch and an image under 8 MB.');
      filename = file.name.slice(0, 160);
      bytes = Buffer.from(await file.arrayBuffer());
      mimeType = imageType(bytes, file.type);
      storagePath = `clients/maharaja/catalogue-imports/${batchId}/${crypto.randomUUID()}`;
      await bucket.file(storagePath).save(bytes, { contentType: mimeType, public: false, metadata: { cacheControl: 'private, no-store' } });
    } else {
      const body = await req.json();
      batchId = String(body.batchId || '');
      storagePath = String(body.storagePath || '');
      filename = String(body.filename || '').slice(0, 160);
      if (!BATCH_PATTERN.test(batchId) || !storagePath.startsWith(`clients/maharaja/catalogue-imports/${batchId}/`)) throw new Error('Invalid import item.');
      const file = bucket.file(storagePath);
      [bytes] = await file.download();
      const [metadata] = await file.getMetadata();
      mimeType = imageType(bytes, String(metadata.contentType || ''));
    }
    const analysis = await classify(bytes, mimeType, filename);
    return NextResponse.json({ success: true, batchId, storagePath, filename, ...analysis });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not analyze garment.' }, { status: 400 });
  }
}

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getStorageBucket } from '@/lib/firebase/admin';
import { catalogueCategories } from '@/lib/tryfocus/sample-data';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';
import { resolveRequestClientId } from '@/lib/maharaja/server';

export const maxDuration = 60;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function imageType(bytes: Buffer, declared: string) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  const actual = jpeg ? 'image/jpeg' : png ? 'image/png' : webp ? 'image/webp' : '';
  if (!actual || !MIME_TYPES.has(declared) || actual !== declared) throw new Error('Only valid JPEG, PNG or WebP garment photos are accepted.');
  return actual;
}

export async function POST(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  if (!verifyOperatorRequest(req)) return NextResponse.json({ error: 'Operator sign-in required.' }, { status: 401 });
  try {
    const bucket = getStorageBucket();
    if (!bucket) return NextResponse.json({ error: 'Catalogue storage is unavailable.' }, { status: 503 });
    const form = await req.formData();
    const batchId = String(form.get('batchId') || '');
    const category = catalogueCategories.find((item) => item.id === form.get('category'));
    const file = form.get('file');
    if (!/^[a-z0-9-]{12,64}$/i.test(batchId) || !category || !(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES) {
      throw new Error('Choose an audience and category, then upload an image under 8 MB.');
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = imageType(bytes, file.type);
    const storagePath = `clients/${activeClientId()}/catalogue-imports/${batchId}/${crypto.randomUUID()}`;
    await bucket.file(storagePath).save(bytes, { contentType: mimeType, public: false, metadata: { cacheControl: 'private, no-store' } });
    return NextResponse.json({ success: true, batchId, storagePath, filename: file.name.slice(0, 160), category: category.id });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not upload garment.' }, { status: 400 });
  }
}

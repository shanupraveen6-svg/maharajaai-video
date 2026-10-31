import { NextRequest, NextResponse } from 'next/server';
import { readPhotoTransfer, savePhotoTransfer } from '@/lib/maharaja/photo-transfer';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';

type Context = { params: Promise<{ token: string }> };
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(req: NextRequest, context: Context) {
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
export async function PATCH(req: NextRequest, context: Context) {
  const { token } = await context.params;
  const record = await readPhotoTransfer(token);
  if (!record) return NextResponse.json({ error: 'This upload QR has expired.' }, { status: 404, headers });
  if (record.status !== 'waiting') return NextResponse.json({ error: 'The photo has already been sent.' }, { status: 409, headers });
  const form = await req.formData();
  const file = form.get('photo');
  if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'Choose a photo under 2 MB.' }, { status: 400, headers });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return NextResponse.json({ error: 'Please choose a valid photo.' }, { status: 400, headers });
  const bucket = getStorageBucket();
  const path = `clients/${record.clientId || 'maharaja'}/photo-transfers/${token}/photo.jpg`;
  if (bucket) {
    await bucket.file(path).save(bytes, { contentType: 'image/jpeg', public: false, metadata: { cacheControl: 'private, no-store' } });
    await savePhotoTransfer(token, { ...record, status: 'ready', path, contentType: 'image/jpeg' });
  } else await savePhotoTransfer(token, { ...record, status: 'ready', image: `data:image/jpeg;base64,${bytes.toString('base64')}` });
  return NextResponse.json({ success: true }, { headers });
}
export async function DELETE(req: NextRequest, context: Context) {
  const { token } = await context.params;
  const record = await readPhotoTransfer(token);
  if (!record || req.headers.get('x-transfer-receiver') !== record.receiver) return NextResponse.json({ error: 'Transfer not found.' }, { status: 404, headers });
  if (record.path) await getStorageBucket()?.file(record.path).delete({ ignoreNotFound: true });
  const db = getDb();
  if (db) await db.collection('tvPhotoTransfers').doc(token).delete();
  else getMockStore().sessions.delete(`photo_transfer_${token}`);
  return NextResponse.json({ success: true }, { headers });
}

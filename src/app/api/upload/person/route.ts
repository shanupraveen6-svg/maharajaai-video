import { NextRequest, NextResponse } from 'next/server';
import { uploadPersonImage } from '@/lib/firebase/storage';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { validateSourceImage } from '@/lib/utils/image-upload';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const sessionId = formData.get('sessionId') as string | null;

    if (!file || !sessionId) {
      return NextResponse.json({ success: false, error: 'File and sessionId parameters are required.' }, { status: 400 });
    }
    validateSourceImage(file);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const assetId = `pers_${Date.now()}`;

    const uploadResult = await uploadPersonImage(sessionId, assetId, buffer, file.type);
    const nowIso = new Date().toISOString();

    const db = getDb();
    if (db) {
      await db.collection('sessions').doc(sessionId).set({
        id: sessionId,
        personStoragePath: uploadResult.storagePath,
        updatedAt: nowIso
      }, { merge: true });
    } else {
      const mockStore = getMockStore();
      const session = mockStore.sessions.get(sessionId) || { id: sessionId };
      session.personStoragePath = uploadResult.storagePath;
      mockStore.sessions.set(sessionId, session);
    }

    return NextResponse.json({
      success: true,
      assetId,
      storagePath: uploadResult.storagePath,
      size: uploadResult.size
    });
  } catch (error: any) {
    console.error('Person Upload Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Upload failed' }, { status: 500 });
  }
}

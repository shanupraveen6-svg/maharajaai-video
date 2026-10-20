import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const DEFAULT_NAME = 'Maharaja Festival Showcase';

function cleanName(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return DEFAULT_NAME;
  return value.trim().replace(/\s+/g, ' ').slice(0, 60) || DEFAULT_NAME;
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized operator session.' }, { status: 401 });
    }

    const form = await req.formData();
    const uploaded = form.get('file');
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ success: false, error: 'Choose an MP4 or MOV video first.' }, { status: 400 });
    }
    if (!['video/mp4', 'video/quicktime'].includes(uploaded.type)) {
      return NextResponse.json({ success: false, error: 'Only MP4 and MOV showcase videos are supported.' }, { status: 400 });
    }
    if (!uploaded.size || uploaded.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'Each showcase video must be 4 MB or smaller.' }, { status: 413 });
    }

    const bucket = getStorageBucket();
    if (!bucket) return NextResponse.json({ success: false, error: 'Firebase Storage is unavailable.' }, { status: 503 });

    const sampleId = `showcase_${randomUUID()}`;
    const extension = uploaded.type === 'video/quicktime' ? 'mov' : 'mp4';
    const storagePath = `clients/maharaja/live-testing/${sampleId}.${extension}`;
    await bucket.file(storagePath).save(Buffer.from(await uploaded.arrayBuffer()), {
      resumable: false,
      contentType: uploaded.type,
      metadata: { cacheControl: 'private, max-age=0' },
    });

    const video = {
      id: sampleId,
      sessionId: sampleId,
      clientId: 'maharaja',
      status: 'ready',
      storagePath,
      contentType: uploaded.type,
      displayName: cleanName(form.get('displayName')),
      customerName: DEFAULT_NAME,
      customerLocality: 'Maharaja Showroom',
      isShowcaseSample: true,
      published: true,
      replayEnabled: true,
      playbackMode: 'embedded',
      hasEmbeddedAudio: true,
      createdAt: new Date().toISOString(),
    };
    const db = getDb();
    if (db) await db.collection('videos').doc(sampleId).set(video);
    else getMockStore().videos.set(sampleId, video);

    return NextResponse.json({ success: true, video });
  } catch (error: any) {
    console.error('Showcase sample upload error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unable to upload the showcase video.' }, { status: 500 });
  }
}

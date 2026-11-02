import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';
import { getMaharajaWorkspace, resolveRequestClientId } from '@/lib/maharaja/server';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { saveGoLiveEntry } from '@/lib/maharaja/go-live-library';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 4 * 1024 * 1024;

function cleanName(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== 'string') return fallback;
  return value.trim().replace(/\s+/g, ' ').slice(0, 60) || fallback;
}

export async function POST(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
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
    if (!bucket) return NextResponse.json({ success: false, error: 'Storage is unavailable right now. Please try again shortly.' }, { status: 503 });

    const sampleId = `showcase_${randomUUID()}`;
    const extension = uploaded.type === 'video/quicktime' ? 'mov' : 'mp4';
    const storagePath = `clients/${activeClientId()}/live-testing/${sampleId}.${extension}`;
    await bucket.file(storagePath).save(Buffer.from(await uploaded.arrayBuffer()), {
      resumable: false,
      contentType: uploaded.type,
      metadata: { cacheControl: 'private, max-age=0' },
    });

    const workspace = await getMaharajaWorkspace();
    const storeName = workspace.clientName.replace(/^The\s+/i, '').trim() || 'Our store';
    const showcaseName = activeClientId() === MAHARAJA_CLIENT_ID ? 'Maharaja Festival Showcase' : `${storeName} Showcase`;
    const video = {
      id: sampleId,
      sessionId: sampleId,
      clientId: activeClientId(),
      status: 'ready' as const,
      storagePath,
      contentType: uploaded.type,
      displayName: cleanName(form.get('displayName'), showcaseName),
      customerName: showcaseName,
      customerLocality: activeClientId() === MAHARAJA_CLIENT_ID ? 'Maharaja Showroom' : storeName,
      isShowcaseSample: true,
      published: true,
      replayEnabled: true,
      universalPool: true,
      playbackMode: 'embedded' as const,
      hasEmbeddedAudio: true,
      createdAt: new Date().toISOString(),
    };
    const db = getDb();
    if (db) await db.collection('videos').doc(sampleId).set(video);
    else getMockStore().videos.set(sampleId, video);
    // The clip plays on this store's Go Live screens from its own library straight away.
    await saveGoLiveEntry({ ...video, updatedAt: video.createdAt });

    return NextResponse.json({ success: true, video });
  } catch (error: any) {
    console.error('Showcase sample upload error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unable to upload the showcase video.' }, { status: 500 });
  }
}

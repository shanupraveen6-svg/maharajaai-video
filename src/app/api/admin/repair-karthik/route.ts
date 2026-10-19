import { NextRequest, NextResponse } from 'next/server';
import { getStorageBucket } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const bucket = getStorageBucket();
    if (!bucket) {
      return NextResponse.json({ success: false, error: 'Firebase Storage bucket unavailable.' }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || '9s';
    const sessionId = searchParams.get('sessionId') || 'maharaja_1792343524686_5e61aa15';

    const arrayBuf = await req.arrayBuffer();
    if (!arrayBuf || arrayBuf.byteLength === 0) {
      return NextResponse.json({ success: false, error: 'Empty video payload.' }, { status: 400 });
    }

    const buffer = Buffer.from(arrayBuf);

    if (type === '9s') {
      const storagePath = `clients/maharaja/sessions/${sessionId}/video/live-9s.mp4`;
      const file = bucket.file(storagePath);
      await file.save(buffer, {
        contentType: 'video/mp4',
        resumable: false,
        metadata: {
          cacheControl: 'public, max-age=3600',
          metadata: {
            durationSeconds: '9',
            playbackMode: 'embedded',
            hasEmbeddedAudio: 'true',
          },
        },
      });
      return NextResponse.json({ success: true, updated: storagePath, bytes: buffer.length });
    } else {
      const storagePath6s = `clients/maharaja/sessions/${sessionId}/video/final-6s.mp4`;
      const storagePathFinal = `clients/maharaja/sessions/${sessionId}/video/final.mp4`;
      const file6s = bucket.file(storagePath6s);
      const fileFinal = bucket.file(storagePathFinal);

      await Promise.all([
        file6s.save(buffer, {
          contentType: 'video/mp4',
          resumable: false,
          metadata: {
            cacheControl: 'public, max-age=3600',
            metadata: {
              durationSeconds: '6',
              playbackMode: 'embedded',
              hasEmbeddedAudio: 'true',
            },
          },
        }),
        fileFinal.save(buffer, {
          contentType: 'video/mp4',
          resumable: false,
          metadata: {
            cacheControl: 'public, max-age=3600',
          },
        }),
      ]);
      return NextResponse.json({ success: true, updated: [storagePath6s, storagePathFinal], bytes: buffer.length });
    }
  } catch (err: any) {
    console.error('Repair Karthik Video Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

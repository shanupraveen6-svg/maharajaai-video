import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { verifyTvRequest } from '@/lib/auth/display';
import { bindClient } from '@/lib/maharaja/client-context';
import { getPublicAppUrl, resolveRequestClientId } from '@/lib/maharaja/server';
import { MirrorRecordingError, confirmMirrorRecording, createMirrorUpload } from '@/lib/maharaja/mirror-recordings';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, max-age=0' };

/**
 * The paired TV saves a finished Live Mirror session: `{ action: 'upload-url', contentType, sizeBytes }`,
 * a direct upload, then `{ action: 'confirm', id, contentType, garmentTitle, looks }`, which returns the QR link.
 */
export async function POST(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  if (!await verifyTvRequest(req) && !verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Sign in or pair this display first.' }, { status: 401, headers: noStore });
  }
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'upload-url') {
      const rate = await enforceRateLimit(req, 'mirror-recording', 30, 10 * 60 * 1000);
      if (!rate.allowed) return NextResponse.json({ success: false, error: 'Please wait a moment before saving another session.' }, { status: 429, headers: noStore });
      return NextResponse.json({ success: true, ...await createMirrorUpload(body.contentType, body.sizeBytes) }, { headers: noStore });
    }
    if (body.action === 'confirm') {
      const record = await confirmMirrorRecording(body.id, body.contentType, body.garmentTitle, body.looks);
      return NextResponse.json({
        success: true,
        link: getPublicAppUrl(`/maharaja/mirror/${record.id}`),
        expiresAt: new Date(record.expiresAtMs).toISOString(),
      }, { headers: noStore });
    }
    return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400, headers: noStore });
  } catch (error) {
    if (error instanceof MirrorRecordingError) return NextResponse.json({ success: false, error: error.message }, { status: 400, headers: noStore });
    console.error('Live Mirror recording failed:', error);
    return NextResponse.json({ success: false, error: 'The video could not be saved.' }, { status: 500, headers: noStore });
  }
}

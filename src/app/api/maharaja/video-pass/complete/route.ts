import { NextRequest, NextResponse } from 'next/server';
import {
  getVideoPass,
  incrementMaharajaUsage,
  logMaharajaActivity,
  markVideoPassUsed,
  verifyMaharajaAccess,
} from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const action = body.action === 'live' ? 'live' : 'download';

    if (!code) {
      return NextResponse.json({ success: false, error: 'Pass code is required.' }, { status: 400 });
    }

    const access = await verifyMaharajaAccess(req, code, 'ai-video');
    if (!access.allowed && access.error !== 'This AI Video has been completed.') {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }

    const pass = await getVideoPass(code);
    if (!pass) {
      return NextResponse.json({ success: false, error: 'Pass not found.' }, { status: 404 });
    }

    if (pass.status !== 'used') {
      await markVideoPassUsed(code);
      if (action === 'download') {
        await incrementMaharajaUsage('downloads');
      }
      await logMaharajaActivity(
        action === 'live' ? 'go-live' : 'download',
        `Maharaja AI Video pass completed via ${action}`,
        { code: pass.code, sessionId }
      );
    }

    return NextResponse.json({
      success: true,
      status: 'used',
      message: 'This AI Video has been completed.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete video pass.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

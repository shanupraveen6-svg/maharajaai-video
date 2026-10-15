import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getVideoPass, incrementMaharajaUsage, logMaharajaActivity, verifyMaharajaAccess, type MaharajaActivity } from '@/lib/maharaja/server';

const CUSTOMER_TYPES = new Set(['retry', 'download', 'share']);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = String(body.type || '');
    if (type === 'qr-download') {
      if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    } else {
      if (!CUSTOMER_TYPES.has(type)) return NextResponse.json({ success: false, error: 'Invalid activity.' }, { status: 400 });
      const access = await verifyMaharajaAccess(req, body.accessCode, type === 'retry' ? 'ai-video' : 'try-on');
      if (!access.allowed) {
        const completedPass = type === 'share' && typeof body.accessCode === 'string'
          ? await getVideoPass(body.accessCode.trim())
          : null;
        if (!completedPass || completedPass.status !== 'used') {
          return NextResponse.json({ success: false, error: access.error }, { status: 401 });
        }
      }
      if (type === 'retry' && String(body.pin || '') !== (process.env.MAHARAJA_MANAGER_PIN || '7070')) {
        return NextResponse.json({ success: false, error: 'Manager PIN is incorrect.' }, { status: 403 });
      }
    }

    if (type === 'retry') await incrementMaharajaUsage('retries');
    if (type === 'download') await incrementMaharajaUsage('downloads');
    await logMaharajaActivity(type as MaharajaActivity['type'], String(body.label || type), {
      sessionId: String(body.sessionId || ''),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to record activity.' }, { status: 500 });
  }
}

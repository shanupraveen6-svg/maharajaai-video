import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getMaharajaWorkspace, getVideoPass, incrementMaharajaUsage, logMaharajaActivity, markPassRetryApproved, verifyMaharajaAccess, type MaharajaActivity } from '@/lib/maharaja/server';

const CUSTOMER_TYPES = new Set(['retry', 'download', 'share']);
const MAX_RETRY_ALLOWANCE = Number(process.env.MAHARAJA_MAX_RETRY_ALLOWANCE) || 100;

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
      if (type === 'retry') {
        const workspace = await getMaharajaWorkspace();
        if (workspace.usage.retries >= MAX_RETRY_ALLOWANCE) {
          return NextResponse.json({ success: false, error: 'The store manager retry reserve has been reached.' }, { status: 403 });
        }
        if (access.pass?.retryUsed) {
          return NextResponse.json({ success: false, error: 'This billing pass has already used its 1 allowed manager video retry.' }, { status: 403 });
        }
        if (String(body.pin || '') !== (process.env.MAHARAJA_MANAGER_PIN || '7070')) {
          await logMaharajaActivity('retry', 'Manager retry rejected: incorrect PIN', {
            sessionId: String(body.sessionId || ''),
            success: false,
          });
          return NextResponse.json({ success: false, error: 'Manager PIN is incorrect.' }, { status: 403 });
        }
        if (access.pass && !access.pass.videoDone) {
          return NextResponse.json({ success: false, error: 'A retry can only be approved after the first AI Video has been generated.' }, { status: 403 });
        }
        if (access.pass) {
          await markPassRetryApproved(access.pass.code);
        }
      }
    }

    if (type === 'retry') await incrementMaharajaUsage('retries');
    if (type === 'download') await incrementMaharajaUsage('downloads');
    await logMaharajaActivity(type as MaharajaActivity['type'], String(body.label || type), {
      sessionId: String(body.sessionId || ''),
      success: true,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to record activity.' }, { status: 500 });
  }
}

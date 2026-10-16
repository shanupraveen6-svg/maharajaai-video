import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import {
  getMaharajaWorkspace,
  getTryOnDeviceStatus,
  getVideoPass,
  incrementMaharajaUsage,
  logMaharajaActivity,
  markPassRetryApproved,
  markTryOnDeviceRetryApproved,
  validTryOnDeviceId,
  verifyMaharajaAccess,
  type MaharajaActivity,
} from '@/lib/maharaja/server';

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
      const service = body.service === 'try-on' ? 'try-on' : 'ai-video';
      const access = await verifyMaharajaAccess(req, body.accessCode, type === 'retry' ? service : 'try-on');
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
          return NextResponse.json({ success: false, error: `Store retry reserve has been reached (${MAX_RETRY_ALLOWANCE} retries). Contact administration.` }, { status: 403 });
        }
        const target: 'image' | 'video' = body.target === 'image' ? 'image' : 'video';
        const deviceStatus = validTryOnDeviceId(body.deviceId) ? await getTryOnDeviceStatus(body.deviceId) : null;
        if (access.pass?.retryUsed || deviceStatus?.retryUsed) {
          return NextResponse.json({ success: false, error: 'This customer has already used their 1 allowed retry.' }, { status: 403 });
        }
        if (access.pass?.videoGenerating) {
          return NextResponse.json({ success: false, error: 'A video is currently being generated. Wait for generation to complete or fail before requesting a retry.' }, { status: 409 });
        }

        if (access.pass) {
          await markPassRetryApproved(access.pass.code, target, service);
        } else if (service === 'try-on' && validTryOnDeviceId(body.deviceId)) {
          await markTryOnDeviceRetryApproved(body.deviceId);
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

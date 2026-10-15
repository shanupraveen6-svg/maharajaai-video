import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getMaharajaWorkspace, getVideoPass, incrementMaharajaUsage, logMaharajaActivity, markPassRetryApproved, verifyMaharajaAccess, type MaharajaActivity } from '@/lib/maharaja/server';

const CUSTOMER_TYPES = new Set(['retry', 'download', 'share']);
const MAX_RETRY_ALLOWANCE = Number(process.env.MAHARAJA_MAX_RETRY_ALLOWANCE) || 100;

const pinAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_FAILED_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;

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
          return NextResponse.json({ success: false, error: `Store manager retry reserve has been reached (${MAX_RETRY_ALLOWANCE} retries). Contact administration.` }, { status: 403 });
        }
        if (access.pass?.retryUsed) {
          return NextResponse.json({ success: false, error: 'This billing pass has already used its 1 allowed manager video retry.' }, { status: 403 });
        }
        if (access.pass?.videoGenerating) {
          return NextResponse.json({ success: false, error: 'A video is currently being generated. Wait for generation to complete or fail before requesting a retry.' }, { status: 409 });
        }

        // Check if retry is valid for current pass state
        if (access.pass && !access.pass.videoDone) {
          if (access.pass.lastVideoFailed) {
            return NextResponse.json({
              success: false,
              error: 'The previous video attempt failed and your video slot has been automatically restored. You can generate again directly without using a manager retry.'
            }, { status: 400 });
          }
          return NextResponse.json({ success: false, error: 'A retry can only be approved after the first AI Video has been completed.' }, { status: 403 });
        }

        // Authorization: Check either operator cookie or manager PIN
        const isOperator = verifyOperatorRequest(req);
        if (!isOperator) {
          const configuredPin = process.env.MAHARAJA_MANAGER_PIN?.trim();
          const isProduction = process.env.NODE_ENV === 'production';

          if (isProduction && !configuredPin) {
            console.error('CRITICAL: MAHARAJA_MANAGER_PIN is not configured in production environment.');
            return NextResponse.json({
              success: false,
              error: 'Manager authorization is temporarily unavailable (MAHARAJA_MANAGER_PIN is not configured). Contact administrator.'
            }, { status: 500 });
          }

          const expectedPin = configuredPin || (isProduction ? '' : '7070');
          const rateLimitKey = String(body.accessCode || req.headers.get('x-forwarded-for') || 'default');
          const record = pinAttempts.get(rateLimitKey);
          const now = Date.now();

          if (record && record.lockedUntil > now) {
            const minutesRemaining = Math.ceil((record.lockedUntil - now) / 60000);
            return NextResponse.json({
              success: false,
              error: `Too many incorrect PIN attempts. Retry approval is locked for ${minutesRemaining} minute(s).`
            }, { status: 429 });
          }

          const providedPin = String(body.pin || '').trim();
          if (!providedPin || providedPin !== expectedPin) {
            const currentCount = ((record && record.lockedUntil <= now) ? 0 : (record?.count || 0)) + 1;
            const lockedUntil = currentCount >= MAX_FAILED_PIN_ATTEMPTS ? now + PIN_LOCKOUT_MS : 0;
            pinAttempts.set(rateLimitKey, { count: currentCount, lockedUntil });

            await logMaharajaActivity('retry', 'Manager retry rejected: incorrect PIN', {
              sessionId: String(body.sessionId || ''),
              success: false,
            });

            if (lockedUntil > 0) {
              return NextResponse.json({
                success: false,
                error: 'Too many incorrect PIN attempts. Retry approval is now locked for 15 minutes.'
              }, { status: 429 });
            }

            return NextResponse.json({
              success: false,
              error: `Manager PIN is incorrect. (${MAX_FAILED_PIN_ATTEMPTS - currentCount} attempt(s) remaining before lockout)`
            }, { status: 403 });
          }

          // Successful PIN verification: clear rate-limit tracking
          pinAttempts.delete(rateLimitKey);
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

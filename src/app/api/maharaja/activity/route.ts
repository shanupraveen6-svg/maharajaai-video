import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { ENFORCE_REPEAT_LIMITS } from '@/lib/maharaja/config';
import {
  getMaharajaWorkspace,
  getTryOnDeviceStatus,
  getVideoPass,
  getCampaignEntitlementForPass,
  getCustomerServiceAllowances,
  incrementMaharajaUsage,
  logMaharajaActivity,
  markPassRetryApproved,
  markTryOnDeviceRetryApproved,
  validTryOnDeviceId,
  verifyMaharajaAccess,
  type MaharajaActivity,
} from '@/lib/maharaja/server';

const CUSTOMER_TYPES = new Set(['retry', 'download', 'share']);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = String(body.type || '');
    if (type === 'qr-download') {
      if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    } else {
      if (!CUSTOMER_TYPES.has(type)) return NextResponse.json({ success: false, error: 'Invalid activity.' }, { status: 400 });
      const service = body.service === 'try-on' ? 'try-on' : 'ai-video';
      let access = await verifyMaharajaAccess(req, body.accessCode, type === 'retry' ? service : 'try-on');
      if (!access.allowed) {
        const completedPass = (type === 'share' || type === 'retry') && typeof body.accessCode === 'string'
          ? await getVideoPass(body.accessCode.trim())
          : null;
        if (completedPass && (completedPass.status === 'used' || completedPass.videoDone) && (!ENFORCE_REPEAT_LIMITS || !completedPass.retryUsed)) {
          const workspace = await getMaharajaWorkspace();
          const entitlement = await getCampaignEntitlementForPass(completedPass.code);
          const allowances = getCustomerServiceAllowances(entitlement);
          access = {
            allowed: true as const,
            clientId: completedPass.clientId,
            pass: completedPass,
            workspace,
            entitlement,
            allowances,
          };
        } else {
          return NextResponse.json({ success: false, error: access.error }, { status: 401 });
        }
      }
      if (type === 'retry') {
        const target: 'image' | 'video' = body.target === 'image' ? 'image' : 'video';
        const deviceStatus = validTryOnDeviceId(body.deviceId) ? await getTryOnDeviceStatus(body.deviceId) : null;

        // Independent 3-service retry enforcement
        if (ENFORCE_REPEAT_LIMITS) {
          if (target === 'video') {
            if (access.allowances.video.used >= 2) {
              return NextResponse.json({
                success: false,
                error: 'A retry has already used this quota. H3 Cinematic Video allowance exhausted (2/2 completed). Maximum 2 generations reached.',
              }, { status: 403 });
            }
          } else if (target === 'image') {
            if (service === 'try-on') {
              if (access.allowances.tryOn.used >= 2 || deviceStatus?.retryUsed) {
                return NextResponse.json({
                  success: false,
                  error: 'A retry has already used this quota. AI Try-On allowance exhausted (2/2 completed). Maximum 2 generations reached.',
                }, { status: 403 });
              }
            } else {
              if (access.allowances.masterImage.used >= 2) {
                return NextResponse.json({
                  success: false,
                  error: 'A retry has already used this quota. Celebration Gemini Master Image allowance exhausted (2/2 completed). Maximum 2 generations reached.',
                }, { status: 403 });
              }
            }
          }
        }

        if (access.pass?.videoGenerating) {
          return NextResponse.json({ success: false, error: 'A video is currently being generated. Wait for generation to complete or fail before requesting a retry.' }, { status: 409 });
        }
        if (target === 'video' && access.pass && !access.pass.videoDone && access.allowances.video.used === 0) {
          return NextResponse.json({ success: false, error: 'A video retry is available only after the first AI Video is completed.' }, { status: 403 });
        }
        if (target === 'image' && access.pass) {
          const imageExists = service === 'try-on' ? access.pass.tryOnImageDone : access.pass.videoMasterDone;
          if (!imageExists && (service === 'try-on' ? access.allowances.tryOn.used === 0 : access.allowances.masterImage.used === 0)) {
            return NextResponse.json({ success: false, error: 'An image retry is available only after the first AI image is completed.' }, { status: 403 });
          }
        }
        if (target === 'image' && !access.pass && service === 'try-on' && deviceStatus?.status !== 'used') {
          return NextResponse.json({ success: false, error: 'An image retry is available only after the first AI Try-On is completed.' }, { status: 403 });
        }

        if (access.pass) {
          await markPassRetryApproved(access.pass.code, target, service);
        } else if (service === 'try-on' && validTryOnDeviceId(body.deviceId)) {
          await markTryOnDeviceRetryApproved(body.deviceId);
        }
      }
    }

    const target = body.target === 'image' ? 'image' : (body.target === 'video' ? 'video' : undefined);
    const service = body.service === 'try-on' ? 'try-on' : (body.service === 'ai-video' ? 'ai-video' : undefined);
    if (type === 'retry') await incrementMaharajaUsage('retries');
    if (type === 'download') await incrementMaharajaUsage('downloads');
    await logMaharajaActivity(type as MaharajaActivity['type'], String(body.label || type), {
      sessionId: String(body.sessionId || ''),
      target,
      service,
      success: true,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to record activity.' }, { status: 500 });
  }
}

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MAHARAJA_CLIENT_ID, ENFORCE_REPEAT_LIMITS } from '@/lib/maharaja/config';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import {
  getMaharajaWorkspace,
  incrementMaharajaUsage,
  type MaharajaVideoPass,
  saveVideoPass,
  expireActivePassesForPhone,
  logMaharajaActivity,
  getCampaignEntitlementByPhone,
  getCustomerServiceAllowances,
  getPublicAppUrl,
} from '@/lib/maharaja/server';
import { getWhatsAppStatus, sendWhatsAppResult } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

function cleanPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 ? digits : '';
}

function maskPhone(phone: string) {
  return `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json(
        { success: false, error: 'Authenticated biller or operator access is required to generate customer passes.' },
        { status: 401 }
      );
    }
    const rate = await enforceRateLimit(req, 'video-pass', 30, 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: 'Too many QR requests. Wait briefly and try again.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      });
    }

    const body = await req.json();
    const workspace = await getMaharajaWorkspace();

    if (!workspace.campaignEnabled) {
      return NextResponse.json({ success: false, error: 'Maharaja campaign is currently paused.' }, { status: 403 });
    }
    if (body.billingCode !== workspace.billingCode) {
      return NextResponse.json({ success: false, error: 'Invalid Maharaja billing-counter link.' }, { status: 403 });
    }
    const phone = cleanPhone(body.phone);
    const experienceType = body.experienceType === 'catalogue-gift' ? 'catalogue-gift' : 'purchased-garment';
    if (phone.length !== 10) {
      return NextResponse.json({ success: false, error: 'Enter a valid 10 digit phone number.' }, { status: 400 });
    }

    const now = Date.now();
    // Every customer reward is valid for one day. This matches the WhatsApp/QR
    // handoff policy and lets a shopper safely continue after leaving the counter.
    const validityMs = 24 * 60 * 60 * 1000;
    const code = crypto.randomBytes(18).toString('base64url');
    const pass: MaharajaVideoPass = {
      id: code,
      code,
      clientId: MAHARAJA_CLIENT_ID,
      phone,
      phoneMasked: maskPhone(phone),
      experienceType,
      billLast4: '',
      eventId: workspace.defaultEvent,
      status: 'active',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + validityMs).toISOString(),
      expiresAtMs: now + validityMs,
      tryOnImageDone: false,
      tryOnImageUrl: '',
      videoMasterDone: false,
      videoMasterUrl: '',
      videoMasterApproved: false,
      videoMasterApprovedUrl: '',
      videoGenerating: false,
      videoDone: false,
      retryUsed: false,
      whatsappOptIn: experienceType === 'catalogue-gift' || body.whatsappOptIn === true,
      ...(experienceType === 'catalogue-gift' || body.whatsappOptIn === true ? { whatsappDeliveryStatus: 'pending' as const } : {}),
      usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
    };

    if (ENFORCE_REPEAT_LIMITS) {
      const expiredCount = await expireActivePassesForPhone(phone, undefined, experienceType);
      if (expiredCount > 0) {
        await incrementMaharajaUsage('retries');
        await logMaharajaActivity('retry', `Previous AI Video QR superseded by retry (${maskPhone(phone)})`, {
          phone: maskPhone(phone),
          target: 'video',
          service: 'ai-video',
        });
      }
    }

    const [entitlement] = await Promise.all([
      getCampaignEntitlementByPhone(phone),
      saveVideoPass(pass),
      incrementMaharajaUsage('videoPasses'),
      logMaharajaActivity('video-pass', `${experienceType === 'catalogue-gift' ? 'Catalogue Gift' : 'Purchased Garment'} AI Video access created`, {
        phone: pass.phoneMasked,
        experienceType,
        whatsappOptIn: pass.whatsappOptIn === true,
      }),
    ]);
    const allowances = getCustomerServiceAllowances(entitlement);

    const link = getPublicAppUrl(experienceType === 'catalogue-gift'
      ? `/maharaja/catalogue/${pass.code}`
      : `/maharaja/video/${pass.code}`);
    let whatsappSent = false;
    let whatsappError = '';
    if (pass.whatsappOptIn && getWhatsAppStatus().configured) {
      try {
        await sendWhatsAppResult(phone, link);
        whatsappSent = true;
      } catch (error) {
        whatsappError = error instanceof Error ? error.message : 'WhatsApp delivery failed.';
      }
    }

    return NextResponse.json({
      success: true,
      whatsappSent,
      whatsappError,
      allowances,
      pass: {
        code: pass.code,
        clientId: pass.clientId,
        phoneMasked: pass.phoneMasked,
        eventId: pass.eventId,
        experienceType,
        expiresAt: pass.expiresAt,
        link,
        allowances,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create customer AI Video QR.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

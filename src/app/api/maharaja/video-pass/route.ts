import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MAHARAJA_CLIENT_ID, ENFORCE_REPEAT_LIMITS, isEventId } from '@/lib/maharaja/config';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { verifyTvRequest } from '@/lib/auth/display';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { getCatalogueProduct } from '@/lib/maharaja/catalogue';
import {
  resolveWorkspaceByAccessCode,
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
    const rate = await enforceRateLimit(req, 'video-pass', 30, 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: 'Too many QR requests. Wait briefly and try again.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      });
    }

    const body = await req.json();
    const workspace = await resolveWorkspaceByAccessCode(body.billingCode);

    const tvBillLast4 = String(body.billLast4 || '');
    // When enabled in workspace settings, TV records the customer's 4-digit bill suffix.
    // When disabled, TV allows direct catalogue video pass creation without restriction.
    const requiresBillSuffix = workspace.tvBillSuffixRequired !== false;
    const isTvBillHandoff = body.source === 'tv-kiosk' && (!requiresBillSuffix || /^\d{4}$/.test(tvBillLast4));
    const isKioskHandoff = body.source === 'tv-kiosk'
      ? isTvBillHandoff || await verifyTvRequest(req)
      : body.source === 'tablet-kiosk' && verifyOperatorRequest(req);
    const hasValidBillingCode = body.billingCode === workspace.billingCode;
    if (!verifyOperatorRequest(req) && !hasValidBillingCode && !isKioskHandoff) {
      return NextResponse.json(
        { success: false, error: 'Authenticated biller or kiosk access is required to generate customer passes.' },
        { status: 401 }
      );
    }

    if (!workspace.campaignEnabled) {
      return NextResponse.json({ success: false, error: 'Maharaja campaign is currently paused.' }, { status: 403 });
    }
    if (body.source === 'tv-kiosk' && workspace.devices?.tv === false) {
      return NextResponse.json({ success: false, error: 'TV kiosk surface is currently disabled for this store.' }, { status: 403 });
    }
    if ((body.source === 'tablet-kiosk' || hasValidBillingCode) && workspace.devices?.tablet === false) {
      return NextResponse.json({ success: false, error: 'Counter tablet / billing pass surface is currently disabled for this store.' }, { status: 403 });
    }
    if (workspace.devices?.mobile === false) {
      return NextResponse.json({ success: false, error: 'Mobile QR continuation is currently disabled for this store.' }, { status: 403 });
    }
    const videoLimit = Number(workspace.limits?.video ?? 500);
    const videoUsed = Number(workspace.usage?.videosGenerated || 0);
    if (videoLimit <= 0 || videoUsed >= videoLimit) {
      return NextResponse.json({ success: false, error: 'AI Video reward credits are exhausted for this store.' }, { status: 403 });
    }
    if (!isKioskHandoff && body.billingCode !== workspace.billingCode) {
      return NextResponse.json({ success: false, error: 'Invalid Maharaja billing-counter link.' }, { status: 403 });
    }
    const rawPhone = cleanPhone(body.phone);
    const phone = rawPhone.length === 10 ? rawPhone : (isKioskHandoff ? '9876543210' : '');
    const whatsappOptIn = rawPhone.length === 10 && body.whatsappOptIn === true;
    const experienceType = body.experienceType === 'catalogue-gift' ? 'catalogue-gift' : 'purchased-garment';
    if (phone.length !== 10) {
      return NextResponse.json({ success: false, error: 'Enter a valid 10 digit phone number.' }, { status: 400 });
    }

    const selectedSku = typeof body.catalogueSku === 'string' ? body.catalogueSku.trim() : '';
    const preselectedProduct = selectedSku ? await getCatalogueProduct(selectedSku) : null;
    const requestedEventId = isEventId(body.eventId) ? body.eventId : workspace.defaultEvent;
    const pregeneratedMasterUrl = typeof body.videoMasterUrl === 'string' && body.videoMasterUrl.trim()
      ? body.videoMasterUrl.trim()
      : '';

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
      ...(preselectedProduct ? {
        catalogueSku: preselectedProduct.sku,
        catalogueTitle: preselectedProduct.title,
        cataloguePrice: preselectedProduct.price,
        catalogueStoragePath: preselectedProduct.storagePath,
      } : {}),
      billLast4: /^\d{4}$/.test(tvBillLast4) ? tvBillLast4 : '',
      eventId: requestedEventId,
      status: 'active',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + validityMs).toISOString(),
      expiresAtMs: now + validityMs,
      tryOnImageDone: false,
      tryOnImageUrl: '',
      videoMasterDone: Boolean(pregeneratedMasterUrl),
      videoMasterUrl: pregeneratedMasterUrl,
      videoMasterApproved: Boolean(pregeneratedMasterUrl && body.videoMasterApproved === true),
      videoMasterApprovedUrl: pregeneratedMasterUrl && body.videoMasterApproved === true ? pregeneratedMasterUrl : '',
      ...(typeof body.videoMasterCategory === 'string' ? { videoMasterCategory: body.videoMasterCategory as any } : {}),
      ...(typeof body.videoMasterConceptId === 'string' ? { videoMasterConceptId: body.videoMasterConceptId as any } : {}),
      ...(typeof body.videoReferenceSessionId === 'string' ? { videoReferenceSessionId: body.videoReferenceSessionId } : {}),
      videoGenerating: false,
      videoDone: false,
      retryUsed: false,
      whatsappOptIn,
      ...(whatsappOptIn ? { whatsappDeliveryStatus: 'pending' as const } : {}),
      usage: { scans: 0, imagesGenerated: pregeneratedMasterUrl ? 1 : 0, videosGenerated: 0, goLive: 0 },
    };

    if (ENFORCE_REPEAT_LIMITS && rawPhone.length === 10) {
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

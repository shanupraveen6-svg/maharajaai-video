import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ENFORCE_REPEAT_LIMITS, isEventId } from '@/lib/maharaja/config';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { verifyTvRequest } from '@/lib/auth/display';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { getCatalogueProduct } from '@/lib/maharaja/catalogue';
import { resolveRequestClientId,
  resolveWorkspaceByAccessCode,
  incrementMaharajaUsage,
  type MaharajaVideoPass,
  saveVideoPass,
  expireActivePassesForPhone,
  logMaharajaActivity,
  getCampaignEntitlementByPhone,
  getCustomerServiceAllowances,
  getPublicAppUrl,
  isWhatsAppEnabled,
} from '@/lib/maharaja/server';
import { sendWhatsAppResult } from '@/lib/whatsapp';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { VIDEO_PROMPT_ARCHITECTURE_VERSION } from '@/lib/maharaja/video-concepts';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';

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
    // The billing or poster code decides the client; the counter tablet uses its staff login.
    bindClient(await resolveRequestClientId(req, body.billingCode));
    const workspace = await resolveWorkspaceByAccessCode(body.billingCode);

    const tvBillLast4 = String(body.billLast4 || '');
    // When enabled in workspace settings, TV records the customer's 4-digit bill suffix.
    // When disabled, TV allows direct catalogue video pass creation without restriction.
    const requiresBillSuffix = workspace.tvBillSuffixRequired !== false;
    if (body.source === 'tv-kiosk' && requiresBillSuffix && !/^\d{4}$/.test(tvBillLast4)) {
      return NextResponse.json({ success: false, error: 'Enter the last four digits of your bill.' }, { status: 400 });
    }
    const isTvBillHandoff = body.source === 'tv-kiosk' && (!requiresBillSuffix || /^\d{4}$/.test(tvBillLast4));
    const isPosterHandoff = body.source === 'video-poster' && body.billingCode === workspace.openVideoCode;
    // TV passes come only from a paired TV; the bill digits are an extra check, not the credential.
    const isKioskHandoff = body.source === 'tv-kiosk'
      ? isTvBillHandoff && await verifyTvRequest(req)
      : (body.source === 'tablet-kiosk' && verifyOperatorRequest(req)) || isPosterHandoff;
    const hasValidBillingCode = body.billingCode === workspace.billingCode;
    if (!verifyOperatorRequest(req) && !hasValidBillingCode && !isKioskHandoff) {
      return NextResponse.json(
        { success: false, error: 'Authenticated biller or kiosk access is required to generate customer passes.' },
        { status: 401 }
      );
    }

    if (!workspace.campaignEnabled) {
      return NextResponse.json({ success: false, error: `${workspace.clientName} campaign is currently paused.` }, { status: 403 });
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
      return NextResponse.json({ success: false, error: 'AI Video is paused right now. Please ask our staff for help.' }, { status: 403 });
    }
    if (!isKioskHandoff && body.billingCode !== workspace.billingCode) {
      return NextResponse.json({ success: false, error: 'Invalid Maharaja billing-counter link.' }, { status: 403 });
    }
    const rawPhone = cleanPhone(body.phone);
    // QR customers do not share a made-up phone number or campaign entitlement.
    const phone = rawPhone;
    const whatsappOptIn = rawPhone.length === 10 && body.whatsappOptIn === true;
    const experienceType = body.source === 'tv-kiosk'
      ? 'catalogue-gift'
      : body.source === 'video-poster' || body.source === 'tablet-kiosk'
        ? 'purchased-garment'
        : body.experienceType === 'catalogue-gift' ? 'catalogue-gift' : 'purchased-garment';
    if (body.whatsappOptIn === true && phone.length !== 10) {
      return NextResponse.json({ success: false, error: 'Enter a valid 10 digit phone number.' }, { status: 400 });
    }

    const selectedSku = experienceType === 'catalogue-gift' && typeof body.catalogueSku === 'string' ? body.catalogueSku.trim() : '';
    const preselectedProduct = selectedSku ? await getCatalogueProduct(selectedSku) : null;
    if (body.source === 'tv-kiosk' && (!preselectedProduct || (!preselectedProduct.eligibleForVideo && !preselectedProduct.sku.startsWith('TF-')))) {
      return NextResponse.json({ success: false, error: 'Select an AI Video garment from the TV catalogue.' }, { status: 400 });
    }
    const requestedEventId = isEventId(body.eventId) ? body.eventId : workspace.defaultEvent;
    const pregeneratedMasterUrl = typeof body.videoMasterUrl === 'string' && body.videoMasterUrl.trim()
      ? body.videoMasterUrl.trim()
      : '';
    const referenceSessionId = typeof body.videoReferenceSessionId === 'string' ? body.videoReferenceSessionId : '';
    let sourceSession: Record<string, any> | null = null;
    if (pregeneratedMasterUrl) {
      if (!await verifyTvRequest(req)) return NextResponse.json({ success: false, error: 'Pair this display before handing off a portrait.' }, { status: 401 });
      if (!/^[A-Za-z0-9_-]{8,120}$/.test(referenceSessionId)) return NextResponse.json({ success: false, error: 'The portrait session is missing. Create the portrait again.' }, { status: 400 });
      const db = getDb();
      sourceSession = (db ? (await db.collection('sessions').doc(referenceSessionId).get()).data() : getMockStore().sessions.get(referenceSessionId)) || null;
      if (!sourceSession || sourceSession.accessCode || sourceSession.masterImageUrl !== pregeneratedMasterUrl || sourceSession.promptArchitectureVersion !== VIDEO_PROMPT_ARCHITECTURE_VERSION || !sourceSession.personPhotoStoragePath || !sourceSession.garmentPhotoStoragePaths?.length) {
        return NextResponse.json({ success: false, error: 'This portrait could not be handed off safely. Create a new portrait.' }, { status: 409 });
      }
    }

    const now = Date.now();
    // Every customer reward is valid for one day. This matches the WhatsApp/QR
    // handoff policy and lets a shopper safely continue after leaving the counter.
    const validityMs = 24 * 60 * 60 * 1000;
    // Counter QRs (tablet or billing link) may be printed or shown before the customer scans,
    // so their 24-hour window starts on first open.
    const counterPass = body.source === 'tablet-kiosk' || (hasValidBillingCode && body.source !== 'tv-kiosk');
    const code = crypto.randomBytes(18).toString('base64url');
    const pass: MaharajaVideoPass = {
      id: code,
      code,
      clientId: activeClientId(),
      phone,
      phoneMasked: phone ? maskPhone(phone) : '',
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
      ...(counterPass ? { activateOnScan: true } : {}),
      tryOnImageDone: false,
      tryOnImageUrl: '',
      videoMasterDone: Boolean(pregeneratedMasterUrl),
      videoMasterUrl: pregeneratedMasterUrl,
      videoMasterApproved: false,
      videoMasterApprovedUrl: '',
      ...(sourceSession ? {
        videoReferenceSessionId: referenceSessionId,
        videoPromptArchitectureVersion: VIDEO_PROMPT_ARCHITECTURE_VERSION,
        videoMasterCategory: sourceSession.templateId,
        videoMasterConceptId: sourceSession.conceptId,
        videoMasterGarmentType: sourceSession.garmentType,
        videoPersonPhotoStoragePath: sourceSession.personPhotoStoragePath,
        videoGarmentPhotoStoragePaths: sourceSession.garmentPhotoStoragePaths,
      } : {}),
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

    if (sourceSession) {
      const db = getDb();
      if (db) {
        await db.runTransaction(async (transaction) => {
          const ref = db.collection('sessions').doc(referenceSessionId);
          const fresh = (await transaction.get(ref)).data();
          if (fresh?.accessCode || fresh?.masterImageUrl !== pregeneratedMasterUrl) throw new Error('This portrait was already handed off. Create a new portrait.');
          transaction.set(ref, { accessCode: code, expiresAt: pass.expiresAt }, { merge: true });
          transaction.set(db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code), pass);
        });
      } else getMockStore().sessions.set(referenceSessionId, { ...sourceSession, accessCode: code, expiresAt: pass.expiresAt });
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
    if (pass.whatsappOptIn && isWhatsAppEnabled(workspace)) {
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

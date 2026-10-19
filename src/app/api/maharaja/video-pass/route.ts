import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AI_VIDEO_MIN_PURCHASE, isEventId, MAHARAJA_CLIENT_ID, ENFORCE_REPEAT_LIMITS } from '@/lib/maharaja/config';
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
} from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

function cleanPhone(value: unknown) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function cleanBillLast4(value: unknown) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
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
    const requestedTier = Number(body.billAmount || body.amount);
    if (![5000, 7000, 10000].includes(requestedTier)) {
      return NextResponse.json({ success: false, error: 'Select the customer bill tier: ₹5,000+, ₹7,000+, or ₹10,000+.' }, { status: 400 });
    }

    const phone = cleanPhone(body.phone);
    const billLast4 = cleanBillLast4(body.billLast4);
    if (phone.length !== 10) {
      return NextResponse.json({ success: false, error: 'Enter a valid 10 digit phone number.' }, { status: 400 });
    }
    if (billLast4.length !== 4) {
      return NextResponse.json({ success: false, error: 'Enter the last 4 characters or digits of the bill.' }, { status: 400 });
    }
    if (!isEventId(body.eventId)) {
      return NextResponse.json({ success: false, error: 'Select a valid event.' }, { status: 400 });
    }
    if (!workspace.activeEvents.includes(body.eventId)) {
      return NextResponse.json({ success: false, error: 'That event is currently inactive.' }, { status: 400 });
    }

    const now = Date.now();
    const code = crypto.randomBytes(18).toString('base64url');
    const pass: MaharajaVideoPass = {
      id: code,
      code,
      clientId: MAHARAJA_CLIENT_ID,
      phone,
      phoneMasked: maskPhone(phone),
      billLast4,
      eventId: body.eventId,
      status: 'active',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 1 * 60 * 60 * 1000).toISOString(),
      expiresAtMs: now + 1 * 60 * 60 * 1000,
      tryOnImageDone: false,
      tryOnImageUrl: '',
      videoMasterDone: false,
      videoMasterUrl: '',
      videoMasterApproved: false,
      videoMasterApprovedUrl: '',
      videoGenerating: false,
      videoDone: false,
      retryUsed: false,
      whatsappOptIn: body.whatsappOptIn === true,
      ...(body.whatsappOptIn === true ? { whatsappDeliveryStatus: 'pending' as const } : {}),
      usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
    };

    if (ENFORCE_REPEAT_LIMITS) {
      const expiredCount = await expireActivePassesForPhone(phone);
      if (expiredCount > 0) {
        await incrementMaharajaUsage('retries');
        await logMaharajaActivity('retry', `Previous AI Video QR superseded by retry (${maskPhone(phone)})`, {
          phone: maskPhone(phone),
          billLast4,
          target: 'video',
          service: 'ai-video',
        });
      }
    }

    const [entitlement] = await Promise.all([
      getCampaignEntitlementByPhone(phone),
      saveVideoPass(pass),
      incrementMaharajaUsage('videoPasses'),
      logMaharajaActivity('video-pass', `${pass.eventId} AI Video QR created`, {
        phone: pass.phoneMasked,
        billLast4: pass.billLast4,
        amount: requestedTier,
        whatsappOptIn: pass.whatsappOptIn === true,
      }),
    ]);
    const allowances = getCustomerServiceAllowances(entitlement);

    return NextResponse.json({
      success: true,
      allowances,
      pass: {
        code: pass.code,
        clientId: pass.clientId,
        phoneMasked: pass.phoneMasked,
        billLast4: pass.billLast4,
        eventId: pass.eventId,
        expiresAt: pass.expiresAt,
        link: `${req.nextUrl.origin}/maharaja/video/${pass.code}`,
        allowances,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create customer AI Video QR.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

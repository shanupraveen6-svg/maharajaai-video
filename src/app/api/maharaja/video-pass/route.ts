import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AI_VIDEO_MIN_PURCHASE, isEventId, MAHARAJA_CLIENT_ID, ENFORCE_REPEAT_LIMITS } from '@/lib/maharaja/config';
import {
  getMaharajaWorkspace,
  incrementMaharajaUsage,
  MaharajaVideoPass,
  saveVideoPass,
  expireActivePassesForPhone,
  logMaharajaActivity,
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
    const body = await req.json();
    const workspace = await getMaharajaWorkspace();

    if (!workspace.campaignEnabled) {
      return NextResponse.json({ success: false, error: 'Maharaja campaign is currently paused.' }, { status: 403 });
    }
    if (body.billingCode !== workspace.billingCode) {
      return NextResponse.json({ success: false, error: 'Invalid Maharaja billing-counter link.' }, { status: 403 });
    }
    if (body.eligible !== true) {
      return NextResponse.json({ success: false, error: `Confirm that the bill is at least Rs ${AI_VIDEO_MIN_PURCHASE}.` }, { status: 400 });
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

    await saveVideoPass(pass);
    await incrementMaharajaUsage('videoPasses');
    const requestedTier = Number(body.billAmount || body.amount);
    const billAmount = [5000, 7000, 10000].includes(requestedTier) ? requestedTier : AI_VIDEO_MIN_PURCHASE;
    await logMaharajaActivity('video-pass', `${pass.eventId} AI Video QR created`, {
      phone: pass.phoneMasked,
      billLast4: pass.billLast4,
        amount: billAmount,
        whatsappOptIn: pass.whatsappOptIn === true,
    });

    return NextResponse.json({
      success: true,
      pass: {
        code: pass.code,
        clientId: pass.clientId,
        phoneMasked: pass.phoneMasked,
        billLast4: pass.billLast4,
        eventId: pass.eventId,
        expiresAt: pass.expiresAt,
        link: `${req.nextUrl.origin}/maharaja/video/${pass.code}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create customer AI Video QR.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

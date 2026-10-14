import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getDb, getMockStore } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

const STORE_SLUG = 'maharaja';
const TRY_ON_MIN_AMOUNT = 500;
const AI_VIDEO_MIN_AMOUNT = 5000;

type AccessType = 'try-on' | 'ai-video' | 'both';
type CustomerPass = ReturnType<typeof buildPassPayload>;

function cleanPhone(value: unknown) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function cleanBillLast4(value: unknown) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
}

function cleanAccessType(value: unknown): AccessType {
  return value === 'try-on' || value === 'ai-video' || value === 'both' ? value : 'both';
}

function createAccessCode() {
  return crypto.randomBytes(4).toString('hex').slice(0, 7);
}

function maskPhone(phone: string) {
  if (phone.length < 10) return phone;
  return `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}

function buildPassPayload(body: Record<string, unknown>, origin: string) {
  const phone = cleanPhone(body.phone);
  const billLast4 = cleanBillLast4(body.billLast4);
  const purchaseAmount = Math.max(0, Math.floor(Number(body.purchaseAmount || 0)));
  const accessType = cleanAccessType(body.accessType);
  const nowMs = Date.now();
  const expiresAtMs = nowMs + 24 * 60 * 60 * 1000;
  const code = createAccessCode();
  const tryOnRequested = accessType === 'try-on' || accessType === 'both';
  const aiVideoRequested = accessType === 'ai-video' || accessType === 'both';
  const tryOnEligible = tryOnRequested && purchaseAmount >= TRY_ON_MIN_AMOUNT;
  const aiVideoEligible = aiVideoRequested && purchaseAmount >= AI_VIDEO_MIN_AMOUNT;
  const link = `${origin}/c/${STORE_SLUG}/${code}`;

  if (phone.length !== 10) {
    throw new Error('Enter a valid 10 digit customer phone number.');
  }
  if (billLast4.length < 4) {
    throw new Error('Enter the last 4 characters/digits of the bill.');
  }
  if (!tryOnEligible && !aiVideoEligible) {
    throw new Error('Purchase amount is not eligible for the selected service.');
  }

  return {
    id: code,
    code,
    storeSlug: STORE_SLUG,
    phone,
    phoneMasked: maskPhone(phone),
    billLast4,
    purchaseAmount,
    accessType,
    tryOnEligible,
    aiVideoEligible,
    tryOnEnabled: true,
    aiVideoEnabled: true,
    status: 'active',
    link,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    usage: {
      tryOnStarted: 0,
      aiVideoStarted: 0,
      downloads: 0,
      goLive: 0,
      retries: 0
    }
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized operator session.' }, { status: 401 });
    }

    const body = await req.json();
    const origin = req.nextUrl.origin;
    const pass = buildPassPayload(body, origin);
    const db = getDb();

    if (db) {
      await db.collection('customerPasses').doc(pass.code).set({
        ...pass,
        createdAtTimestamp: Timestamp.fromDate(new Date(pass.createdAt)),
        expiresAtTimestamp: Timestamp.fromDate(new Date(pass.expiresAt))
      });
    } else {
      getMockStore().customerPasses.set(pass.code, pass);
    }

    return NextResponse.json({ success: true, pass });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create customer pass.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized operator session.' }, { status: 401 });
    }

    const db = getDb();
    let passes: Array<Record<string, unknown>> = [];

    if (db) {
      const snapshot = await db.collection('customerPasses')
        .where('storeSlug', '==', STORE_SLUG)
        .orderBy('createdAtTimestamp', 'desc')
        .limit(12)
        .get();
      passes = snapshot.docs.map((doc: { id: string; data: () => Record<string, unknown> }) => ({ id: doc.id, ...doc.data() }));
    } else {
      passes = Array.from(getMockStore().customerPasses.values())
        .filter((item): item is CustomerPass => typeof item === 'object' && item !== null && (item as CustomerPass).storeSlug === STORE_SLUG)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 12);
    }

    return NextResponse.json({ success: true, passes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load passes.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

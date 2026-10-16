import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { parseBarcodePrice } from '@/lib/maharaja/barcode-price';
import { TRY_ON_MIN_PURCHASE } from '@/lib/maharaja/config';
import {
  getTryOnDeviceStatus,
  issueTryOnGrant,
  logMaharajaActivity,
  validTryOnDeviceId,
  verifyMaharajaAccess,
} from '@/lib/maharaja/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const access = await verifyMaharajaAccess(req, body.accessCode, 'try-on');
    if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    if (!validTryOnDeviceId(body.deviceId)) return NextResponse.json({ success: false, error: 'This device could not be verified. Reload the page and try again.' }, { status: 400 });

    const existing = await getTryOnDeviceStatus(body.deviceId);
    if (existing?.status === 'used') return NextResponse.json({ success: false, error: 'This device has already completed its Maharaja AI Try-On.' }, { status: 409 });
    if (existing?.status === 'processing') return NextResponse.json({ success: false, error: 'A Try-On is already being generated on this device.' }, { status: 409 });

    const barcode = typeof body.barcode === 'string' ? body.barcode.trim().slice(0, 512) : '';
    const printedText = typeof body.printedText === 'string' ? body.printedText.trim().slice(0, 4_000) : '';
    if (!barcode && !printedText) return NextResponse.json({ success: false, error: 'The printed MRP was not clear. Hold the complete tag steady in good light and tap Read MRP.' }, { status: 400 });
    const printedPrice = parseBarcodePrice(printedText);
    const parsed = printedPrice.amount !== null ? printedPrice : parseBarcodePrice(barcode);
    if (parsed.amount === null) {
      return NextResponse.json({
        success: true,
        analysis: {
          validTag: false,
          amount: null,
          eligible: false,
          format: typeof body.format === 'string' ? body.format.slice(0, 32) : 'unknown',
          message: 'Barcode detected, but the printed MRP was not clear. Keep the full tag flat, well lit and inside the frame.',
        },
        grant: null,
      });
    }

    const amount = parsed.amount;
    const eligible = amount >= TRY_ON_MIN_PURCHASE;
    const grant = eligible ? await issueTryOnGrant(body.deviceId, amount) : null;
    if (grant && !grant.allowed) return NextResponse.json({ success: false, error: grant.error }, { status: 409 });
    if (grant?.allowed) {
      const barcodeHash = crypto.createHash('sha256').update(barcode || printedText).digest('hex').slice(0, 16);
      await logMaharajaActivity('price-scan', `Eligible garment barcode scanned at Rs ${amount}`, {
        amount,
        barcodeHash,
        priceSource: parsed.source,
      });
    }

    return NextResponse.json({
      success: true,
      analysis: {
        validTag: true,
        amount,
        eligible,
        format: typeof body.format === 'string' ? body.format.slice(0, 32) : 'unknown',
        message: eligible
          ? `Price verified: Rs ${amount}.`
          : `Price verified: Rs ${amount}. Try-On requires Rs ${TRY_ON_MIN_PURCHASE} or more.`,
      },
      grant: grant?.allowed ? { token: grant.token, expiresAtMs: grant.expiresAtMs } : null,
    });
  } catch (error) {
    console.error('Barcode verification error:', error);
    return NextResponse.json({ success: false, error: 'The barcode could not be verified. Keep it inside the frame and try again.' }, { status: 500 });
  }
}

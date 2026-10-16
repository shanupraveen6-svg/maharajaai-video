import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { parseBarcodePrice } from '@/lib/maharaja/barcode-price';
import { TRY_ON_MIN_PURCHASE } from '@/lib/maharaja/config';
import {
  analyzeTagDuplicate,
  getTryOnDeviceStatus,
  issueTryOnGrant,
  logMaharajaActivity,
  validTryOnDeviceId,
  verifyMaharajaAccess,
} from '@/lib/maharaja/server';

export const maxDuration = 45;

/**
 * In-build, 100% local barcode decoder using sharp and ZXing.
 * Zero external API calls, zero network dependencies, runs offline.
 */
async function decodeBarcodeFromImageBuffer(base64Data: string): Promise<string> {
  if (typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) return '';
  try {
    const rawMatch = base64Data.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    const base64Str = rawMatch ? rawMatch[1] : base64Data;
    const buf = Buffer.from(base64Str, 'base64');
    const sharp = (await import('sharp')).default;
    const {
      MultiFormatReader,
      RGBLuminanceSource,
      BinaryBitmap,
      HybridBinarizer,
      DecodeHintType,
      BarcodeFormat,
    } = await import('@zxing/library');

    const { data, info } = await sharp(buf)
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const luminances = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
    const source = new RGBLuminanceSource(luminances, info.width, info.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const reader = new MultiFormatReader();
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.UPC_A,
      BarcodeFormat.ITF,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);

    const result = reader.decode(bitmap);
    return result.getText() || '';
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const access = await verifyMaharajaAccess(req, body.accessCode, 'try-on');
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }
    if (!validTryOnDeviceId(body.deviceId)) {
      return NextResponse.json(
        { success: false, error: 'This device could not be verified. Reload the page and try again.' },
        { status: 400 }
      );
    }

    const existing = await getTryOnDeviceStatus(body.deviceId);
    if (existing?.status === 'used') {
      return NextResponse.json(
        { success: false, error: 'This device has already completed its Maharaja AI Try-On. Thank you for visiting!' },
        { status: 409 }
      );
    }
    if (existing?.status === 'processing') {
      return NextResponse.json(
        { success: false, error: 'A Try-On is already being generated on this device.' },
        { status: 409 }
      );
    }

    let barcode = typeof body.barcode === 'string' ? body.barcode.trim().slice(0, 512) : '';
    const printedText = typeof body.printedText === 'string' ? body.printedText.trim().slice(0, 4_000) : '';

    // If no barcode was detected directly on client, try server-side ZXing decoding from the image
    if (!barcode && body.image) {
      barcode = await decodeBarcodeFromImageBuffer(body.image);
    }

    // 1. Check if user confirmed or entered an explicit amount (e.g. from UI confirmation)
    let amount: number | null = null;
    let priceSource = 'direct-entry';

    if (typeof body.amount === 'number' && Number.isFinite(body.amount) && body.amount > 0) {
      amount = Math.round(body.amount * 100) / 100;
    } else {
      // 2. Extract using in-build comprehensive price parser
      const parsedFromBarcode = parseBarcodePrice(barcode);
      const parsedFromText = parseBarcodePrice(printedText);

      if (parsedFromBarcode.amount !== null) {
        amount = parsedFromBarcode.amount;
        priceSource = parsedFromBarcode.source || 'barcode';
      } else if (parsedFromText.amount !== null) {
        amount = parsedFromText.amount;
        priceSource = parsedFromText.source || 'printed-label';
      }
    }

    // If still no price could be caught, prompt user clearly with the scanned code
    if (amount === null) {
      return NextResponse.json({
        success: true,
        analysis: {
          validTag: false,
          amount: null,
          eligible: false,
          scannedCode: barcode || null,
          format: typeof body.format === 'string' ? body.format.slice(0, 32) : 'unknown',
          message: barcode
            ? `Tag recognized (${barcode.slice(0, 20)}). Enter or confirm the printed MRP on this tag.`
            : 'Point the full-size camera at the garment price tag or barcode, then tap Capture.',
        },
        grant: null,
      });
    }

    // 3. Duplicate Analysis (Inbuild database / memory store, no external API)
    const tagIdentifier = barcode || printedText || `tag-amt-${amount}`;
    const duplicate = await analyzeTagDuplicate(body.deviceId, tagIdentifier, amount);

    // If another device already used this exact tag for a completed Try-On:
    if (duplicate.duplicateType === 'different_device_used') {
      await logMaharajaActivity(
        'duplicate-tag-scan',
        `Duplicate garment tag scan prevented (₹${amount})`,
        { amount, tagIdentifier: tagIdentifier.slice(0, 32), deviceId: body.deviceId }
      );
      return NextResponse.json({
        success: true,
        analysis: {
          validTag: true,
          amount,
          eligible: false,
          isDuplicate: true,
          duplicateType: 'different_device_used',
          message: `This garment tag (₹${amount}) has already been used for an AI Try-On by another shopper. Each garment can be tried on once. Please scan an unredeemed garment tag.`,
        },
        grant: null,
      });
    }

    // 4. Eligibility Check (Rs 500+ minimum)
    const eligible = amount >= TRY_ON_MIN_PURCHASE;

    let grant: { allowed: boolean; token?: string; expiresAtMs?: number; error?: string } | null = null;
    if (eligible) {
      grant = await issueTryOnGrant(body.deviceId, amount);
      if (grant && !grant.allowed) {
        return NextResponse.json({ success: false, error: grant.error }, { status: 409 });
      }
    }

    // 5. Activity Logging
    const barcodeHash = crypto.createHash('sha256').update(tagIdentifier).digest('hex').slice(0, 16);
    if (eligible && grant?.allowed) {
      const isReScan = duplicate.duplicateType === 'same_device';
      await logMaharajaActivity(
        'price-scan',
        isReScan
          ? `Garment price tag re-scanned and verified at Rs ${amount}`
          : `Eligible garment price tag scanned at Rs ${amount}`,
        {
          amount,
          barcodeHash,
          priceSource,
          isDuplicate: duplicate.isDuplicate,
          duplicateType: duplicate.duplicateType,
        }
      );
    }

    let successMessage = `Price verified: Rs ${amount}.`;
    if (!eligible) {
      successMessage = `REJECTED: Rs ${amount} is below Rs ${TRY_ON_MIN_PURCHASE} minimum. AI Try-On requires Rs ${TRY_ON_MIN_PURCHASE} or more.`;
    } else if (duplicate.duplicateType === 'same_device') {
      successMessage = `ENTER APPROVED: Rs ${amount}. Garment tag verified.`;
    } else {
      successMessage = `ENTER APPROVED: Rs ${amount}. Tag verified and eligible.`;
    }

    return NextResponse.json({
      success: true,
      analysis: {
        validTag: true,
        amount,
        eligible,
        isDuplicate: duplicate.isDuplicate,
        duplicateType: duplicate.duplicateType,
        scannedCount: duplicate.scannedCount,
        format: typeof body.format === 'string' ? body.format.slice(0, 32) : 'unknown',
        message: successMessage,
      },
      grant: grant?.allowed ? { token: grant.token, expiresAtMs: grant.expiresAtMs } : null,
    });
  } catch (error) {
    console.error('Inbuild price tag verification error:', error);
    return NextResponse.json(
      { success: false, error: 'The price tag could not be verified. Keep the tag inside the frame and try again.' },
      { status: 500 }
    );
  }
}

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { parseBarcodePrice } from '@/lib/maharaja/barcode-price';
import { TRY_ON_MIN_PURCHASE, ENFORCE_REPEAT_LIMITS } from '@/lib/maharaja/config';
import { AI_CONFIG } from '@/lib/ai/config';
import {
  analyzeTagDuplicate,
  getTryOnDeviceStatus,
  issueTryOnGrant,
  logMaharajaActivity,
  markTagUsedForTryOn,
  validTryOnDeviceId,
  verifyMaharajaAccess,
} from '@/lib/maharaja/server';

export const maxDuration = 45;

function getGenAIClient() {
  const apiKey = AI_CONFIG.PRIMARY_API_KEY || process.env.GOOGLE_AI_API_KEY_PRIMARY || process.env.GEMINI_API_KEY || '';
  if (!apiKey || apiKey.trim() === '') return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch {
    return null;
  }
}

function reject(message: string, amount: number | null = null) {
  return NextResponse.json({ success: true, analysis: { validTag: amount !== null, amount, eligible: false, message }, grant: null });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const access = await verifyMaharajaAccess(req, body.accessCode, 'try-on');
    if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    if (!validTryOnDeviceId(body.deviceId)) {
      return NextResponse.json({ success: false, error: 'This device could not be verified. Reload the page and try again.' }, { status: 400 });
    }

    if (ENFORCE_REPEAT_LIMITS) {
      const existing = await getTryOnDeviceStatus(body.deviceId);
      if (existing?.status === 'used') return NextResponse.json({ success: false, error: 'This device has already completed its Maharaja AI Try-On.' }, { status: 409 });
      if (existing?.status === 'processing') return NextResponse.json({ success: false, error: 'A Try-On is already being generated on this device.' }, { status: 409 });
    }

    // The price is always read server-side from the scanned tag; a client-sent amount is never trusted.
    let barcode = typeof body.barcode === 'string' ? body.barcode.trim().slice(0, 512) : '';
    const printedText = typeof body.printedText === 'string' ? body.printedText.trim().slice(0, 4_000) : '';
    const fromText = parseBarcodePrice(printedText);
    const parsed = fromText.amount !== null ? fromText : parseBarcodePrice(barcode);

    // Fast Gemini Vision analysis when a photo/frame is supplied
    if (parsed.amount === null && typeof body.image === 'string' && body.image.length > 50) {
      const ai = getGenAIClient();
      if (ai) {
        const imageBase64 = body.image.split(',')[1] || body.image;
        const models = Array.from(new Set([AI_CONFIG.GEMINI_ANALYSIS_MODEL, 'gemini-2.5-flash', 'gemini-1.5-flash'].filter(Boolean)));
        for (const model of models) {
          try {
            const resp = await ai.models.generateContent({
              model,
              contents: [
                { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
                'Analyze this garment price tag or label photo. Extract the printed Maximum Retail Price (MRP) in Indian Rupees (INR) and the barcode numbers if visible. Return JSON strictly in this format: {"amount": number | null, "barcode": string | null}'
              ],
              config: { responseMimeType: 'application/json' }
            });
            const text = resp.text || '';
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
              const data = JSON.parse(match[0]);
              if (typeof data.amount === 'number' && Number.isFinite(data.amount) && data.amount > 0) {
                parsed.amount = Math.round(data.amount);
                parsed.source = 'gemini-vision';
              }
              if (typeof data.barcode === 'string' && data.barcode.trim() && !barcode) {
                barcode = data.barcode.trim();
              }
            }
            if (parsed.amount !== null) {
              break;
            }
          } catch (visionErr) {
            console.warn(`Gemini price tag vision warning (${model}):`, visionErr);
          }
        }
      }
    }

    if (parsed.amount === null) {
      return reject('Price not read. Hold the full printed MRP steady in good light and capture it again.');
    }
    const amount = parsed.amount;

    if (amount < TRY_ON_MIN_PURCHASE) {
      return reject(`₹${amount} — AI Try-On is for garments ₹${TRY_ON_MIN_PURCHASE} and above.`, amount);
    }

    // Duplicate check uses the product barcode only (OCR text varies frame to frame).
    if (barcode) {
      const duplicate = await analyzeTagDuplicate(body.deviceId, barcode, amount);
      if (ENFORCE_REPEAT_LIMITS && duplicate.duplicateType === 'different_device_used') {
        await logMaharajaActivity('duplicate-tag-scan', `Duplicate garment tag rejected (₹${amount})`, {
          amount,
          barcodeHash: crypto.createHash('sha256').update(barcode).digest('hex').slice(0, 16),
        });
        return reject('This tag was already used for a Try-On on another phone. Please scan a different garment.', amount);
      }
    }

    const grant = await issueTryOnGrant(body.deviceId, amount);
    if (!grant.allowed) return NextResponse.json({ success: false, error: grant.error }, { status: 409 });
    if (barcode) await markTagUsedForTryOn(barcode);

    await logMaharajaActivity('price-scan', `Eligible garment tag scanned at Rs ${amount}`, {
      amount,
      barcodeHash: crypto.createHash('sha256').update(barcode || printedText).digest('hex').slice(0, 16),
      priceSource: parsed.source,
    });

    return NextResponse.json({
      success: true,
      analysis: { validTag: true, amount, eligible: true, message: `₹${amount} verified. Continue to your photos.` },
      grant: { token: grant.token, expiresAtMs: grant.expiresAtMs },
    });
  } catch (error) {
    console.error('Price tag verification error:', error);
    return NextResponse.json({ success: false, error: 'The price tag could not be verified. Please try again.' }, { status: 500 });
  }
}

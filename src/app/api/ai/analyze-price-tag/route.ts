import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { AI_CONFIG } from '@/lib/ai/config';
import { TRY_ON_MIN_PURCHASE } from '@/lib/maharaja/config';
import {
  getTryOnDeviceStatus,
  issueTryOnGrant,
  logMaharajaActivity,
  validTryOnDeviceId,
  verifyMaharajaAccess,
} from '@/lib/maharaja/server';

export const maxDuration = 45;

function parseDataUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const access = await verifyMaharajaAccess(req, body.accessCode, 'try-on');
    if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    if (!validTryOnDeviceId(body.deviceId)) return NextResponse.json({ success: false, error: 'This device could not be verified. Reload the page and try again.' }, { status: 400 });
    const existing = await getTryOnDeviceStatus(body.deviceId);
    if (existing?.status === 'used') return NextResponse.json({ success: false, error: 'This device has already completed its Maharaja AI Try-On.' }, { status: 409 });
    if (existing?.status === 'processing') return NextResponse.json({ success: false, error: 'A Try-On is already being generated on this device.' }, { status: 409 });

    const image = parseDataUrl(body.image);
    if (!image) return NextResponse.json({ success: false, error: 'Take a clear photo of the Maharaja price tag.' }, { status: 400 });

    if (!AI_CONFIG.PRIMARY_API_KEY) return NextResponse.json({ success: false, error: 'Image verification is not configured.' }, { status: 503 });

    const ai = new GoogleGenAI({ apiKey: AI_CONFIG.PRIMARY_API_KEY });
    const resp = await ai.models.generateContent({
      model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
      contents: [
        { inlineData: image },
        `Read this Maharaja clothing price tag.

Return the clearly visible selling price in Indian Rupees. Ignore barcode, SKU, size, dates and phone numbers. Accept an ordinary phone-camera photo as long as a retail tag and price can be read. If both MRP and discounted selling price are visible, use the selling price. Do not guess a price when the digits cannot be read.

Return ONLY valid JSON matching this exact structure:
{
  "validTag": boolean,
  "amount": number | null,
  "currency": "INR",
  "brandOrStore": "visible text or unknown",
  "confidence": number,
  "message": "short customer-safe result"
}

Never include markdown.
Never include commentary before or after JSON.`
      ],
    });
    const responseText = resp.text || '';
    const result = parseJson(responseText);
    const amount = Number(result?.amount || 0);
    const brand = String(result?.brandOrStore || '');
    const hasMaharaja = /maharaja/i.test(brand) || /maharaja/i.test(String(result?.message || ''));
    // Fail-closed: both validTag and verified Maharaja branding are required
    const validTag = result?.validTag === true && hasMaharaja && Number.isFinite(amount) && amount > 0;
    const eligible = validTag && amount >= TRY_ON_MIN_PURCHASE;
    const grant = eligible ? await issueTryOnGrant(body.deviceId, amount) : null;
    if (grant && !grant.allowed) return NextResponse.json({ success: false, error: grant.error }, { status: 409 });
    if (grant?.allowed) await logMaharajaActivity('price-scan', `Eligible garment scanned at Rs ${amount}`, { amount });

    return NextResponse.json({
      success: true,
      analysis: {
        validTag,
        amount: validTag ? amount : null,
        eligible,
        brandOrStore: brand || 'unknown',
        confidence: Number(result?.confidence || 0),
        message: validTag
          ? amount >= TRY_ON_MIN_PURCHASE ? `Price verified: Rs ${amount}.` : `Price verified: Rs ${amount}. Try-On requires Rs ${TRY_ON_MIN_PURCHASE} or more.`
          : 'The price tag could not be verified. Retake it in bright light with the full Maharaja tag and price clearly visible.',
      },
      grant: grant?.allowed ? { token: grant.token, expiresAtMs: grant.expiresAtMs } : null,
    });
  } catch (error) {
    console.error('Price tag analysis error:', error);
    return NextResponse.json({ success: false, error: 'The price tag could not be verified. Retake a clear photo.' }, { status: 500 });
  }
}

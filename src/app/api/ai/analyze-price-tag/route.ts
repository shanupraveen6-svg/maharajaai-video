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
    let responseText = '';
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await ai.models.generateContent({
          model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
          contents: [
            { inlineData: image },
            `Inspect this retail clothing price tag carefully.

VALIDATION REQUIREMENTS:
1. A physical retail merchandise tag must be clearly visible.
2. A valid Indian Rupee price must be clearly readable.
3. Do not guess blurred, cut-off, hidden, folded, reflected, or partially visible digits.
4. Ignore:
   - barcode numbers
   - SKU/style numbers
   - size numbers
   - dates
   - phone numbers
   - QR contents
   - unrelated numeric strings
5. If both MRP and a final/discounted selling price are clearly visible, return the final selling price.
6. If the final selling price cannot be determined with high confidence, validTag=false and amount=null.
7. The tag must show Maharaja / Majestic Maharaja branding or another explicitly server-approved store identifier.
8. If store identity cannot be confidently verified, validTag=false.
9. Glare, severe perspective distortion, finger obstruction, blur, cropping, or folded price digits must cause rejection instead of guessing.

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
        if (resp.text) {
          responseText = resp.text;
          break;
        }
      } catch (err: unknown) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
    if (!responseText && lastError) {
      console.warn('Gemini price tag analysis retry exhausted:', lastError);
      const isQuotaError = String(lastError).includes('429') || String(lastError).includes('RESOURCE_EXHAUSTED') || String(lastError).includes('quota');
      if (AI_CONFIG.ALLOW_MOCK_BACKEND && isQuotaError) {
        responseText = JSON.stringify({
          validTag: true,
          amount: 799,
          currency: 'INR',
          brandOrStore: 'Majestic Maharaja',
          confidence: 0.98,
          message: 'Price verified: Rs 799 (local test mock fallback - Gemini quota exhausted).'
        });
      }
    }
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

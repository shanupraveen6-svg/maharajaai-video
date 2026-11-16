import sharp from 'sharp';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { AI_CONFIG } from '@/lib/ai/config';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';
import { bindClient } from '@/lib/maharaja/client-context';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { OWN_GARMENT_TYPES } from '@/lib/tryfocus/garment-types';

export const dynamic = 'force-dynamic';

type Audience = keyof typeof OWN_GARMENT_TYPES;
export type GarmentCheckStatus = 'ok' | 'mismatch' | 'multiple' | 'unclear' | 'unchecked';

/**
 * Own try-on: right after the customer photographs their garment, before Generate. Checks in 2–4 seconds that
 * the photo shows exactly one garment and that it is what the customer chose on the left (a saree when they
 * chose Saree). A wrong choice never reaches the Try-On engines. If the check itself cannot run, the answer
 * is 'unchecked' and the customer can still go on (no fail state).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const access = await verifyMaharajaAccess(req, body.accessCode, 'try-on');
    bindClient(access.allowed ? access.clientId : null);
    if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: 401 });

    const audience: Audience = (['women', 'men', 'boys', 'girls'] as const).includes(body.audience) ? body.audience : 'women';
    const types = OWN_GARMENT_TYPES[audience];
    const chosen = types.find((type) => type.id === body.garmentType);
    const image = typeof body.image === 'string' ? body.image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '') : '';
    if (!chosen || !image) return NextResponse.json({ success: false, error: 'Choose what you are showing, then take the photo.' }, { status: 400 });

    const rate = await enforceRateLimit(req, 'garment-check', 40, 10 * 60 * 1000, typeof body.deviceId === 'string' ? body.deviceId : undefined);
    if (!rate.allowed) return NextResponse.json({ success: true, status: 'unchecked' satisfies GarmentCheckStatus });

    const apiKey = AI_CONFIG.PRIMARY_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ success: true, status: 'unchecked' satisfies GarmentCheckStatus });
    const small = (await sharp(Buffer.from(image, 'base64')).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()).toString('base64');

    const list = types.map((type) => `"${type.id}" (${type.label})`).join(', ');
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
      contents: [
        { inlineData: { mimeType: 'image/jpeg', data: small } },
        `A shop customer is showing one garment to a camera for a virtual try-on: held up in their hands, on a hanger, or laid flat. Ignore the clothes the person holding it is wearing, and the room. Count the separate garments being shown (a saree with its blouse piece, or a kurti with its matching dupatta, counts as one). Then say which of these types the shown garment is: ${list}, or "other" if none fits. Return JSON {"garments": number, "type": "<id or other>", "clear": true|false} where clear is false if the garment is too dark, blurred, cut off or too small to see.`,
      ],
      // A quick look, not a long think: the customer is waiting at the screen.
      config: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, abortSignal: AbortSignal.timeout(12_000) },
    });
    const parsed = JSON.parse(response.text || '{}');
    const garments = Number(parsed?.garments);
    const detected = types.find((type) => type.id === parsed?.type);
    let status: GarmentCheckStatus = 'ok';
    if (parsed?.clear === false || garments === 0) status = 'unclear';
    else if (garments > 1) status = 'multiple';
    else if (detected && detected.id !== chosen.id) status = 'mismatch';
    else if (!detected && parsed?.type === 'other') status = 'mismatch';
    return NextResponse.json({
      success: true,
      status,
      detectedType: detected?.id || null,
      detectedLabel: detected?.label || null,
    });
  } catch (error) {
    console.warn('Garment check could not run:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: true, status: 'unchecked' satisfies GarmentCheckStatus });
  }
}

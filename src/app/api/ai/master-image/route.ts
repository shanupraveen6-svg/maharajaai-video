import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { GoogleGenAI } from '@google/genai';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export const maxDuration = 60;

function getGenAIClient() {
  const apiKey = AI_CONFIG.PRIMARY_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    return null;
  }
}

function formatGeminiImageError(error: any) {
  const raw = error?.message || String(error || 'Unknown Gemini error.');
  const lower = raw.toLowerCase();

  if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('free tier')) {
    return 'Gemini image quota is exhausted or the Vercel API key is connected to a free-tier Google AI project. Create/use an API key from the paid/prepay Maharaja project and update GOOGLE_AI_API_KEY_PRIMARY in Vercel.';
  }

  if (lower.includes('api key') || lower.includes('permission') || lower.includes('unauthenticated')) {
    return 'Gemini API key is invalid or does not have access to image generation. Update GOOGLE_AI_API_KEY_PRIMARY in Vercel with the Maharaja project API key.';
  }

  if (lower.includes('model') || lower.includes('not found')) {
    return `Gemini image model is not available for this API key/project. Current model: ${AI_CONFIG.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image'}.`;
  }

  return raw.length > 280 ? `${raw.slice(0, 280)}...` : raw;
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized operator session. Please login again.' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, garmentAnalysis, personAnalysis, personPhoto, garmentPhotos, conceptPrompt, templateId } = body;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required.' }, { status: 400 });
    }

    if (!personPhoto) {
      return NextResponse.json(
        { success: false, error: 'Customer photo is missing. Upload one clear customer photo before generating the AI image.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(garmentPhotos) || garmentPhotos.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Garment photo is missing. Upload at least one garment photo before generating the AI image.' },
        { status: 400 }
      );
    }

    const isDemoAsset = AI_CONFIG.IS_DEMO_MODE;
    const nowIso = new Date().toISOString();

    let masterImageUrl = '';

    if (body.usePreset) {
      masterImageUrl = '/test-master-women.jpg';
    } else if (isDemoAsset) {
      return NextResponse.json(
        { success: false, error: 'Real Gemini master image generation is disabled because DEMO_MODE=true.' },
        { status: 400 }
      );
    } else {
      const ai = getGenAIClient();
      if (!ai) {
        return NextResponse.json(
          { success: false, error: 'Gemini image generation key is missing. Upload an AI image manually or configure GOOGLE_AI_API_KEY_PRIMARY.' },
          { status: 500 }
        );
      }

      try {
        const contents: any[] = [];

        if (personPhoto) {
          const personBase64 = personPhoto.split(',')[1] || personPhoto;
          contents.push({ inlineData: { mimeType: 'image/jpeg', data: personBase64 } });
        }

        if (garmentPhotos && Array.isArray(garmentPhotos)) {
          garmentPhotos.forEach((photo: string) => {
            const garmentBase64 = photo.split(',')[1] || photo;
            contents.push({ inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } });
          });
        }

        const templatePrompt = typeof conceptPrompt === 'string' && conceptPrompt.trim()
          ? conceptPrompt.trim()
          : 'Create an elegant premium Diwali fashion setting with warm glowing diyas, traditional lamps, subtle rangoli, floral decorations and refined festive golden lighting.';

        const prompt = `Create a photorealistic vertical 9:16 full-body Indian festive fashion master image.
Use the first uploaded image as the exact customer identity reference. Preserve facial identity, facial features, face shape, skin tone, hairstyle, body proportions, age appearance and likeness.
Use remaining garment images as exact clothing reference. Preserve garment primary color, fabric, embroidery, motifs, borders, silhouette and design.
Dress the same customer naturally in the selected garment.
Apply this selected template: ${templatePrompt}
Maintain strict full-body head-to-toe framing. Modest, family-friendly, premium fashion campaign look.`;

        contents.push(prompt);

        const imageModel = AI_CONFIG.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
        const genResponse = await ai.models.generateContent({
          model: imageModel,
          contents,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio: '9:16' },
          },
        });

        const candidate = genResponse.candidates?.[0];
        const part = candidate?.content?.parts?.find((p: any) => p.inlineData);
        if (part?.inlineData?.data) {
          const imageBase64 = part.inlineData.data;
          masterImageUrl = `data:image/jpeg;base64,${imageBase64}`;

          const bucket = getStorageBucket();
          if (bucket) {
            const fileBuffer = Buffer.from(imageBase64, 'base64');
            const storagePath = `sessions/${sessionId}/master/master.jpg`;
            const file = bucket.file(storagePath);
            await file.save(fileBuffer, { contentType: 'image/jpeg', public: false });
            const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
            masterImageUrl = signedUrl;
          }
        } else {
          return NextResponse.json(
            { success: false, error: 'Gemini returned no image. No fallback image was used. Upload a manual AI image or retry after checking the model.' },
            { status: 502 }
          );
        }
      } catch (genError: any) {
        console.error('Gemini Master Image Generation Error:', genError);
        return NextResponse.json(
          { success: false, error: formatGeminiImageError(genError) },
          { status: 500 }
        );
      }
    }

    const db = getDb();

    if (db) {
      await db.collection('sessions').doc(sessionId).set({
        sessionId,
        garmentAnalysis,
        personAnalysis,
        templateId: templateId || null,
        masterImageUrl,
        masterStoragePath: `sessions/${sessionId}/master/master.jpg`,
        status: 'master_ready',
        updatedAt: nowIso
      }, { merge: true });
    } else {
      const mockStore = getMockStore();
      mockStore.sessions.set(sessionId, {
        sessionId,
        garmentAnalysis,
        personAnalysis,
        templateId: templateId || null,
        masterImageUrl,
        masterStoragePath: `sessions/${sessionId}/master/master.jpg`,
        status: 'master_ready',
        updatedAt: nowIso
      });
    }

    return NextResponse.json({
      success: true,
      sessionId,
      masterImageUrl,
      isDemoAsset,
      operatorMessage: 'Master fashion reference generated successfully.'
    });
  } catch (error: any) {
    console.error('Master Image Route Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate master reference image.' },
      { status: 500 }
    );
  }
}

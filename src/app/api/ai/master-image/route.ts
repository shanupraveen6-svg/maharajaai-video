import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { GoogleGenAI } from '@google/genai';

function getGenAIClient() {
  const apiKey = AI_CONFIG.PRIMARY_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, garmentAnalysis, personAnalysis, personPhoto, garmentPhotos, conceptPrompt, templateId } = body;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required.' }, { status: 400 });
    }

    const isDemoAsset = AI_CONFIG.IS_DEMO_MODE;
    const nowIso = new Date().toISOString();

    const ai = getGenAIClient();

    if (isDemoAsset) {
      return NextResponse.json(
        {
          success: false,
          error: 'Real Gemini image generation is disabled because DEMO_MODE=true. Set DEMO_MODE=false in Vercel before shop testing.'
        },
        { status: 400 }
      );
    }

    if (!ai) {
      return NextResponse.json(
        { success: false, error: 'Gemini API key is not configured for master image synthesis.' },
        { status: 500 }
      );
    }

    let masterImageUrl = '';

    try {
        const contents: any[] = [];

        // 1. Person photo inlineData (customer reference for facial identity & body proportions)
        if (personPhoto) {
          const personBase64 = personPhoto.split(',')[1] || personPhoto;
          contents.push({
            inlineData: { mimeType: 'image/jpeg', data: personBase64 }
          });
        }

        // 2. Garment photo(s) inlineData (product reference for exact garment, color & embroidery)
        if (garmentPhotos && Array.isArray(garmentPhotos)) {
          garmentPhotos.forEach((photo: string) => {
            const garmentBase64 = photo.split(',')[1] || photo;
            contents.push({
              inlineData: { mimeType: 'image/jpeg', data: garmentBase64 }
            });
          });
        }

        const templatePrompt = typeof conceptPrompt === 'string' && conceptPrompt.trim()
          ? conceptPrompt.trim()
          : 'Create an elegant premium Diwali fashion setting with warm glowing diyas, traditional lamps, subtle rangoli, floral decorations and refined festive golden lighting.';

        const prompt = `Create a photorealistic vertical 9:16 full-body Indian festive fashion master image.
Use the first uploaded image as the exact customer identity reference. Preserve the same facial identity, facial features, face shape, skin tone, hairstyle, approximate body proportions, age appearance and overall likeness. Make the customer look polished with lighting and grooming only; do not replace them with a different model or celebrity-like face.
Use the remaining uploaded garment images as the exact clothing reference. Preserve the garment's real primary color, secondary colors, fabric appearance, embroidery, motifs, borders, pattern placement, neckline, sleeves, silhouette and overall design.
Dress the same customer naturally and realistically in the selected garment as a complete full-length outfit.
If the uploaded product contains only a top garment, create a tasteful complementary traditional bottom that matches the product without altering the supplied garment itself.
Apply this selected Maharaja template:
${templatePrompt}
Maintain strict full-body head-to-toe framing. The complete outfit must be clearly visible.
Styling should be attractive, premium and realistic, with natural posture, subtle festive makeup and elegant Indian traditional styling suitable for the customer. Keep the image modest, respectful, family-friendly and suitable for a Thanjavur retail store. Focus on the complete outfit, fabric, festive mood and graceful presence, not on individual body parts.
Do not change the customer's identity. Do not redesign the garment. Do not change garment color, embroidery, motifs or pattern. Do not change menswear into womenswear or womenswear into menswear. Do not create duplicate people, extra limbs, malformed hands, random text or logos.
The final image should look like a premium Maharaja festive fashion campaign photograph.`;

        contents.push(prompt);

        let imageBase64: string | null = null;

        // Multimodal image synthesis passing person & garment reference photo parts with explicit 9:16 aspect ratio
        const genResponse = await ai.models.generateContent({
          model: AI_CONFIG.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
          contents,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
              aspectRatio: '9:16',
            },
          },
        });

        const candidate = genResponse.candidates?.[0];
        const part = candidate?.content?.parts?.find((p: any) => p.inlineData);
        if (part?.inlineData?.data) {
          imageBase64 = part.inlineData.data;
        }

        if (!imageBase64) {
          throw new Error('Gemini image generation model failed to return a valid master image payload.');
        }

        masterImageUrl = `data:image/jpeg;base64,${imageBase64}`;

        // Store privately in Firebase Storage (public: false)
        const bucket = getStorageBucket();
        if (bucket && imageBase64) {
          const fileBuffer = Buffer.from(imageBase64, 'base64');
          const storagePath = `sessions/${sessionId}/master/master.jpg`;
          const file = bucket.file(storagePath);
          await file.save(fileBuffer, { contentType: 'image/jpeg', public: false });
          const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
          masterImageUrl = signedUrl;
        }
    } catch (genError: any) {
      console.error('Gemini Master Image Generation Failed:', genError);
      return NextResponse.json(
        { success: false, error: `Master Image generation failed: ${genError.message}` },
        { status: 500 }
      );
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
      operatorMessage: isDemoAsset
        ? 'Demo Master Reference Image loaded (Real Google Image synthesis active when DEMO_MODE=false).'
        : 'Master fashion reference synthesized successfully.'
    });
  } catch (error: any) {
    console.error('Master Image Route Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate master reference image.' },
      { status: 500 }
    );
  }
}

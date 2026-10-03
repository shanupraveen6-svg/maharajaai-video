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
    const { sessionId, garmentAnalysis, personAnalysis, personPhoto, garmentPhotos } = body;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required.' }, { status: 400 });
    }

    let masterImageUrl = personPhoto || '/sample-master.jpg';
    const isDemoAsset = AI_CONFIG.IS_DEMO_MODE;
    const nowIso = new Date().toISOString();

    const ai = getGenAIClient();

    if (!isDemoAsset) {
      if (!ai) {
        return NextResponse.json(
          { success: false, error: 'Gemini API key is not configured for master image synthesis.' },
          { status: 500 }
        );
      }

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

        const prompt = `CRITICAL PRODUCT LOCK:
The uploaded garment photos are the product being sold. The model must wear the exact same uploaded product outfit. Do not create a kurta, sherwani, festive costume, jacket, robe, saree, lehenga, or any different clothing unless that exact item is visible in the product photos. Diwali styling is allowed only in the background, lights, lamps, flowers, rangoli, and showroom mood. The clothes must stay exactly like the product photos.

Create a premium cinematic 9:16 vertical full-body Maharaja Diwali showroom fashion advertisement master image.

Use the first input image only as the exact customer identity and body reference. Preserve the same face, facial structure, eyes, nose, smile, jawline, skin tone, hairstyle, age appearance, height impression, body proportions, and natural presence. Facial match must be very close to the uploaded customer photo. Ignore and replace the clothes worn in the customer photo. Do not beautify by changing identity or body shape.

Use the remaining input images as the exact garment reference and the main sales product. The customer must wear the exact uploaded product outfit, not a newly invented festive outfit. Preserve the real ${garmentAnalysis?.primaryColor || 'selected outfit'} color, secondary colors, fabric appearance, embroidery, motifs, borders, neckline, sleeve shape, silhouette, buttons, pockets, cargo pockets, stitching, wrinkles, fit, length, pattern placement, and styling details of the ${garmentAnalysis?.garmentType || 'outfit'}.

Do not convert the outfit into a kurta, sherwani, saree, lehenga, or other traditional costume unless that exact garment is visible in the uploaded reference photos. If the uploaded garment is a shirt, pants, cargo, casualwear, kidswear, or westernwear, preserve that exact style.

Make the customer look like a premium fashion model in a luxury retail campaign while still looking like the same real person. Improve only posture, styling, lighting, grooming polish, and scene quality; do not alter identity or body shape.

Match the presentation tone naturally to the customer: elegant and confident for men, graceful and refined for women, cheerful and premium for kids. Do not change gender presentation, age appearance, or facial identity.

Only the environment, lighting, and mood should become grand Diwali-themed. Set the scene inside a premium Maharaja Thanjavur showroom campaign environment: warm diya glow, brass lamps, subtle rangoli, marigold flowers, rich maroon and gold accents, refined festive decor, luxury festive entrance, soft cinematic bokeh, and elegant luxury retail atmosphere.

Optional text: if a greeting is shown as a small elegant showroom banner or final festive card, use only this exact Tamil text with correct spelling: "இனிய தீபாவளி நல்வாழ்த்துகள்". Do not add any other text.

Lighting and camera: warm golden key light, soft rim light for separation, gentle diya highlights on face and fabric, realistic skin texture, editorial 50mm fashion photography feel, full-body vertical composition, slightly low flattering camera height, graceful posture, natural confident smile, and sharp garment visibility from collar to footwear.

Adapt the pose, camera height, drape, and lighting to flatter the individual naturally while preserving real identity, skin tone, and body proportions. If the garment is dark, add warm rim light and golden background separation. If the garment has heavy embroidery, emphasize detailed light on the fabric.

No duplicate people, no extra limbs, no distorted hands, no random text except the exact Tamil greeting above, no fake logos, no face change, no skin tone change, no garment type change, no garment redesign, no garment color change, no traditional outfit substitution.`;

        contents.push(prompt);

        let imageBase64: string | null = null;

        // Multimodal image synthesis passing person & garment reference photo parts with explicit 9:16 aspect ratio
        const genResponse = await ai.models.generateContent({
          model: AI_CONFIG.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
          contents,
          config: {
            imageConfig: {
              aspectRatio: '9:16'
            }
          }
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
    }

    const db = getDb();

    if (db) {
      await db.collection('sessions').doc(sessionId).set({
        sessionId,
        garmentAnalysis,
        personAnalysis,
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

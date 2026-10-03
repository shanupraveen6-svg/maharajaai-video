import { GoogleGenAI } from '@google/genai';
import { AI_CONFIG } from './config';
import { GarmentAnalysisSchema, PersonAnalysisSchema } from './schemas';

function getGenAIClient() {
  const apiKey = AI_CONFIG.PRIMARY_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    console.warn('Failed to initialize GoogleGenAI client:', err);
    return null;
  }
}

// 1. Analyze Garment Photos using Gemini + Zod Validation
export async function analyzeGarmentImages(imageDataUrls: string[]) {
  const ai = getGenAIClient();

  if (AI_CONFIG.IS_DEMO_MODE || !ai) {
    if (!AI_CONFIG.IS_DEMO_MODE && !ai) {
      throw new Error('Gemini API key is missing or invalid outside Demo Mode.');
    }
    const fallback = {
      valid: true,
      category: "Men's Luxury Ethnic Wear",
      garmentType: "Kurta",
      coverage: "top_only" as const,
      primaryColor: "Royal Deep Maroon",
      secondaryColors: ["Zari Gold", "Crimson"],
      fabricAppearance: "Pure Banarasi Silk",
      embroideryDescription: "Intricate gold zari embroidery along collar, button placket, and cuffs",
      patternDescription: "Traditional royal motif borders",
      additionalPhotoRequired: false,
      requestedPhotos: [],
      complementaryPieces: {
        recommendedBottom: "Silk Cream Churidar",
        rationale: "Classic contrast that elevates the maroon silk kurta without overpowering"
      },
      operatorMessage: "Garment scan verified successfully."
    };
    return GarmentAnalysisSchema.parse(fallback);
  }

  try {
    const contents = imageDataUrls.map((url) => {
      const base64Data = url.split(',')[1] || url;
      return {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      };
    });

    const prompt = `Analyze these garment photos for Maharaja Ready-Made Store in Thanjavur.
Identify:
1. Category (Men's / Women's / Kid's)
2. Garment type (Kurta, Sherwani, Lehenga, Saree, Kurti, Salwar, Dhoti, Veshti, etc.)
3. Coverage (top_only or full_set)
4. Primary and secondary colors
5. Fabric appearance & embroidery/pattern details
6. If top_only, recommend a complementary lower garment
7. Check if photo clarity/framing is sufficient.

Return STRICT JSON matching this schema:
{
  "valid": boolean,
  "category": string,
  "garmentType": string,
  "coverage": "top_only" | "full_set",
  "primaryColor": string,
  "secondaryColors": string[],
  "fabricAppearance": string,
  "embroideryDescription": string,
  "patternDescription": string,
  "additionalPhotoRequired": boolean,
  "requestedPhotos": string[],
  "complementaryPieces": { "recommendedBottom": string, "rationale": string },
  "operatorMessage": string
}`;

    const response = await ai.models.generateContent({
      model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
      contents: [...contents, prompt]
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return GarmentAnalysisSchema.parse(parsed);
    }
    throw new Error('Could not parse JSON from Gemini response');
  } catch (error) {
    console.error('Gemini Garment Analysis Error:', error);
    if (!AI_CONFIG.IS_DEMO_MODE) {
      throw error;
    }
    const fallback = {
      valid: true,
      category: "Men's Ethnic Wear",
      garmentType: "Kurta",
      coverage: "top_only" as const,
      primaryColor: "Royal Deep Maroon",
      secondaryColors: ["Zari Gold"],
      fabricAppearance: "Banarasi Silk",
      embroideryDescription: "Gold zari embroidery along collar",
      patternDescription: "Festive border",
      additionalPhotoRequired: false,
      requestedPhotos: [],
      complementaryPieces: { recommendedBottom: "Gold Silk Churidar", rationale: "Complements kurta" },
      operatorMessage: "Analysis fallback completed."
    };
    return GarmentAnalysisSchema.parse(fallback);
  }
}

// 2. Validate Person Photo using Gemini + Zod Validation
export async function analyzePersonImage(imageDataUrl: string) {
  const ai = getGenAIClient();

  if (AI_CONFIG.IS_DEMO_MODE || !ai) {
    if (!AI_CONFIG.IS_DEMO_MODE && !ai) {
      throw new Error('Gemini API key is missing or invalid outside Demo Mode.');
    }
    const fallback = {
      valid: true,
      subjectGroup: "adult" as const,
      fullBodyVisible: true,
      faceVisible: true,
      lightingQuality: "excellent" as const,
      additionalPhotoRequired: false,
      requestedPhotos: [],
      operatorMessage: "Customer photo verified cleanly."
    };
    return PersonAnalysisSchema.parse(fallback);
  }

  try {
    const base64Data = imageDataUrl.split(',')[1] || imageDataUrl;
    const prompt = `Inspect this customer photograph for AI video generation.
Verify:
1. Exactly one person present
2. Face clearly visible
3. Body sufficiently visible
4. Good lighting quality
5. Subject group (adult or child)

Return STRICT JSON:
{
  "valid": boolean,
  "subjectGroup": "adult" | "child",
  "fullBodyVisible": boolean,
  "faceVisible": boolean,
  "lightingQuality": "excellent" | "acceptable" | "poor",
  "additionalPhotoRequired": boolean,
  "requestedPhotos": string[],
  "operatorMessage": string
}`;

    const response = await ai.models.generateContent({
      model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
      contents: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
        prompt
      ]
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return PersonAnalysisSchema.parse(parsed);
    }
    throw new Error('Could not parse JSON from person analysis');
  } catch (error) {
    console.error('Gemini Person Analysis Error:', error);
    if (!AI_CONFIG.IS_DEMO_MODE) {
      throw error;
    }
    const fallback = {
      valid: true,
      subjectGroup: "adult" as const,
      fullBodyVisible: true,
      faceVisible: true,
      lightingQuality: "excellent" as const,
      additionalPhotoRequired: false,
      requestedPhotos: [],
      operatorMessage: "Customer photo verified."
    };
    return PersonAnalysisSchema.parse(fallback);
  }
}

// 3. Controlled Video Prompt Builder
export function buildVideoPrompt(analysis: any, conceptPrompt?: string): string {
  const garmentType = analysis?.garmentType || 'outfit';
  const primaryColor = analysis?.primaryColor || 'selected garment';
  const embroidery = analysis?.embroideryDescription || 'visible garment details';
  const fabric = analysis?.fabricAppearance || 'real fabric texture';

  return `CRITICAL PRODUCT LOCK:
The uploaded master image outfit is the product being sold. Keep the exact same outfit for the full video. Do not create a kurta, sherwani, festive costume, jacket, robe, saree, lehenga, or any different clothing unless it is already shown in the master image. Diwali styling is allowed only in the background, lights, lamps, flowers, rangoli, and showroom mood. The clothes must stay exactly like the master image.

Create a premium cinematic 6-second vertical 9:16 Maharaja Diwali showroom fashion commercial using the uploaded master image as the exact visual reference.

The uploaded outfit is the sales product and hero of the ad. Preserve the same person identity, face, eyes, nose, smile, jawline, skin tone, hairstyle, age appearance, height impression, body proportions, ${primaryColor} ${garmentType}, ${fabric}, ${embroidery}, garment color, embroidery, motifs, borders, shirt/pant structure, pockets, cargo pockets, stitching, wrinkles, fit, bottom wear, footwear, and complete outfit throughout the video.

The outfit must remain exactly as shown in the master image. Do not convert the outfit into a kurta, sherwani, saree, lehenga, or other festive costume unless the master image already shows that exact outfit.

Shot style: luxury retail Diwali fashion model film. The subject stands gracefully in the same outfit, looking like a premium showroom campaign model while still being the same real person. Use a slow cinematic dolly push-in from full-body head-to-toe framing, with subtle natural breathing, soft smile, gentle fabric motion, and elegant hand placement. If a diya is used, keep it small and away from the garment so the product remains clearly visible.

Match the presentation tone naturally to the customer: elegant and confident for men, graceful and refined for women, cheerful and premium for kids. Facial match must remain very close for the full video.

${typeof conceptPrompt === 'string' && conceptPrompt.trim() ? conceptPrompt.trim() : 'Concept: Royal showroom campaign film. Use a premium Diwali showroom scene with confident fashion-ad posture, warm brass lamps, marigold decor and rich cinematic depth.'}

Camera and lighting: 35mm cinematic lens look, warm golden key light, soft rim light, diya glow on face and garment, festive background bokeh, rich maroon-gold Diwali color grade, premium Maharaja showroom atmosphere, realistic skin texture, sharp focus on garment details and face.

Keep full body visible from head to toe throughout the entire 6 seconds. The garment must remain clearly visible and unchanged. The motion should be slow, graceful, premium, and suitable for an in-store fashion advertisement.

Optional text: if a greeting appears as a small elegant final card or showroom banner, use only this exact Tamil text with correct spelling: "இனிய தீபாவளி நல்வாழ்த்துகள்". Do not add any other text or generated logos.

Do not change the face. Do not change skin tone. Do not change body shape. Do not swap outfit. Do not change garment type, color, fit, bottom wear, footwear, or design. No traditional outfit substitution. No dancing, no spinning, no fast walking, no duplicate person, no extra limbs, no malformed hands, no face morphing, no random text except the exact Tamil greeting above, no generated logo.`;
}

// 4. Quality Assurance Evaluation (Fix 13: Freeze Fake QA)
export async function runQualityAssurance(masterImageUrl: string, videoUrl: string) {
  return {
    approved: false,
    qaStatus: "not_implemented",
    identityAcceptable: false,
    garmentAcceptable: false,
    motionAcceptable: false,
    majorIssues: ["AI Keyframe QA is not implemented yet"],
    operatorMessage: "AI QA inspection pending operator review."
  };
}

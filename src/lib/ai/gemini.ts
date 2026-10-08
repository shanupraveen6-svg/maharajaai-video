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
      category: "Uploaded Fashion Garment",
      garmentType: "Uploaded outfit",
      coverage: "top_only" as const,
      primaryColor: "Exact uploaded garment color",
      secondaryColors: [],
      fabricAppearance: "Exact uploaded fabric texture",
      embroideryDescription: "Exact uploaded garment details",
      patternDescription: "Exact uploaded garment pattern",
      additionalPhotoRequired: false,
      requestedPhotos: [],
      complementaryPieces: {
        recommendedBottom: "A tasteful complementary bottom only if the uploaded outfit needs one",
        rationale: "Complements the uploaded garment without changing its original design"
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
      category: "Uploaded Fashion Garment",
      garmentType: "Uploaded outfit",
      coverage: "top_only" as const,
      primaryColor: "Exact uploaded garment color",
      secondaryColors: [],
      fabricAppearance: "Exact uploaded fabric texture",
      embroideryDescription: "Exact uploaded garment details",
      patternDescription: "Exact uploaded garment pattern",
      additionalPhotoRequired: false,
      requestedPhotos: [],
      complementaryPieces: {
        recommendedBottom: "A tasteful complementary bottom only if the uploaded outfit needs one",
        rationale: "Complements the uploaded garment without changing its original design"
      },
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
  const scene = typeof conceptPrompt === 'string' && conceptPrompt.trim()
    ? conceptPrompt.trim()
    : 'A premium Maharaja Diwali fashion setting with warm golden festive lighting, diyas, brass lamps and marigold flowers.';

  return `Create a photorealistic 6-second vertical 9:16 silent Diwali fashion video from the attached master image, using it as the first frame. The video must be exactly 6 seconds long.

IDENTITY LOCK (highest priority): every frame must show the EXACT same person as the master image: identical face, facial features, face shape, eyes, eyebrows, nose, lips, skin tone, hairstyle and hair length, age appearance, body size, height and proportions, plus glasses, bindi, earrings, necklace and any other accessories. Do not beautify, slim, enlarge, restyle or morph the person. Do not change gender styling.
OUTFIT LOCK: keep the exact outfit from the master image: same colors, fabric, embroidery, pattern placement, drape/dupatta and hem length. Never invent or change a color.

SCENE AND STYLE: ${scene}

MOTION: very slow and calm. For the first 3 seconds take a few small slow steps with the head and face frontal to the camera, then stand still and give a soft natural smile for the final 3 seconds. The camera stays locked and steady: no zoom, push-in, pan or cut. No head turns, dancing, spinning, jumping or big pose changes. Natural fabric movement and anatomically correct hands.

FRAMING: full-body head-to-toe for the entire video, person centered, face large enough to stay sharp and stable. Modest, respectful, family-friendly, suitable for a Thanjavur fashion store. Do not emphasize legs, hips, chest, waist or any isolated body part. No glamour or seductive posing.

AUDIO: silent. No speech, voice, music or lip-sync; mouth closed or softly smiling.

NO TEXT: do not render any text, captions, banners or logos in the video.

Realistic, premium, sharp focus, warm festive color grading. No duplicate person, extra limbs or malformed hands.`;
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

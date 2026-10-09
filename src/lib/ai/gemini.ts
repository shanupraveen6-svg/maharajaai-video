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
  const prompt = typeof conceptPrompt === 'string' && conceptPrompt.trim()
    ? conceptPrompt.trim()
    : `Create a premium photorealistic 6-second vertical 9:16 Diwali fashion video from the provided image. Use the image as the exact sharp first frame. Preserve the exact same person, face, identity, age, skin tone, body size, body proportions, outfit fit, garment color, fabric texture, footwear, background, lighting and decorations throughout. Failure-proof rule: the person stays in the same modest front-facing or slight three-quarter still pose. No walking, no dancing, no hand movement, no leg movement, no body turn, no fabric stretch, no slimming, no body resizing, no outfit tightening or loosening. Cinematic motion uses two safe effects only: smooth dolly-in with tiny side truck, plus festive lighting/background shimmer such as diya flicker, lens flare, bokeh, lantern glow or distant crackers. Start sharp immediately. Casual tiny head/eye movement and soft smile only. End with a clean slow zoom-out reveal for TV slow-motion playback. no 180 orbit, no 360 orbit, no spin, no dutch roll, no snap zoom, no back view. No dialogue, no lip-sync, no mouth speaking, no text, no captions, no signage, no letters, no face change, no outfit change, no slippers, no casual bathroom sandals, no extra limbs.`;

  return prompt.length > 1950 ? prompt.slice(0, 1950) : prompt;
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

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
      primaryColor: "Royal Silk Blue",
      secondaryColors: ["Zari Gold"],
      fabricAppearance: "Pure Silk",
      embroideryDescription: "Intricate gold zari embroidery along collar, placket, and cuffs",
      patternDescription: "Traditional royal motif borders",
      additionalPhotoRequired: false,
      requestedPhotos: [],
      complementaryPieces: {
        recommendedBottom: "Silk Cream Churidar",
        rationale: "Classic contrast that elevates the silk outfit without overpowering"
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
  const primaryColor = analysis?.primaryColor || 'selected garment color';
  const embroidery = analysis?.embroideryDescription || 'visible garment details';
  const fabric = analysis?.fabricAppearance || 'real fabric texture';

  return `Create a photorealistic premium 6-second vertical 9:16 Diwali fashion commercial using the uploaded master reference image as the definitive visual reference.
Preserve the exact same person's facial identity, facial features, face shape, skin tone, hairstyle, body proportions, age appearance, garment design (${primaryColor} ${garmentType}, ${fabric}, ${embroidery}), garment color, embroidery, motifs, pattern, accessories and complete outfit throughout the entire video.
The subject begins slightly farther from the camera and walks slowly and naturally forward toward the camera throughout the shot.
Maintain strict full-body head-to-toe framing throughout so the complete garment length and silhouette remain clearly visible at all times.
The subject smiles warmly and gracefully holds a glowing traditional clay diya in both hands while walking.
Place the subject in a vibrant premium Diwali celebration environment with warm diyas, traditional lamps, floral decorations, subtle rangoli and elegant festive golden lighting.
Use realistic walking motion, natural fabric movement, anatomically correct hands and fingers, elegant posture, subtle festive makeup, realistic skin texture and high-end Indian fashion-commercial lighting.
The subject clearly says in natural Tamil:
"அனைவருக்கும் இனிய தீபாவளி நல்வாழ்த்துக்கள்!"
Keep the camera movement smooth and cinematic. Keep the person centered and clearly visible.
Display the Tamil greeting text tastefully near the lower third for 2-3 seconds.
Do not change the person's face. Do not change the garment. Do not change garment color, embroidery, hairstyle or body proportions. No duplicate person. No extra limbs. No malformed hands. No dancing. No spinning. No jumping. No face morphing. No random text. No generated logos. No excessive fireworks.
Premium festive commercial look, sharp focus, cinematic depth and warm color grading.`;
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

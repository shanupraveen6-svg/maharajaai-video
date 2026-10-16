import { GoogleGenAI } from '@google/genai';
import { AI_CONFIG } from './config';
import { GarmentAnalysisSchema, MasterImageQASchema, type MasterImageQA, PersonAnalysisSchema } from './schemas';

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

// Lightweight source check. This should reject only unusable uploads.
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

    const prompt = `Quickly check whether these uploads contain a visible clothing garment that can be used as an AI fashion reference.

Accept normal phone photos, garments on a person, mannequin, hanger, rack or shop counter. Do not demand a perfect background, exact pose, visible label, fabric identification or professional lighting. Reject only when no garment is visible, the image is extremely blurred/dark, or the garment is almost completely cropped out.

Describe only clearly visible colors and garment details. Never copy mannequin, hanger, rack or showroom objects into the garment description.

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

// Lightweight source check. Normal customer phone photos should pass.
export async function analyzePersonImage(
  imageDataUrl: string,
  expectedGroup?: 'adult' | 'child',
  service: 'try-on' | 'ai-video' = 'ai-video'
) {
  void service;
  const ai = getGenAIClient();

  if (AI_CONFIG.IS_DEMO_MODE || !ai) {
    if (!AI_CONFIG.IS_DEMO_MODE && !ai) {
      throw new Error('Gemini API key is missing or invalid outside Demo Mode.');
    }
    const fallback = {
      valid: true,
      subjectGroup: "adult" as const,
      fullBodyVisible: true,
      bothFeetVisible: true,
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
    const prompt = `Quickly check whether this is a usable customer photo for AI clothing visualization.

Accept ordinary phone photos and natural poses. The face and enough of the person should be visible to identify the customer and place clothing. Do not require perfect lighting, a studio background, visible hands, visible feet, a strict pose or full-body framing. Reject only if there is no person, the face is fully hidden, or blur/darkness/cropping makes the person unusable.

The selected customer group is ${expectedGroup || 'adult or child'}. Use it as a helpful consistency check, but do not reject an otherwise usable photo for uncertain age alone.

Return STRICT JSON:
{
  "valid": boolean,
  "subjectGroup": "adult" | "child",
  "fullBodyVisible": boolean,
  "bothFeetVisible": boolean,
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
      const validated = PersonAnalysisSchema.parse(parsed);

      return validated;
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
      bothFeetVisible: true,
      faceVisible: true,
      lightingQuality: "excellent" as const,
      additionalPhotoRequired: false,
      requestedPhotos: [],
      operatorMessage: "Customer photo verified."
    };
    return PersonAnalysisSchema.parse(fallback);
  }
}

// 3. Controlled Video Base Prompt Builder (Movement-Neutral)
export function buildVideoPrompt(analysis: any, conceptPrompt?: string): string {
  void analysis;
  if (typeof conceptPrompt !== 'string' || !conceptPrompt.trim()) {
    throw new Error('An approved Maharaja event and category prompt is required for video generation.');
  }
  return conceptPrompt.trim();
}

// 4. Quality Assurance Evaluation (Section 6: Master Image Quality Gate)
export async function validateFestivalMasterImage(
  masterImageUrlOrBase64: string,
  customerPhoto?: string,
  garmentPhoto?: string
): Promise<MasterImageQA> {
  const ai = getGenAIClient();
  if (AI_CONFIG.IS_DEMO_MODE || !ai) {
    return MasterImageQASchema.parse({
      valid: true,
      identityPreserved: true,
      garmentPreserved: true,
      fullBodyVisible: true,
      bothFeetVisible: true,
      anatomyAcceptable: true,
      cleanFrame: true,
      videoSafe: true,
      reason: 'Demo mode approval.'
    });
  }

  const contents: any[] = [];
  const masterBase64 = masterImageUrlOrBase64.split(',')[1] || masterImageUrlOrBase64;
    contents.push({ inlineData: { mimeType: 'image/jpeg', data: masterBase64 } });

    if (customerPhoto) {
      const cBase64 = customerPhoto.split(',')[1] || customerPhoto;
      contents.push({ inlineData: { mimeType: 'image/jpeg', data: cBase64 } });
    }
    if (garmentPhoto) {
      const gBase64 = garmentPhoto.split(',')[1] || garmentPhoto;
      contents.push({ inlineData: { mimeType: 'image/jpeg', data: gBase64 } });
    }

    const prompt = `Inspect this festival master image before video generation.

REJECT the master (set videoSafe=false and valid=false) if ANY of these occur:
- wrong identity or obvious face change from customer reference
- wrong garment or major garment-color change from garment reference
- extra limb or missing limb
- bad hand mutation or severely malformed/fused fingers
- cropped feet, missing feet, merged feet, or extreme foot distortion
- duplicate person
- visible mannequin contamination (plastic skin, mannequin neck/stand)
- unexpected text, titles, subtitles, words, logos, or watermarks
- severe frame crop or subject's feet too close to lower frame edge

Return STRICT JSON matching this schema:
{
  "valid": boolean,
  "identityPreserved": boolean,
  "garmentPreserved": boolean,
  "fullBodyVisible": boolean,
  "bothFeetVisible": boolean,
  "anatomyAcceptable": boolean,
  "cleanFrame": boolean,
  "videoSafe": boolean,
  "reason": string
}`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await ai.models.generateContent({
        model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
        contents,
      });

      const text = resp.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return MasterImageQASchema.parse(parsed);
      }
      throw new Error('Could not parse valid JSON from master image QA output');
    } catch (err) {
      lastErr = err;
      console.warn(`Master image QA inspection attempt ${attempt + 1} failed:`, err);
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  // Fail closed: Never convert an inspection failure into an approval!
  const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr || 'Unknown error');
  return MasterImageQASchema.parse({
    valid: false,
    identityPreserved: false,
    garmentPreserved: false,
    fullBodyVisible: false,
    bothFeetVisible: false,
    anatomyAcceptable: false,
    cleanFrame: false,
    videoSafe: false,
    reason: `Automated inspection unavailable (${errMsg.slice(0, 150)}). Master image cannot be verified as safe for video generation.`
  });
}

/** Legacy QA stub retained for backwards-compatibility */
export async function runQualityAssurance(masterImageUrl: string, videoUrl: string) {
  void masterImageUrl;
  void videoUrl;
  return {
    approved: false,
    qaStatus: "not_implemented",
    identityAcceptable: false,
    garmentAcceptable: false,
    motionAcceptable: false,
    majorIssues: ["AI Keyframe QA is replaced by validateFestivalMasterImage pre-gate"],
    operatorMessage: "AI QA inspection pending operator review."
  };
}

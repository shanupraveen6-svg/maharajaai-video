import {
  buildH3MotionPrompt,
  buildFailProofMediumFlatMotionPrompt,
  buildOmniMotionPrompt,
  getVideoConcept,
  type VideoConceptId,
} from './video-concepts';
import type { EventId, GarmentType } from './config';

/**
 * The AI Video engines, 6-second vertical reference-to-video renders on fal: H3 Max, then Gemini Omni Flash
 * 1.1 at 720p ($0.10 a second) as the backup (see video-engines.ts). Estimates are fal list prices for 6 s.
 */
export const FAL_VIDEO_MODELS = [
  { id: 'h3-max', label: 'H3 Max · 768p', model: 'minimax/h3-max/reference-to-video', seconds: 6, estimatedUsd: 0.48 },
  { id: 'gemini-omni', label: 'Gemini Omni Flash · 720p', model: 'google/gemini-omni-flash/v1.1/reference-to-video', seconds: 6, estimatedUsd: 0.60 },
] as const;

export type VideoModelId = (typeof FAL_VIDEO_MODELS)[number]['id'];

export function getVideoTestModel(requestedModelId?: unknown) {
  if (typeof requestedModelId === 'string' && requestedModelId) {
    return FAL_VIDEO_MODELS.find((model) => model.id === requestedModelId) || null;
  }
  return FAL_VIDEO_MODELS[0];
}

export function buildVideoTestInput(
  modelId: VideoModelId,
  masterImageUrl: string,
  garmentReferenceUrls: string[],
  conceptId: VideoConceptId,
  garmentRoles: string[],
  eventId: EventId = 'diwali',
  garmentType: GarmentType = 'generic',
  useMediumFlatBackup = false,
) {
  const concept = getVideoConcept(conceptId);
  if (!concept) throw new Error('The selected film concept is unavailable. Please select a concept again.');
  const garments = garmentReferenceUrls.filter(Boolean).slice(0, 2);
  const roles = garmentRoles.slice(0, garments.length);
  const references = [masterImageUrl, ...garments];

  const motionPrompt = useMediumFlatBackup
    ? buildFailProofMediumFlatMotionPrompt(concept, roles, eventId, 'h3', garmentType)
    : buildH3MotionPrompt(concept, roles, eventId, 'h3', garmentType);

  if (modelId === 'h3-max') {
    return {
      prompt: motionPrompt,
      image_url: masterImageUrl,
      reference_image_urls: references,
      duration: 6,
      resolution: '768P',
      aspect_ratio: '9:16',
      prompt_expansion_mode: 'disabled',
      enable_safety_checker: true,
    };
  }

  if (modelId === 'gemini-omni') {
    // Gemini Omni reads the images in list order before the prompt; its own prompt names them in words
    // and always makes the calm backup film (it is the last engine).
    return {
      prompt: buildOmniMotionPrompt(concept, garments.length, eventId, garmentType),
      image_urls: references,
      duration: 6,
      resolution: '720p',
      aspect_ratio: '9:16',
    };
  }

  throw new Error('Unsupported Fal video model.');
}

export function publicFalQueueUrl(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('https://')) return '';
  try {
    const url = new URL(value);
    return url.hostname.endsWith('fal.run') ? url.toString() : '';
  } catch {
    return '';
  }
}

export function extractVideoUrl(result: any) {
  const outputs = Array.isArray(result?.outputs)
    ? result.outputs
    : Array.isArray(result?.data?.outputs)
      ? result.data.outputs
      : Array.isArray(result?.output)
        ? result.output
        : typeof result?.output === 'string'
          ? [result.output]
          : typeof result?.data?.output === 'string'
            ? [result.data.output]
            : [];
  const candidates = [
    result?.video?.url,
    result?.video_url,
    result?.data?.video?.url,
    result?.output?.video?.url,
    result?.data?.output?.video?.url,
    ...outputs.map((output: unknown) => (typeof output === 'string' ? output : (output as any)?.url)),
  ];
  return candidates.find((value) => typeof value === 'string' && value.startsWith('http')) || '';
}

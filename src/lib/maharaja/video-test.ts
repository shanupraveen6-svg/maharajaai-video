import { buildH3MotionPrompt, getVideoConcept, type VideoConceptId } from './video-concepts';
import type { EventId, GarmentType } from './config';

export const FAL_VIDEO_MODELS = [
  { id: 'h3-max', label: 'H3 Max · 768p', model: 'minimax/h3-max/reference-to-video', seconds: 6, estimatedUsd: 0.48 },
  { id: 'pixverse-c1', label: 'PixVerse C1 · 720p', model: 'fal-ai/pixverse/c1/reference-to-video', seconds: 6, estimatedUsd: 0.30 },
] as const;

export function getVideoTestModel(requestedModelId?: unknown) {
  if (typeof requestedModelId === 'string' && requestedModelId) {
    return FAL_VIDEO_MODELS.find((model) => model.id === requestedModelId) || null;
  }
  return FAL_VIDEO_MODELS[0];
}

export function buildVideoTestInput(
  modelId: (typeof FAL_VIDEO_MODELS)[number]['id'],
  masterImageUrl: string,
  garmentReferenceUrls: string[],
  conceptId: VideoConceptId,
  garmentRoles: string[],
  eventId: EventId = 'diwali',
  garmentType: GarmentType = 'generic',
) {
  const concept = getVideoConcept(conceptId);
  if (!concept) throw new Error('The selected film concept is unavailable. Please select a concept again.');
  const garments = garmentReferenceUrls.filter(Boolean).slice(0, 2);
  const roles = garmentRoles.slice(0, garments.length);
  const references = [masterImageUrl, ...garments];

  if (modelId === 'h3-max') {
    return {
      prompt: buildH3MotionPrompt(concept, roles, eventId, 'h3', garmentType),
      image_url: masterImageUrl,
      reference_image_urls: references,
      duration: 6,
      resolution: '768P',
      aspect_ratio: '9:16',
      prompt_expansion_mode: 'disabled',
      enable_safety_checker: true,
    };
  }

  if (modelId === 'pixverse-c1') {
    const prompt = buildH3MotionPrompt(concept, roles, eventId, 'pixverse', garmentType);
    if (Buffer.byteLength(prompt, 'utf8') > 2048) throw new Error('PixVerse prompt exceeds its 2,048-byte limit.');
    return {
      prompt,
      image_references: references.map((image_url, index) => ({
        image_url,
        ref_name: index === 0 ? 'master' : `garment${index}`,
        type: 'subject' as const,
      })),
      duration: 6,
      resolution: '720p',
      aspect_ratio: '9:16',
      generate_audio_switch: false,
      enable_safety_checker: true,
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

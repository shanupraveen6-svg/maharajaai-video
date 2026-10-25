import { buildH3MotionPrompt, getVideoConcept, type VideoConceptId } from './video-concepts';

export const H3_REFERENCE_TO_VIDEO_MODEL = 'minimax/h3-max/reference-to-video';
export const WAVESPEED_H3_REFERENCE_TO_VIDEO_MODEL = 'wavespeed-ai/minimax-h3/reference-to-video';

export type VideoProvider = 'fal' | 'wavespeed';

export function getActiveVideoProvider(): VideoProvider {
  return process.env.VIDEO_PROVIDER?.trim().toLowerCase() === 'wavespeed' ? 'wavespeed' : 'fal';
}

export function getVideoTestModel() {
  if (getActiveVideoProvider() === 'wavespeed') {
    return { id: 'wavespeed-h3', model: WAVESPEED_H3_REFERENCE_TO_VIDEO_MODEL, seconds: 6, estimatedUsd: 0.64 };
  }
  return { id: 'h3-max', model: H3_REFERENCE_TO_VIDEO_MODEL, seconds: 6, estimatedUsd: 0.48 };
}

export function buildVideoTestInput(
  masterImageUrl: string,
  garmentReferenceUrls: string[],
  conceptId: VideoConceptId,
  garmentRoles: string[],
  backup = false,
) {
  const concept = getVideoConcept(conceptId);
  if (!concept) throw new Error('The selected Diwali film concept is unavailable. Please select a concept again.');
  return {
    image_url: masterImageUrl,
    reference_image_urls: garmentReferenceUrls.filter(Boolean),
    prompt: buildH3MotionPrompt(concept, garmentRoles, backup),
    duration: 6,
    resolution: '768P',
    aspect_ratio: '9:16',
    prompt_expansion_mode: 'disabled',
    enable_safety_checker: true,
  };
}

export function buildWaveSpeedVideoInput(
  masterImageUrl: string,
  garmentReferenceUrls: string[],
  conceptId: VideoConceptId,
  garmentRoles: string[],
) {
  const garmentMap = garmentReferenceUrls
    .map((_, index) => `<Picture ${index + 2}> is garment reference ${index + 1}${garmentRoles[index] ? ` (${garmentRoles[index]})` : ''}; it confirms exact garment construction only.`)
    .join('\n');
  return {
    prompt: `REFERENCE MAP:\n<Picture 1> is the approved Gemini master image and is the absolute authority for the customer's identity, natural unretouched skin, exact garment, pose, framing and environment.\n${garmentMap}\n\n${buildH3MotionPrompt(getVideoConcept(conceptId)!, garmentRoles)}`,
    reference_images: [masterImageUrl, ...garmentReferenceUrls.filter(Boolean)],
    duration: 6,
    resolution: '768p',
    aspect_ratio: '9:16',
  };
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
  const outputs = Array.isArray(result?.outputs) ? result.outputs : Array.isArray(result?.data?.outputs) ? result.data.outputs : [];
  const candidates = [
    result?.video?.url, result?.video_url, result?.data?.video?.url, result?.output?.video?.url,
    ...outputs.map((output: unknown) => typeof output === 'string' ? output : (output as any)?.url),
  ];
  return candidates.find((value) => typeof value === 'string' && value.startsWith('http')) || '';
}

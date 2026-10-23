import { buildH3MotionPrompt, getVideoConcept, type VideoConceptId } from './video-concepts';

export const H3_REFERENCE_TO_VIDEO_MODEL = 'minimax/h3-max/reference-to-video';

export function getVideoTestModel() {
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
  const candidates = [result?.video?.url, result?.video_url, result?.data?.video?.url, result?.output?.video?.url];
  return candidates.find((value) => typeof value === 'string' && value.startsWith('http')) || '';
}

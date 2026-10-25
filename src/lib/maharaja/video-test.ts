import { buildH3MotionPrompt, getVideoConcept, type VideoConceptId } from './video-concepts';

export const H3_REFERENCE_TO_VIDEO_MODEL = 'minimax/h3-max/reference-to-video';
export const WAVESPEED_H3_REFERENCE_TO_VIDEO_MODEL = 'wavespeed-ai/minimax-h3/reference-to-video';

export const WAVE_SPEED_TEST_MODELS = [
  {
    id: 'minimax-h3-original',
    label: 'MiniMax H3 Original · 768p',
    model: 'minimax/h3/reference-to-video',
    inputFormat: 'h3',
    seconds: 6,
    estimatedUsd: 0.6,
  },
  {
    id: 'wavespeed-h3-open',
    label: 'WaveSpeed H3 Open Weights · 768p',
    model: WAVESPEED_H3_REFERENCE_TO_VIDEO_MODEL,
    inputFormat: 'h3',
    seconds: 6,
    estimatedUsd: 0.64,
  },
  {
    id: 'vidu-q4',
    label: 'Vidu Q4 · 720p',
    model: 'vidu/q4-preview/reference-to-video',
    inputFormat: 'vidu',
    seconds: 6,
    estimatedUsd: 0.57,
  },
  {
    id: 'kling-v4',
    label: 'Kling V4 · 720p',
    model: 'kwaivgi/kling-v4.0/reference-to-video',
    inputFormat: 'kling',
    seconds: 6,
    estimatedUsd: 0.942,
  },
] as const;

export type WaveSpeedTestModelId = (typeof WAVE_SPEED_TEST_MODELS)[number]['id'];
type WaveSpeedInputFormat = (typeof WAVE_SPEED_TEST_MODELS)[number]['inputFormat'];

export type VideoProvider = 'fal' | 'wavespeed';

export function getActiveVideoProvider(): VideoProvider {
  return process.env.VIDEO_PROVIDER?.trim().toLowerCase() === 'wavespeed' ? 'wavespeed' : 'fal';
}

export function isVideoModelTestingEnabled() {
  return process.env.VIDEO_MODEL_TESTING?.trim().toLowerCase() === 'true';
}

function findWaveSpeedTestModel(value: unknown) {
  return WAVE_SPEED_TEST_MODELS.find((model) => model.id === value);
}

export function getVideoTestModel(requestedModelId?: unknown) {
  if (getActiveVideoProvider() === 'wavespeed') {
    if (isVideoModelTestingEnabled() && typeof requestedModelId === 'string') {
      return findWaveSpeedTestModel(requestedModelId) || null;
    }
    return findWaveSpeedTestModel('wavespeed-h3-open')!;
  }
  return { id: 'h3-max', model: H3_REFERENCE_TO_VIDEO_MODEL, inputFormat: 'fal' as const, seconds: 6, estimatedUsd: 0.48 };
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
  inputFormat: WaveSpeedInputFormat,
  masterImageUrl: string,
  garmentReferenceUrls: string[],
  conceptId: VideoConceptId,
  garmentRoles: string[],
) {
  const concept = getVideoConcept(conceptId);
  if (!concept) throw new Error('The selected Diwali film concept is unavailable. Please select a concept again.');
  const references = [masterImageUrl, ...garmentReferenceUrls.filter(Boolean)];
  const garmentMap = garmentReferenceUrls
    .map((_, index) => `<Picture ${index + 2}> is garment reference ${index + 1}${garmentRoles[index] ? ` (${garmentRoles[index]})` : ''}; it confirms exact garment construction only.`)
    .join('\n');
  const prompt = `REFERENCE MAP:\n<Picture 1> is the approved Gemini master image and is the absolute authority for the customer's identity, natural unretouched skin, exact garment, pose, framing and environment.\n${garmentMap}\n\n${buildH3MotionPrompt(concept, garmentRoles)}`;

  if (inputFormat === 'vidu') {
    return { prompt, images: references, duration: 6, resolution: '720p', aspect_ratio: '9:16', generate_audio: true };
  }
  if (inputFormat === 'kling') {
    const klingPrompt = `REFERENCE MAP:\n${references.map((_, index) => `@Image${index + 1} ${index === 0 ? 'is the approved master image and is the authority for identity, garment, pose, framing and environment.' : `confirms garment construction reference ${index}.`}`).join('\n')}\n\n${buildH3MotionPrompt(concept, garmentRoles)}`;
    return { prompt: klingPrompt, images: references, duration: 6, resolution: '720p', aspect_ratio: '9:16', keep_original_sound: false };
  }
  return { prompt, reference_images: references, duration: 6, resolution: '768p', aspect_ratio: '9:16' };
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

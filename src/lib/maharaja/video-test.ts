import { buildH3MotionPrompt, getVideoConcept, type VideoConceptId } from './video-concepts';

export const H3_REFERENCE_TO_VIDEO_MODEL = 'minimax/h3-max/reference-to-video';
export const WAVESPEED_H3_REFERENCE_TO_VIDEO_MODEL = 'wavespeed-ai/minimax-h3/reference-to-video';

export const WAVE_SPEED_TEST_MODELS = [
  {
    id: 'wavespeed-h3-open',
    label: '#1 WaveSpeed H3 Open (50% OFF · ₹39.15)',
    model: WAVESPEED_H3_REFERENCE_TO_VIDEO_MODEL,
    inputFormat: 'h3',
    seconds: 6,
    estimatedUsd: 0.45,
  },
  {
    id: 'minimax-h3-original',
    label: '#2 MiniMax H3 Normal · 768p (₹52.20)',
    model: 'minimax/h3/reference-to-video',
    inputFormat: 'h3',
    seconds: 6,
    estimatedUsd: 0.60,
  },
  {
    id: 'vidu-q4',
    label: '#3 Vidu Q4 Preview (15% OFF · ₹42.18)',
    model: 'vidu/q4-preview/reference-to-video',
    inputFormat: 'vidu',
    seconds: 6,
    estimatedUsd: 0.485,
  },
  {
    id: 'kling-video-o3-std',
    label: '#4 Kling Omni O3 Std · 720p (₹43.85)',
    model: 'kwaivgi/kling-video-o3-std/reference-to-video',
    inputFormat: 'kling',
    seconds: 6,
    estimatedUsd: 0.504,
  },
  {
    id: 'wavespeed-h3-singularity',
    label: '#5 WaveSpeed H3 Singularity (50% OFF · ₹39.15)',
    model: 'wavespeed-ai/minimax-h3-singularity/reference-to-video',
    inputFormat: 'h3',
    seconds: 6,
    estimatedUsd: 0.45,
  },
  {
    id: 'wan-2-7',
    label: '#6 Alibaba Wan 2.7 R2V · 720p (₹52.20)',
    model: 'alibaba/wan-2.7/reference-to-video',
    inputFormat: 'wan',
    seconds: 6,
    estimatedUsd: 0.60,
  },
  {
    id: 'wan-2-6',
    label: '#7 Alibaba Wan 2.6 R2V · 720p (₹52.20)',
    model: 'alibaba/wan-2.6/reference-to-video',
    inputFormat: 'wan',
    seconds: 6,
    estimatedUsd: 0.60,
  },
  {
    id: 'gemini-omni-flash',
    label: '#8 Google Gemini Omni 1.1 Flash (₹52.20)',
    model: 'google/gemini-omni-1.1-flash/reference-to-video',
    inputFormat: 'gemini',
    seconds: 6,
    estimatedUsd: 0.60,
  },
  {
    id: 'pixverse-c1',
    label: '#9 PixVerse C1 R2V · 720p (₹26.10)',
    model: 'pixverse/pixverse-c1/reference-to-video',
    inputFormat: 'general',
    seconds: 6,
    estimatedUsd: 0.30,
  },
  {
    id: 'wan-2-6-flash',
    label: '#10 Wan 2.6 Flash R2V · 720p (₹26.10)',
    model: 'alibaba/wan-2.6/reference-to-video-flash',
    inputFormat: 'wan',
    seconds: 6,
    estimatedUsd: 0.30,
  },
  {
    id: 'grok-imagine',
    label: '#11 xAI Grok Imagine R2V (₹26.10)',
    model: 'x-ai/grok-imagine-video/reference-to-video',
    inputFormat: 'general',
    seconds: 6,
    estimatedUsd: 0.30,
  },
  {
    id: 'pruna-p-video-2',
    label: '#12 Pruna P-Video-2 Pro · 720p (₹18.27)',
    model: 'pruna-ai/p-video-2-pro/reference-to-video',
    inputFormat: 'general',
    seconds: 6,
    estimatedUsd: 0.21,
  },
] as const;

export type WaveSpeedTestModelId = (typeof WAVE_SPEED_TEST_MODELS)[number]['id'];
type WaveSpeedInputFormat = (typeof WAVE_SPEED_TEST_MODELS)[number]['inputFormat'];

export type VideoProvider = 'fal' | 'wavespeed';

export function getActiveVideoProvider(): VideoProvider {
  return process.env.VIDEO_PROVIDER?.trim().toLowerCase() === 'wavespeed' ? 'wavespeed' : 'fal';
}

export function isVideoModelTestingEnabled() {
  return (process.env.VIDEO_MODEL_TESTING || process.env.NEXT_PUBLIC_VIDEO_MODEL_TESTING)?.trim().toLowerCase() === 'true';
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
    return { prompt: prompt.replace(/<Picture (\d+)>/g, 'Image $1'), images: references, duration: 6, resolution: '720p', aspect_ratio: '9:16', generate_audio: false };
  }
  if (inputFormat === 'kling') {
    const klingPrompt = prompt.replace(/<Picture (\d+)>/g, '@Image$1');
    return { prompt: klingPrompt, images: references, duration: 6, resolution: '720p', aspect_ratio: '9:16', keep_original_sound: false };
  }
  if (inputFormat === 'wan' || inputFormat === 'gemini' || inputFormat === 'general') {
    const naturalPrompt = prompt.replace(/<Picture (\d+)>/g, 'Image $1');
    return { prompt: naturalPrompt, images: references, reference_images: references, duration: 6, resolution: '720p', aspect_ratio: '9:16' };
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

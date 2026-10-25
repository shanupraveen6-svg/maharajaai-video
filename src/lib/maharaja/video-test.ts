import { buildH3MotionPrompt, getVideoConcept, type VideoConceptId } from './video-concepts';

export const H3_REFERENCE_TO_VIDEO_MODEL = 'minimax/h3-max/reference-to-video';
export const WAVESPEED_H3_REFERENCE_TO_VIDEO_MODEL = 'wavespeed-ai/minimax-h3/reference-to-video';

export const WAVE_SPEED_TEST_MODELS = [
  {
    id: 'wavespeed-h3-open',
    label: '#1 WaveSpeed H3 Open (Estimated current cost $0.66 / ₹57.42)',
    model: WAVESPEED_H3_REFERENCE_TO_VIDEO_MODEL,
    inputFormat: 'h3' as const,
    seconds: 6,
    estimatedUsd: 0.66,
  },
  {
    id: 'minimax-h3-original',
    label: '#2 MiniMax H3 Normal · 768p (Estimated current cost $0.60 / ₹52.20)',
    model: 'minimax/h3/reference-to-video',
    inputFormat: 'h3' as const,
    seconds: 6,
    estimatedUsd: 0.60,
  },
  {
    id: 'wavespeed-h3-singularity',
    label: '#3 WaveSpeed H3 Singularity (Estimated current cost $0.66 / ₹57.42)',
    model: 'wavespeed-ai/minimax-h3-singularity/reference-to-video',
    inputFormat: 'h3' as const,
    seconds: 6,
    estimatedUsd: 0.66,
  },
  {
    id: 'vidu-q4',
    label: '#4 Vidu Q4 Preview (Estimated current cost $0.57 / ₹49.59)',
    model: 'vidu/q4-preview/reference-to-video',
    inputFormat: 'vidu' as const,
    seconds: 6,
    estimatedUsd: 0.57,
  },
  {
    id: 'kling-video-o3-std',
    label: '#5 Kling Omni O3 Standard · 720p (Estimated current cost $0.504 / ₹43.85)',
    model: 'kwaivgi/kling-video-o3-std/reference-to-video',
    inputFormat: 'kling-o3' as const,
    seconds: 6,
    estimatedUsd: 0.504,
  },
  {
    id: 'gemini-omni-flash',
    label: '#6 Google Gemini Omni 1.1 Flash (Estimated current cost $0.60 / ₹52.20)',
    model: 'google/gemini-omni-1.1-flash/reference-to-video',
    inputFormat: 'gemini-omni' as const,
    seconds: 6,
    estimatedUsd: 0.60,
  },
  {
    id: 'pixverse-c1',
    label: '#7 PixVerse C1 R2V · 720p (Estimated current cost $0.30 / ₹26.10)',
    model: 'pixverse/pixverse-c1/reference-to-video',
    inputFormat: 'pixverse-c1' as const,
    seconds: 6,
    estimatedUsd: 0.30,
  },
  {
    id: 'grok-imagine',
    label: '#8 xAI Grok Imagine R2V (Estimated current cost $0.30 / ₹26.10)',
    model: 'x-ai/grok-imagine-video/reference-to-video',
    inputFormat: 'grok-imagine' as const,
    seconds: 6,
    estimatedUsd: 0.30,
  },
  {
    id: 'pruna-p-video-2',
    label: '#9 Pruna P-Video-2 Pro · 768p Speed (Estimated current cost $0.24 / ₹20.88)',
    model: 'pruna-ai/p-video-2-pro/reference-to-video',
    inputFormat: 'pruna' as const,
    seconds: 6,
    estimatedUsd: 0.24,
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
  const safeGarments = garmentReferenceUrls.filter(Boolean).slice(0, 2);
  const safeRoles = garmentRoles.slice(0, safeGarments.length);
  return {
    image_url: masterImageUrl,
    reference_image_urls: safeGarments,
    prompt: buildH3MotionPrompt(concept, safeRoles, backup),
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

  // Strict Rule 1: Maximum 3 images (Image 1 = Master, Image 2 = Garment 1, Image 3 = Garment 2)
  const safeGarments = garmentReferenceUrls.filter(Boolean).slice(0, 2);
  const safeRoles = garmentRoles.slice(0, safeGarments.length);
  const references = [masterImageUrl, ...safeGarments];
  const baseMotion = buildH3MotionPrompt(concept, safeRoles);

  let finalPrompt = '';

  if (inputFormat === 'h3') {
    const garmentMap = safeGarments
      .map((_, index) => `<Picture ${index + 2}> is garment reference ${index + 1}${safeRoles[index] ? ` (${safeRoles[index]})` : ''}; it confirms exact garment construction only.`)
      .join('\n');
    finalPrompt = `REFERENCE MAP:\n<Picture 1> is the approved Gemini master image and is the absolute authority for the customer's identity, natural unretouched skin, exact garment, pose, framing and environment.\n${garmentMap}\n\n${baseMotion}`;
    if (finalPrompt.length > 5000) throw new Error(`H3 prompt exceeds 5,000 characters limit (${finalPrompt.length}).`);
    return {
      prompt: finalPrompt,
      reference_images: references,
      duration: 6,
      resolution: '768p',
      aspect_ratio: '9:16',
    };
  }

  if (inputFormat === 'vidu') {
    // Vidu Q4: Plain images array, no @Image tags, ordered role wording (Image 1, Image 2, Image 3)
    const garmentMap = safeGarments
      .map((_, index) => `Image ${index + 2} is garment reference ${index + 1}${safeRoles[index] ? ` (${safeRoles[index]})` : ''}; it confirms exact garment construction only.`)
      .join('\n');
    const motion = baseMotion.replace(/<Picture (\d+)>/g, 'Image $1');
    finalPrompt = `REFERENCE MAP:\nImage 1 is the approved Gemini master image and is the absolute authority for the customer's identity, natural unretouched skin, exact garment, pose, framing and environment.\n${garmentMap}\n\n${motion}`;
    if (finalPrompt.length > 5000) throw new Error(`Vidu prompt exceeds 5,000 characters limit (${finalPrompt.length}).`);
    return {
      prompt: finalPrompt,
      images: references,
      duration: 6,
      resolution: '720p',
      aspect_ratio: '9:16',
      generate_audio: false,
    };
  }

  if (inputFormat === 'kling-o3') {
    // Kling O3: <<<image_1>>>, <<<image_2>>>, <<<image_3>>>
    const garmentMap = safeGarments
      .map((_, index) => `<<<image_${index + 2}>>> is garment reference ${index + 1}${safeRoles[index] ? ` (${safeRoles[index]})` : ''}; it confirms exact garment construction only.`)
      .join('\n');
    const motion = baseMotion.replace(/<Picture (\d+)>/g, '<<<image_$1>>>');
    finalPrompt = `REFERENCE MAP:\n<<<image_1>>> is the approved Gemini master image and is the absolute authority for the customer's identity, natural unretouched skin, exact garment, pose, framing and environment.\n${garmentMap}\n\n${motion}`;
    if (finalPrompt.length > 5000) throw new Error(`Kling O3 prompt exceeds 5,000 characters limit (${finalPrompt.length}).`);
    return {
      prompt: finalPrompt,
      images: references,
      duration: 6,
      aspect_ratio: '9:16',
      sound: false,
    };
  }

  if (inputFormat === 'gemini-omni') {
    // Gemini Omni: <IMAGE_REF_0>, <IMAGE_REF_1>, <IMAGE_REF_2>
    const garmentMap = safeGarments
      .map((_, index) => `<IMAGE_REF_${index + 1}> is garment reference ${index + 1}${safeRoles[index] ? ` (${safeRoles[index]})` : ''}; it confirms exact garment construction only.`)
      .join('\n');
    const motion = baseMotion.replace(/<Picture (\d+)>/g, (_, n) => `<IMAGE_REF_${Number(n) - 1}>`);
    finalPrompt = `REFERENCE MAP:\n<IMAGE_REF_0> is the approved Gemini master image and is the absolute authority for the customer's identity, natural unretouched skin, exact garment, pose, framing and environment.\n${garmentMap}\n\n${motion}`;
    if (finalPrompt.length > 5000) throw new Error(`Gemini Omni prompt exceeds 5,000 characters limit (${finalPrompt.length}).`);
    return {
      prompt: finalPrompt,
      images: references,
      duration: 6,
      resolution: '720p',
      aspect_ratio: '9:16',
    };
  }

  if (inputFormat === 'pixverse-c1') {
    // PixVerse C1: Structured image objects and @master, @garment1, @garment2 tags
    const roleTags = ['@master', '@garment1', '@garment2'];
    const garmentMap = safeGarments
      .map((_, index) => `${roleTags[index + 1]} is garment reference ${index + 1}${safeRoles[index] ? ` (${safeRoles[index]})` : ''}; it confirms exact garment construction only.`)
      .join('\n');
    const motion = baseMotion.replace(/<Picture (\d+)>/g, (_, n) => roleTags[Number(n) - 1] || `@garment${Number(n) - 1}`);
    finalPrompt = `REFERENCE MAP:\n@master is the approved Gemini master image and is the absolute authority for the customer's identity, natural unretouched skin, exact garment, pose, framing and environment.\n${garmentMap}\n\n${motion}`;
    if (finalPrompt.length > 5000) throw new Error(`PixVerse prompt exceeds 5,000 characters limit (${finalPrompt.length}).`);
    const structuredImages = references.map((url, index) => ({
      image: url,
      ref_name: index === 0 ? 'master' : `garment${index}`,
      type: 'subject' as const,
    }));
    return {
      prompt: finalPrompt,
      images: structuredImages,
      duration: 6,
      resolution: '720p',
      aspect_ratio: '9:16',
      generate_audio_switch: false,
    };
  }

  if (inputFormat === 'grok-imagine') {
    // Grok Imagine: <IMAGE_0>, <IMAGE_1>, <IMAGE_2>
    const garmentMap = safeGarments
      .map((_, index) => `<IMAGE_${index + 1}> is garment reference ${index + 1}${safeRoles[index] ? ` (${safeRoles[index]})` : ''}; it confirms exact garment construction only.`)
      .join('\n');
    const motion = baseMotion.replace(/<Picture (\d+)>/g, (_, n) => `<IMAGE_${Number(n) - 1}>`);
    finalPrompt = `REFERENCE MAP:\n<IMAGE_0> is the approved Gemini master image and is the absolute authority for the customer's identity, natural unretouched skin, exact garment, pose, framing and environment.\n${garmentMap}\n\n${motion}`;
    if (finalPrompt.length > 5000) throw new Error(`Grok Imagine prompt exceeds 5,000 characters limit (${finalPrompt.length}).`);
    return {
      prompt: finalPrompt,
      images: references,
      duration: 6,
      resolution: '720p',
    };
  }

  if (inputFormat === 'pruna') {
    // Pruna: Documented plain images array without unsupported special tags; nearest supported resolution above 720p is 768p
    const garmentMap = safeGarments
      .map((_, index) => `Garment reference ${index + 1} (Image ${index + 2})${safeRoles[index] ? ` (${safeRoles[index]})` : ''} confirms exact garment construction only.`)
      .join('\n');
    const motion = baseMotion
      .replace(/<Picture 1>/g, 'Master portrait (Image 1)')
      .replace(/<Picture 2>/g, 'Garment reference 1 (Image 2)')
      .replace(/<Picture 3>/g, 'Garment reference 2 (Image 3)');
    finalPrompt = `REFERENCE MAP:\nMaster portrait (Image 1) is the approved Gemini master image and is the absolute authority for the customer's identity, natural unretouched skin, exact garment, pose, framing and environment.\n${garmentMap}\n\n${motion}`;
    if (finalPrompt.length > 5000) throw new Error(`Pruna prompt exceeds 5,000 characters limit (${finalPrompt.length}).`);
    return {
      prompt: finalPrompt,
      images: references,
      duration: 6,
      resolution: '768p',
      aspect_ratio: '9:16',
      mode: 'speed',
      prompt_upsampler: 'off',
      keep_audio: false,
    };
  }

  throw new Error(`Unsupported WaveSpeed input format: ${inputFormat}`);
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

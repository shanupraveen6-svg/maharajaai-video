export const VIDEO_TEST_MODELS = [
  { id: 'h3-max', label: 'H3 Max Reference', model: 'minimax/h3-max/reference-to-video', seconds: 5, estimatedUsd: 0.40 },
  { id: 'pixverse-c1', label: 'PixVerse C1 Reference', model: 'fal-ai/pixverse/c1/reference-to-video', seconds: 6, estimatedUsd: 0.30 },
  { id: 'ltx-2.3', label: 'LTX 2.3 Pro', model: 'fal-ai/ltx-2.3/image-to-video', seconds: 6, estimatedUsd: 0.48 },
] as const;

export type VideoTestModelId = typeof VIDEO_TEST_MODELS[number]['id'];

export function getVideoTestModel(value: unknown) {
  return VIDEO_TEST_MODELS.find((entry) => entry.id === value) || null;
}

const CINEMATIC_PROMPT = `Use the approved image as the exact visual authority and opening composition. Preserve the same person, face, age, skin tone, hairstyle, body proportions, pose, hands and feet. Preserve the complete outfit exactly: silhouette, fit, layers, colours, gradients, patterns, prints, construction and accessories. Do not redesign, replace, recolour or add clothing details. Do not infer attire from gender, age, Diwali or architecture. The customer remains a stable luxury campaign hero with the same natural expression. Allow only extremely subtle natural life without changing facial geometry or posture. Create a grand millionaire Diwali campaign through the existing environment: a smooth premium forward cinema push, rich dimensional depth, restrained focus transition, existing lamp glow, existing distant bokeh and existing reflections moving gently. Keep all effects behind or around the customer; nothing crosses or alters the face, body or outfit. No walking, turning, arm movement, garment motion, fabric flutter, orbit, side-angle reconstruction, new props, new architecture or newly revealed surfaces. Finish with a powerful clean hero hold. Identity and outfit fidelity override every creative instruction.`;

export function buildVideoTestInput(
  modelId: VideoTestModelId,
  masterUrl: string,
  garmentUrls: string[],
) {
  if (modelId === 'h3-max') {
    return {
      image_url: masterUrl,
      reference_image_urls: garmentUrls,
      prompt: CINEMATIC_PROMPT,
      duration: 5,
      resolution: '768P',
      aspect_ratio: 'adaptive',
      prompt_expansion_mode: 'disabled',
      enable_safety_checker: true,
    };
  }

  if (modelId === 'pixverse-c1') {
    return {
      prompt: `${CINEMATIC_PROMPT} Use @customer as the exact subject and composition authority.${garmentUrls.map((_, index) => ` Use @garment${index + 1} only as outfit-detail authority.`).join('')}`,
      image_references: [
        { type: 'subject', image_url: masterUrl, ref_name: 'customer' },
        ...garmentUrls.map((imageUrl, index) => ({ type: 'subject', image_url: imageUrl, ref_name: `garment${index + 1}` })),
      ],
      duration: 6,
      resolution: '720p',
      aspect_ratio: '9:16',
      generate_audio_switch: false,
      enable_safety_checker: true,
    };
  }

  return {
    image_url: masterUrl,
    prompt: CINEMATIC_PROMPT,
    duration: 6,
    resolution: '1080p',
    aspect_ratio: '9:16',
    fps: 24,
    generate_audio: false,
    enable_safety_checker: true,
  };
}

export function extractVideoUrl(payload: any): string | null {
  const candidates = [
    payload?.video?.url,
    payload?.data?.video?.url,
    payload?.output?.video?.url,
    payload?.url,
  ];
  return candidates.find((value) => typeof value === 'string' && /^https?:\/\//i.test(value)) || null;
}

export function publicFalQueueUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'fal.run' || url.hostname.endsWith('.fal.run')) ? url.toString() : null;
  } catch {
    return null;
  }
}

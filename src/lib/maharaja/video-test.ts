import { getEventSceneDirection, type CustomerCategory } from './config';

export const VIDEO_TEST_MODELS = [
  { id: 'h3-max', label: 'H3 Max Reference', model: 'minimax/h3-max/reference-to-video', seconds: 6, estimatedUsd: 0.48 },
] as const;

export type VideoTestModelId = typeof VIDEO_TEST_MODELS[number]['id'];

export function getVideoTestModel(value: unknown) {
  return VIDEO_TEST_MODELS.find((entry) => entry.id === value) || null;
}

const FIDELITY_LOCK = `Use the approved image as the exact visual authority and opening composition. Preserve the same person, face, age, skin tone, hairstyle, body proportions, pose, hands and feet. Preserve the complete outfit exactly: silhouette, fit, layers, colours, gradients, patterns, prints, construction and accessories. Do not redesign, replace, recolour or add clothing details. Do not infer attire from gender, age, Diwali or architecture. Preserve the same natural expression with only imperceptible living presence; never transform the smile or facial geometry. No walking, turning, hand gesture, arm movement, garment motion, fabric flutter, hair movement, orbit, side-angle reconstruction, new props, new architecture or newly revealed surfaces. Effects remain behind or around the customer and never cross the face, body or outfit. Identity and outfit fidelity override every creative instruction.`;

function buildH3Prompt(category: CustomerCategory) {
  const sceneMotion = getEventSceneDirection(category, 'diwali', 'set-1').videoScene;
  return `${FIDELITY_LOCK} CINEMATIC DIRECTION: ${sceneMotion} Use physically believable camera inertia, natural depth of field, realistic flame behaviour, restrained atmospheric movement and premium cinema colour. Structure the six-second film as one continuous shot with no hard cuts. Seconds 0–1.5 establish the full luxury environment and foreground depth. Seconds 1.5–4.5 execute the controlled camera move with visible but realistic background animation and parallax. Seconds 4.5–6 settle into a detailed full-body hero composition with the face and complete outfit clearly readable. Keep motion purposeful enough to remain elegant when the six-second source is later retimed to nine seconds at two-thirds speed.`;
}

export function buildVideoTestInput(
  modelId: VideoTestModelId,
  masterUrl: string,
  garmentUrls: string[],
  category: CustomerCategory,
) {
  return {
    image_url: masterUrl,
    reference_image_urls: garmentUrls,
    prompt: buildH3Prompt(category),
    duration: 6,
    resolution: '768P',
    aspect_ratio: 'adaptive',
    prompt_expansion_mode: 'disabled',
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

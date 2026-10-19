import { getEventSceneDirection, type CustomerCategory } from './config';

export const VIDEO_TEST_MODELS = [
  { id: 'h3-max', label: 'H3 Max Reference', model: 'minimax/h3-max/reference-to-video', seconds: 6, estimatedUsd: 0.48 },
] as const;

export type VideoTestModelId = typeof VIDEO_TEST_MODELS[number]['id'];

export function getVideoTestModel(value: unknown) {
  return VIDEO_TEST_MODELS.find((entry) => entry.id === value) || null;
}

const FIDELITY_LOCK = `SUBJECT LOCK: The approved first frame is the authority. Preserve the same identity, face, age, skin tone, hairstyle, body proportions, expression, pose, outfit design, fit, layers, colours, gradients, patterns and accessories. Both hands remain exactly where they begin. No greeting, chest-touch gesture, waving, walking, turning, arm movement, garment motion, hair motion, body reshaping or side-view reconstruction. Never add, remove, recolour or redesign clothing. Nothing crosses or alters the customer's silhouette. Identity and outfit fidelity override every creative instruction.`;

function buildH3Prompt(category: CustomerCategory) {
  const sceneMotion = getEventSceneDirection(category, 'diwali', 'set-1').videoScene;
  return `CINEMATIC ACTION — HIGH PRIORITY: Create one continuous six-second luxury Diwali campaign shot with visibly active environment and no hard cuts. Seconds 0–1.5 hold a wide establishing composition showing the complete palace scale and foreground depth. Seconds 1.5–4.5 perform the scene-specific camera move with clearly visible foreground parallax and at least three subtle background motions already supported by the first frame: lantern movement, natural diya flicker, water or reflection movement, distant celebration-light shimmer, fountain spray or foliage movement. Seconds 4.5–6 ease smoothly into a medium-full hero composition while keeping the complete outfit and both feet readable. Motion must remain purposeful and fluid enough for later nine-second slow presentation. ${sceneMotion} Use physically believable camera inertia, natural depth of field, realistic flame and reflection behaviour, restrained atmospheric movement and premium cinema colour. Foreground elements travel only along outer frame edges. No light ribbon, flare, particle, lantern or prop may pass across the customer. No sudden zoom, fake cut, reverse shot or return to a reconstructed angle. ${FIDELITY_LOCK}`;
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

import { getCampaignPose, getCampaignPoseLabel, getCampaignPoseTransition, getEventOption, getEventSceneDirection, type CampaignPoseId, type CustomerCategory, type EventId, type VideoPromptSet } from './config';

export const VIDEO_TEST_MODELS = [
  { id: 'h3-max', label: 'H3 Max Reference', model: 'minimax/h3-max/reference-to-video', seconds: 6, estimatedUsd: 0.48 },
] as const;

export type VideoTestModelId = typeof VIDEO_TEST_MODELS[number]['id'];

export function getVideoTestModel(value: unknown) {
  return VIDEO_TEST_MODELS.find((entry) => entry.id === value) || null;
}

const FIDELITY_LOCK = `REFERENCE AUTHORITY: The approved first frame is the composition authority. Reference image 1 is the original customer identity authority; later reference images are garment-detail authorities. SUBJECT LOCK: Preserve the customer's exact identity, facial structure, skin tone, hair, age, and natural proportions. Garment design, fabric weave, colors, borders, and embroidery must remain 100% stable with zero outfit morphing or texture drift. MOTION CHOREOGRAPHY: The customer begins in their natural relaxed standing stance, performs only the single designated smooth signature pose transition into the final hold, and maintains living human presence (gentle chest breathing, soft eye-focus, and radiant celebratory smile). Never invent erratic waving, walking, body turns, or unscripted gestures. Nothing crosses or alters the customer's silhouette. Identity and outfit fidelity override every creative instruction.`;

function buildH3Prompt(category: CustomerCategory, eventId: EventId, promptSet: VideoPromptSet, poseId: CampaignPoseId) {
  const event = getEventOption(eventId);
  const sceneMotion = getEventSceneDirection(category, eventId, promptSet).videoScene;
  const poseLabel = getCampaignPoseLabel(poseId);
  const poseTransition = getCampaignPoseTransition(category, poseId);
  const diwaliEnergy = eventId === 'diwali'
    ? `DIWALI FESTIVE ANIMATION — VIBRANT & ACTIVE: Ensure dynamic festive atmosphere across the scene: brass diya oil flames visibly flicker and dance with warm golden firelight, casting shimmering golden reflections across the polished marble floor. Distant festive fireworks bloom gracefully in the deep indigo night sky behind the palace arches. Floating golden sparks, Diwali bokeh motes, and warm celebratory light particles drift gently through the ambient air behind the customer. Suspended palace lanterns sway subtly with a gentle festive evening breeze. Keep the festive life active and glowing across the environment while preserving the customer's clothing and identity.`
    : '';

  return `CINEMATIC ACTION — HIGH PRIORITY: Create one continuous six-second luxury ${event.label} campaign shot with visibly active environment and fluid, living human presence.

CHOREOGRAPHY & MOTION TIMELINE:
- Seconds 0.0–1.5: Hold a wide establishing composition showing the complete location scale and foreground depth. The customer stands with natural, living human presence (gentle chest breathing, eye catchlights, warm subtle smile, hands relaxed naturally at sides).
- Seconds 1.5–3.5: Fluid Pose Transition (${poseLabel}). The camera executes its scene-specific move with foreground parallax, while the customer gracefully and intentionally executes the signature pose: ${poseTransition}
- Seconds 3.5–6.0: Regal Hero Hold. The signature ${poseLabel} pose is fully settled and held with royal poise, radiant celebratory smile, and living eye focus through the end of the shot, perfect for a luxury commercial loop. Complete outfit and both feet remain readable.

ENVIRONMENT & CAMERA:
${sceneMotion} ${diwaliEnergy} Use physically believable camera inertia, natural depth of field, realistic event lighting, reflections and rich atmospheric movement. Foreground elements travel only along outer frame edges. No light ribbon, flare, particle, decoration or prop may pass across the customer. No sudden zoom, fake cut, reverse shot or reconstructed angle. ${FIDELITY_LOCK}`;
}

export function buildVideoTestInput(
  modelId: VideoTestModelId,
  masterUrl: string,
  referenceUrls: string[],
  category: CustomerCategory,
  eventId: EventId,
  promptSet: VideoPromptSet,
  poseId: CampaignPoseId,
) {
  return {
    image_url: masterUrl,
    reference_image_urls: referenceUrls,
    prompt: buildH3Prompt(category, eventId, promptSet, poseId),
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

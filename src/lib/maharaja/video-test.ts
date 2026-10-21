import { getCampaignExperience, getCampaignPoseLabel, getCampaignPoseTransition, type CampaignPoseId, type CustomerCategory, type EventId, type VideoPromptSet } from './config';

export const VIDEO_TEST_MODELS = [
  { id: 'h3-max', label: 'H3 Max Reference', model: 'minimax/h3-max/reference-to-video', seconds: 6, estimatedUsd: 0.48 },
] as const;

export type VideoTestModelId = typeof VIDEO_TEST_MODELS[number]['id'];

export function getVideoTestModel(value: unknown) {
  return VIDEO_TEST_MODELS.find((entry) => entry.id === value) || null;
}

const FIDELITY_LOCK = `REFERENCE AUTHORITY: The approved opening frame is the sole authority for customer identity, face, body, opening pose, complete clothing and scene composition. Begin exactly from the approved opening frame. Do not correct, reposition or reinterpret the person to satisfy text instructions. Reference Images 1 onward are garment-detail references only; they reinforce textile construction, weave, pattern, border and colour details already visible in the approved opening frame. Never restore, introduce or infer clothing from any other source. REAL HUMAN PHOTOGRAPHY (ANTI-CGI LOCK): The subject must look like an authentic living human filmed on a 35mm cinema camera, with natural skin texture and genuine textile drape. Forbid CGI, avatar, plastic skin, doll face or mannequin stiffness. SUBJECT LOCK: Preserve exact identity, facial structure, expression, skin tone, hair, age, body proportions and complete outfit with zero clothing replacement, morphing, recolouring or texture drift. The only permitted subject geometry change is the explicitly specified short arm-and-hand trajectory into the selected final pose. Keep torso, feet, hair and garment construction stable throughout that movement. Never invent waving, walking, breathing motion, body turns, expression changes or additional gestures. Identity and outfit fidelity override every creative instruction.`;

function buildH3Prompt(category: CustomerCategory, eventId: EventId, promptSet: VideoPromptSet, poseId: CampaignPoseId, referenceRoles: string[]) {
  const experience = getCampaignExperience(category, promptSet);
  const poseLabel = getCampaignPoseLabel(poseId);
  const poseTransition = getCampaignPoseTransition(category, poseId);
  const roleAuthority = referenceRoles.length
    ? referenceRoles.map((role, index) => `- Reference Image ${index + 1}: ${role}. Preserve only this garment component and its visible details.`).join('\n')
    : '- Reference Image 1: current garment detail reference. Preserve only details already visible in the approved opening frame.';
  const diwaliEnergy = eventId === 'diwali'
    ? `DIWALI FESTIVE ANIMATION — BACKGROUND ONLY: Existing diya flames flicker naturally, existing distant fireworks bloom softly, and existing lantern light and reflections animate behind the customer. Do not add particles, sparks, light ribbons, props or effects across the customer or garment.`
    : '';

  return `CINEMATIC ACTION — LIVE-ACTION CAPTURE: Create one continuous six-second luxury live-action campaign film from the approved master image with authentic human photorealism and one precisely controlled pose action.

LOCKED EXPERIENCE: ${experience.id}. Scene, camera, movement and final pose are a single fixed experience and must not be independently changed.

GARMENT REFERENCE ROLES:
${roleAuthority}

CHOREOGRAPHY & MOTION TIMELINE:
- Seconds 0.0–1.4: Hold the exact approved opening frame pose and exact facial expression. Do not reposition hands, arms, head, torso or feet. No breathing-driven torso movement.
- Seconds 1.4–3.4: Perform exactly one short transition into ${poseLabel}: ${poseTransition} No other gesture, expression change or body transition is permitted.
- Seconds 3.4–6.0: Hold the settled ${poseLabel} pose without further body, hand, face, hair or garment movement. Keep the complete outfit and both feet readable.

ENVIRONMENT & CAMERA:
${experience.cameraMotion} ${experience.environmentMotion} ${diwaliEnergy} Use natural depth of field and realistic event lighting. No parallax, lateral motion, orbit, crane motion, perspective reconstruction, sudden zoom, cut, reverse shot or newly revealed surface. No light, flare, particle, decoration or prop may pass across the customer. ${FIDELITY_LOCK}`;
}

export function buildVideoTestInput(
  modelId: VideoTestModelId,
  masterUrl: string,
  referenceUrls: string[],
  category: CustomerCategory,
  eventId: EventId,
  promptSet: VideoPromptSet,
  poseId: CampaignPoseId,
  referenceRoles: string[] = [],
) {
  return {
    image_url: masterUrl,
    reference_image_urls: referenceUrls,
    prompt: buildH3Prompt(category, eventId, promptSet, poseId, referenceRoles),
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

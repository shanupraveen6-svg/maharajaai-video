import type { CustomerCategory, VideoPromptSet } from './config';

export const DIWALI_REFERENCE_VIDEO_MODEL = 'minimax/h3-max/reference-to-video';

export type DiwaliReferencePromptId =
  | 'diwali-men-01'
  | 'diwali-men-02'
  | 'diwali-women-01'
  | 'diwali-women-02'
  | 'diwali-boy-01'
  | 'diwali-boy-02'
  | 'diwali-girl-01'
  | 'diwali-girl-02'
  | 'diwali-backup-01'
  | 'diwali-backup-02';

const REFERENCE_LOCK = `REFERENCE AUTHORITY — ABSOLUTE PRIORITY

The approved first-frame image is the final visual authority for the complete composition. Image 1 is the original customer identity reference. Images 2 onward, when present, are the original clothing references.

Preserve the exact customer identity shown by the approved first frame and Image 1: same face, facial geometry, hairstyle, hairline, skin tone, body proportions, age appearance, expression, pose, hands, head position and foot position.

Preserve exactly whatever clothing is already visible in the approved first frame and supported by Images 2 onward. The model must not decide what the customer should wear and must not infer clothing from customer category, age, gender, Diwali, culture, location, architecture, background, fashion context or celebration theme.

Never replace, redesign, reinterpret, recolor, embellish, simplify or restyle the clothing. Preserve every visible silhouette, fit, layer, colour region, gradient, pattern, print, motif, collar, neckline, sleeve, hem, fabric appearance, accessory and construction detail. Introduce no new colour, embroidery or decoration and remove nothing.

SUBJECT LOCK

The customer remains completely stationary like a luxury campaign hero. No walking, stepping, turning, arm movement, hand movement, head movement, blinking, breathing-driven torso movement, body reshaping, garment movement, fabric flutter or hair movement. Never reveal or invent unseen sides of the customer or clothing.

All cinematic energy comes from camera treatment and elements already present in the approved scene. Effects stay behind or around the customer and never cross or alter the face, skin, body or clothing.

CUSTOMER AND CLOTHING FIDELITY OVERRIDE EVERY OTHER INSTRUCTION.`;

const CHILD_SAFETY = `CHILD SAFETY

Preserve the child's exact age appearance and natural identity. No mature styling, mature posing, adult glamour or adult fashion behaviour.`;

const PRIMARY_TREATMENTS: Record<Exclude<DiwaliReferencePromptId, 'diwali-backup-01' | 'diwali-backup-02'>, string> = {
  'diwali-men-01': `Preserve the exact approved Diwali composition. Use a smooth premium whole-frame forward cinema push toward the stationary customer. Use existing foreground depth only when already visible. Existing background lamp light, distant bokeh and floor reflections may move very subtly. Create luxury depth without changing the viewing angle. Add no lamps, architecture or decoration. No orbit, side-angle reconstruction or effects on the customer. Finish with a clean powerful hero hold.`,
  'diwali-men-02': `Preserve the exact approved architectural scene. Begin with premium shallow cinematic depth and smoothly settle attention on the stationary customer. Execute one controlled whole-frame forward camera push while maintaining the exact viewpoint. Existing architectural highlights, distant festive lights and reflections may move subtly. No orbit, lateral reconstruction, crossing objects or new scene elements. End in a strong luxury fashion hero frame.`,
  'diwali-women-01': `Preserve the exact approved Diwali scene. Use an elegant controlled whole-frame cinema push toward the stationary customer. Allow only existing walkway illumination, distant lights and reflective surfaces to create movement. Existing background illumination may deepen into a rich luxury glow. Keep every moving effect physically separated from the customer. No new decoration, orbit or perspective reconstruction. Finish with a premium campaign hero hold.`,
  'diwali-women-02': `Preserve the exact approved doorway or architectural composition. Use subtle focus depth from the existing scene followed by a smooth whole-frame forward hero push. Existing background illumination, bokeh and architectural reflections may shimmer gently. The customer remains motionless and identical to the approved first frame. Nothing crosses the customer. No new props, recolouring, orbit or viewing-angle change. End on a polished full-body hero portrait.`,
  'diwali-boy-01': `${CHILD_SAFETY}\n\nPreserve the exact approved courtyard or open festive composition. Use one smooth gentle whole-frame cinema push. Existing distant lights, decorative illumination and floor reflections may create controlled visual energy behind the child. No new objects, scene redesign, orbit or subject movement. Create a premium cheerful campaign-film feeling through camera and environment only.`,
  'diwali-boy-02': `${CHILD_SAFETY}\n\nPreserve the exact approved composition. Use existing hanging lights, overhead decoration or background depth only when already present. Perform one controlled whole-frame forward camera push. Existing background lights may shimmer gently. Generate no swinging or crossing objects and add no decoration. No orbit or perspective reconstruction. Finish with a crisp premium hero hold.`,
  'diwali-girl-01': `${CHILD_SAFETY}\n\nPreserve the exact approved balcony or architectural composition. Use one gentle luxurious whole-frame camera push while maintaining the original viewing angle. Existing background illumination, distant lights and reflections may softly shimmer. Add no props or floating effects. No orbit or perspective reconstruction. End in a charming premium campaign portrait.`,
  'diwali-girl-02': `${CHILD_SAFETY}\n\nPreserve the exact approved decorative-floor and festive composition. Use one gentle premium whole-frame forward camera push. Existing floor highlights, reflections, distant illumination and bokeh may move subtly. Keep all effects separated from the child. Add no decoration. No orbit or scene reconstruction. End on a clean, bright luxury hero frame.`,
};

const BACKUP_TREATMENTS: Record<'diwali-backup-01' | 'diwali-backup-02', string> = {
  'diwali-backup-01': `MAXIMUM FIDELITY REGENERATION. Freeze the customer, clothing and complete scene. Only the camera may move. Apply one very slow uniform whole-frame forward optical push while preserving the original viewpoint. No background, particle, lamp, bokeh, reflection or lighting animation. No perspective change, orbit or new content. The result must look like the exact approved photograph receiving only a premium cinema-camera push.`,
  'diwali-backup-02': `ULTRA-LOCKED HERO FILM. Keep the customer, clothing, environment, lighting and every visible object rigid and unchanged. Apply only an extremely subtle whole-frame cinema push over six seconds and finish with a stable hero hold. Keep the original viewpoint. No lateral movement, perspective reconstruction, newly revealed surfaces or new visual content. Maximum visual consistency overrides creative reinterpretation.`,
};

export function getDiwaliReferencePromptId(
  category: CustomerCategory,
  promptSet: VideoPromptSet = 'set-1',
  backup?: 1 | 2,
): DiwaliReferencePromptId {
  if (backup === 1) return 'diwali-backup-01';
  if (backup === 2) return 'diwali-backup-02';
  const variant = promptSet === 'set-2' ? '02' : '01';
  return `diwali-${category}-${variant}` as DiwaliReferencePromptId;
}

export function buildDiwaliReferenceVideoPrompt(promptId: DiwaliReferencePromptId): string {
  const treatment = promptId in BACKUP_TREATMENTS
    ? BACKUP_TREATMENTS[promptId as keyof typeof BACKUP_TREATMENTS]
    : PRIMARY_TREATMENTS[promptId as keyof typeof PRIMARY_TREATMENTS];
  return `${REFERENCE_LOCK}\n\nDIWALI CINEMATIC TREATMENT\n\n${treatment}`.replace(/\s+/g, ' ').trim();
}

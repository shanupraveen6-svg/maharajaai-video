export const MAHARAJA_CLIENT_ID = 'maharaja';
export const MAHARAJA_WORKSPACE_CODE = 'workspace';
export const TRY_ON_MIN_PURCHASE = 500;
export const AI_VIDEO_MIN_PURCHASE = 5000;

export const EVENT_IDS = ['diwali', 'new-year', 'pongal', 'christmas', 'ramadan', 'birthday'] as const;
export type EventId = (typeof EVENT_IDS)[number];

export const EVENT_OPTIONS: Array<{ id: EventId; label: string; scene: string }> = [
  {
    id: 'diwali',
    label: 'Diwali',
    scene: 'an elegant Diwali fashion-store setting with warm diyas, brass lamps, marigold flowers, rangoli and refined golden light',
  },
  {
    id: 'new-year',
    label: 'New Year',
    scene: 'a premium New Year fashion celebration with elegant gold lights, subtle confetti, midnight sparkle and a polished retail-stage atmosphere',
  },
  {
    id: 'pongal',
    label: 'Pongal',
    scene: 'a premium Tamil Pongal celebration with sugarcane, kolam, brass decor, harvest accents and warm morning light',
  },
  {
    id: 'christmas',
    label: 'Christmas',
    scene: 'an elegant Christmas fashion setting with tasteful evergreen decor, warm white lights, gold ornaments and a premium retail atmosphere',
  },
  {
    id: 'ramadan',
    label: 'Ramadan',
    scene: 'a respectful Ramadan evening fashion setting with elegant lanterns, crescent-inspired decor, warm architectural light and refined modest styling',
  },
  {
    id: 'birthday',
    label: 'Birthday',
    scene: 'a premium birthday fashion celebration with tasteful balloons, soft gold lights, subtle ribbons and an elegant retail photo-stage atmosphere',
  },
];

export function isEventId(value: unknown): value is EventId {
  return typeof value === 'string' && EVENT_IDS.includes(value as EventId);
}

export function getEventOption(eventId: EventId) {
  return EVENT_OPTIONS.find((event) => event.id === eventId) || EVENT_OPTIONS[0];
}

export type CustomerCategory = 'men' | 'women' | 'boy' | 'girl';
export type VideoPromptSet = 'set-1' | 'set-2';

export function buildMasterPrompt(category: CustomerCategory, eventId: EventId) {
  const event = getEventOption(eventId);
  const subject = category === 'men'
    ? 'adult man'
    : category === 'women'
      ? 'adult woman'
      : category === 'boy'
        ? 'young boy'
        : 'young girl';
  const safety = category === 'boy' || category === 'girl'
    ? 'Use child-safe, age-appropriate, cheerful styling with no adult glamour.'
    : 'Use modest, family-friendly premium fashion styling with no glamour or body-part emphasis.';

  return `Create a hyper-photorealistic vertical 9:16 full-body fashion master image for ${event.label}. The subject is an ${subject}. Use the first uploaded image as the exact person reference and preserve face, skin tone, age, hairstyle, body shape, body size and identity. Use every remaining uploaded image as garment evidence and preserve the exact garment color, fabric, embroidery, borders, motifs, silhouette and fit. Never substitute a different person or redesign the outfit. ${safety} Keep the person head-to-toe with both feet visible, natural hands, stable posture and clean appropriate footwear. Scene: ${event.scene}. No words, captions, logos, greeting text, religious marks on the forehead, extra limbs, distorted hands or cropped feet.`;
}

export function buildEventVideoPrompt(category: CustomerCategory, eventId: EventId, promptSet: VideoPromptSet) {
  const event = getEventOption(eventId);
  const child = category === 'boy' || category === 'girl';
  const feminine = category === 'women' || category === 'girl';
  const subject = category === 'men' ? 'adult man' : category === 'women' ? 'adult woman' : category === 'boy' ? 'young boy' : 'young girl';
  const styling = category === 'women'
    ? 'modest graceful heroine presentation suitable for a saree or lehenga'
    : category === 'men'
      ? 'confident premium hero presentation suitable for a kurta or sherwani'
      : category === 'girl'
        ? 'strictly child-safe festive presentation suitable for a pattu pavadai, with no adult glamour'
        : 'strictly child-safe cheerful presentation suitable for a kurta pajama or dhoti';
  const heldObject = child
    ? 'The child holds one lit brass lamp in both hands. Both hands, fingers, wrists, elbows, lamp position and flame position remain fixed in every frame.'
    : 'Both arms, hands and fingers remain in their exact source-image positions in every frame.';
  const theme = promptSet === 'set-2'
    ? feminine
      ? 'Divine-touch set: animate only background gold rays, temple-lamp glow, a fixed halo behind the subject and slow background-only gold particles.'
      : 'Cracker set: animate only distant background firework bursts, controlled gold sparks behind the subject and reflected festive light on the environment. No sparks cross the face or body.'
    : 'Premium festive set: animate only background practical lights, controlled gold particles behind the subject and a soft light sweep across the environment.';
  const camera = promptSet === 'set-2'
    ? 'Camera path: begin on the approved full-body frame, execute one fixed-radius 12-degree side track, then return to the exact front-facing full-body composition.'
    : 'Camera path: begin on the approved full-body frame, execute one straight slow dolly-in, then one straight pull-back to the exact starting composition.';

  return `Create a premium photorealistic 6-second vertical 9:16 ${event.label} fashion film from the approved master image of the ${subject}. Styling: ${styling}. SUBJECT LOCK: the subject remains completely stationary for all 6 seconds. Feet remain fixed to the floor. Legs, torso, shoulders, arms, hands, fingers and head angle remain fixed. Garment silhouette, pleats, drape, borders and footwear remain unchanged. The only subject action is one natural closed-mouth smile that appears gradually; no other face or body motion. ${heldObject} ${camera} ${theme} Event environment: ${event.scene}. Preserve exact identity, age, skin tone, body proportions, outfit colors, fabric, embroidery, footwear and background composition. Preserve the existing Majestic Maharaja top-right brand mark exactly. Prohibited: walking, stepping, turning, dancing, waving, hand movement, head movement, body sway, breathing motion, garment motion, pose transition, lip-sync, dialogue, text, captions, forehead marks, extra limbs, face change or outfit change.`;
}

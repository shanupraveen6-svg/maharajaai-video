export const MAHARAJA_CLIENT_ID = 'maharaja';
export const MAHARAJA_WORKSPACE_CODE = 'workspace';
export const TRY_ON_MIN_PURCHASE = 500;
export const AI_VIDEO_MIN_PURCHASE = 5000;
export const MAX_TRY_ON_RETRIES = 2;

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

export function buildEventVideoPrompt(category: CustomerCategory, eventId: EventId) {
  const event = getEventOption(eventId);
  const subject = category === 'men'
    ? 'man'
    : category === 'women'
      ? 'woman'
      : category === 'boy'
        ? 'young boy'
        : 'young girl';

  return `Create a premium photorealistic 6-second vertical 9:16 ${event.label} fashion film from the approved master image of the ${subject}. Start cinematic motion at frame 1. Preserve the exact face, identity, age, skin tone, body proportions, outfit, garment colors, fabric, embroidery, footwear and background. Keep the body, hands, feet and garment edges stable. Use tiny natural eye life, gentle breathing and a soft smile only. Create energy through a smooth dolly-in, subtle side truck, light sweep and background motion inspired by ${event.scene}. Finish with a clean full-body frame. Preserve the existing Majestic Maharaja top-right brand mark exactly; add no other logos. No walking, turning, dancing, pose change, lip-sync, text, captions, forehead marks, extra limbs, face change or outfit change.`;
}

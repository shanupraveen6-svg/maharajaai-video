export const MAHARAJA_CLIENT_ID = 'maharaja';
export const MAHARAJA_WORKSPACE_CODE = 'workspace';
export const TRY_ON_MIN_PURCHASE = 500;
export const AI_VIDEO_MIN_PURCHASE = 5000;
export const FESTIVE_TIER_MIN = Number(process.env.MAHARAJA_FESTIVE_TIER_MIN) || 500;
export const LUXURY_TIER_MIN = Number(process.env.MAHARAJA_LUXURY_TIER_MIN) || 3000;

export const ENFORCE_REPEAT_LIMITS = process.env.ENFORCE_REPEAT_LIMITS === 'false'
  ? false
  : process.env.NODE_ENV === 'production';

export const EVENT_IDS = ['diwali', 'new-year', 'pongal', 'christmas', 'ramadan', 'birthday'] as const;
export type EventId = (typeof EVENT_IDS)[number];

export const EVENT_OPTIONS: Array<{ id: EventId; label: string; scene: string }> = [
  { id: 'diwali', label: 'Diwali', scene: 'a premium Diwali fashion setting with warm diyas, restrained golden bokeh and heritage architecture' },
  { id: 'new-year', label: 'New Year', scene: 'a refined New Year fashion celebration with elegant lights and subtle festive sparkle' },
  { id: 'pongal', label: 'Pongal', scene: 'a premium Pongal courtyard with kolam details, warm daylight and traditional festive decor' },
  { id: 'christmas', label: 'Christmas', scene: 'an elegant Christmas fashion setting with warm lights and tasteful seasonal decor' },
  { id: 'ramadan', label: 'Ramadan', scene: 'a refined Ramadan setting with warm lanterns and dignified heritage architecture' },
  { id: 'birthday', label: 'Birthday', scene: 'a premium birthday fashion celebration with tasteful balloons and soft gold lights' },
];

export function isEventId(value: unknown): value is EventId {
  return typeof value === 'string' && EVENT_IDS.includes(value as EventId);
}

export function getEventOption(eventId: EventId) {
  return EVENT_OPTIONS.find((event) => event.id === eventId) || EVENT_OPTIONS[0];
}

export type CustomerCategory = 'men' | 'women' | 'boy' | 'girl';

/** Production virtual try-on prompt. Festival styling belongs only to the AI Video master flow. */
export function buildTryOnPrompt(category: CustomerCategory) {
  const subject = category === 'men'
    ? 'adult man'
    : category === 'women'
      ? 'adult woman'
      : category === 'boy'
        ? 'young boy'
        : 'young girl';
  const safety = category === 'boy' || category === 'girl'
    ? 'Use child-safe, age-appropriate, natural modest styling with no adult glamour.'
    : 'Use modest, family-friendly, natural styling.';

  return `Create a photorealistic vertical 9:16 full-body virtual try-on photograph of the real ${subject}.

REFERENCE AUTHORITY:
- Image 1 is the authoritative customer identity reference.
- Images 2 onwards show the same garment or its explicitly labelled pieces and details. Use all supplied garment references together.

IDENTITY AND NATURAL-SKIN LOCK:
- Preserve the exact face, natural asymmetry, eyes, nose, lips, jawline, ears, skin tone, hairstyle, hairline, facial hair, glasses, age appearance and body proportions from Image 1.
- Keep real pores, fine lines, under-eye detail, moles and natural skin texture.
- Do not add makeup, foundation, lipstick, eyeliner, contouring, false lashes, skin whitening, glamour styling, beauty filters, facial reshaping, symmetry correction, airbrushing, waxy skin, plastic skin, porcelain texture, CGI or a doll-like appearance.

GARMENT LOCK:
- Dress the customer in the exact garment from the supplied garment references; combine their details into one outfit.
- Preserve its exact colours, colour transitions, fabric, weave, prints, embroidery, borders, neckline, sleeves, drape, pieces and silhouette.
- Ignore the garment photo's mannequin, hanger, rack, stand and background. Transfer only the garment.
- Use realistic cloth gravity, folds and contact shadows without changing the customer's body.

FRAMING AND LIGHT:
- One customer standing naturally, facing the camera, with the full head and both feet visible.
- Two natural arms and hands with no duplicated or distorted anatomy.
- ${safety}
- Use a clean neutral fashion studio with a large soft key light, gentle neutral fill, subtle rim separation, neutral white balance and realistic exposure.
- Keep natural skin highlights without glow, bloom, beauty lighting or cosmetic retouching.
- No festival environment, props, text, logos or watermarks.

The only purpose is to show clearly and realistically how this exact garment looks on this exact customer.`;
}

export type GarmentType =
  | 'unset'
  | 'saree'
  | 'lehenga'
  | 'salwar'
  | 'one_piece'
  | 'two_piece'
  | 'three_piece'
  | 'shirt_pant'
  | 'tshirt_bottom'
  | 'dhoti_veshti'
  | 'kurta_dhoti'
  | 'pattu_pavadai'
  | 'boy_ethnic'
  | 'generic';

export const GARMENT_TYPE_VALUES: readonly GarmentType[] = [
  'unset', 'saree', 'lehenga', 'salwar', 'one_piece', 'two_piece', 'three_piece',
  'shirt_pant', 'tshirt_bottom', 'dhoti_veshti', 'kurta_dhoti', 'pattu_pavadai',
  'boy_ethnic', 'generic',
];

export function resolveGarmentType(
  category: CustomerCategory = 'women',
  explicitType?: string,
  garmentAnalysis?: string,
  garmentRoles?: string[],
): GarmentType {
  if (typeof explicitType === 'string' && GARMENT_TYPE_VALUES.includes(explicitType as GarmentType) && explicitType !== 'unset') {
    return explicitType as GarmentType;
  }
  const text = `${explicitType || ''} ${garmentAnalysis || ''} ${(garmentRoles || []).join(' ')}`.toLowerCase();
  if (text.includes('dhoti') || text.includes('veshti') || text.includes('kurta') || text.includes('pyjama') || text.includes('pajama')) {
    return category === 'boy' ? 'boy_ethnic' : 'kurta_dhoti';
  }
  if (text.includes('pattu pavadai') || text.includes('pavadai') || text.includes('langa voni')) return 'pattu_pavadai';
  if (text.includes('lehenga') || text.includes('ghagra') || text.includes('chaniya')) return 'lehenga';
  if (text.includes('salwar') || text.includes('anarkali') || text.includes('kameez') || text.includes('churidar') || text.includes('kurti')) return 'salwar';
  if (text.includes('saree') || text.includes('sari') || text.includes('kanchi') || text.includes('banarasi') || text.includes('pallu')) return 'saree';
  return 'generic';
}

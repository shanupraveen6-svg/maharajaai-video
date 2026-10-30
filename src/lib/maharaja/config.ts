export const MAHARAJA_CLIENT_ID = 'maharaja';
export const MAHARAJA_WORKSPACE_CODE = 'workspace';
/** ₹500 minimum is disabled (0) by default for direct QR image try-on scan. */
export const TRY_ON_MIN_PURCHASE = 0;
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
/** Garment types that make sense for each customer category; anything else is treated as generic. */
const GARMENT_TYPES_BY_CATEGORY: Record<CustomerCategory, readonly GarmentType[]> = {
  women: ['saree', 'lehenga', 'salwar', 'one_piece', 'two_piece', 'three_piece', 'shirt_pant', 'tshirt_bottom', 'generic'],
  men: ['kurta_dhoti', 'dhoti_veshti', 'shirt_pant', 'tshirt_bottom', 'two_piece', 'three_piece', 'generic'],
  girl: ['pattu_pavadai', 'lehenga', 'salwar', 'one_piece', 'two_piece', 'three_piece', 'tshirt_bottom', 'generic'],
  boy: ['boy_ethnic', 'kurta_dhoti', 'dhoti_veshti', 'shirt_pant', 'tshirt_bottom', 'two_piece', 'three_piece', 'generic'],
};

/**
 * A garment type the customer category cannot wear (for example a pattu pavadai for a boy) would steer
 * the model toward the wrong garment, so it falls back to copying the references exactly.
 */
export function compatibleGarmentType(category: CustomerCategory, garmentType: GarmentType): GarmentType {
  if (garmentType === 'unset') return 'generic';
  return GARMENT_TYPES_BY_CATEGORY[category].includes(garmentType) ? garmentType : 'generic';
}

/** One rule per garment type, shared by the Try-On and festival master image prompts. */
export const GARMENT_TYPE_RULES: Record<GarmentType, string> = {
  saree: 'SAREE: an authentic Indian saree. Preserve the exact saree body, pallu, border finish, motif geometry and blouse construction, with neat front waist pleats, a clean diagonal body wrap and the pallu falling naturally from the shoulder. Never convert it into a salwar, churidar, lehenga or one-piece garment.',
  lehenga: 'LEHENGA CHOLI: preserve the exact flared skirt and kalis, embroidered hem border, choli neckline and sleeves, and the dupatta drape as shown. No saree pleats or pallu.',
  salwar: 'SALWAR / ANARKALI: preserve the exact tunic length and flare, neckline, side slits, salwar or churidar bottom and dupatta drape. No saree pleats or pallu.',
  one_piece: 'ONE-PIECE (gown, dress or frock): preserve the exact single-garment silhouette, neckline, sleeves, waistline, flare and hem length. Do not add a dupatta, jacket, second piece or saree drape.',
  two_piece: 'TWO-PIECE SET: preserve the supplied top and bottom as two separate pieces with their exact lengths, fit and prints. Do not add a third layer, dupatta or saree drape.',
  three_piece: 'THREE-PIECE SET: preserve the exact inner top, outer layer (jacket, shrug, waistcoat or dupatta) and bottom, layered in the order shown. Do not remove or invent a layer.',
  shirt_pant: 'SHIRT AND TROUSERS: preserve the exact shirt collar, placket, buttons, sleeves and print, and the supplied trousers with waistband and hem resting above the footwear. Never convert either piece to a kurta, dhoti or ethnic wear.',
  tshirt_bottom: 'T-SHIRT / CASUAL TOP AND BOTTOM: preserve the exact knit or casual top with its neckline, print and sleeve length (no collar or buttons unless shown) and the supplied bottom (jeans, trousers, shorts or skirt). Never add a jacket or convert it to formal or ethnic wear.',
  dhoti_veshti: 'VESHTI / DHOTI WITH SHIRT: preserve the supplied shirt or kurta and the veshti wrapped with front pleats, the gold or zari border along the hem and front edge, and crisp natural folds; add an angavastram only if shown. Never convert it to trousers or a saree.',
  kurta_dhoti: 'KURTA WITH DHOTI OR PYJAMA: preserve the exact kurta length, collar, placket, buttons, sleeves and fabric weave, and the dhoti, veshti or pyjama drape shown. If the reference is a modern shirt and trousers, keep them as shirt and trousers.',
  pattu_pavadai: 'PATTU PAVADAI: a girl\'s traditional silk skirt with matching blouse. Preserve the full flared silk skirt, the zari border and the blouse sleeves and neckline in modest child styling. No adult saree drape.',
  boy_ethnic: 'BOY\'S ETHNIC SET: preserve the exact kurta-pyjama, sherwani or shirt-and-dhoti set as shown, with child proportions and comfortable fit. If the reference is a modern shirt or T-shirt with trousers, keep it modern.',
  generic: 'GARMENT AS SHOWN: copy only the supplied garment references exactly; do not reinterpret them as a different traditional, western, formal or casual garment.',
  unset: 'GARMENT AS SHOWN: copy only the supplied garment references exactly; do not reinterpret them as a different traditional, western, formal or casual garment.',
};

/** Finer detail for named styles within a garment type, matched from the catalogue category or title. */
const GARMENT_STYLE_DETAILS: Array<{ match: RegExp; types: readonly GarmentType[]; detail: string }> = [
  { match: /kanchi|kanjiv|silk saree|pattu saree|bridal/, types: ['saree'], detail: 'Silk saree detail: keep the heavy silk lustre, the contrast zari border and the woven pallu motifs crisp and unbroken.' },
  { match: /anarkali/, types: ['salwar'], detail: 'Anarkali detail: fitted bodice with a floor- or calf-length flare of kalis and a matching churidar.' },
  { match: /gown/, types: ['one_piece'], detail: 'Gown detail: structured bodice, flared skirt and a floor-grazing hem.' },
  { match: /frock/, types: ['one_piece'], detail: 'Frock detail: modest neckline, gathered waist and comfortable knee-length flare.' },
  { match: /sherwani/, types: ['three_piece', 'boy_ethnic', 'kurta_dhoti', 'generic'], detail: 'Sherwani detail: structured long coat with stand collar and front buttons over the matching bottom.' },
  { match: /blazer|suit/, types: ['three_piece', 'shirt_pant', 'generic'], detail: 'Tailored detail: keep the lapels, shoulder line and button stance of the jacket exactly.' },
];

const GARMENT_KEYWORD_TYPES: Array<{ match: RegExp; type: GarmentType }> = [
  { match: /saree|sari\b/, type: 'saree' },
  { match: /lehenga|ghagra/, type: 'lehenga' },
  { match: /pavadai|langa/, type: 'pattu_pavadai' },
  { match: /salwar|anarkali|kurti|churidar/, type: 'salwar' },
  { match: /veshti|dhoti/, type: 'dhoti_veshti' },
  { match: /t-?shirt|tee\b/, type: 'tshirt_bottom' },
  { match: /shirt|trouser|pant/, type: 'shirt_pant' },
  { match: /gown|frock|dress/, type: 'one_piece' },
];

export function buildTryOnPrompt(
  category: CustomerCategory,
  details?: {
    audience?: string;
    categoryId?: string;
    garmentType?: string;
    productTitle?: string;
  }
) {
  const subject = category === 'men'
    ? 'adult man'
    : category === 'women'
      ? 'adult woman'
      : category === 'boy'
        ? 'young boy'
        : 'young girl';
  const isChild = category === 'boy' || category === 'girl';
  const safety = isChild
    ? 'Use child-safe, age-appropriate, natural modest styling with no adult glamour, makeup or mature posing.'
    : 'Use modest, family-friendly, natural styling.';

  const text = `${details?.categoryId || ''} ${details?.productTitle || ''}`.toLowerCase();
  const explicitType = GARMENT_TYPE_VALUES.includes(details?.garmentType as GarmentType) ? details?.garmentType as GarmentType : 'generic';
  // The garment type chosen by staff or the catalogue wins; keywords only help when none was chosen.
  const inferredType = explicitType === 'generic' || explicitType === 'unset'
    ? GARMENT_KEYWORD_TYPES.find((item) => item.match.test(text))?.type || 'generic'
    : explicitType;
  const garmentType = compatibleGarmentType(category, inferredType);
  const styleDetails = GARMENT_STYLE_DETAILS
    .filter((item) => item.types.includes(garmentType) && item.match.test(text))
    .map((item) => `- ${item.detail}`)
    .join('\n');

  return `Create a photorealistic vertical 9:16 full-body virtual try-on photograph of the real ${subject}.

GARMENT TYPE:
- ${GARMENT_TYPE_RULES[garmentType]}${styleDetails ? `\n${styleDetails}` : ''}
- Fit the garment to this ${subject}'s real body with natural ease${isChild ? ' and comfortable child proportions' : ''}; never change the body to fit the garment.

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
- Ignore the garment photo's mannequin, hanger, rack, stand, model and background. Transfer only the garment.
- Keep the customer's own footwear unless the references show footwear as part of the outfit.
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

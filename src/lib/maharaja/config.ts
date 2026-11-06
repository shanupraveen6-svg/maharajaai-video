export const MAHARAJA_CLIENT_ID = 'maharaja';
export const MAHARAJA_WORKSPACE_CODE = 'workspace';
/** ₹500 minimum is disabled (0) by default for direct QR image try-on scan. */
export const TRY_ON_MIN_PURCHASE = 0;
export const AI_VIDEO_MIN_PURCHASE = 5000;
export const FESTIVE_TIER_MIN = Number(process.env.MAHARAJA_FESTIVE_TIER_MIN) || 500;
export const LUXURY_TIER_MIN = Number(process.env.MAHARAJA_LUXURY_TIER_MIN) || 3000;

/**
 * Per-customer and per-device limits (one phone per pass, 2 tries per customer, one Try-On per device).
 * Off until launch so any device can try, retry, and make images and videos any number of times.
 * Set ENFORCE_REPEAT_LIMITS=true on Vercel to switch them on. Store credits and the spend cap still apply.
 */
export const ENFORCE_REPEAT_LIMITS = process.env.ENFORCE_REPEAT_LIMITS === 'true';

/** A customer rate limit, raised tenfold while repeat limits are off. */
export function customerRateLimit(limit: number) {
  return ENFORCE_REPEAT_LIMITS ? limit : limit * 10;
}

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

/** Garment types that make sense for each customer category; anything else is treated as generic. */
const GARMENT_TYPES_BY_CATEGORY: Record<CustomerCategory, readonly GarmentType[]> = {
  women: ['saree', 'half_saree', 'lehenga', 'salwar', 'one_piece', 'top', 'trousers', 'jacket', 'two_piece', 'three_piece', 'shirt_pant', 'tshirt_bottom', 'generic'],
  men: ['kurta_dhoti', 'dhoti_veshti', 'shirt_pant', 'tshirt_bottom', 'trousers', 'jacket', 'two_piece', 'three_piece', 'generic'],
  girl: ['pattu_pavadai', 'half_saree', 'lehenga', 'salwar', 'one_piece', 'top', 'trousers', 'two_piece', 'three_piece', 'tshirt_bottom', 'generic'],
  boy: ['boy_ethnic', 'kurta_dhoti', 'dhoti_veshti', 'shirt_pant', 'tshirt_bottom', 'trousers', 'jacket', 'two_piece', 'three_piece', 'generic'],
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
  half_saree: 'HALF SAREE (LANGA VONI / DHAVANI): a flared ankle-length skirt (pavadai), a fitted blouse and a half-length drape (dhavani) pleated at the waist and taken over the left shoulder, exactly as shown. It is not a full saree: no full body wrap.',
  lehenga: 'LEHENGA CHOLI: preserve the exact flared skirt and kalis, embroidered hem border, choli neckline and sleeves, and the dupatta drape as shown. No saree pleats or pallu.',
  salwar: 'SALWAR / ANARKALI: preserve the exact tunic length and flare, neckline, side slits, salwar or churidar bottom and dupatta drape. No saree pleats or pallu.',
  one_piece: 'ONE-PIECE (gown, dress or frock): preserve the exact single-garment silhouette, neckline, sleeves, waistline, flare and hem length. Do not add a dupatta, jacket, second piece or saree drape.',
  two_piece: 'TWO-PIECE SET: preserve the supplied top and bottom as two separate pieces with their exact lengths, fit and prints. Do not add a third layer, dupatta or saree drape.',
  three_piece: 'THREE-PIECE SET: preserve the exact inner top, outer layer (jacket, shrug, waistcoat or dupatta) and bottom, layered in the order shown. Do not remove or invent a layer.',
  shirt_pant: 'SHIRT: dress the customer in the supplied shirt only, with its exact collar, placket, buttons, pockets, cuffs, sleeve length, print and colours, tucked or untucked as the shirt is styled. Keep the customer\'s own trousers, veshti or bottom exactly as in Image 1. Never convert it to a kurta, T-shirt or ethnic wear.',
  tshirt_bottom: 'T-SHIRT: dress the customer in the supplied T-shirt only, with its exact neckline, sleeve length, knit, print, graphics and colours (no collar or buttons unless shown). Keep the customer\'s own bottom exactly as in Image 1. Never add a jacket or convert it to a shirt or ethnic wear.',
  top: 'TOP / BLOUSE: dress the customer in the supplied top only, with its exact neckline, sleeves, length, fit, print and colours. Keep the customer\'s own bottom exactly as in Image 1. Never extend it into a kurti, dress or set.',
  trousers: 'TROUSERS / JEANS: dress the customer in the supplied trousers, jeans or bottom only, with the exact waistband, fly, pockets, wash or colour, fit and length, the hem resting naturally above the footwear. Keep the customer\'s own shirt or top exactly as in Image 1. Never convert it to a veshti, dhoti, skirt or shorts.',
  jacket: 'JACKET / BLAZER / WAISTCOAT: dress the customer in the supplied outer layer only, with its exact lapels or collar, buttons, pockets, shoulder line, length and colours, worn over the customer\'s own clothes from Image 1. Never add a matching bottom or tie that is not shown.',
  dhoti_veshti: 'VESHTI / DHOTI: dress the customer in the supplied veshti, wrapped at the waist to the ankles with front pleats and crisp natural folds, keeping its own main body colour (usually plain white or cream) and its own border exactly as shown (colour, width, print and where it sits). Keep the customer\'s own shirt unless a shirt is part of the supplied garment. Never add a gold or zari border that is not shown, never print the veshti with another garment\'s pattern, and add an angavastram only if shown. Never convert it to trousers or a saree.',
  kurta_dhoti: 'KURTA: preserve the exact kurta length, collar, placket, buttons, sleeves and fabric weave. Dress the customer in its pyjama, churidar, dhoti or sherwani layer only if the garment reference shows one; otherwise keep the customer\'s own bottom exactly as in Image 1.',
  pattu_pavadai: 'PATTU PAVADAI: a girl\'s traditional silk skirt with matching blouse. Preserve the full flared silk skirt, the zari border and the blouse sleeves and neckline in modest child styling. No adult saree drape.',
  boy_ethnic: 'BOY\'S KURTA OR ETHNIC WEAR: preserve the exact kurta, sherwani or ethnic top with child proportions and a comfortable fit. Add a pyjama, dhoti or other piece only if the garment reference shows it; otherwise keep the boy\'s own bottom exactly as in Image 1.',
  generic: 'GARMENT AS SHOWN: copy only the supplied garment references exactly; do not reinterpret them as a different traditional, western, formal or casual garment.',
  unset: 'GARMENT AS SHOWN: copy only the supplied garment references exactly; do not reinterpret them as a different traditional, western, formal or casual garment.',
};

/**
 * GenLook takes a product title and description, not instructions: it reads them as the shop's product
 * listing. Each one says plainly what the garment is and how it is worn.
 */
export const GENLOOK_GARMENT_DESCRIPTIONS: Record<GarmentType, { title: string; description: string }> = {
  saree: { title: 'Saree', description: 'A traditional Indian saree with matching blouse, worn with neat front pleats at the waist, the body wrapped once around and the decorated pallu draped over the left shoulder. Keep the exact border, pallu motifs, weave and colours.' },
  half_saree: { title: 'Half saree', description: 'A half saree (langa voni): a flared ankle-length skirt with a fitted blouse and a half-length drape pleated at the waist and taken over the left shoulder. Keep the exact border, motifs and colours.' },
  lehenga: { title: 'Lehenga choli', description: 'A lehenga set: a flared ankle-length skirt with an embroidered hem, a fitted choli blouse and a dupatta draped as shown. Keep the exact embroidery, colours and flare.' },
  salwar: { title: 'Kurti / salwar suit', description: 'A kurti or salwar suit: a long tunic with its exact neckline, sleeves and side slits, worn over matching salwar, churidar or leggings, with the dupatta only if shown. Keep the exact length, print and colours.' },
  one_piece: { title: 'Dress', description: 'A single-piece dress, gown or frock with its exact neckline, sleeves, waistline, flare and hem length. Keep the exact print, fabric and colours.' },
  two_piece: { title: 'Top and bottom set', description: 'A two-piece outfit: the shown top worn with the shown bottom, each with its exact length, fit, print and colours.' },
  three_piece: { title: 'Three-piece set', description: 'A three-piece outfit: inner top, outer layer (jacket, shrug or dupatta) and bottom, layered as shown. Keep every piece and its exact colours.' },
  shirt_pant: { title: 'Shirt', description: 'A collared button shirt. Use its exact sleeve length, collar, pockets, buttons, print and colours from the photo.' },
  tshirt_bottom: { title: 'T-shirt', description: 'A casual T-shirt. Use its exact neckline, sleeve length, print, graphics and colours from the photo.' },
  top: { title: 'Top', description: "A women's top or blouse worn on the upper body. Use its exact neckline, sleeves, length, fit, print and colours from the photo." },
  trousers: { title: 'Trousers', description: 'Trousers or jeans worn from the waist to the ankles. Use the exact waistband, pockets, fit, length, wash and colours from the photo.' },
  jacket: { title: 'Jacket', description: 'A jacket, blazer or waistcoat worn as the outer layer. Use its exact collar or lapels, buttons, pockets, length and colours from the photo.' },
  dhoti_veshti: { title: 'Veshti (dhoti)', description: 'A South Indian veshti (dhoti) wrapped at the waist and falling to the ankles. It keeps its own body colour and its own border exactly as shown.' },
  kurta_dhoti: { title: 'Kurta', description: 'A kurta with its exact length, collar, placket and sleeves, with a pyjama, churidar or dhoti only if the photo shows one. Keep the exact fabric, embroidery and colours.' },
  pattu_pavadai: { title: 'Pattu pavadai', description: "A girl's traditional silk pattu pavadai: a full flared ankle-length silk skirt with a zari border and a matching blouse. Keep the exact border, motifs and colours." },
  boy_ethnic: { title: "Boy's kurta", description: "A boy's kurta, sherwani or ethnic top, with a pyjama or dhoti only if the photo shows one. Keep the exact fabric, embroidery and colours." },
  generic: { title: 'Outfit', description: 'The outfit exactly as shown in the photo, with every piece, its colours, print and fabric.' },
  unset: { title: 'Outfit', description: 'The outfit exactly as shown in the photo, with every piece, its colours, print and fabric.' },
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

/**
 * The one keyword table every path uses (catalogue category, product title, staff analysis), checked in
 * order: the more specific garment first (half saree before saree, kurti before kurta, kurta before dhoti).
 */
const GARMENT_KEYWORD_TYPES: Array<{ match: RegExp; type: GarmentType }> = [
  { match: /half[- ]?saree|langa[- ]?voni|dhavani|davani/, type: 'half_saree' },
  { match: /pavadai|langa\b/, type: 'pattu_pavadai' },
  { match: /\bsarees?\b|\bsaris?\b|kanchi|kanjiv|banarasi|pallu/, type: 'saree' },
  { match: /lehenga|ghagra|chaniya/, type: 'lehenga' },
  { match: /salwar|anarkali|kurti|churidar|kameez/, type: 'salwar' },
  { match: /kurta|sherwani|pyjama|pajama/, type: 'kurta_dhoti' },
  { match: /veshti|dhoti|angavastram|mundu/, type: 'dhoti_veshti' },
  { match: /t-?shirt|\btee\b/, type: 'tshirt_bottom' },
  { match: /blazer|jacket|waistcoat|\bcoat\b/, type: 'jacket' },
  { match: /trouser|pant|jean|chino|bottom/, type: 'trousers' },
  { match: /blouse|\btop\b|tops\b/, type: 'top' },
  { match: /shirt/, type: 'shirt_pant' },
  { match: /gown|frock|dress/, type: 'one_piece' },
];

/** The garment type named by keywords in a category, product title or analysis, or generic. */
export function garmentTypeFromText(text: string): GarmentType {
  const lower = text.toLowerCase();
  return GARMENT_KEYWORD_TYPES.find((item) => item.match.test(lower))?.type || 'generic';
}

/**
 * Gemini's Try-On prompt (GenLook, fal and FASHN take the photos and a product listing instead). The garment
 * type arrives already resolved by garmentTypeFor; the category and title only pick the style details.
 * Sections: what to do, the garment, the customer, the photo. One garment per Try-On.
 */
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
  const text = `${details?.categoryId || ''} ${details?.productTitle || ''}`.toLowerCase();
  const chosen = GARMENT_TYPE_VALUES.includes(details?.garmentType as GarmentType) ? details?.garmentType as GarmentType : 'generic';
  const garmentType = compatibleGarmentType(category, chosen === 'generic' || chosen === 'unset' ? garmentTypeFromText(text) : chosen);
  const styleDetails = GARMENT_STYLE_DETAILS
    .filter((item) => item.types.includes(garmentType) && item.match.test(text))
    .map((item) => item.detail)
    .join(' ');

  return `<task>
Edit Image 1, a real photo of a ${subject}, into a photorealistic virtual try-on: dress them in the one garment shown in Images 2 onward and change nothing else in the photo.
</task>

<garment>
${GARMENT_TYPE_RULES[garmentType]}${styleDetails ? `
${styleDetails}` : ''}
Images 2 onward are views of this same one garment. Copy its exact colours, fabric, weave, print, embroidery, borders, neckline, sleeves, length and drape; take only the garment, not the hanger, mannequin, model, hands holding it or background.
Fit it to this ${subject}'s real body with natural ease, realistic cloth weight, folds and contact shadows${isChild ? ', in comfortable child proportions' : ''}.
</garment>

<customer>
Image 1 is the customer. Keep their face and its natural asymmetry, skin tone and real skin texture, hair, facial hair, glasses, age and body proportions exactly as photographed: unretouched, with no makeup, filter or reshaping.
Keep every piece of their own clothing and footwear that this garment does not replace.
</customer>

<photo>
Change only the area the garment covers. Keep Image 1's background, framing, crop, camera angle, pose, hands, lighting and colours exactly; do not extend, crop, zoom or re-light the photo or add body parts it does not show.
${isChild ? 'Keep it child-safe and age-appropriate, with no adult glamour or mature posing.' : 'Modest, family-friendly styling.'} No festival scene, props, text or logo.
</photo>

<output>
One image: this exact customer in this exact garment, in their own photo.
</output>`;
}

export type GarmentType =
  | 'unset'
  | 'saree'
  | 'half_saree'
  | 'lehenga'
  | 'salwar'
  | 'one_piece'
  | 'two_piece'
  | 'three_piece'
  | 'shirt_pant'
  | 'tshirt_bottom'
  | 'top'
  | 'trousers'
  | 'jacket'
  | 'dhoti_veshti'
  | 'kurta_dhoti'
  | 'pattu_pavadai'
  | 'boy_ethnic'
  | 'generic';

export const GARMENT_TYPE_VALUES: readonly GarmentType[] = [
  'unset', 'saree', 'half_saree', 'lehenga', 'salwar', 'one_piece', 'two_piece', 'three_piece',
  'shirt_pant', 'tshirt_bottom', 'top', 'trousers', 'jacket', 'dhoti_veshti', 'kurta_dhoti', 'pattu_pavadai',
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
  const type = garmentTypeFromText(`${explicitType || ''} ${garmentAnalysis || ''} ${(garmentRoles || []).join(' ')}`);
  return category === 'boy' && type === 'kurta_dhoti' ? 'boy_ethnic' : type;
}

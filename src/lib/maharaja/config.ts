export const MAHARAJA_CLIENT_ID = 'maharaja';
export const MAHARAJA_WORKSPACE_CODE = 'workspace';
export const TRY_ON_MIN_PURCHASE = 500;
export const AI_VIDEO_MIN_PURCHASE = 5000;
export const FESTIVE_TIER_MIN = Number(process.env.MAHARAJA_FESTIVE_TIER_MIN) || 500;
export const LUXURY_TIER_MIN = Number(process.env.MAHARAJA_LUXURY_TIER_MIN) || 3000;

/**
 * Repeat usage & duplicate limit enforcement.
 * Production-safe by default. Set ENFORCE_REPEAT_LIMITS=false only in an
 * isolated local or preview environment used for deliberate testing.
 */
export const ENFORCE_REPEAT_LIMITS = process.env.ENFORCE_REPEAT_LIMITS === 'false'
  ? false
  : true;

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
export const CAMPAIGN_POSE_IDS = [
  'relaxed-sides',
  'one-hand-hip',
  'two-hands-hips',
  'chest-hold',
  'low-clasp',
  'low-wrist-hold',
  'editorial-asymmetry',
  'soft-side-stance',
] as const;
export type CampaignPoseId = (typeof CAMPAIGN_POSE_IDS)[number];

export function isCampaignPoseId(value: unknown): value is CampaignPoseId {
  return typeof value === 'string' && (CAMPAIGN_POSE_IDS as readonly string[]).includes(value);
}

export function getCampaignPoseId(sessionId: string | undefined, category: CustomerCategory): CampaignPoseId {
  const childSafePoses: CampaignPoseId[] = ['relaxed-sides', 'low-clasp', 'low-wrist-hold', 'soft-side-stance'];
  const pool = category === 'boy' || category === 'girl' ? childSafePoses : [...CAMPAIGN_POSE_IDS];
  let hash = 0;
  const key = `${sessionId || 'new'}:${category}:pose`;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return pool[hash % pool.length];
}

/** High-accuracy virtual try-on prompt: strict identity lock + authentic garment transfer + clean studio. */
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

  return `Create a hyper-photorealistic vertical 9:16 full-body Indian virtual try-on photograph of the ${subject}.

REFERENCE PRIORITY:
- Image 1 is the authoritative real customer photograph (identity reference).
- Image 2 is the single authoritative garment reference showing the exact outfit, colors, fabric, and design details.

IDENTITY & FACE LOCK:
- Preserve the exact real customer identity from Image 1: facial structure, face shape, eyes, nose, mouth, jawline, ears, skin tone, hairstyle, hairline, facial hair, glasses, age appearance, height impression, and natural body proportions.
- Do NOT beautify into another person, change age, alter body weight, change skin complexion, make slimmer or heavier, or substitute the face.

GARMENT SPECIFICATION LOCK:
- Dress the customer in the exact uploaded garment from the single garment reference photograph.
- Preserve: exact primary and secondary colors (do not shift colors; keep neutrals, grey, gold, and zari authentic), fabric material texture (silk, cotton, georgette, velvet, linen), embroidery patterns, zari borders, neckline shape, sleeve length, drape, and silhouette.
- Natural fabric physics: render realistic cloth draping, gravity, and fold shadows conforming naturally to the customer's body contours without distortion.
- Ignore any mannequin, hanger, rack, stand, or background elements in the garment photo. Transfer the textile garment only.

ANATOMY & FRAMING:
- Single subject standing naturally upright facing the camera.
- Strict 9:16 vertical full-body framing head-to-toe: entire head visible, both feet fully visible on the floor with natural footwear.
- Two arms, two natural hands with 5 distinct fingers each, no duplicated or distorted limbs.
- ${safety}

SETTING & LIGHTING:
- Clean, premium, neutral indoor fashion retail studio background.
- Soft, flattering multi-point studio lighting that illuminates both the face and garment fabric details clearly.
- Do not create a festival environment. No diyas, no rangoli, no flowers, no festive props, no cinematic effects.
- No text, no logos, no watermarks.
The only purpose is to clearly and photorealistically show how this exact garment looks on this customer.`;
}

/** Section 5: Universal Gemini Master Image Prompt & Category/Event Builders */
export const UNIVERSAL_GEMINI_IMAGE_PROMPT = `Create a photorealistic luxury festive fashion portrait of the customer using the uploaded customer photo and uploaded garment references.

P0 — ABSOLUTE IDENTITY & REFERENCE FIDELITY (NON-NEGOTIABLE):
- Preserve the customer's exact face, identity, eye shape, nose bridge, lip contour, jawline, ears, skin tone, natural complexion, hairstyle, age impression, and body proportions.
- Do NOT beautify into another person, reshape facial features, alter body weight, change skin complexion, or substitute identity.
- Dress the customer in the exact uploaded garment references with authentic fabric texture, embroidery, and weave.
- Strictly preserve true colors and dye hues. Neutral grey must remain pure neutral grey (never shift into beige, tan, cream, brown, or gold).
- Jewelry: Visible necklaces, earrings, and traditional ornaments must have crisp metallic luster, naturally seated against skin and fabric with zero melting.

P1 — NATURAL HUMAN PRESENCE (LIVING CELEBRATION):
- Feature a warm, radiant, celebratory festive smile with lively, expressive eyes, relaxed facial muscles, and natural warmth.
- Avoid flat, stiff mannequin stares, frozen wax expressions, or stern grimaces.
- Subject stands with regal, poised, grounded posture; both feet visible and firmly placed on the floor.

P2 — CINEMATIC MULTI-PLANE COMPOSITION (BUILT FOR PARALLAX):
- Compose with clear spatial depth layering:
  1. Foreground: Event-appropriate celebratory decor positioned slightly off-center in the near foreground without obscuring the customer.
  2. Midground: The customer standing in full-body festive elegance.
  3. Background: Refined celebration setting appropriate to the selected festival.
- Use a genuinely wide environmental composition: the full-body customer occupies approximately 58%–68% of frame height so the architecture, foreground depth and animated background remain clearly visible.
- Keep open visual space around the complete body silhouette. Foreground objects may touch only the extreme frame edges and must never overlap the face, hands, body or garment.
- The setting must contain at least three already-visible animation anchors chosen from distant lanterns, diya flames, water, fountain spray, reflective flooring, foliage, hanging decorations or distant celebration lights.
- Full body visible head-to-toe in strict 9:16 vertical orientation. No extra people, no mannequins, no duplicated limbs.

P3 — FESTIVE LIGHTING & TEXTILE LUSTER:
- Flattering luxury fashion lighting accentuating fabric weave texture, borders, and metallic luster without altering true dye hues.

FINAL QUALITY:
- An aspirational ₹1-crore luxury Indian festive fashion campaign portrait faithful to the customer's identity and original garment.
- Reject ordinary corridors, tight doorways, flat retail walls, shallow hallway framing and repetitive indoor compositions.`;

export type GarmentType = 'saree' | 'lehenga' | 'salwar' | 'kurta_dhoti' | 'pattu_pavadai' | 'boy_ethnic' | 'generic';

export function resolveGarmentType(
  category: CustomerCategory = 'women',
  explicitType?: string,
  garmentAnalysis?: string,
  garmentRoles?: string[]
): GarmentType {
  const text = `${explicitType || ''} ${garmentAnalysis || ''} ${(garmentRoles || []).join(' ')}`.toLowerCase();

  if (text.includes('dhoti') || text.includes('veshti') || text.includes('kurta') || text.includes('pyjama') || text.includes('pajama')) {
    return category === 'boy' ? 'boy_ethnic' : 'kurta_dhoti';
  }
  if (text.includes('pattu pavadai') || text.includes('pavadai') || text.includes('langa voni')) {
    return 'pattu_pavadai';
  }

  if (text.includes('lehenga') || text.includes('ghagra') || text.includes('chaniya')) {
    return 'lehenga';
  }
  if (text.includes('salwar') || text.includes('anarkali') || text.includes('kameez') || text.includes('churidar') || text.includes('kurti')) {
    return 'salwar';
  }
  if (text.includes('saree') || text.includes('sari') || text.includes('kanchi') || text.includes('banarasi') || text.includes('pallu')) {
    return 'saree';
  }
  return 'generic';
}

/** Garment-specific and category-specific garment architecture rules */
export function getGarmentFidelityRules(
  categoryOrGarment: CustomerCategory | GarmentType,
  isVideo = false
): string {
  if (isVideo) {
    return `CLOTHING LOCK & FABRIC STABILITY (ZERO MORPHING):
- Absolute Garment Consistency: The subject must wear the exact same clothing, fabric weave, pattern, colors, collar, sleeves, and fit shown in the initial reference image.
- Strictly FORBIDDEN: Absolutely NO clothing change, NO dress morphing, NO outfit swapping, NO color shifting, NO added embroidery, and NO texture alteration.
- The outfit present in the input image must remain 100% unchanged across all video frames from start to finish.
- Fabric drape remains anchored to body contours with zero pattern drift and zero texture swimming.`;
  }

  const type: GarmentType = ['saree', 'lehenga', 'salwar', 'kurta_dhoti', 'pattu_pavadai', 'boy_ethnic', 'generic'].includes(categoryOrGarment)
    ? (categoryOrGarment as GarmentType)
    : resolveGarmentType(categoryOrGarment as CustomerCategory);

  switch (type) {
    case 'saree':
      return `SAREE SPECIFIC FIDELITY:
- Render the exact blouse design (neckline, sleeve length), complete six-yard saree body drape, crisp vertical waist pleats falling straight to the floor, authentic metallic gold zari borders along edges, and the exact ornate pallu draped elegantly over the shoulder.
- Jewelry: Traditional festive jewelry (kasu malai, jhumkas, bangles) naturally seated against skin and silk.`;

    case 'lehenga':
      return `LEHENGA / CHOLI SPECIFIC FIDELITY:
- Render exact flared skirt/kalis silhouette, waistband/kamarbandh, choli bodice construction and neckline, and dupatta drape. Rich embroidery and border motifs strictly preserved.
- Strictly NO saree pleats, NO continuous saree body drape.
- Jewelry: Traditional festive jewelry naturally seated against skin and fabric.`;

    case 'salwar':
      return `SALWAR / ANARKALI SPECIFIC FIDELITY:
- Render exact flowing tunic/anarkali flare, neckline, sleeve cut, churidar/pant fit, and dupatta drape.
- Strictly NO saree pleats, NO saree body drape, NO choli exposure.
- Jewelry: Traditional festive jewelry naturally seated against skin and fabric.`;

    case 'kurta_dhoti':
      return `MEN'S ATTIRE SPECIFIC FIDELITY:
- If the uploaded garment is traditional wear: render exact kurta silhouette, collar construction, placket buttons, fabric weave, and dhoti/veshti pleats or churidar/pyjama fit. Angavastram/shawl if present.
- If the uploaded garment is modern shirts/trousers: render the exact shirt collar, sleeves, ombre/solid color pattern, and trousers faithfully from the reference. Never convert into a kurta or traditional wear.
- Strictly NO feminine garment elements, NO saree drapes, NO blouse styling.
- Posture: Confident, regal, masculine posture with grounded feet.`;

    case 'boy_ethnic':
      return `BOY'S ATTIRE SPECIFIC FIDELITY:
- If the uploaded garment is traditional wear: render age-appropriate boy's traditional Indian wear (festive kurta-pyjama or dhoti-shirt) matching the reference.
- If the uploaded garment is modern shirts/trousers: render the exact shirt collar, sleeves, ombre/solid color pattern, and trousers faithfully from the reference. Never convert into a kurta.
- Strictly NO adult glamour, NO mature posing, NO saree/pallu elements.
- Cheerful, natural boyish charm and modest styling.`;

    case 'pattu_pavadai':
      return `GIRL'S TRADITIONAL ETHNIC FIDELITY:
- Render age-appropriate girl's traditional Indian wear (pattu pavadai silk skirt and blouse/choli or festive anarkali).
- Strictly NO adult glamour, NO adult saree drape, NO mature styling.
- Charming, natural girl princess elegance and modest styling.`;

    case 'generic':
    default:
      return `GARMENT REFERENCE FIDELITY:
- Render exact uploaded garment silhouette, neckline, sleeve length, waist construction, fabric weave, and dye colors faithfully matching references.`;
  }
}

export type NormalSceneVariant =
  | 'women_style_1'
  | 'women_style_2'
  | 'men_style_1'
  | 'men_style_2'
  | 'girl_style_1'
  | 'girl_style_2'
  | 'boy_style_1'
  | 'boy_style_2';

export const NORMAL_SCENE_VARIANTS: NormalSceneVariant[] = [
  'women_style_1',
  'women_style_2',
  'men_style_1',
  'men_style_2',
  'girl_style_1',
  'girl_style_2',
  'boy_style_1',
  'boy_style_2',
];

export function getNormalSceneVariant(category: CustomerCategory, promptSet: VideoPromptSet = 'set-1'): NormalSceneVariant {
  const isSet2 = promptSet === 'set-2';
  switch (category) {
    case 'women': return isSet2 ? 'women_style_2' : 'women_style_1';
    case 'men': return isSet2 ? 'men_style_2' : 'men_style_1';
    case 'girl': return isSet2 ? 'girl_style_2' : 'girl_style_1';
    case 'boy': return isSet2 ? 'boy_style_2' : 'boy_style_1';
  }
}

type NonDiwaliEventId = Exclude<EventId, 'diwali'>;

const LUXURY_EVENT_SCENES: Record<NonDiwaliEventId, Record<VideoPromptSet, {
  location: string;
  foreground: string;
  background: string;
  lighting: string;
  motion: string;
}>> = {
  pongal: {
    'set-1': {
      location: 'an expansive Chettinad palace courtyard opening toward sunlit harvest fields',
      foreground: 'a decorated brass Pongal pot, turmeric leaves and a detailed kolam placed only at the outer foreground edges',
      background: 'carved timber pillars, tall sugarcane arrangements, layered courtyard arches and distant green fields',
      lighting: 'premium golden-morning cinema light with realistic steam, polished-stone reflections and soft agricultural haze',
      motion: 'Use a smooth forward crane-and-dolly move. Existing cooking steam, sugarcane leaves, distant foliage and floor highlights move naturally while the architecture remains stable',
    },
    'set-2': {
      location: 'a monumental Thanjavur-inspired harvest pavilion beside a broad palace water garden',
      foreground: 'a low floral kolam and engraved harvest urn at opposite extreme foreground corners',
      background: 'open stone colonnades, sugarcane installations, a reflecting channel and distant sunlit temple-town silhouettes',
      lighting: 'bright celebratory morning light, soft golden rim illumination and rich reflection depth',
      motion: 'Begin wide and glide forward along the water garden with a restrained crane settle. Existing water ripples, leaves, steam and reflected sunlight animate behind the customer',
    },
  },
  'new-year': {
    'set-1': {
      location: 'a vast luxury rooftop gala above an illuminated metropolitan skyline at midnight',
      foreground: 'crystal light sculptures and gold architectural details confined to the far frame edges',
      background: 'layered rooftop terraces, reflective pools, distant skyline lights and restrained fireworks already visible behind the architecture',
      lighting: 'black-gold campaign lighting with clean facial illumination, midnight-blue separation and premium reflections',
      motion: 'Use a controlled forward dolly with gentle edge-light parallax. Existing skyline lights, distant fireworks, water reflections and suspended light elements animate behind the customer',
    },
    'set-2': {
      location: 'a monumental glass-roofed celebration atrium connected to an open skyline terrace',
      foreground: 'two softly blurred crystal installations positioned at separate outer foreground edges',
      background: 'towering glass arches, a long reflective aisle, suspended warm lights and a distant city celebration',
      lighting: 'high-end champagne-gold editorial light with deep midnight contrast and realistic glass reflections',
      motion: 'Start with the complete atrium scale, then perform a slow forward crane move. Existing suspended lights, distant celebration glow and glass-floor reflections create visible depth without crossing the customer',
    },
  },
  christmas: {
    'set-1': {
      location: 'a grand heritage conservatory transformed into an ultra-luxury Christmas evening campaign',
      foreground: 'evergreen branches, warm lantern glass and gold ribbon details restricted to the extreme frame edges',
      background: 'towering arched windows, a monumental decorated tree, layered warm lights and a moonlit garden beyond',
      lighting: 'rich warm-white and champagne-gold cinema lighting with emerald depth and realistic polished-floor reflections',
      motion: 'Use a slow stabilized forward dolly. Existing fairy lights, fireplace glow, distant garden snowfall and floor reflections animate gently behind the customer',
    },
    'set-2': {
      location: 'an open palace ballroom terrace overlooking a luminous winter garden',
      foreground: 'a crystal lantern and evergreen arrangement placed only at opposite outer foreground corners',
      background: 'grand columns, suspended chandeliers, a distant decorated tree, garden lights and restrained snow beyond the terrace',
      lighting: 'luxury holiday campaign lighting with warm skin illumination, cool night separation and deep architectural highlights',
      motion: 'Begin wide and glide forward through the terrace opening with subtle chandelier parallax. Existing lights, distant snowfall, garden foliage and reflections move naturally behind the customer',
    },
  },
  ramadan: {
    'set-1': {
      location: 'a vast moonlit palace courtyard with a reflecting pool and refined Ramadan illumination',
      foreground: 'engraved lanterns and geometric screens positioned only at the far outer foreground edges',
      background: 'layered arches, suspended lanterns, a broad reflecting pool, distant domes and a deep evening sky',
      lighting: 'dignified amber-and-indigo cinema lighting with soft lantern glow, clear facial light and premium water reflections',
      motion: 'Use a serene forward crane-and-dolly move. Existing lantern flames, water reflections, distant foliage and suspended lights animate subtly behind the customer',
    },
    'set-2': {
      location: 'an open royal garden colonnade beneath an elegant canopy of warm lanterns',
      foreground: 'a low patterned lantern and carved stone detail at separate extreme foreground corners',
      background: 'deep colonnades, moonlit gardens, reflective stone paths, distant arches and layered warm lights',
      lighting: 'calm premium evening light with warm architectural accents, indigo depth and realistic reflective highlights',
      motion: 'Begin with the complete garden-colonnade scale, then glide forward with restrained edge parallax. Existing lantern light, leaves, water and distant bokeh move gently behind the customer',
    },
  },
  birthday: {
    'set-1': {
      location: 'a spectacular palace garden celebration staged like a premium fashion campaign',
      foreground: 'a sculptural floral arrangement and elegant cake display confined to opposite outer foreground edges',
      background: 'open garden pavilions, suspended warm lights, a reflecting fountain, restrained balloons and distant celebration bokeh',
      lighting: 'joyful luxury cinema light with flattering facial illumination, rich colour separation and realistic fountain reflections',
      motion: 'Use a smooth forward dolly with gentle edge-only floral parallax. Existing fountain water, suspended lights, ribbons and distant bokeh animate behind the customer',
    },
    'set-2': {
      location: 'a vast rooftop celebration pavilion overlooking an illuminated palace and city garden',
      foreground: 'softly blurred light sculptures and tasteful floral decor at separate extreme frame edges',
      background: 'monumental arches, a lantern canopy, reflective flooring, distant balloons and skyline celebration lights',
      lighting: 'premium evening campaign lighting with warm gold highlights, deep blue-hour atmosphere and polished reflections',
      motion: 'Start wide and perform a controlled forward crane move. Existing canopy lights, distant balloons, skyline bokeh and floor reflections move naturally behind the customer',
    },
  },
};

function buildLuxuryEventScene(category: CustomerCategory, eventId: NonDiwaliEventId, promptSet: VideoPromptSet) {
  const profile = LUXURY_EVENT_SCENES[eventId][promptSet];
  const isChild = category === 'girl' || category === 'boy';
  const framing = isChild
    ? 'Frame the child full-body at child eye level with hands relaxed and empty, occupying approximately 58%–64% of the frame height. Keep the presentation age-appropriate, natural and free of adult glamour.'
    : category === 'men'
      ? 'Frame the customer full-body from a restrained natural hero angle, occupying approximately 60%–68% of the frame height with hands relaxed and the complete silhouette visible.'
      : 'Frame the customer full-body at eye level as the central luxury-campaign hero, occupying approximately 60%–68% of the frame height with hands relaxed and the complete silhouette visible.';
  return {
    imageScene: `Create ${profile.location}. ${framing} Use ${profile.foreground}. Behind the customer, show ${profile.background}. Use ${profile.lighting}. Preserve generous open space around the complete body. Do not prescribe, infer or alter clothing. No crowd, text, logo, narrow corridor, flat retail stage, object in the customer's hands or decoration crossing the customer.`,
    videoScene: `Preserve the exact approved composition and original frontal viewing direction. ${profile.motion}. Keep all environmental activity physically behind or at the outer edges of the customer. Keep face, expression, hands, body, hair, clothing and accessories stable. No blink instruction, gesture, walking, turning, orbit, lateral angle reconstruction, new object or effect crossing the silhouette. Finish with a clean medium-full luxury hero hold.`,
  };
}

/** Event-specific scene direction (strict isolation of event props and lighting across all 8 variants) */
export function getEventSceneDirection(
  category: CustomerCategory,
  eventId: EventId,
  sceneIdxOrSet: 0 | 1 | VideoPromptSet = 0
): { imageScene: string; videoScene: string } {
  const promptSet: VideoPromptSet = sceneIdxOrSet === 1 || sceneIdxOrSet === 'set-2' ? 'set-2' : 'set-1';
  const variant = getNormalSceneVariant(category, promptSet);

  if (eventId !== 'diwali') {
    return buildLuxuryEventScene(category, eventId, promptSet);
  }

  switch (eventId as EventId) {
    case 'diwali': {
      switch (variant) {
        case 'women_style_1':
          return {
            imageScene: `Create an extraordinary royal Diwali evening on the open terrace of a vast Indian palace overlooking illuminated domes and a distant heritage skyline. Frame the customer full-body at eye level as the central luxury-campaign hero. Place an out-of-focus engraved brass lamp and crystal lantern at opposite near-foreground edges for deep parallax, never covering the customer. Behind her, use a broad reflecting pool, monumental sandstone arches, layered palace balconies, hundreds of distant diyas, suspended lanterns already visible high in the background, restrained warm haze, and rich blue-hour sky. Use couture-editorial key light, soft golden rim light, realistic firelight, deep dimensional shadows and premium cinema colour separation. Avoid an indoor corridor, ordinary hallway, flat wall, repetitive doorway, crowd, text or fireworks.`,
            videoScene: `Preserve the exact royal terrace composition. Begin with the complete palace scale, then perform a slow stabilized forward crane-and-dolly push with gentle foreground-lamp parallax while keeping the original frontal viewpoint. Existing suspended background lanterns may rise very slowly; distant diya flames, skyline bokeh and reflecting-pool highlights may move naturally. Keep every effect behind the customer. Finish with a commanding full-body hero hold.`
          };
        case 'women_style_2':
          return {
            imageScene: `Create an ultra-luxury Diwali fashion portrait inside a vast open palace-garden pavilion at night. Frame the customer full-body at eye level with generous architectural space. Use a softly blurred marigold strand and crystal lamp at separate outer foreground edges, a polished stone aisle with floral rangoli, symmetrical brass lamps, illuminated garden arches, hanging glass lanterns, deep warm bokeh and a distant palace facade. Include subtle blue-hour sky through the open pavilion and realistic reflective highlights. The result must resemble a premium jewellery-and-fashion campaign, never a narrow corridor, flat retail stage or ordinary doorway. No crowd, text or effects across the customer.`,
            videoScene: `Preserve the exact open garden-pavilion composition. Begin wide, glide gently past the outer-edge marigold strand and crystal lamp, then continue with a smooth forward dolly along the illuminated aisle. Existing hanging lanterns may sway minimally; garden foliage, diya flames, floor reflections and distant bokeh may move naturally. Settle into an elegant medium-full hero view without changing the customer's pose or viewpoint.`
          };
        case 'men_style_1':
          return {
            imageScene: `Create a monumental Diwali night at the grand ceremonial arch of an ultra-luxury Indian palace, using the supplied sample's premium depth and warm heritage lighting as the quality benchmark. Frame the customer full-body from a subtly low natural hero angle. Use marigold-draped carved pillars, layered brass lamps, a detailed floral rangoli and one softly blurred lantern at an extreme foreground edge. Through the large arch, reveal a deep blue evening sky with restrained distant fireworks already visible, palace lights and atmospheric bokeh. Keep fireworks far behind the customer and architecture. No crowd, text, narrow corridor or clothing additions.`,
            videoScene: `Preserve the exact ceremonial-arch composition. Hold the complete arch and full-body customer, then perform a smooth forward dolly with outer-edge foreground-lantern parallax. Existing distant fireworks may bloom softly behind the arch; diya flames, garlands and palace bokeh may move naturally. Do not create flashes or particles over the customer. Finish on a dignified medium-full hero composition.`
          };
        case 'men_style_2':
          return {
            imageScene: `Create a spectacular Diwali arrival court before an enormous illuminated palace facade with carved columns, broad ceremonial steps, a long reflecting fountain axis and layered golden archways. Frame the customer full-body from a restrained low hero angle, occupying no more than two-thirds of the vertical frame. Place a vintage palace lantern and sculpted brass diya stand at opposite extreme foreground edges. Include fountain reflections, distant suspended lanterns, warm architectural uplighting, subtle haze and a rich indigo sky. The scale must feel like a ₹1-crore heritage-hotel campaign, never an ordinary hallway. No vehicles, crowd, text or effects across the customer.`,
            videoScene: `Preserve the exact palace arrival-court composition. Use a controlled forward dolly with an extremely small crane rise and clear edge-only foreground parallax. Existing fountain water, suspended lanterns, diya flames and facade reflections move visibly but naturally. Maintain the monumental scale and settle into a powerful full-body hero hold without rotating the customer.`
          };
        case 'girl_style_1':
          return {
            imageScene: `Create a magical but photorealistic child-safe Diwali evening in a magnificent palace garden pavilion. Frame the child full-body at child eye level with both hands relaxed and empty. Use a low floral urli and softly blurred glass lantern at separate foreground corners, never touching or obscuring the child. Behind her, show a grand open pavilion, landscaped garden, shallow reflecting channel, illuminated palace wings, distant suspended lanterns already visible above the garden, marigold installations and warm fairy-light depth. Use soft flattering key light, gentle golden rim light, realistic reflections and joyful premium campaign colour. No corridor, ordinary hallway, adult glamour, crowd, text, fireworks or objects in the child's hands.`,
            videoScene: `Preserve the exact palace-garden composition and child-safe pose. Use a gentle child-eye-level forward dolly with soft foreground floral parallax and no lateral orbit. Existing distant lanterns may drift upward slowly; garden lights, diya flames, water reflections and leaves may move subtly and realistically behind the child. Keep the child, hands, hair and clothing stable. Finish with a bright charming hero hold.`
          };
        case 'girl_style_2':
          return {
            imageScene: `Create a child-safe royal Diwali balcony overlooking a luminous palace water garden. Frame the child full-body at child eye level with hands relaxed and empty, surrounded by generous open space. Use a softly blurred floral strand and low crystal lantern only at the far foreground edges. Behind her, show carved balcony arches, a reflecting pool, illuminated garden paths, palace domes, distant floating lanterns and restrained golden celebration lights. Use gentle fashion lighting, realistic reflections and premium storybook warmth without adult glamour. No corridor, crowd, text, fireworks or objects in the child's hands.`,
            videoScene: `Preserve the exact balcony and water-garden composition. Use a slow child-eye-level forward glide with delicate edge-only floral parallax. Existing floating lanterns rise gradually; water reflections, garden lights, diya flames and distant foliage move softly behind the child. Keep the child completely stable and finish with a clean charming full-body portrait.`
          };
        case 'boy_style_1':
          return {
            imageScene: `Create a spectacular child-safe Diwali evening in an expansive royal palace courtyard opening toward a grand illuminated gateway. Frame the child full-body at child eye level, standing naturally with both hands relaxed and empty. Use a carved brass urli and a softly blurred decorative lantern at the far foreground edges for layered depth. Behind him, show a vast stone courtyard, monumental gateway, palace balconies, symmetrical floor diyas, a shallow reflection strip, distant lanterns already visible above the architecture and deep blue evening sky. Use cheerful premium fashion lighting, realistic warm reflections and cinematic depth. No corridor, ordinary hallway, adult styling, crowd, text, fireworks or objects in the child's hands.`,
            videoScene: `Preserve the exact grand-courtyard composition and child-safe pose. Use a smooth child-eye-level forward dolly with a slight crane settle and foreground-object parallax, never rotating around the child. Existing distant lanterns, gateway lights, diya flames and floor reflections may move gently behind him. Keep face, hands, body and clothing stable. Finish with a crisp joyful hero hold.`
          };
        case 'boy_style_2':
          return {
            imageScene: `Create a joyful child-safe Diwali celebration on a vast royal palace rooftop terrace. Frame the child full-body at child eye level with both hands relaxed and empty. Use one softly blurred vintage lantern at an outer foreground edge and a low floral rangoli near the opposite corner. Behind him, reveal carved terrace arches, palace domes, strings of suspended lanterns, distant skyline lights, restrained fireworks already visible far behind the architecture, and warm diya reflections across polished stone. Use bright premium campaign lighting without adult styling. No corridor, crowd, text or effects crossing the child.`,
            videoScene: `Preserve the exact rooftop-terrace composition. Begin wide, then use a smooth child-eye-level forward dolly with outer-edge lantern parallax. Existing suspended lanterns may drift gently, distant fireworks may bloom behind the palace domes, and diya reflections may shimmer across the floor. Keep all motion behind the child and finish with a cheerful medium-full hero hold.`
          };
      }
    }

    case 'pongal': {
      switch (variant) {
        case 'women_style_1':
          return {
            imageScene: `Place the customer in an elegant Tamil Pongal setting with a decorated brass Pongal pot and turmeric plant in the near foreground. Harvest sugarcane stalks, traditional kolam floor art, and warm golden morning sunlight.`,
            videoScene: `Foreground reveal gliding past a traditional decorated brass Pongal pot and sugarcane stalks. Warm celebratory morning sunlight shimmers across the kolam floor art with rich celebratory depth and 10°–12° lateral arc reveal.`
          };
        case 'women_style_2':
          return {
            imageScene: `Place the customer in a heritage courtyard with harvest sugarcane decor, fresh turmeric accents, refined kolam art, and bright celebratory morning ambience.`,
            videoScene: `Camera glides forward in an expansive harvest celebration reveal past heritage pillars, with golden morning light illuminating fabric textures, borders, and traditional festive decor.`
          };
        case 'men_style_1':
          return {
            imageScene: `Place the customer standing tall and confident with grounded masculine posture in a Tamil heritage courtyard. Fresh harvest sugarcane stalks and a brass urn stand in the near foreground with vibrant kolam floor art.`,
            videoScene: `Slightly low hero angle. Ultra-smooth optical forward reveal gliding past harvest sugarcane accents. Restrained 10°–12° lateral arc reveals a confident warm smile and crisp traditional fabric weave.`
          };
        case 'men_style_2':
          return {
            imageScene: `Place the customer in an expansive heritage courtyard with carved teak pillars, festive harvest sugarcane decor, and bright celebratory morning illumination.`,
            videoScene: `Eye-level stabilized lateral tracking slider move executing a steady 10°–12° perspective shift across harvest celebration courtyard, revealing crisp garment drape and dignified grounded presence.`
          };
        case 'girl_style_1':
          return {
            imageScene: `Place the child at child eye-level in a bright Pongal setting in traditional pattu pavadai. Hands resting naturally at sides. Near foreground features a small decorated brass Pongal pot with fresh flower kolam.`,
            videoScene: `Child eye-level. Ultra-smooth gentle forward push gliding past a mini decorated Pongal pot. Warm morning sunlight illuminates the girl's sweet joyful smile and soft blink. Child safety locked.`
          };
        case 'girl_style_2':
          return {
            imageScene: `Place the child at child eye-level in a heritage courtyard near festive sugarcane decor and delicate kolam art. Modest, cheerful, and family-friendly presentation.`,
            videoScene: `Child eye-level. Restrained, gentle 8°–10° lateral arc reveal past harvest decor, soft morning sunlight illuminating the girl's polite standing posture and natural smile. Child safety locked.`
          };
        case 'boy_style_1':
          return {
            imageScene: `Place the child at child eye-level in traditional festive wear. Hands resting naturally at sides. Near foreground features a small decorative harvest sugarcane bundle and kolam floor art.`,
            videoScene: `Child eye-level. Ultra-smooth stabilized forward push gliding past sugarcane accents. Cheerful bright smile, natural blink, and crisp traditional attire. Child safety locked.`
          };
        case 'boy_style_2':
          return {
            imageScene: `Place the child at child eye-level standing in a traditional heritage courtyard with bright morning sunlight and festive Pongal decor.`,
            videoScene: `Child eye-level. Smooth 8°–10° lateral slider move across traditional courtyard setting. Polite happy expression, steady feet, and authentic youthful warmth. Child safety locked.`
          };
      }
    }

    case 'new-year': {
      switch (variant) {
        case 'women_style_1':
          return {
            imageScene: `Place the customer on a luxury New Year celebration stage with an elegant crystal or gold-trimmed architectural pillar in the near foreground. Midnight sparkle, refined champagne-gold lighting, and polished retail gala depth.`,
            videoScene: `Foreground reveal gliding past an elegant gold-accented celebration pillar. Celebratory midnight sparkle and soft golden bokeh shimmer in the background air with sophisticated luxury depth and 10°–12° lateral reveal.`
          };
        case 'women_style_2':
          return {
            imageScene: `Place the customer in an upscale evening gala setting with subtle gold confetti accents, warm midnight ambient glow, and polished luxury architectural framing.`,
            videoScene: `Camera glides forward past refined architectural accents with shimmering party light trails, warm golden celebration ambience, and rich textile luster.`
          };
        case 'men_style_1':
          return {
            imageScene: `Place the customer standing tall with heroic posture on a luxury New Year celebration stage. An architectural champagne-gold pillar stands in the near foreground with celebratory ambient glow.`,
            videoScene: `Slightly low hero angle. Ultra-smooth optical forward reveal gliding past a luxury architectural pillar. 10°–12° lateral arc reveals a confident warm smile and sharp fabric textures.`
          };
        case 'men_style_2':
          return {
            imageScene: `Place the customer in an expansive modern gala salon with refined architectural lines, subtle champagne sparkle, and warm evening illumination.`,
            videoScene: `Eye-level stabilized lateral tracking slider move executing a steady 10°–12° perspective shift across modern gala architecture, maintaining dignified composed presence and feet locked to floor.`
          };
        case 'girl_style_1':
          return {
            imageScene: `Place the child at child eye-level in an elegant festive celebration setting. Hands resting naturally at sides. Near foreground features soft gold ribbons and celebratory stage decor.`,
            videoScene: `Child eye-level. Ultra-smooth gentle forward push gliding past gold ribbon accents. Sparkling background bokeh illuminates the child's sweet cheerful smile. Child safety locked.`
          };
        case 'girl_style_2':
          return {
            imageScene: `Place the child at child eye-level in an upscale celebration salon with soft golden fairy lights and gentle holiday decor. Modest and cheerful presentation.`,
            videoScene: `Child eye-level. Restrained, gentle 8°–10° lateral arc reveal past golden celebration lights, sweet polite smile, and soft blink. Child safety locked.`
          };
        case 'boy_style_1':
          return {
            imageScene: `Place the child at child eye-level standing upright in traditional ethnic wear. Hands resting naturally at sides. Near foreground features a gold-accented celebration pedestal.`,
            videoScene: `Child eye-level. Ultra-smooth forward push gliding past celebratory stage accent. Bright happy smile, festive lighting, and steady grounded posture. Child safety locked.`
          };
        case 'boy_style_2':
          return {
            imageScene: `Place the child at child eye-level in a modern celebratory salon with warm golden illumination and polished floor reflections.`,
            videoScene: `Child eye-level. Smooth 8°–10° lateral slider move across celebration salon, calm polite smile, and steady feet. Child safety locked.`
          };
      }
    }

    case 'christmas': {
      switch (variant) {
        case 'women_style_1':
          return {
            imageScene: `Place the customer in a luxury holiday boutique setting with a tastefully decorated evergreen bough, warm white fairy lights, and gold ribbon in the near foreground. Elegant holiday decor with golden baubles and warm architectural depth.`,
            videoScene: `Foreground reveal gliding past a decorated evergreen garland with warm white fairy lights and gold ribbon. Soft champagne-gold illumination shimmers across polished flooring with elegant holiday depth and 10°–12° lateral reveal.`
          };
        case 'women_style_2':
          return {
            imageScene: `Place the customer in a refined festive salon with tasteful evergreen garlands, warm champagne-white illumination, subtle gold ornaments, and premium seasonal charm.`,
            videoScene: `Camera glides forward past tasteful evergreen and golden festive accents, revealing fabric textures and rich luster under warm, refined holiday illumination.`
          };
        case 'men_style_1':
          return {
            imageScene: `Place the customer standing tall with heroic posture in a luxury holiday salon. A decorated architectural arch with tasteful evergreen garland and warm fairy lights stands in the near foreground.`,
            videoScene: `Slightly low hero angle. Ultra-smooth optical forward reveal gliding past an evergreen archway. 10°–12° lateral arc reveals a confident warm smile and crisp fabric tailoring.`
          };
        case 'men_style_2':
          return {
            imageScene: `Place the customer in a grand festive salon with polished architectural woodwork, tasteful seasonal wreaths, and warm golden holiday glow.`,
            videoScene: `Eye-level stabilized lateral tracking slider move executing a steady 10°–12° perspective shift across grand festive holiday salon with tasteful seasonal wreaths, dignified presence and steady feet.`
          };
        case 'girl_style_1':
          return {
            imageScene: `Place the child at child eye-level in a cozy holiday salon. Hands resting naturally at sides. Near foreground features a tasteful mini evergreen wreath with gold ribbon.`,
            videoScene: `Child eye-level. Ultra-smooth gentle forward push gliding past evergreen ribbon accents. Soft white fairy lights illuminate the child's sweet cheerful smile. Child safety locked.`
          };
        case 'girl_style_2':
          return {
            imageScene: `Place the child at child eye-level in a cozy holiday salon near a tastefully decorated festive tree with soft warm fairy lights.`,
            videoScene: `Child eye-level. Restrained, gentle 8°–10° lateral arc reveal past soft holiday lights, sweet polite posture, and warm seasonal charm. Child safety locked.`
          };
        case 'boy_style_1':
          return {
            imageScene: `Place the child at child eye-level standing upright in festive attire. Hands resting naturally at sides. Near foreground features a holiday pedestal with evergreen trim.`,
            videoScene: `Child eye-level. Ultra-smooth forward push gliding past holiday pedestal, bright happy smile, and warm seasonal illumination. Child safety locked.`
          };
        case 'boy_style_2':
          return {
            imageScene: `Place the child at child eye-level in a festive holiday salon with warm white lights and polished floor reflections.`,
            videoScene: `Child eye-level. Smooth 8°–10° lateral slider move across festive holiday salon, polite happy expression, and steady feet. Child safety locked.`
          };
      }
    }

    case 'ramadan': {
      switch (variant) {
        case 'women_style_1':
          return {
            imageScene: `Place the customer in an elegant Ramadan setting with a traditional ornamental brass Arabian lantern in the near foreground with soft geometric glow. Warm architectural lighting, subtle crescent-inspired motifs, and refined modest elegance.`,
            videoScene: `Foreground reveal gliding past an ornate brass lantern with warm geometric light. Soft architectural illumination skims across heritage arches with dignified celebratory depth and 10°–12° lateral reveal.`
          };
        case 'women_style_2':
          return {
            imageScene: `Place the customer in a grand arched heritage corridor with warm hanging lanterns, soft ambient evening glow, and dignified architectural depth.`,
            videoScene: `Camera glides forward past elegant arched corridors with warm ambient lantern glow illuminating textile textures with graceful festive serenity.`
          };
        case 'men_style_1':
          return {
            imageScene: `Place the customer standing tall with dignified grounded posture in a grand arched heritage corridor. A carved geometric pillar with hanging brass lantern stands in the near foreground.`,
            videoScene: `Slightly low hero angle. Ultra-smooth optical forward reveal gliding past a geometric lantern pillar. 10°–12° lateral arc reveals a confident respectful smile and crisp fabric weave.`
          };
        case 'men_style_2':
          return {
            imageScene: `Place the customer in a grand heritage colonnade with intricate stone arches and warm ambient evening illumination.`,
            videoScene: `Eye-level stabilized lateral tracking slider move executing a steady 10°–12° perspective shift across grand colonnade arches, dignified calm presence.`
          };
        case 'girl_style_1':
          return {
            imageScene: `Place the child at child eye-level in a modest traditional festive setting. Hands resting naturally at sides. Near foreground features a small ornate brass lantern with soft glow.`,
            videoScene: `Child eye-level. Ultra-smooth gentle forward push gliding past a small brass lantern. Sweet respectful smile, natural soft blink, and serene festive glow. Child safety locked.`
          };
        case 'girl_style_2':
          return {
            imageScene: `Place the child at child eye-level in an arched heritage corridor with soft warm ambient lantern light. Modest and innocent presentation.`,
            videoScene: `Child eye-level. Restrained, gentle 8°–10° lateral arc reveal past arched heritage corridor, sweet polite posture, and serene grace. Child safety locked.`
          };
        case 'boy_style_1':
          return {
            imageScene: `Place the child at child eye-level standing upright in modest ethnic wear. Hands resting naturally at sides. Near foreground features a low carved pedestal with decorative brass lantern.`,
            videoScene: `Child eye-level. Ultra-smooth forward push gliding past lantern pedestal, bright respectful smile, and warm illumination. Child safety locked.`
          };
        case 'boy_style_2':
          return {
            imageScene: `Place the child at child eye-level in a traditional arched corridor with warm ambient lanterns and polished floor reflections.`,
            videoScene: `Child eye-level. Smooth 8°–10° lateral slider move across heritage arched corridor, calm polite smile, and steady feet. Child safety locked.`
          };
      }
    }

    case 'birthday': {
      switch (variant) {
        case 'women_style_1':
          return {
            imageScene: `Place the customer on an elegant boutique celebration stage with champagne-gold celebration accents or decorative pillars in the near foreground. Soft festive balloons, gentle golden sparkle, and celebratory charm.`,
            videoScene: `Foreground reveal gliding past an elegant champagne-gold celebratory stage accent. Soft festive balloons and gentle golden bokeh drift gracefully in the background air with 10°–12° lateral reveal.`
          };
        case 'women_style_2':
          return {
            imageScene: `Place the customer in a refined celebration lounge with tasteful gold ribbons, warm celebration lighting, and cheerful upscale party depth.`,
            videoScene: `Camera glides forward past celebratory party accents, with bright warm illumination creating a joyful, upscale birthday commercial feel and rich fabric luster.`
          };
        case 'men_style_1':
          return {
            imageScene: `Place the customer standing tall with heroic posture on an upscale celebration stage. An architectural champagne pillar display stands in the near foreground with celebratory lighting.`,
            videoScene: `Slightly low hero angle. Ultra-smooth optical forward reveal gliding past champagne pillar display. 10°–12° lateral arc reveals a confident warm smile and crisp fabric textures.`
          };
        case 'men_style_2':
          return {
            imageScene: `Place the customer in a modern celebration lounge with refined architectural framing and warm party glow.`,
            videoScene: `Eye-level stabilized lateral tracking slider move executing a steady 10°–12° perspective shift across modern celebration lounge, steady parallax and distinguished presence.`
          };
        case 'girl_style_1':
          return {
            imageScene: `Place the child at child eye-level in a cheerful celebration setting in festive dress. Hands resting naturally at sides. Near foreground features soft pastel balloons and ribbon accents.`,
            videoScene: `Child eye-level. Ultra-smooth gentle forward push gliding past pastel balloons. Sweet joyful smile, soft blink, and bright celebratory atmosphere. Child safety locked.`
          };
        case 'girl_style_2':
          return {
            imageScene: `Place the child at child eye-level in a cheerful birthday party salon with soft colorful fairy lights and festive decor.`,
            videoScene: `Child eye-level. Restrained, gentle 8°–10° lateral arc reveal past birthday party decor, sweet cheerful smile, and playful celebration charm. Child safety locked.`
          };
        case 'boy_style_1':
          return {
            imageScene: `Place the child at child eye-level standing upright in cheerful ethnic wear. Hands resting naturally at sides. Near foreground features a festive balloon arrangement.`,
            videoScene: `Child eye-level. Ultra-smooth forward push gliding past balloon arrangement, bright happy smile, and cheerful celebration lighting. Child safety locked.`
          };
        case 'boy_style_2':
          return {
            imageScene: `Place the child at child eye-level in a party celebration salon with warm festive lights and polished floor reflections.`,
            videoScene: `Child eye-level. Smooth 8°–10° lateral slider move across party celebration salon, polite happy expression, and steady feet. Child safety locked.`
          };
      }
    }
  }
}

/** Deterministically alternates between scene 0 and scene 1 for a given session. */
export function getSceneIndex(sessionId?: string): 0 | 1 {
  if (!sessionId) return 0;
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return (hash % 2) as 0 | 1;
}

export function getCampaignPose(category: CustomerCategory, poseId: CampaignPoseId): string {
  const childPoses: Record<CampaignPoseId, string> = {
    'relaxed-sides': 'A child-safe upright standing pose with both arms relaxed at the sides, hands visible below the waist and clear of the torso.',
    'one-hand-hip': 'A child-safe upright standing pose with both arms relaxed at the sides, hands visible below the waist and clear of the torso.',
    'two-hands-hips': 'A child-safe balanced standing pose with both hands relaxed naturally at the sides and feet comfortably placed.',
    'chest-hold': 'A child-safe calm standing pose with hands softly and naturally together below the waist, with no gesture or prop.',
    'low-clasp': 'A child-safe calm standing pose with hands softly and naturally together below the waist, with no gesture or prop.',
    'low-wrist-hold': 'A child-safe relaxed standing pose with one hand gently holding the other wrist below the waist, with no gesture or prop.',
    'editorial-asymmetry': 'A child-safe balanced standing pose with one arm relaxed at the side and the other resting naturally below the waist, both hands clear of the torso.',
    'soft-side-stance': 'A child-safe upright pose with a gentle natural weight shift, both arms relaxed at the sides and hands visible below the waist.',
  };
  if (category === 'boy' || category === 'girl') return childPoses[poseId];

  const adultPoses: Record<CampaignPoseId, string> = {
    'relaxed-sides': 'A calm upright stance with both arms relaxed at the sides, hands fully visible below the waist and clear of the torso and garment.',
    'one-hand-hip': 'A confident static fashion stance with one hand already resting on the hip and the other arm relaxed at the side. The hand must remain on the hip, not move toward the chest.',
    'two-hands-hips': 'A confident static fashion stance with both hands already resting symmetrically on the hips. No hand movement, chest touch, gesture or pose transition.',
    'chest-hold': 'A composed static fashion stance with one hand already resting lightly over the upper chest and the other arm relaxed at the side. This is a completed still pose: do not raise, lower or animate the hand.',
    'low-clasp': 'An elegant still stance with both hands softly clasped together below the waist, clear of the garment details.',
    'low-wrist-hold': 'A refined static stance with one hand gently holding the other wrist below the waist, clear of the torso and garment.',
    'editorial-asymmetry': 'A balanced editorial stance with one arm naturally bent low and the other relaxed at the side, both hands fully visible below the waist and clear of the torso.',
    'soft-side-stance': 'A poised open-shoulder stance with a gentle natural weight shift, both arms relaxed at naturally different angles and hands at the outer thigh line.',
  };
  return adultPoses[poseId];
}

export function buildMasterPrompt(
  category: CustomerCategory = 'women',
  eventId: EventId = 'diwali',
  sessionId?: string,
  garmentTypeOrHint?: GarmentType | string,
  promptSet?: VideoPromptSet,
  poseId?: CampaignPoseId,
): string {
  const event = getEventOption(eventId);
  const resolvedPromptSet: VideoPromptSet = promptSet || (getSceneIndex(sessionId) === 1 ? 'set-2' : 'set-1');
  const resolvedGarment = (typeof garmentTypeOrHint === 'string' && ['saree', 'lehenga', 'salwar', 'kurta_dhoti', 'pattu_pavadai', 'boy_ethnic', 'generic'].includes(garmentTypeOrHint))
    ? (garmentTypeOrHint as GarmentType)
    : resolveGarmentType(category, typeof garmentTypeOrHint === 'string' ? garmentTypeOrHint : undefined);
  const garmentRules = getGarmentFidelityRules(resolvedGarment, false);
  const scene = getEventSceneDirection(category, eventId, resolvedPromptSet);
  const resolvedPoseId = poseId || getCampaignPoseId(sessionId, category);
  const campaignPose = getCampaignPose(category, resolvedPoseId);
  const safeImageScene = scene.imageScene
    .replace(/\s+in traditional pattu pavadai\b/gi, '')
    .replace(/\s+in traditional (?:ethnic|festive) wear\b/gi, '')
    .replace(/\s+in festive attire\b/gi, '')
    .replace(/\s+in modest ethnic wear\b/gi, '')
    .replace(/\s+in cheerful ethnic wear\b/gi, '');
  const childSafety = category === 'boy' || category === 'girl'
    ? '\n\nCHILD SAFETY: Keep the child fully age-appropriate, naturally cheerful, modestly styled, and free of adult glamour, mature posing, or suggestive presentation.'
    : '';
  return `${UNIVERSAL_GEMINI_IMAGE_PROMPT}\n\nCAMPAIGN POSE — STATIC FIRST FRAME (${resolvedPoseId}):\n${campaignPose}\n- This is a completed refined model-ad pose, not a hand gesture or action sequence. No waving, pointing, prayer pose, crossed arms, holding props or rotating the body.\n- Preserve the uploaded customer's natural anatomy and keep the selected pose stable for the later H3 film.\n\nGARMENT & STYLING ARCHITECTURE:\n${garmentRules}\n\nEVENT ENVIRONMENT (${event.label.toUpperCase()}):\n${safeImageScene}\n- The event environment changes only the background. It must not change, replace, restyle, or add to the uploaded garment.${childSafety}`;
}

/** Section 6: Universal Video Prompt — Cinematic Freedom with Absolute Identity & Garment Protection */
export const UNIVERSAL_VIDEO_PROMPT = `Create a premium luxury Indian festive fashion commercial from the approved master image with absolute identity and garment preservation.

P0 — ABSOLUTE FIDELITY & ZERO CLOTHING CHANGE (NON-NEGOTIABLE):
- Identity: Preserve exact facial geometry, eyes, nose, jawline, skin tone, hair, age, expression, pose, hands, feet, and body proportions. Zero reshaping, beautification, or identity alteration.
- Garment: Preserve the exact clothing silhouette, fabric weave, collar, neckline, sleeves, drape, colors, patterns, borders, embroidery, jewelry, and accessories from first frame to last. Zero clothing change, morphing, swapping, additions, removal, recoloring, or texture drift.

P1 — SUBJECT LOCK:
- Treat the person and attire as a protected reference layer. Preserve natural stillness with no hand, arm, chest, body, or garment movement. Keep all subject elements fixed.

P2 — LUXURY CINEMATIC CAMERA:
- Apply one slow, elegant whole-frame optical dolly-in with premium cinema-lens depth and polished editorial pacing. Keep the original viewpoint and framing; no perspective change or unseen surfaces.

P3 — LIVING FESTIVE ENVIRONMENT:
- Animate only existing background light, bokeh, reflections, focus, and restrained particles in empty space. Particles must never cross or obscure the face, body, garment, hands, or feet. Keep the subject, clothing color, and skin tone stable.

CONFLICT RESOLUTION RULE:
- Fidelity overrides motion. Dampen motion whenever needed to protect identity and garment stability.`;

export function buildEventVideoPrompt(
  category: CustomerCategory = 'women',
  eventId: EventId = 'diwali',
  sessionIdOrSet?: string | VideoPromptSet,
  promptSetOrGarment?: VideoPromptSet | GarmentType | string,
  garmentTypeOrHint?: GarmentType | string
): string {
  const event = getEventOption(eventId);
  let resolvedPromptSet: VideoPromptSet = 'set-1';
  let candidateGarment = garmentTypeOrHint;

  if (sessionIdOrSet === 'set-1' || sessionIdOrSet === 'set-2') {
    resolvedPromptSet = sessionIdOrSet;
    if (typeof promptSetOrGarment === 'string' && promptSetOrGarment !== 'set-1' && promptSetOrGarment !== 'set-2') {
      candidateGarment = candidateGarment || promptSetOrGarment;
    }
  } else if (promptSetOrGarment === 'set-1' || promptSetOrGarment === 'set-2') {
    resolvedPromptSet = promptSetOrGarment;
  } else if (typeof sessionIdOrSet === 'string') {
    resolvedPromptSet = getSceneIndex(sessionIdOrSet) === 1 ? 'set-2' : 'set-1';
    if (typeof promptSetOrGarment === 'string' && promptSetOrGarment !== 'set-1' && promptSetOrGarment !== 'set-2') {
      candidateGarment = candidateGarment || promptSetOrGarment;
    }
  }

  const resolvedGarment = (typeof candidateGarment === 'string' && ['saree', 'lehenga', 'salwar', 'kurta_dhoti', 'pattu_pavadai', 'boy_ethnic', 'generic'].includes(candidateGarment))
    ? (candidateGarment as GarmentType)
    : resolveGarmentType(category, typeof candidateGarment === 'string' ? candidateGarment : undefined);
  const garmentRules = getGarmentFidelityRules(resolvedGarment, true);
  const eventAtmosphere: Record<EventId, string> = {
    diwali: 'Animate the existing warm lamp glow, background bokeh, and floor reflections with restrained golden particles in empty background space.',
    pongal: 'Animate the existing warm morning light, background highlights, and floor reflections with restrained sunlit particles in empty background space.',
    'new-year': 'Animate the existing background sparkle, light bokeh, and reflective highlights with restrained celebratory particles in empty background space.',
    christmas: 'Animate the existing background fairy-light bokeh and warm reflective highlights with restrained light particles in empty background space.',
    ramadan: 'Animate the existing background lantern glow, light bokeh, and floor reflections with restrained luminous particles in empty background space.',
    birthday: 'Animate the existing background celebration lights, bokeh, and reflective highlights with restrained festive particles in empty background space.',
  };
  const childSafety = category === 'boy' || category === 'girl'
    ? '\n\nCHILD SAFETY: Keep the child fully age-appropriate, naturally cheerful, modestly styled, and free of adult glamour, mature posing, or suggestive presentation.'
    : '';
  return `${UNIVERSAL_VIDEO_PROMPT}\n\nGARMENT & TEXTILE STABILITY:\n${garmentRules}\n\nEVENT ATMOSPHERE (${event.label.toUpperCase()}):\n${eventAtmosphere[eventId]}\n- Preserve all existing background objects. Do not add, remove, replace, or redesign scene elements.${childSafety}`;
}

/** Section 7: Ultra-Safe Backup Video Prompt (Single Universal Fail-Safe) */
export const ULTRA_SAFE_BACKUP_VIDEO_PROMPT = `FAIL-SAFE REGENERATION MODE. RETRY STABILIZED FASHION COMMERCIAL MODE.

Create a premium 6-second vertical festive fashion commercial from the master image with absolute stability.

ANCHORED STABILIZED POSTURE:
- Subject remains poised and firmly anchored in the exact pose: feet stay locked to floor coordinates with zero walking, turning, stepping, or hand gestures.
- Preserve the exact face, expression, body, pose, hands, feet, hair, and proportions without animation or reinterpretation.
- Strict Garment Stability: zero fabric fluttering, zero pattern crawling, zero border drift. Fabric drape remains locked to body contours.
- Camera: Keep the original viewpoint and framing fixed, with a very gentle uniform optical push/zoom starting at frame 1. Use no viewing-angle or perspective change.

Preserve the exact face, identity, hairstyle, body proportions, and exact outfit from the master reference image.
Do not change or morph clothing.
Do not change garment colours, fabrics, or patterns.
Do not add or remove embroidery.
Do not beautify the face.
Do not change facial geometry.
Do not change the pose.

Allow only:
- subtle ambient festive lighting shimmer
- subtle background bokeh shimmer
- slight floor reflection shimmer
- soft warm festive light depth
- one slow uniform optical push applied to the complete frame

Keep the customer centered and full-body visible.
The result must feel elegant, luxurious, and stable. Motion must be very easy, smooth, and safe for the model to generate.`;

export function buildFailSafeVideoPrompt(
  category: CustomerCategory = 'women',
  eventId: EventId = 'diwali',
  garmentTypeOrHint?: GarmentType | string,
  backupMode: string = 'backup-locked'
): string {
  void category;
  void eventId;
  void garmentTypeOrHint;
  void backupMode;
  return ULTRA_SAFE_BACKUP_VIDEO_PROMPT;
}

export const BACKUP_PROMPT_MODES = ['backup-locked'] as const;
export type BackupPromptMode = 'backup-locked';

export function buildBackup1LockedVideoPrompt(
  category: CustomerCategory = 'women',
  eventId: EventId = 'diwali',
  garmentTypeOrHint?: GarmentType | string
): string {
  return buildFailSafeVideoPrompt(category, eventId, garmentTypeOrHint);
}

export function buildBackup2PushVideoPrompt(
  category: CustomerCategory = 'women',
  eventId: EventId = 'diwali',
  garmentTypeOrHint?: GarmentType | string
): string {
  return buildFailSafeVideoPrompt(category, eventId, garmentTypeOrHint);
}

// Aliases for backward compatibility
export const MASTER_IMAGE_UNIVERSAL_PREFIX = UNIVERSAL_GEMINI_IMAGE_PROMPT;
export const UNIVERSAL_HAILUO_VIDEO_BASE = UNIVERSAL_VIDEO_PROMPT;

// fal currently publishes no prompt-length maximum; this cap prevents unintentional runaway prompts.
export const MAX_VIDEO_PROMPT_CHARS = 3500;

export interface MotionSafetyRuleOptions {
  lowerBodyVisibility?: string;
}

export function buildMotionSafetyRule(
  decision?: MotionSafetyRuleOptions,
  isFailSafe = false
): string {
  const visibility = decision?.lowerBodyVisibility === 'clear'
    ? 'lower body visible and anchored'
    : 'lower body anchored';

  if (isFailSafe) {
    return `EXECUTION & ANCHOR CONSTRAINTS: ${visibility}. Preserve the exact person, expression, pose, clothing, and accessories without movement or reinterpretation. Only existing background light and a uniform whole-frame optical push may move. Zero text, words, titles, or logos.`;
  }

  return `EXECUTION & ANCHOR CONSTRAINTS: ${visibility}. Preserve exact identity, facial geometry, smile, gaze, pose, clothing, and accessories. Permit only one soft blink and extremely subtle chest breathing; keep all other subject elements fixed. Start the slow whole-frame optical push, background focus transition, light bloom, and restrained empty-space particles at frame 1. Zero blank screen, zero delayed intro, zero text, words, titles, or logos.`;
}

export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxLength * 0.75)) {
    return sliced.slice(0, lastSpace).replace(/[,;:\-\s]+$/, '') + '.';
  }
  return sliced;
}

export function buildFinalPrompt(
  basePrompt: string,
  decision?: MotionSafetyRuleOptions,
  isFailSafe = false
): string {
  let executionRule = '';
  if (isFailSafe || basePrompt.includes('FAIL-SAFE REGENERATION MODE')) {
    executionRule = 'STABILIZED LOCKED REGENERATION: The approved master image is the sole visual authority. Preserve the exact identity, face, expression, body, pose, clothing, colors, patterns, jewelry, and accessories in every frame. Animate only existing background light with one slow uniform whole-frame optical push. Zero reinterpretation, perspective change, texture swimming, or distortion.';
  }

  const canonicalPrompt = (executionRule ? `${basePrompt} ${executionRule}` : basePrompt)
    .replace(/\s+/g, ' ')
    .trim();
  const mandatorySafetyRule = buildMotionSafetyRule(decision, isFailSafe)
    .replace(/\s+/g, ' ')
    .trim();
  const separator = ' ';
  const baseBudget = MAX_VIDEO_PROMPT_CHARS - mandatorySafetyRule.length - separator.length;

  if (baseBudget <= 0) {
    throw new Error('Mandatory video safety rules exceed the provider prompt budget.');
  }

  const boundedBase = truncateAtWordBoundary(canonicalPrompt, baseBudget);
  return `${boundedBase}${separator}${mandatorySafetyRule}`;
}

export const MAHARAJA_CLIENT_ID = 'maharaja';
export const MAHARAJA_WORKSPACE_CODE = 'workspace';
export const TRY_ON_MIN_PURCHASE = 500;
export const AI_VIDEO_MIN_PURCHASE = 5000;
export const FESTIVE_TIER_MIN = Number(process.env.MAHARAJA_FESTIVE_TIER_MIN) || 500;
export const LUXURY_TIER_MIN = Number(process.env.MAHARAJA_LUXURY_TIER_MIN) || 3000;

/**
 * Repeat usage & duplicate limit enforcement.
 * Live-safe by default. Set ENFORCE_REPEAT_LIMITS=false only in an isolated test environment.
 */
export const ENFORCE_REPEAT_LIMITS = process.env.ENFORCE_REPEAT_LIMITS !== 'false';

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
- Images 2, 3, and 4 (up to 3 garment photos) are the authoritative garment reference photographs showing the exact outfit components (e.g. Top/Shirt, Bottom/Pant, Extra/Layer), colors, fabrics, and design details.

IDENTITY & FACE LOCK:
- Preserve the exact real customer identity from Image 1: facial structure, face shape, eyes, nose, mouth, jawline, ears, skin tone, hairstyle, hairline, facial hair, glasses, age appearance, height impression, and natural body proportions.
- Do NOT beautify into another person, change age, alter body weight, change skin complexion, make slimmer or heavier, or substitute the face.

GARMENT SPECIFICATION LOCK:
- Dress the customer in the exact uploaded garments from the garment reference photograph(s).
- Combine the upper garment (Top/Shirt) and lower garment (Bottom/Pant/Skirt) into a realistic, cohesive complete outfit as designated by the garment roles.
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
- Full body visible head-to-toe in strict 9:16 vertical orientation. No extra people, no mannequins, no duplicated limbs.

P3 — FESTIVE LIGHTING & TEXTILE LUSTER:
- Flattering luxury fashion lighting accentuating fabric weave texture, borders, and metallic luster without altering true dye hues.

FINAL QUALITY:
- An aspirational ₹1-crore luxury Indian festive fashion campaign portrait that is 100% faithful to the customer's identity and original garment.`;

export type GarmentType = 'saree' | 'lehenga' | 'salwar' | 'kurta_dhoti' | 'pattu_pavadai' | 'boy_ethnic' | 'generic';

export function resolveGarmentType(
  category: CustomerCategory = 'women',
  explicitType?: string,
  garmentAnalysis?: string,
  garmentRoles?: string[]
): GarmentType {
  const text = `${explicitType || ''} ${garmentAnalysis || ''} ${(garmentRoles || []).join(' ')}`.toLowerCase();

  if (category === 'men') return 'kurta_dhoti';
  if (category === 'boy') return 'boy_ethnic';
  if (category === 'girl') return 'pattu_pavadai';

  if (text.includes('lehenga') || text.includes('ghagra') || text.includes('chaniya') || text.includes('skirt')) {
    return 'lehenga';
  }
  if (text.includes('salwar') || text.includes('anarkali') || text.includes('kameez') || text.includes('churidar') || text.includes('kurti')) {
    return 'salwar';
  }
  if (text.includes('saree') || text.includes('sari') || text.includes('kanchi') || text.includes('banarasi') || text.includes('silk') || text.includes('pallu')) {
    return 'saree';
  }
  return 'saree';
}

/** Garment-specific and category-specific garment architecture rules */
export function getGarmentFidelityRules(
  categoryOrGarment: CustomerCategory | GarmentType,
  isVideo = false
): string {
  const type: GarmentType = ['saree', 'lehenga', 'salwar', 'kurta_dhoti', 'pattu_pavadai', 'boy_ethnic', 'generic'].includes(categoryOrGarment)
    ? (categoryOrGarment as GarmentType)
    : resolveGarmentType(categoryOrGarment as CustomerCategory);

  switch (type) {
    case 'saree':
      return isVideo
        ? `SAREE SPECIFIC FIDELITY:
- Preserve exact blouse construction, continuous six-yard saree drape, vertical waist pleats grounded to floor, metallic gold zari borders, and ornate pallu over shoulder.
- Motion Constraints: Pleats, waist tuck, blouse, and borders remain anchored with zero pattern drift. Free-hanging pallu edge has subtle micro-sway only.
- Jewelry: Traditional festive jewelry remains solidly anchored.`
        : `SAREE SPECIFIC FIDELITY:
- Render the exact blouse design (neckline, sleeve length), complete six-yard saree body drape, crisp vertical waist pleats falling straight to the floor, authentic metallic gold zari borders along edges, and the exact ornate pallu draped elegantly over the shoulder.
- Jewelry: Traditional festive jewelry (kasu malai, jhumkas, bangles) naturally seated against skin and silk.`;

    case 'lehenga':
      return isVideo
        ? `LEHENGA / CHOLI SPECIFIC FIDELITY:
- Preserve exact flared skirt/kalis silhouette, waistband/kamarbandh, choli bodice construction and neckline, and dupatta drape. Rich embroidery and border motifs strictly preserved.
- Strictly NO saree pleats, NO continuous saree body drape.
- Motion Constraints: Skirt waistband, choli, and hem borders remain geometrically anchored. Free-hanging dupatta edge may have subtle, delicate micro-sway only.
- Jewelry: Traditional festive jewelry solidly anchored.`
        : `LEHENGA / CHOLI SPECIFIC FIDELITY:
- Render exact flared skirt/kalis silhouette, waistband/kamarbandh, choli bodice construction and neckline, and dupatta drape. Rich embroidery and border motifs strictly preserved.
- Strictly NO saree pleats, NO continuous saree body drape.
- Jewelry: Traditional festive jewelry naturally seated against skin and fabric.`;

    case 'salwar':
      return isVideo
        ? `SALWAR / ANARKALI SPECIFIC FIDELITY:
- Preserve exact flowing tunic/anarkali flare, neckline, sleeve cut, churidar/pant fit, and dupatta drape.
- Strictly NO saree pleats, NO saree body drape, NO choli exposure.
- Motion Constraints: Tunic bodice, waist, and pant remain geometrically anchored. Free-hanging dupatta edge may have subtle micro-sway only.
- Jewelry: Traditional festive jewelry solidly anchored.`
        : `SALWAR / ANARKALI SPECIFIC FIDELITY:
- Render exact flowing tunic/anarkali flare, neckline, sleeve cut, churidar/pant fit, and dupatta drape.
- Strictly NO saree pleats, NO saree body drape, NO choli exposure.
- Jewelry: Traditional festive jewelry naturally seated against skin and fabric.`;

    case 'kurta_dhoti':
      return isVideo
        ? `MEN'S TRADITIONAL SPECIFIC FIDELITY:
- Preserve exact kurta silhouette, mandarin/stand collar construction, placket buttons, fabric weave, and dhoti/veshti pleats or churidar/pyjama fit. Angavastram/shawl if present.
- Strictly NO feminine garment elements, NO saree drapes, NO blouse styling.
- Motion Constraints: Kurta hem and dhoti/pyjama remain geometrically anchored with zero pattern drift or limb duplication.
- Posture: Confident, regal, masculine traditional posture with grounded feet.`
        : `MEN'S TRADITIONAL SPECIFIC FIDELITY:
- Render exact kurta silhouette, collar construction, placket buttons, fabric weave, and dhoti/veshti pleats or churidar/pyjama fit. Angavastram/shawl if present.
- Strictly NO feminine garment elements, NO saree drapes, NO blouse styling.
- Posture: Confident, regal, masculine traditional posture with grounded feet.`;

    case 'boy_ethnic':
      return isVideo
        ? `BOY'S TRADITIONAL ETHNIC FIDELITY:
- Preserve age-appropriate boy's traditional Indian wear (festive kurta-pyjama or dhoti-shirt) matching the uploaded reference.
- Strictly NO adult glamour, NO mature posing, NO saree/pallu elements.
- Natural cheerful boyish poise with anchored feet.`
        : `BOY'S TRADITIONAL ETHNIC FIDELITY:
- Render age-appropriate boy's traditional Indian wear (festive kurta-pyjama or dhoti-shirt) matching the uploaded reference.
- Strictly NO adult glamour, NO mature posing, NO saree/pallu elements.
- Cheerful, natural boyish charm and modest styling.`;

    case 'pattu_pavadai':
      return isVideo
        ? `GIRL'S TRADITIONAL ETHNIC FIDELITY:
- Preserve age-appropriate girl's traditional Indian wear (pattu pavadai silk skirt and blouse/choli or festive anarkali).
- Strictly NO adult glamour, NO adult saree drape, NO mature styling.
- Gentle micro-sway on pavadai skirt hem only; natural cheerful girl princess poise with anchored feet.`
        : `GIRL'S TRADITIONAL ETHNIC FIDELITY:
- Render age-appropriate girl's traditional Indian wear (pattu pavadai silk skirt and blouse/choli or festive anarkali).
- Strictly NO adult glamour, NO adult saree drape, NO mature styling.
- Charming, natural girl princess elegance and modest styling.`;

    case 'generic':
    default:
      return isVideo
        ? `GARMENT REFERENCE FIDELITY:
- Preserve exact uploaded garment silhouette, neckline, sleeve length, waist construction, fabric weave, and dye colors.
- Motion Constraints: Garment remains geometrically anchored to the body contours with zero pattern drift or cloth melting.`
        : `GARMENT REFERENCE FIDELITY:
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

/** Event-specific scene direction (strict isolation of event props and lighting across all 8 variants) */
export function getEventSceneDirection(
  category: CustomerCategory,
  eventId: EventId,
  sceneIdxOrSet: 0 | 1 | VideoPromptSet = 0
): { imageScene: string; videoScene: string } {
  const promptSet: VideoPromptSet = sceneIdxOrSet === 1 || sceneIdxOrSet === 'set-2' ? 'set-2' : 'set-1';
  const variant = getNormalSceneVariant(category, promptSet);

  switch (eventId) {
    case 'diwali': {
      switch (variant) {
        case 'women_style_1':
          return {
            imageScene: `Place the customer in an elegant Diwali setting with a traditional brass kuthu-vilakku oil lamp in the near foreground. Warm golden diya glow, marigold flower garlands, and a refined boutique/palace corridor with glowing clay diyas and delicate floral rangoli.`,
            videoScene: `Eye-level smooth foreground reveal gliding past warm glowing brass kuthu-vilakku oil lamps. Diya flames flicker naturally with warm amber reflections across polished heritage floor. 10°–12° lateral arc reveal showcasing rich textile luster and drape. Golden festive bokeh shimmers gently in the background.`
          };
        case 'women_style_2':
          return {
            imageScene: `Place the customer near an ornate festive palace doorway lined with glowing clay diyas, marigold accents, warm golden celebration lighting, soft backlighting, and refined luxury depth.`,
            videoScene: `Camera glides forward at a slightly low majestic angle past an ornate festive doorway lined with glowing diyas and marigold garlands, with 12°–15° lateral perspective shift revealing rich textile luster and drape under warm celebratory golden illumination.`
          };
        case 'men_style_1':
          return {
            imageScene: `Place the customer standing tall and confident with grounded masculine posture in a heritage palace corridor. An ornate brass lamp bracket on a carved wooden pillar stands in the near foreground with glowing diyas and warm golden light.`,
            videoScene: `Slightly low hero angle. Ultra-smooth optical forward reveal gliding past an ornate brass lamp bracket. Restrained 10°–12° lateral arc reveals dignified confident posture, warm composed smile, natural eye contact, and crisp fabric weave.`
          };
        case 'men_style_2':
          return {
            imageScene: `Place the customer in an expansive heritage palace courtyard with traditional stone pillars, warm floor-level diya lanterns, and polished granite flooring with grounded dignified stance.`,
            videoScene: `Eye-level stabilized lateral tracking slider move executing a steady 10°–12° perspective shift across traditional carved pillars and warm glowing floor diyas. Subject maintains a grounded, dignified presence with feet firmly locked.`
          };
        case 'girl_style_1':
          return {
            imageScene: `Place the child at child eye-level in an innocent, cheerful Diwali setting. Hands resting naturally at sides (strictly no fire or lamps in hands). In the near foreground sits a low decorative brass urli filled with floating marigold petals and subtle glowing diyas.`,
            videoScene: `Child eye-level. Ultra-smooth gentle forward push gliding past a low decorative floral urli. Soft festive diya glow illuminates the child's sweet cheerful smile, natural soft blink, and modest traditional attire. Child safety locked.`
          };
        case 'girl_style_2':
          return {
            imageScene: `Place the child at child eye-level near a decorated palace archway lined with soft golden fairy lights, marigold garlands, and polished floor reflections. Modest, child-safe, elegant styling.`,
            videoScene: `Child eye-level. Restrained, gentle 8°–10° lateral arc reveal gliding past a decorated palace archway. Soft ambient festival glow illuminates the girl's sweet polite posture, natural breathing, and tender smile. Child safety locked.`
          };
        case 'boy_style_1':
          return {
            imageScene: `Place the child at child eye-level standing upright and cheerful in traditional ethnic wear. Hands resting naturally at sides (strictly no fire or sparklers). Near foreground features a low carved brass pedestal with delicate floral rangoli art.`,
            videoScene: `Child eye-level. Ultra-smooth stabilized forward push gliding past a low decorative rangoli pedestal. Bright cheerful smile, natural soft blink, and steady grounded posture. Child safety locked.`
          };
        case 'boy_style_2':
          return {
            imageScene: `Place the child at child eye-level in a traditional palace corridor with warm floor diyas and polished stone floor reflections. Modest, calm, and respectful presentation.`,
            videoScene: `Child eye-level. Smooth 8°–10° lateral slider move across heritage pillars with soft background diya glow. Polite happy smile, natural breathing, and steady feet. Child safety locked.`
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

export function buildMasterPrompt(
  category: CustomerCategory = 'women',
  eventId: EventId = 'diwali',
  sessionId?: string,
  garmentTypeOrHint?: GarmentType | string,
  promptSet?: VideoPromptSet
): string {
  const event = getEventOption(eventId);
  const resolvedPromptSet: VideoPromptSet = promptSet || (getSceneIndex(sessionId) === 1 ? 'set-2' : 'set-1');
  const resolvedGarment = (typeof garmentTypeOrHint === 'string' && ['saree', 'lehenga', 'salwar', 'kurta_dhoti', 'pattu_pavadai', 'boy_ethnic', 'generic'].includes(garmentTypeOrHint))
    ? (garmentTypeOrHint as GarmentType)
    : resolveGarmentType(category, typeof garmentTypeOrHint === 'string' ? garmentTypeOrHint : undefined);
  const garmentRules = getGarmentFidelityRules(resolvedGarment, false);
  const scene = getEventSceneDirection(category, eventId, resolvedPromptSet);
  const childSafety = category === 'boy' || category === 'girl'
    ? '\n\nCHILD SAFETY: Keep the child fully age-appropriate, naturally cheerful, modestly styled, and free of adult glamour, mature posing, or suggestive presentation.'
    : '';
  return `${UNIVERSAL_GEMINI_IMAGE_PROMPT}\n\nGARMENT & STYLING ARCHITECTURE:\n${garmentRules}\n\nEVENT ENVIRONMENT (${event.label.toUpperCase()}):\n${scene.imageScene}${childSafety}`;
}

/** Section 6: Universal Video Prompt — Cinematic Freedom with Absolute Identity & Garment Protection */
export const UNIVERSAL_VIDEO_PROMPT = `Create a premium luxury Indian festive fashion commercial from the master image with realistic human vitality, exact garment fidelity, and cinematic parallax.

P0 — ABSOLUTE FIDELITY (NON-NEGOTIABLE):
- Identity: Preserve exact facial geometry, eyes, nose, jawline, skin tone, hair, and body proportions. Zero face reshaping, beautification, or identity alteration.
- Garment: Preserve exact silhouette, fabric weave, embroidery, border geometry, and dye hues. Neutral grey stays pure grey. Zero color shifting or pattern swimming.
- Jewelry: Visible ornaments remain solidly anchored with zero floating.

P1 — NATURAL HUMAN PRESENCE:
- Vitality: warm festive smile, expressive eyes with natural micro-saccades, 1–2 soft blinks across 6s, and gentle breathing (<1.5cm).
- Grounded: feet stay firmly anchored to floor coordinates with zero walking or stepping. Avoid stiff mannequin stare.

P2 — LUXURY CAMERA CHOREOGRAPHY & PARALLAX:
- Smooth optical dolly-in with restrained 10°–15° lateral perspective shift from reference viewpoint.
- Multi-plane parallax between foreground celebratory decor, midground subject, and background setting. Never invent unseen reverse surfaces.

P3 — LIVING FESTIVE ENVIRONMENT:
- Ambient festive lighting reveals textile luster without altering dye colors.

P4 — NATURAL FABRIC PHYSICS:
- Free-hanging fabric edges have subtle micro-sway in air.

CONFLICT RESOLUTION RULE:
- Fidelity strictly overrides motion. Dampen motion to protect identity and fabric stability.`;

export function buildEventVideoPrompt(
  category: CustomerCategory = 'women',
  eventId: EventId = 'diwali',
  sessionIdOrSet?: string | VideoPromptSet,
  promptSet?: VideoPromptSet,
  garmentTypeOrHint?: GarmentType | string
): string {
  const event = getEventOption(eventId);
  let resolvedPromptSet: VideoPromptSet = 'set-1';
  if (sessionIdOrSet === 'set-1' || sessionIdOrSet === 'set-2') {
    resolvedPromptSet = sessionIdOrSet;
  } else if (promptSet === 'set-1' || promptSet === 'set-2') {
    resolvedPromptSet = promptSet;
  } else if (typeof sessionIdOrSet === 'string') {
    resolvedPromptSet = getSceneIndex(sessionIdOrSet) === 1 ? 'set-2' : 'set-1';
  }

  const resolvedGarment = (typeof garmentTypeOrHint === 'string' && ['saree', 'lehenga', 'salwar', 'kurta_dhoti', 'pattu_pavadai', 'boy_ethnic', 'generic'].includes(garmentTypeOrHint))
    ? (garmentTypeOrHint as GarmentType)
    : resolveGarmentType(category, typeof garmentTypeOrHint === 'string' ? garmentTypeOrHint : undefined);
  const garmentRules = getGarmentFidelityRules(resolvedGarment, true);
  const scene = getEventSceneDirection(category, eventId, resolvedPromptSet);
  const childSafety = category === 'boy' || category === 'girl'
    ? '\n\nCHILD SAFETY: Keep the child fully age-appropriate, naturally cheerful, modestly styled, and free of adult glamour, mature posing, or suggestive presentation.'
    : '';
  return `${UNIVERSAL_VIDEO_PROMPT}\n\nGARMENT & TEXTILE STABILITY:\n${garmentRules}\n\nEVENT ATMOSPHERE & SHOT DIRECTION (${event.label.toUpperCase()}):\n${scene.videoScene}${childSafety}`;
}

/** Section 7: Ultra-Safe Backup Video Prompt (Single Universal Fail-Safe) */
export const ULTRA_SAFE_BACKUP_VIDEO_PROMPT = `FAIL-SAFE REGENERATION MODE. RETRY STABILIZED FASHION COMMERCIAL MODE.

Create a premium 6-second vertical festive fashion commercial from the master image with absolute stability.

ANCHORED STABILIZED POSTURE:
- Subject remains poised and firmly anchored in the exact pose: feet stay locked to floor coordinates with zero walking, turning, stepping, or hand gestures.
- Natural human vitality: allow subtle gentle breathing (<1cm), 1 natural soft blink, and a warm, composed festive closed-mouth expression. Strictly avoid dead wax mannequin stares.
- Strict Garment Stability: zero fabric fluttering, zero pattern crawling, zero border drift. Fabric drape and pleats remain locked to body contours.
- Camera: Camera remains stationary on a locked-off tripod with a very gentle, subtle optical push/zoom starting at frame 1. Strictly ZERO lateral rotation, ZERO panning, ZERO tilt, ZERO orbit, and ZERO reframing.

Preserve the exact face, identity, hairstyle, body proportions, garment design, garment embroidery, and garment colours.
Do not beautify the face.
Do not change facial geometry.
Do not change garment colours.
Do not change the pose.

Allow only:
- subtle ambient festive lighting shimmer
- subtle background bokeh shimmer
- slight floor reflection shimmer
- soft warm festive light depth

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

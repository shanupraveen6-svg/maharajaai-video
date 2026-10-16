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

/** Section 5: Universal Gemini Master Image Prompt & 8 Scene Variants */
export const UNIVERSAL_GEMINI_IMAGE_PROMPT = `Create a premium festive fashion portrait of the customer using the uploaded customer photo and uploaded garment references.

PRIORITY RULES:
1. Preserve the customer's exact face, identity, hairstyle, age impression, skin tone, and body proportions.
2. Do not beautify the face. Do not reshape facial features. Do not change jawline, nose, eyes, lips, forehead, hairstyle, or complexion.
3. Preserve the exact garment design, exact garment pattern, exact embroidery, and exact garment colours from the uploaded garment references.
4. Warm festive lighting may add highlights and shadows, but it must not change the true garment colour. Neutral grey must remain neutral grey. Do not shift garments into beige, tan, khaki, cream, or other incorrect hues.
5. Keep the customer standing in a clean, premium, elegant full-body fashion pose.
6. The output must feel like a luxury festive fashion campaign image.
7. Create the premium/model look only through professional lighting, environment, composition, and posture — never through facial beautification or identity alteration.
8. Full body must be visible from head to feet. Both feet must remain visible.
9. No extra people. No mannequins. No duplicated limbs. No distorted hands or feet.
10. The customer must wear the uploaded garments exactly.

GARMENT ROLE MAPPING:
- Garment Reference 1 = Top / Shirt / Upper Garment
- Garment Reference 2 = Bottom / Pant / Lower Garment
- Garment Reference 3 = Extra / Optional Garment or Styling Layer

IMAGE STYLE:
Bright flattering premium fashion lighting, elegant festive atmosphere, rich but tasteful Indian celebration mood, cinematic composition, realistic fabric rendering, natural skin texture, clean luxury presentation.

OUTPUT:
A polished premium full-body festive fashion image that looks aspirational, elegant, and realistic while preserving exact identity and exact dress fidelity.`;

export const GEMINI_IMAGE_SCENE_ADDONS: Record<CustomerCategory, [string, string]> = {
  men: [
    `SCENE STYLE:
Place the customer in an elegant festive Indian setting with a traditional brass kuthu-vilakku / oil lamp in the foreground or near foreground. Use warm golden festive lighting, subtle diya glow, and rich premium ambience. The scene should feel regal, masculine, and rooted in Indian tradition. Keep the lamp as a tasteful cinematic foreground element without covering the customer's face or garments.`,
    `SCENE STYLE:
Place the customer in an elegant Indian heritage balcony or palace-style corridor with depth, pillars, or railings. Use refined festive lighting, warm background illumination, and a premium luxury ambience. The composition should feel regal, stylish, and cinematic.`,
  ],
  women: [
    `SCENE STYLE:
Place the customer in a graceful festive scene with a diya-lined walkway or richly lit festive floor arrangement. Include soft rangoli-inspired styling, warm glow, elegant highlights, and luxurious Indian festive ambience. The scene should feel elegant, graceful, and premium.`,
    `SCENE STYLE:
Place the customer near an ornate festive doorway or temple-inspired decorative entrance with warm divine golden light, elegant depth, and premium celebratory ambience. The scene should feel rich, graceful, and luxurious without becoming fantasy-like.`,
  ],
  boy: [
    `SCENE STYLE:
Place the child in a cheerful festive courtyard with warm decorative lights, festive ambience, and a bright celebratory background. The mood should feel joyful, energetic, and premium while remaining elegant and realistic.`,
    `SCENE STYLE:
Place the child in a festive environment with decorative hanging lanterns or festive hanging ornaments in the background. Use warm celebratory lighting, playful depth, and cheerful premium ambience. Keep it child-appropriate, elegant, and realistic.`,
  ],
  girl: [
    `SCENE STYLE:
Place the child in a beautiful festive balcony or decorative celebration setting with warm lights, elegant background depth, and a soft premium festive atmosphere. The mood should feel charming, graceful, and celebratory, like a festive princess portrait, while remaining realistic and child-appropriate.`,
    `SCENE STYLE:
Place the child in a festive setting featuring rangoli-inspired styling, warm lamps or diyas, and glowing celebration ambience. Use bright, joyful festive colour and elegant premium lighting while keeping the overall image realistic and child-appropriate.`,
  ],
};

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
  sessionId?: string
): string {
  const event = getEventOption(eventId);
  const sceneIdx = getSceneIndex(sessionId);
  const variants = GEMINI_IMAGE_SCENE_ADDONS[category] || GEMINI_IMAGE_SCENE_ADDONS.women;
  const addOn = variants[sceneIdx] || variants[0];
  return `${UNIVERSAL_GEMINI_IMAGE_PROMPT}\n\nEVENT PRIORITY:\nCreate a ${event.label} presentation using ${event.scene}. The selected event overrides any conflicting festival prop examples below.\n\n${addOn}`;
}

/** Section 6: Universal Video Prompt & 8 Matching Video Scene Variants */
export const UNIVERSAL_VIDEO_PROMPT = `Create a premium 6-second vertical cinematic fashion video from the provided festive master image.

CORE RULES:
1. Preserve the customer's exact face, identity, hairstyle, body proportions, garment design, garment embroidery, and garment colours.
2. Do not beautify the face. Do not alter facial geometry. Do not change skin tone.
3. The subject must remain essentially still, poised, and model-like.
4. Feet remain firmly anchored to the floor coordinates.
5. No walking, stepping, turning, dancing, hand acting, or body repositioning.
6. No garment colour change. No garment design change. No fabric hallucination.
7. Create the cinematic effect mainly through camera movement, foreground/background depth, lighting interaction, reflections, and festive environmental motion.
8. Motion must be clean, premium, smooth, and easy for the model to execute.
9. The shot must remain elegant and stable, not over-animated.
10. This is a 6-second source film intended to remain beautiful when slowed for showroom playback, so motion should be controlled, graceful, and clean.

VIDEO STYLE:
High-end festive fashion film, premium Indian luxury ambience, bright flattering professional lighting, elegant depth, cinematic realism, polished composition.

OUTPUT:
A smooth premium 6-second fashion video in which the customer remains visually locked while the scene feels alive through camera and environment.`;

export const VIDEO_SCENE_ADDONS: Record<CustomerCategory, [string, string]> = {
  men: [
    `SHOT DESIGN:
Use a traditional brass lamp or oil lamp as a near-foreground cinematic element. Perform a smooth subtle reveal shot past the lamp, allowing the customer to remain centered and still. Let the flame flicker naturally and allow warm reflections and distant festive lights to shimmer gently. No subject movement. The cinematic energy comes from the foreground reveal, flame flicker, and elegant lighting depth.`,
    `SHOT DESIGN:
Use a heritage balcony or palace-corridor environment. Perform a gentle premium sideways camera move that creates soft parallax between foreground architecture, the stationary customer, and the festive background. Background lights shimmer subtly. No body motion. The cinematic feel comes from smooth parallax and elegant lighting.`,
  ],
  women: [
    `SHOT DESIGN:
Use a diya-lit festive floor or walkway with warm glowing ambience. Perform a smooth, gentle cinematic reveal or soft controlled tracking move while keeping the customer perfectly poised and still. Let the lamps flicker naturally and allow reflections and background bokeh to shimmer softly. No subject motion.`,
    `SHOT DESIGN:
Use an ornate festive doorway or temple-inspired decorative scene. Perform a smooth elegant camera reveal with subtle depth and premium lighting progression. Let warm golden background light glow softly while the customer remains completely still. The mood should feel rich, graceful, and luxurious.`,
  ],
  boy: [
    `SHOT DESIGN:
Use a festive courtyard setting with bright decorative lights and cheerful celebratory ambience. Perform a gentle simple cinematic move with small background light shimmer and subtle festive depth. The child remains still and centered. Keep motion clean, minimal, and child-appropriate.`,
    `SHOT DESIGN:
Use hanging lanterns or festive hanging decorations in the background. Perform a smooth easy cinematic camera move while the lanterns and background lights show subtle motion. The child remains still, centered, and calm. Keep the scene cheerful, premium, and realistic.`,
  ],
  girl: [
    `SHOT DESIGN:
Use a decorative festive balcony or elegant celebration backdrop. Perform a smooth subtle reveal or gentle lateral move while warm festive lights shimmer in the background. Keep the child perfectly still and poised. The video should feel charming, graceful, and premium.`,
    `SHOT DESIGN:
Use a festive scene with rangoli-inspired styling, lamps/diyas, and a glowing warm ambience. Perform a simple graceful camera move while lamp glow, reflections, and background light shimmer create visual life. The child remains still, centered, and elegant.`,
  ],
};

export function buildEventVideoPrompt(
  category: CustomerCategory = 'women',
  eventId: EventId = 'diwali',
  sessionId?: string,
  promptSet: VideoPromptSet = 'set-1'
): string {
  const event = getEventOption(eventId);
  void promptSet;
  const sceneIdx = getSceneIndex(sessionId);
  const variants = VIDEO_SCENE_ADDONS[category] || VIDEO_SCENE_ADDONS.women;
  const addOn = variants[sceneIdx] || variants[0];
  return `${UNIVERSAL_VIDEO_PROMPT}\n\nEVENT PRIORITY:\nThis is a ${event.label} film using ${event.scene}. Animate only safe background elements appropriate to this selected event; this instruction overrides conflicting festival prop examples below.\n\n${addOn}`;
}

/** Section 7: Ultra-Safe Backup Video Prompt */
export const ULTRA_SAFE_BACKUP_VIDEO_PROMPT = `FAIL-SAFE REGENERATION MODE. RETRY STABILIZED FASHION COMMERCIAL MODE.

Create a premium 6-second vertical festive fashion video from the provided master image.

The customer must remain completely still in the exact pose.
Preserve the exact face, identity, hairstyle, body proportions, garment design, garment embroidery, and garment colours.
Do not beautify the face.
Do not change facial geometry.
Do not change garment colours.
Do not change the pose.

NO walking.
NO stepping.
NO turning.
NO hand motion.
NO head movement.
NO body sway.
NO garment flutter.

Use only one simple safe cinematic move:
a very gentle slow forward push-in / zoom-in combined with premium festive lighting and subtle background shimmer.

Allow only:
- soft diya / lamp flicker
- subtle background bokeh shimmer
- slight floor reflection shimmer
- soft warm festive light depth

Keep the customer centered and full-body visible.
The result must feel elegant, luxurious, and stable.
Motion must be very easy, smooth, and safe for the model to generate.`;

export function buildFailSafeVideoPrompt(
  category: CustomerCategory = 'women',
  eventId: EventId = 'diwali'
): string {
  void category;
  void eventId;
  return ULTRA_SAFE_BACKUP_VIDEO_PROMPT;
}

// Aliases for backward compatibility
export const MASTER_IMAGE_UNIVERSAL_PREFIX = UNIVERSAL_GEMINI_IMAGE_PROMPT;
export const UNIVERSAL_HAILUO_VIDEO_BASE = UNIVERSAL_VIDEO_PROMPT;

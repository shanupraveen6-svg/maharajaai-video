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
2. Feature a warm, confident, radiant festive smile with expressive, joyful eyes and celebratory presence. Avoid a flat, stiff, or stern expression.
3. Do not beautify into another person. Do not reshape facial features. Do not change jawline, nose, eyes, lips, forehead, hairstyle, or complexion.
4. Preserve the exact garment design, exact garment pattern, exact embroidery, and exact garment colours from the uploaded garment references.
5. Warm festive lighting may add highlights and shadows, but it must not change the true garment colour. Neutral grey must remain neutral grey. Do not shift garments into beige, tan, khaki, cream, or other incorrect hues.
6. Keep the customer standing in an elegant, upright, regal full-body high-fashion model pose.
7. The output must feel like a ₹1-crore luxury festive fashion campaign image.
8. Create the premium/model look through professional lighting, festive environment, composition, warm expression, and posture — never through facial beautification or identity alteration.
9. Full body must be visible from head to feet. Both feet must remain visible.
10. No extra people. No mannequins. No duplicated limbs. No distorted hands or feet.
11. The customer must wear the uploaded garments exactly.

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
/** Section 6: Universal Video Prompt — Cinematic Freedom with Absolute Identity & Garment Protection */
export const UNIVERSAL_VIDEO_PROMPT = `Create a premium luxury Indian festive fashion commercial with elegant human presence, cinematic depth, dynamic yet controlled camera movement, sophisticated lighting, and natural fabric physics.

PRIORITY 0 — NON-NEGOTIABLE REFERENCE FIDELITY:
Preserve the customer's facial identity, facial geometry, natural skin tone, hairstyle, recognizable features, body proportions, and all visible jewelry.
Preserve the supplied garment's exact design, silhouette, construction, dyes, embroidery, zari borders, motif arrangement, texture, and fabric characteristics. No garment redesign, invented details, pattern replacement, color transformation, or identity morphing.

PRIORITY 1 — NATURAL EXPRESSION & HUMAN PRESENCE:
Animate a warm, confident, radiant festive smile with expressive eyes, natural blinking, subtle breathing, and an elegant high-fashion presence.
The subject must feel alive, graceful, and celebratory without exaggerated movement, distorted facial features, or unnatural body mechanics.

PRIORITY 2 — CONTROLLED LUXURY CAMERA CHOREOGRAPHY:
Begin with a cinematic foreground reveal past traditional golden brass lamps. Execute a smooth, physically plausible dolly-in combined with a modest lateral camera arc, approximately 10–15 degrees from the reference viewpoint.
Create dimensional parallax between the brass lamps, the subject, and the heritage palace corridor.
Maintain stable subject geometry, garment details, facial proportions, and jewelry across every frame.
Never invent unseen surfaces or force a camera viewpoint that cannot be reliably supported by the provided visual references.

PRIORITY 3 — LIVING FESTIVE ENVIRONMENT:
Introduce realistic diya-flame flicker, elegant golden bokeh, subtle environmental shimmer, polished-floor reflections, and restrained floating festive particles.
Allow gentle golden rim-light variation to reveal the silk and zari texture without altering the garment's original perceived colors.
Keep lighting physically motivated, temporally consistent, and luxurious rather than excessive.

PRIORITY 4 — NATURAL FABRIC PHYSICS:
Permit subtle physically plausible fabric sway, folds, and drape response while keeping motif placement, embroidery, zari geometry, and material identity consistent.
Avoid fabric melting, pattern crawling, shimmering artifacts, or invented cloth geometry.

CONFLICT RESOLUTION RULE:
Whenever cinematic motion, expression, lighting, or environmental animation conflicts with identity or garment fidelity, reduce the dynamic effect automatically. Never sacrifice reference fidelity to achieve more dramatic movement.

FINAL QUALITY TARGET:
Photorealistic luxury fashion cinematography, lively but controlled performance, premium festive atmosphere, stable temporal coherence, natural physics, and precise frame-to-frame identity and garment consistency.`;

export const VIDEO_SCENE_ADDONS: Record<CustomerCategory, [string, string]> = {
  men: [
    `CINEMATIC SHOT DIRECTION:
Begin with an editorial foreground reveal gliding smoothly past traditional brass kuthu-vilakku oil lamps. The camera tracks inward in a slow 10-15° orbital arc revealing the customer in a confident, regal posture with a warm, genuine festive smile. Brass lamp flames flicker naturally casting amber highlights on polished heritage flooring. Deep festive bokeh and golden light interplay in the background create cinematic luxury depth.`,
    `CINEMATIC SHOT DIRECTION:
In a grand heritage palace corridor with ornate carved pillars, the camera executes a fluid lateral tracking move creating rich dimensional parallax between the foreground pillars, the smiling customer, and warm festive lanterns in the background. Subtle golden rim light skims across the fabric texture as warm ambient celebratory light shimmers gently.`,
  ],
  women: [
    `CINEMATIC SHOT DIRECTION:
Begin with a magical foreground reveal past warm glowing brass lamps. The camera executes an elegant 10-15° orbital dolly-in toward the customer, who presents a warm, radiant festive smile with lively expressive eyes. Diya flames dance naturally with realistic reflections across the polished floor. Floating golden festive particles and soft fabric drape sway in the ambient air create a ₹1-crore fashion campaign feel.`,
    `CINEMATIC SHOT DIRECTION:
Set before an ornate festive palace doorway lined with glowing diyas, the camera glides forward in an expansive hero tracking move with rich dimensional parallax. Golden festive light streams warmly, revealing rich silk and zari textures while the customer holds a poised, graceful festive presence with a radiant, welcoming smile.`,
  ],
  boy: [
    `CINEMATIC SHOT DIRECTION:
In a joyful festive courtyard lined with warm decorative lights, the camera executes a gentle cinematic push-in. The child beams with a cheerful, proud festive smile and lively natural blinking while background festival lights shimmer softly.`,
    `CINEMATIC SHOT DIRECTION:
Floating festive lanterns and warm decorative lamps shimmer in the background as the camera executes an elegant smooth reveal. The child stands tall with a bright, charming celebratory smile and natural poise.`,
  ],
  girl: [
    `CINEMATIC SHOT DIRECTION:
Before an elegant festive palace balcony with glowing diyas and warm golden light, the camera tracks in smoothly with soft parallax. The girl presents a radiant, graceful festive smile with natural charm and celebratory elegance.`,
    `CINEMATIC SHOT DIRECTION:
Lively diya flames and soft golden bokeh shimmer gently as the camera executes a smooth orbital reveal. The girl holds an elegant festive posture with a bright, joyful festive smile and natural presence.`,
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

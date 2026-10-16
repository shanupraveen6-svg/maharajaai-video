export const MAHARAJA_CLIENT_ID = 'maharaja';
export const MAHARAJA_WORKSPACE_CODE = 'workspace';
export const TRY_ON_MIN_PURCHASE = 500;
export const AI_VIDEO_MIN_PURCHASE = 5000;
export const FESTIVE_TIER_MIN = Number(process.env.MAHARAJA_FESTIVE_TIER_MIN) || 500;
export const LUXURY_TIER_MIN = Number(process.env.MAHARAJA_LUXURY_TIER_MIN) || 3000;

/**
 * Repeat usage & duplicate limit enforcement.
 * During testing: FALSE (no block for repeated attempts, so developer & client can test from the same phone/device many times).
 * When going live: set to TRUE (or set ENFORCE_REPEAT_LIMITS=true in env).
 */
export const ENFORCE_REPEAT_LIMITS = process.env.ENFORCE_REPEAT_LIMITS === 'true';

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
- Image 1 is the authoritative real customer photograph.
- Image 2 is the authoritative garment reference photograph.

IDENTITY & FACE LOCK:
- Preserve the exact real customer identity from Image 1: facial structure, face shape, eyes, nose, mouth, jawline, ears, skin tone, hairstyle, hairline, facial hair, glasses, age appearance, height impression, and natural body proportions.
- Do NOT beautify into another person, change age, alter body weight, change skin complexion, make slimmer or heavier, or substitute the face.

GARMENT SPECIFICATION LOCK:
- Dress the customer in the exact uploaded garment from Image 2.
- Preserve: exact primary and secondary colors (do not shift colors; keep neutrals, gold, and zari authentic), fabric material texture (silk, cotton, georgette, velvet, linen), embroidery patterns, zari borders, neckline shape, sleeve length, drape, and silhouette.
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

/** Section 5: Master Image Universal Prefix */
export const MASTER_IMAGE_UNIVERSAL_PREFIX = `Create a hyper-photorealistic vertical 9:16 full-body Indian festive fashion photograph.

IDENTITY LOCK:
Preserve the exact real customer identity from the original customer photograph.
Preserve: facial structure, face shape, eyes, nose, mouth, jawline, forehead, ears when visible, beard/moustache, glasses, skin tone, hair texture, hairline, hairstyle, age appearance, body proportions, body size, height impression, shoulder width, natural likeness.
Do NOT: beautify into another person, change age, change body size, change skin complexion, make slimmer, make heavier, make taller, make younger, make older, change facial geometry, change ethnicity, replace hairstyle, or create a model-like substitute face.
Natural professional lighting and grooming are allowed. Identity remodeling is prohibited.

GARMENT LOCK:
Use the original garment references as authoritative.
Preserve: primary color, secondary colors, fabric appearance, embroidery, zari, motifs, borders, sleeves, neckline, silhouette, length, design, garment type. Do not redesign the garment.
Preserve neutral colours exactly: grey must remain grey and must never shift to beige, tan, khaki, cream, brown, or gold.

MANNEQUIN / HANGER ISOLATION:
Ignore any mannequin, hanger, rack, stand, shelf, store fixture or unrelated body visible in garment photographs. Transfer the textile garment only.

ANATOMY:
Exactly one real human subject. Natural human anatomy.
Two arms. Two hands. Five fingers per visible hand. Two legs. Two feet.
No duplicated limbs. No fused fingers. No missing limbs. No distorted hands. No deformed feet.

FRAMING:
Strict 9:16 vertical full-body framing. Entire head visible. Both feet fully visible.
Maintain comfortable floor space below the feet. Do not crop toes or heels.
Do not enlarge the subject so much that the feet approach the lower frame edge.
Subject stands naturally upright. Feet should be separated naturally enough to make each foot visually distinguishable. Avoid crossed legs. Avoid unstable poses.

FOOTWEAR:
Preserve existing footwear when visible. If the source customer is barefoot and traditional styling reasonably permits barefoot presentation, do not automatically invent shoes. Do not randomly replace footwear.

POSE:
Front-facing or very slight three-quarter standing pose. Both feet planted naturally. Hands resting calmly at the side, gently in front, or another simple stable pose. Avoid complicated finger gestures. Avoid hands overlapping each other unnecessarily.

FESTIVAL SAFETY:
No handheld burning lamps. No handheld diya. No handheld fire. No sparklers in customer hands. All burning lamps must be securely placed on the floor or fixed environmental surfaces.
For children: strictly age-appropriate, natural, cheerful, innocent, no adult glamour, no adult makeup styling, no sensual posing.

CLEAN FRAME:
No text. No titles. No captions. No subtitles. No logos. No brand marks. No watermarks. No random letters. No fake signage.

STYLE:
Photorealistic premium Indian retail campaign photography. Natural skin texture. Real fabric texture. Realistic lighting. No CGI appearance. No illustration. No anime. No plastic skin.`;

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

  return `${MASTER_IMAGE_UNIVERSAL_PREFIX}

SUBJECT: An ${subject}. ${safety}
ENVIRONMENT & SCENE: ${event.scene}.
Preserve exact customer identity, skin tone, body proportions, and exact garment design head-to-toe with both feet planted on the floor.`;
}

/** Universal H3 rules shared by all eight category/theme prompts. */
export const UNIVERSAL_HAILUO_VIDEO_BASE = `Create a 6-second vertical 9:16 cinematic festive fashion video using ONLY the provided approved master image.

LOCKS:
Preserve the exact identity, face, skin tone, facial features, age, hairstyle, and body proportions from the master image.
Preserve the exact garment colours, fabric texture, embroidery, zari patterns, borders, sleeves, neckline, silhouette, and design. No face morphing, no body reshaping, no outfit redesign.

SUBJECT & NATURAL PRESENCE:
Keep feet anchored to the floor (no walking, stepping, sliding, or turning).
The subject has lifelike, poised presence: natural gentle breathing motion, graceful subtle head tilt toward the camera with expressive eyes, and a warm radiant festive smile.
Subtle fluid textile physics: the delicate edge of the saree pallu / dupatta / garment hem flutters softly as if in a gentle ambient indoor breeze, bringing the textile to life while keeping all patterns and colors 100% exact.

CINEMATIC CAMERA:
Dynamic smooth camera motion: a graceful upward pedestal tilt and gentle push with depth parallax, showcasing the subject from head-to-toe while revealing the glowing festive ambiance. No jerky shaking, no rapid spinning, no disorienting roll. Full body head-to-toe visible.

ATMOSPHERIC BACKGROUND & LIGHTING:
Animate the festive environment matching the image: diya and lamp flames flicker with dynamic warm golden light cast on the floor. Soft festive bokeh lights twinkle and pulse gently in the background. Subtle golden light dust and warm festive embers drift gently through the ambient air behind the subject.

OUTPUT:
Start on the source image at frame 1. Seamless, high-production cinematic fashion commercial aesthetic. No blank intro, no text, no titles, no watermarks, no extra limbs.`;

export function buildEventVideoPrompt(category: CustomerCategory, eventId: EventId, promptSet: VideoPromptSet = 'set-1') {
  void promptSet;
  const event = getEventOption(eventId);
  const child = category === 'boy' || category === 'girl';

  const directionPlans: Record<CustomerCategory, string> = {
    women: 'CAMERA & MOTION: Elegant ascending vertical pedestal move with subtle parallax. Background temple lamps and floor diyas flicker with warm dynamic amber light reflections on the stone floor. Saree pallu / dupatta edge catches a gentle soft breeze with realistic fabric draping. The woman smiles warmly and gracefully.',
    men: 'CAMERA & MOTION: Low-to-eye-level dynamic hero pedestal move with subtle parallax. Background architectural lights and traditional kutthu vilakku flames flicker softly with amber radiance. The man stands with confident, dignified posture and a natural, warm smile.',
    girl: 'CAMERA & MOTION: Child eye-level gentle camera movement with warm festive depth. Background fairy lights and diyas twinkle softly. The young girl has a cheerful, natural festive smile with joyful innocent poise.',
    boy: 'CAMERA & MOTION: Child eye-level smooth cinematic move. Background festive lanterns and warm lights shimmer with festive celebration. The young boy stands with a bright, proud, and cheerful smile.',
  };
  const directionPlan = directionPlans[category];

  return `${UNIVERSAL_HAILUO_VIDEO_BASE}

${child ? 'CHILD SAFETY: Hands stay naturally at the sides. No handheld lamp, fire or sparkler.' : 'HANDS: Natural relaxed hand posture, no hand mutations or gesture changes.'}
${directionPlan}

EVENT ATMOSPHERE:
Event: ${event.label} - ${event.scene}.
The background lighting, ambient reflections, and particle effects strictly reflect the festive atmosphere of ${event.label}.

FINAL PRIORITY: Preserve identity and the exact outfit above all effects. If an effect threatens the face, anatomy, or garment colour, prioritize the subject stability.`;
}

/** Section 10: Manager Retry Fail-Safe Video Prompt */
export function buildFailSafeVideoPrompt(category?: CustomerCategory, eventId?: EventId) {
  void category;
  void eventId;
  return `FAIL-SAFE REGENERATION MODE.

Create an ultra-stable 6-second vertical 9:16 video from the exact approved master image.
This retry prioritizes identity and structural stability over cinematic movement.

ABSOLUTE IDENTITY AND GARMENT LOCK:
Preserve the exact face, identity, skin tone, age, hairstyle, body shape and proportions.
Preserve the exact garment colours, neutral colours, fabric, embroidery, zari, motifs, borders, sleeves, neckline, silhouette, length and fit.
No beautification, face replacement, body reshaping, garment redesign or colour shift.

ABSOLUTE CAMERA LOCK:
Camera remains 100% stationary for every frame.
No zoom. No push-in. No pan. No tilt. No orbit. No shake. No reframing.

ABSOLUTE BODY LOCK:
The subject remains in the exact source pose.
Feet remain fixed to their original floor coordinates.
Legs remain fixed. Waist remains fixed. Torso position remains fixed. Shoulders remain fixed.
Arms remain fixed. Hands remain fixed. Finger positions remain fixed. Head orientation remains fixed.
Hair silhouette remains fixed. Garment silhouette remains fixed.

ALLOWED HUMAN MOTION ONLY:
1. One very subtle natural eyelid blink.
2. Extremely small closed-mouth facial warmth/smile.
If maintaining identity requires less facial movement, keep the face completely still.

ENVIRONMENTAL MOTION ONLY:
Very gentle floor-lamp flame flicker.
Extremely subtle ambient light shimmer.
No object displacement.

ABSOLUTELY PROHIBITED:
walking, stepping, sliding, turning, dancing, breathing motion, arm movement, hand movement, finger movement, head rotation, fabric billowing, garment transformation, colour shift, camera movement, face morphing, body morphing, foot morphing, text, logos, watermarks, black intro frames.`;
}

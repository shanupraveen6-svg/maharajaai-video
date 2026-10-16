export const MAHARAJA_CLIENT_ID = 'maharaja';
export const MAHARAJA_WORKSPACE_CODE = 'workspace';
export const TRY_ON_MIN_PURCHASE = 500;
export const AI_VIDEO_MIN_PURCHASE = 5000;
export const FESTIVE_TIER_MIN = Number(process.env.MAHARAJA_FESTIVE_TIER_MIN) || 500;
export const LUXURY_TIER_MIN = Number(process.env.MAHARAJA_LUXURY_TIER_MIN) || 3000;

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

/** Plain garment-focused Try-On prompt: no festival scene, props or cinematic effects. */
export function buildTryOnPrompt(category: CustomerCategory) {
  const subject = category === 'men'
    ? 'adult man'
    : category === 'women'
      ? 'adult woman'
      : category === 'boy'
        ? 'young boy'
        : 'young girl';
  const safety = category === 'boy' || category === 'girl'
    ? 'Use child-safe, age-appropriate, natural styling with no adult glamour.'
    : 'Use modest, family-friendly, natural styling.';

  return `Create a photorealistic vertical 9:16 full-body virtual try-on image of the ${subject}. Preserve the exact customer's face, skin tone, hairstyle, body shape, body size and proportions. Dress the customer in the exact uploaded garment. Preserve the exact garment color, fabric, embroidery, patterns, borders, silhouette and fit. ${safety} Use a clean neutral premium retail studio background with natural realistic lighting. Natural standing posture with the full body visible head-to-toe, both feet visible and natural hands. Do not create a festival environment. No diyas, no rangoli, no flowers, no festive props, no cinematic effects, no text, no logos. The only purpose is to clearly show how this exact garment looks on this customer.`;
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

/** Section 8: Universal H3 Video Prompt (Safest Motion Policy - Locked-off Tripod) */
export const UNIVERSAL_HAILUO_VIDEO_BASE = `Create a 6-second vertical 9:16 cinematic fashion video using ONLY the provided approved master image.

SOURCE IMAGE LOCK:
The provided master image is the authoritative first frame.
Preserve the exact: customer identity, face, body proportions, garment, garment color, garment embroidery, fabric structure, hairstyle, pose, hand placement, foot placement, environment composition.
Do not redesign or reinterpret the subject.

CAMERA:
100% stable locked-off tripod composition.
Zero pan. Zero tilt. Zero rotation. Zero orbit. Zero handheld shake. Zero reframing. Zero zoom. Zero camera drift.
Keep the entire body visible from head to feet for all frames.

GROUNDING:
Both feet remain visually anchored to the exact same floor positions throughout the video.
Zero: walking, stepping, sliding, floating, treadmill motion, leg repositioning, foot rotation, stance change.

BODY:
No intentional body displacement. No turning. No pose change. No arm gesture. No hand gesture. No finger movement. No head turn.
Allow only imperceptible natural upper-chest breathing.

FACIAL MOTION:
Allow only subtle natural facial micro-expression.
One soft natural blink is allowed.
A very small natural closed-mouth smile may develop gradually.
No talking. No lip-sync. No exaggerated smile. No mouth deformation. No facial identity change.

GARMENT LOCK:
No garment transformation. No color change. No embroidery change. No border change. No fabric replacement. No sleeve transformation. No garment growth or shrinking. No uncontrolled fabric billowing.
Only extremely subtle physically realistic fabric response from breathing is allowed.

BACKGROUND MOTION:
Environmental motion only.
Allowed: gentle floor-diya flame flicker, subtle ambient golden light variation, very soft distant light shimmer, extremely subtle atmospheric dust particles when appropriate.
Do not move structural objects. Do not move lamps across the scene.

ANATOMY LOCK:
Maintain anatomically stable: face, eyes, hands, fingers, legs, feet.
No duplicated body parts. No fused fingers. No changing finger count. No melting hands. No warped feet. No morphing face. No body stretching.

CHILD SAFETY:
For child subjects: natural age-appropriate expression only, no glamour posing, no adult mannerisms, no dancing, no exaggerated body movement, no handheld fire.

CLEAN VIDEO:
Do not generate: text, captions, subtitles, words, letters, logos, watermarks, brand marks, UI elements.
Start with the visible master image immediately at frame 1. No black frame. No blank intro. No fade-in from black.`;

export function buildEventVideoPrompt(category: CustomerCategory, eventId: EventId, promptSet: VideoPromptSet) {
  const event = getEventOption(eventId);
  const child = category === 'boy' || category === 'girl';
  const feminine = category === 'women' || category === 'girl';

  const cameraPath = promptSet === 'set-2'
    ? 'Camera path: fixed locked-off tripod composition throughout all 6 seconds, keeping full body framed head-to-toe with zero camera shake, zero tilt, and zero horizontal panning.'
    : 'Camera path: ultra-smooth, slow 3% cinematic forward push-in on a stabilized tripod, keeping the full body framed head-to-toe.';

  const heldObject = child
    ? 'Child safety constraint: The child holds NO lamps, NO fire, and NO sparklers (replaces previous lit brass lamp in both hands for strict child protection). Both hands remain stationary and resting naturally at sides.'
    : 'Both arms, hands, and fingers remain stationary in their exact source-image positions in every frame.';

  const theme = promptSet === 'set-2'
    ? feminine
      ? 'Divine-touch set: animate only background gold rays, temple-lamp glow, soft Kutthu Vilakku flicker on granite floor, and slow background-only gold shimmer.'
      : 'Cracker set: animate only distant background festival illumination, soft amber glow, and gentle environmental reflections; no sparks crossing face or body.'
    : 'Premium festive set: animate only background practical festival lights, gentle floor diya flame flickers, and soft light sheen across the fabric.';

  let categoryAtmosphere = '';
  if (category === 'women') {
    if (promptSet === 'set-2') {
      categoryAtmosphere = "The woman remains completely composed and stationary with feet firmly planted on the granite floor. Her serene facial expression softens into a warm, gentle smile with a natural eye blink.";
    } else {
      categoryAtmosphere = "The woman stands poised with feet stationary on the terracotta stone floor. Her expression becomes slightly warmer with one subtle blink and a gentle closed-mouth smile. Floor diyas flicker naturally.";
    }
  } else if (category === 'men') {
    if (promptSet === 'set-2') {
      categoryAtmosphere = "Dignified, grounded posture with feet fixed to the granite floor. Slight natural upper-chest breathing and a subtle, respectful smile. Floor Kutthu Vilakku flames flicker softly.";
    } else {
      categoryAtmosphere = "Confident, steady stance with feet locked to the floor. Subtle chest breathing and a confident, warm smile. Background festival lights pulse gently with warm amber tones.";
    }
  } else if (category === 'girl') {
    if (promptSet === 'set-2') {
      categoryAtmosphere = "Gentle, poised standing posture with feet fixed on the stone floor. Hands remain still. The girl smiles sweetly and naturally. Traditional floor lamps cast a gentle warm glow.";
    } else {
      categoryAtmosphere = "Joyful, innocent standing posture with feet firmly planted. Hands remain relaxed at her sides. A cheerful smile lights up her face with a soft blink. Floor diyas flicker gently.";
    }
  } else {
    // boy
    if (promptSet === 'set-2') {
      categoryAtmosphere = "Calm, respectful posture with feet motionless on the stone floor. Subtle breathing and a polite, happy smile. Temple lamps on the floor flicker gently.";
    } else {
      categoryAtmosphere = "Upright, confident standing posture with feet locked to the floor. Hands remain stationary at his sides. A cheerful, bright smile spreads across his face.";
    }
  }

  return `${UNIVERSAL_HAILUO_VIDEO_BASE}

SUBJECT LOCK: the subject remains completely stationary for all 6 seconds. Feet remain fixed to the floor with zero walking, stepping, sliding, or turning. Legs, torso, shoulders, arms, hands, fingers, and head angle remain fixed in the exact source pose.
${heldObject}
${cameraPath}
${theme}

ATMOSPHERE & SETTING:
Event: ${event.label} - ${event.scene}.
${categoryAtmosphere}

Prohibited: walking, stepping, turning, dancing, waving, hand movement, head movement, body sway, breathing motion, garment motion, pose transition, lip-sync, dialogue, text, captions, extra limbs, face change or outfit change.`;
}

/** Section 10: Manager Retry Fail-Safe Video Prompt */
export function buildFailSafeVideoPrompt(category?: CustomerCategory, eventId?: EventId) {
  void category;
  void eventId;
  return `FAIL-SAFE REGENERATION MODE.

Create an ultra-stable 6-second vertical 9:16 video from the exact approved master image.
This retry prioritizes identity and structural stability over cinematic movement.

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
3. Imperceptible natural breathing only.
If maintaining identity requires less facial movement, keep the face completely still.

ENVIRONMENTAL MOTION ONLY:
Very gentle floor-lamp flame flicker.
Extremely subtle ambient light shimmer.
No object displacement.

ABSOLUTELY PROHIBITED:
walking, stepping, sliding, turning, dancing, arm movement, hand movement, finger movement, head rotation, fabric billowing, garment transformation, camera movement, face morphing, body morphing, foot morphing, text, logos, watermarks, black intro frames.`;
}

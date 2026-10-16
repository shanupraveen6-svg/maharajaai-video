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
export const UNIVERSAL_HAILUO_VIDEO_BASE = `Create a 6-second vertical 9:16 cinematic fashion video using ONLY the provided approved master image.

LOCKS: Preserve the exact identity, face, skin tone, age, hairstyle, body shape and proportions. Preserve the exact garment colours, neutral colours, fabric, embroidery, zari, motifs, borders, sleeves, neckline, silhouette, length and fit. No face morphing, beautification, body reshaping, outfit redesign or colour shift.

SUBJECT: Keep the source pose and head angle. Feet stay anchored. Legs, torso, shoulders, arms, hands and fingers stay fixed. Permit only one soft blink and one gradual restrained closed-mouth smile. No walking, stepping, sliding, turning, dancing, waving, talking, lip-sync, body sway or garment motion.

CAMERA: Follow only the stated camera plan. Use stabilized premium-fashion movement with no shake, roll, orbit, sudden acceleration or reframing. Keep the complete head and both feet visible in every frame.

EFFECTS: Animate only the stated background effects. Keep effects behind the subject; nothing crosses or alters the face or garment colour. Keep anatomy and structural objects stable. Children remain age-appropriate with no adult glamour or handheld fire.

OUTPUT: Start on the source image at frame 1. No black intro, text, logo, watermark, extra limbs or morphing.`;

export function buildEventVideoPrompt(category: CustomerCategory, eventId: EventId, promptSet: VideoPromptSet) {
  const event = getEventOption(eventId);
  const child = category === 'boy' || category === 'girl';

  const directionPlans: Record<CustomerCategory, Record<VideoPromptSet, string>> = {
    women: {
      'set-1': 'CAMERA PLAN: eye-level, ultra-smooth 3% forward push over 6 seconds. EFFECT PLAN: floor diyas flicker and warm background practical lights brighten gently. Keep light on the face and garment constant.',
      'set-2': 'CAMERA PLAN: slightly low premium angle, ultra-smooth 2% pull-back over 6 seconds. EFFECT PLAN: divine gold rays rise slowly behind the subject, temple lamps flicker, and a restrained gold halo shimmers in the background.',
    },
    men: {
      'set-1': 'CAMERA PLAN: slightly low hero angle, ultra-smooth 3% forward push over 6 seconds. EFFECT PLAN: warm architectural lights build gradually and floor lamps create stable background reflections.',
      'set-2': 'CAMERA PLAN: eye-level, ultra-smooth 2% right-to-left slider move over 6 seconds with no orbit. EFFECT PLAN: distant cracker illumination blooms silently behind the set with amber reflections; no sparks near the subject.',
    },
    girl: {
      'set-1': 'CAMERA PLAN: child eye-level, ultra-smooth 2% forward push over 6 seconds. EFFECT PLAN: soft floor-diya flicker and small background fairy lights twinkle slowly. Keep the presentation innocent and natural.',
      'set-2': 'CAMERA PLAN: child eye-level, ultra-smooth 2% pull-back over 6 seconds. EFFECT PLAN: gentle divine rays and temple-lamp glow animate only behind the child with a soft background gold shimmer.',
    },
    boy: {
      'set-1': 'CAMERA PLAN: child eye-level, ultra-smooth 2% left-to-right slider move over 6 seconds with no orbit. EFFECT PLAN: festive lanterns brighten gently and floor-lamp reflections shimmer behind the child.',
      'set-2': 'CAMERA PLAN: slightly low but age-appropriate angle, ultra-smooth 2% forward push over 6 seconds. EFFECT PLAN: distant cracker-colour illumination pulses softly behind the set; no sparks, smoke or flashes near the child.',
    },
  };
  const directionPlan = directionPlans[category][promptSet];

  let categoryAtmosphere = '';
  if (category === 'women') {
    if (promptSet === 'set-2') {
      categoryAtmosphere = "The woman remains completely composed and stationary with feet firmly planted on the granite floor. Her serene facial expression softens into a warm, gentle smile with a natural eye blink.";
    } else {
      categoryAtmosphere = "The woman stands poised with feet stationary on the terracotta stone floor. Her expression becomes slightly warmer with one subtle blink and a gentle closed-mouth smile. Floor diyas flicker naturally.";
    }
  } else if (category === 'men') {
    if (promptSet === 'set-2') {
      categoryAtmosphere = "Dignified, grounded posture with feet fixed to the granite floor. A subtle, respectful closed-mouth smile develops gradually. Floor Kutthu Vilakku flames flicker softly.";
    } else {
      categoryAtmosphere = "Confident, steady stance with feet locked to the floor. A confident, warm closed-mouth smile develops gradually. Background festival lights pulse gently with warm amber tones.";
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
      categoryAtmosphere = "Calm, respectful posture with feet motionless on the stone floor. A polite, happy closed-mouth smile develops gradually. Temple lamps on the floor flicker gently.";
    } else {
      categoryAtmosphere = "Upright, confident standing posture with feet locked to the floor. Hands remain stationary at his sides. A cheerful, bright smile spreads across his face.";
    }
  }

  return `${UNIVERSAL_HAILUO_VIDEO_BASE}

${child ? 'CHILD SAFETY: Hands stay naturally fixed at the sides. No handheld lamp, fire or sparkler.' : 'HANDS: Arms, hands and fingers stay in their exact source positions.'}
${directionPlan}

ATMOSPHERE & SETTING:
Event: ${event.label} - ${event.scene}.
${categoryAtmosphere}

FINAL PRIORITY: Preserve identity and the exact outfit above all effects. If an effect threatens the face, anatomy, garment colour or framing, omit that effect and keep the subject stable.`;
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

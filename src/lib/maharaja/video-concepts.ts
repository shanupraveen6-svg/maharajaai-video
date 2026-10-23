import type { CustomerCategory, EventId, GarmentType } from './config';

export const VIDEO_PROMPT_ARCHITECTURE_VERSION = 'diwali-v2';

export type VideoConceptId =
  | 'men-heritage-passage' | 'men-grand-arrival' | 'men-royal-lounge'
  | 'women-golden-courtyard' | 'women-heritage-balcony' | 'women-grand-hall'
  | 'girl-garden-lights' | 'girl-festive-arch' | 'girl-rangoli-evening'
  | 'boy-heritage-entrance' | 'boy-lantern-pathway' | 'boy-lighted-corridor';

export type VideoConcept = {
  id: VideoConceptId;
  category: CustomerCategory;
  title: string;
  mood: string;
  masterScene: string;
  finalPose: string;
  cameraMotion: string;
  environmentMotion: string;
};

const concepts: VideoConcept[] = [
  { id: 'men-heritage-passage', category: 'men', title: 'Heritage Passage', mood: 'A composed arrival through warm heritage light.', masterScene: 'A believable South Indian heritage colonnade at Diwali evening, warm lamps and restrained distant fireworks.', finalPose: 'Stand naturally with one hand resting low at the outer trouser pocket line and the other relaxed by the outer thigh; do not touch the shirt front.', cameraMotion: 'Begin with a restrained foreground rack-focus reveal, then make one slow straight dolly-in without changing viewpoint.', environmentMotion: 'Existing diya flames, distant fireworks and polished floor reflections move softly behind the subject.' },
  { id: 'men-grand-arrival', category: 'men', title: 'Grand Arrival', mood: 'A confident festive arrival in a real courtyard.', masterScene: 'A refined palace arrival courtyard with real stone, brass lamps, foliage and warm Diwali light.', finalPose: 'Stand upright with both hands relaxed at the outer thighs, shoulders open, no hand gesture.', cameraMotion: 'Use a slow pedestal-up from a slightly lower full-body framing into a stable hero framing, without revealing unseen sides.', environmentMotion: 'Existing lantern glow, foliage and distant fountain reflections animate gently behind the subject.' },
  { id: 'men-royal-lounge', category: 'men', title: 'The Royal Lounge', mood: 'A quiet, polished portrait with cinematic depth.', masterScene: 'A believable luxury heritage lounge with an existing carved chair nearby, warm lamps and muted festive detail; the subject remains standing.', finalPose: 'Stand with hands softly clasped below the waist in open space, clear of the garment.', cameraMotion: 'Use a subtle lens compression push with a soft focus settle, preserving the frontal camera angle.', environmentMotion: 'Existing lamp glow, distant bokeh and floor reflections shimmer softly behind the subject.' },
  { id: 'women-golden-courtyard', category: 'women', title: 'Golden Courtyard', mood: 'A luminous Diwali courtyard portrait.', masterScene: 'A believable heritage courtyard with rangoli, brass lamps, marigolds and warm evening illumination.', finalPose: 'Stand with one hand resting lightly at the outer hip and the other relaxed by the outer thigh; keep hands away from the garment front.', cameraMotion: 'Use one measured forward dolly with a gentle foreground focus reveal, retaining the original frontal viewpoint.', environmentMotion: 'Existing diya flames, soft foliage and floor reflections animate only in background space.' },
  { id: 'women-heritage-balcony', category: 'women', title: 'Heritage Balcony', mood: 'A calm night portrait above a lighted garden.', masterScene: 'A realistic heritage balcony overlooking a lighted water garden, distant fireworks and warm architectural lamps.', finalPose: 'Stand with one hand gently holding the opposite wrist below the waist, fully clear of the garment.', cameraMotion: 'Use a subtle optical push and controlled focus shift from nearby architecture to the subject.', environmentMotion: 'Existing water reflections, distant fireworks and lantern light shimmer behind the subject.' },
  { id: 'women-grand-hall', category: 'women', title: 'The Grand Hall', mood: 'An elegant festive portrait in a real hall.', masterScene: 'A grand but believable heritage hall with tall arches, diya-lined floor and restrained floral decoration.', finalPose: 'Stand in a soft side stance with both hands naturally low and clear of the garment.', cameraMotion: 'Use a slow forward slider of only a few centimetres with a gentle depth settle, retaining the original angle.', environmentMotion: 'Existing diya flames, distant bokeh and architectural reflections move subtly behind the subject.' },
  { id: 'girl-garden-lights', category: 'girl', title: 'Garden of Lights', mood: 'A bright, child-safe Diwali garden moment.', masterScene: 'A real heritage garden at evening with warm lanterns, distant lights and age-appropriate Diwali decoration.', finalPose: 'Stand child-safe with hands lightly together below the waist, no hand motion.', cameraMotion: 'Use a gentle child-eye-level optical push with a soft focus settle.', environmentMotion: 'Existing lanterns, leaves and distant light reflections move softly behind the child.' },
  { id: 'girl-festive-arch', category: 'girl', title: 'The Festive Arch', mood: 'A graceful portrait under a warm heritage arch.', masterScene: 'A believable carved heritage arch with marigolds, brass lamps and warm night lighting.', finalPose: 'Stand child-safe in a soft side stance with hands relaxed low at the outer thighs.', cameraMotion: 'Use one slow centred dolly-in, retaining full-body framing and original viewpoint.', environmentMotion: 'Existing diya flames and distant garden bokeh shimmer behind the child.' },
  { id: 'girl-rangoli-evening', category: 'girl', title: 'Rangoli Evening', mood: 'A joyful Diwali portrait with colour and light.', masterScene: 'A realistic rangoli courtyard with lamps placed around the floor edge and warm heritage walls.', finalPose: 'Stand child-safe with palms together in a still Namaste pose already present in the master image.', cameraMotion: 'Use a modest focus reveal followed by a very gentle forward optical push.', environmentMotion: 'Existing diya glow and floor reflections shimmer in empty background and floor space only.' },
  { id: 'boy-heritage-entrance', category: 'boy', title: 'Heritage Entrance', mood: 'A confident festive arrival at a real gateway.', masterScene: 'A believable heritage gateway courtyard with brass lamps, warm architecture and distant festive lights.', finalPose: 'Stand child-safe with both arms naturally relaxed at the outer thighs; no gesture.', cameraMotion: 'Use a calm child-eye-level dolly-in with a clean hero hold.', environmentMotion: 'Existing lamps, distant lights and floor reflections animate subtly behind the child.' },
  { id: 'boy-lantern-pathway', category: 'boy', title: 'Lantern Pathway', mood: 'A warm pathway portrait with rich Diwali depth.', masterScene: 'A real stone pathway with existing lanterns, foliage and warm Diwali illumination.', finalPose: 'Stand child-safe with hands softly clasped below the waist, clear of clothing.', cameraMotion: 'Use a restrained focus pull from a nearby lantern to the subject, then a slow straight push.', environmentMotion: 'Existing lantern glow, foliage and distant bokeh move gently behind the child.' },
  { id: 'boy-lighted-corridor', category: 'boy', title: 'The Lighted Corridor', mood: 'A polished full-body portrait in heritage light.', masterScene: 'A believable heritage corridor with diya-lined walls, warm arches and restrained distant fireworks.', finalPose: 'Stand child-safe in a still Namaste pose already present in the master image.', cameraMotion: 'Use a very slow optical push while retaining the exact frontal viewpoint.', environmentMotion: 'Existing diya flames, distant fireworks and polished floor reflections animate behind the child.' },
];

export const VIDEO_CONCEPTS = concepts;

export function conceptsForCategory(category: CustomerCategory) {
  return VIDEO_CONCEPTS.filter((concept) => concept.category === category);
}

export function getVideoConcept(value: unknown): VideoConcept | null {
  return typeof value === 'string' ? VIDEO_CONCEPTS.find((concept) => concept.id === value) || null : null;
}

export function buildVideoMasterPrompt(concept: VideoConcept, garmentType: GarmentType) {
  const childSafety = concept.category === 'boy' || concept.category === 'girl'
    ? 'Keep the child fully age-appropriate, naturally cheerful and free of adult glamour or mature posing.'
    : 'Keep the presentation family-friendly, refined and photorealistic.';
  return `Create a photorealistic vertical 9:16 full-body Diwali fashion portrait.\n\nREFERENCE AUTHORITY:\n- Image 1 is the real customer identity reference.\n- Garment images are the sole authority for the confirmed ${garmentType} garment.\n- Do not use, recreate, or blend any prior Try-On or prior generated image.\n\nIDENTITY AND GARMENT LOCK:\nPreserve the customer's face, age appearance, body proportions, hairstyle and skin tone. Preserve the exact garment silhouette, pieces, colours, borders, prints, texture, drape and accessories supplied in the garment references. Never convert the confirmed garment into another garment type.\n\nFINAL POSE AND EXPRESSION — CREATE THIS EXACTLY IN THE MASTER IMAGE:\n${concept.finalPose}\nUse a warm, natural, small festive smile that suits the real customer; preserve their identity and facial character. This final expression and pose are static. Do not depict a before-pose, a hand travel path, raised hand, chest touch, gesture transition, walking, turning, or body movement.\n\nSCENE:\n${concept.masterScene}\nUse rich but believable photography, premium 35mm editorial lighting, full body from head to footwear, no text, no logos, no watermark.\n\n${childSafety}`;
}

export function buildH3MotionPrompt(concept: VideoConcept, referenceRoles: string[], backup = false) {
  const roles = referenceRoles.length ? referenceRoles.join(', ') : 'confirmed garment references';
  if (backup) return `Create a premium six-second vertical Diwali fashion film from the approved master image. The master is absolute visual authority. Preserve the exact person, identity, garment, pose, hands, feet, composition and camera viewpoint from the first frame through the last. Do not move hands, arms, head, body, hair or garment. Do not add or remove objects. Keep ${roles} exactly unchanged. Apply only a subtle whole-frame optical push, restrained existing diya glow, distant bokeh and floor reflection shimmer behind the subject. No orbit, pan, tilt, side movement, body animation, effects across the subject, or perspective reconstruction.`;
  return `Create a premium six-second vertical Diwali fashion film from the approved master image. The master image is the absolute authority for identity, garment, styling, final pose, hands, feet, composition and framing. The garment references (${roles}) confirm exact garment construction only.\n\nSUBJECT LOCK: Start exactly as shown in the master and retain the exact pose and warm natural smile. No hand or arm motion, chest touch, gesture, walking, turning, posture change, smile progression, breathing motion, hair motion, garment motion, fabric flutter, or newly revealed side.\n\nCAMERA: ${concept.cameraMotion}\nENVIRONMENT: ${concept.environmentMotion}\n\nNever place an effect across the face, body, hands, feet, or garment. No orbit, drone, whip pan, hard cut, aggressive zoom, fisheye, or unexplained new object. Fidelity overrides cinematic motion.`;
}

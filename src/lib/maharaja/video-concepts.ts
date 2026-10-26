import type { CustomerCategory, EventId, GarmentType } from './config';

export const VIDEO_PROMPT_ARCHITECTURE_VERSION = 'festival-v6-two-shot-test';

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
  environmentMotion: string;
  effectMotion: string;
};

const concepts: VideoConcept[] = [
  { id: 'men-heritage-passage', category: 'men', title: 'Heritage Passage', mood: 'A composed arrival through warm heritage light.', masterScene: 'An expansive luxury South Indian palace exterior at Diwali evening: carved stone colonnade, a strong near-frame pillar, tall brass diya stands, polished courtyard, clear sky for distant fireworks, and layered amber practical lighting.', environmentMotion: 'Diya flames flicker at different depths; a wave of lanterns ignites down the colonnade; distant fireworks rise and bloom in the sky; warm reflections travel over polished stone.', effectMotion: 'A cinematic amber light beam sweeps the far arches through faint haze; brief gold spark trails and firework glow stay in the sky and background, never over the customer.' },
  { id: 'men-grand-arrival', category: 'men', title: 'Grand Arrival', mood: 'A confident festive arrival in a real courtyard.', masterScene: 'A refined palace arrival courtyard with real stone, brass lamps, lanterns, foliage, a small distant fountain, visible sky and warm Diwali light.', environmentMotion: 'Existing lanterns pulse softly, foliage moves in a faint breeze, fountain highlights sparkle, and stone-floor reflections remain physically consistent.', effectMotion: 'Add one distant firework light wash across the architecture and restrained edge bokeh in empty corners only.' },
  { id: 'men-royal-lounge', category: 'men', title: 'The Royal Lounge', mood: 'A quiet, polished portrait with cinematic depth.', masterScene: 'A believable luxury heritage lounge with an existing carved chair nearby, warm lamps and muted festive detail; the subject remains standing.', environmentMotion: 'Existing lamp flames, distant bokeh and floor reflections shimmer at different depths behind the customer.', effectMotion: 'Use subtle anamorphic highlight bloom on background lamps and a narrow warm light pass across the rear wall, never across the customer.' },
  { id: 'women-golden-courtyard', category: 'women', title: 'Golden Courtyard', mood: 'A luminous Diwali courtyard portrait.', masterScene: 'An expansive luxury heritage palace exterior at Diwali evening, with a carved stone courtyard, a tall brass diya stand in the near foreground, rangoli and marigolds behind the customer, distant fireworks and warm layered arches.', environmentMotion: 'Diya flames flicker independently; marigold strands and leaves sway; distant fireworks rise and bloom in the sky; golden reflections ripple across the courtyard at separate depths.', effectMotion: 'A cinematic warm light sweep travels across the far arches; brief gold spark trails and soft anamorphic flare catch the lamps, always behind the customer.' },
  { id: 'women-heritage-balcony', category: 'women', title: 'Heritage Balcony', mood: 'A calm night portrait above a lighted garden.', masterScene: 'A realistic heritage balcony overlooking a lighted water garden, distant fireworks and warm architectural lamps.', environmentMotion: 'Water reflections travel gently, distant fireworks bloom softly, and existing lanterns flicker behind the customer.', effectMotion: 'Add a delicate moonlit rim in the environment and one restrained distant firework glow reflected in the water, never altering the customer.' },
  { id: 'women-grand-hall', category: 'women', title: 'The Grand Hall', mood: 'An elegant festive portrait in a real hall.', masterScene: 'A grand but believable heritage hall with tall arches, diya-lined floor and restrained floral decoration.', environmentMotion: 'Diya rows flicker in depth, archway bokeh breathes softly, and polished architectural reflections move consistently behind the customer.', effectMotion: 'Use a subtle ceiling-to-floor background light sweep and restrained gold particles along the distant arch edges only.' },
  { id: 'girl-garden-lights', category: 'girl', title: 'Garden of Lights', mood: 'A bright, child-safe Diwali garden moment.', masterScene: 'A real heritage garden at evening with warm lanterns, distant lights and age-appropriate Diwali decoration.', environmentMotion: 'Existing lanterns twinkle softly, distant leaves move gently, and garden reflections shimmer behind the child.', effectMotion: 'Use small warm background firefly-like light points and soft corner bokeh only, with no effect entering the child silhouette.' },
  { id: 'girl-festive-arch', category: 'girl', title: 'The Festive Arch', mood: 'A graceful portrait under a warm heritage arch.', masterScene: 'A believable carved heritage arch with marigolds, brass lamps and warm night lighting.', environmentMotion: 'Existing diya flames flicker, marigold strands move faintly, and distant garden bokeh shimmers behind the child.', effectMotion: 'Add a restrained warm halo to background lamps and sparse golden particles beyond the arch, never overlapping the child.' },
  { id: 'girl-rangoli-evening', category: 'girl', title: 'Rangoli Evening', mood: 'A joyful Diwali portrait with colour and light.', masterScene: 'A realistic rangoli courtyard with lamps placed around the floor edge and warm heritage walls.', environmentMotion: 'Existing floor-edge diyas and warm wall lights flicker while floor reflections shimmer in empty space.', effectMotion: 'Use a soft radial background light pulse synchronized with the diya glow and tiny particles confined beyond the child outline.' },
  { id: 'boy-heritage-entrance', category: 'boy', title: 'Heritage Entrance', mood: 'A confident festive arrival at a real gateway.', masterScene: 'A believable heritage gateway courtyard with brass lamps, warm architecture and distant festive lights.', environmentMotion: 'Existing brass lamps flicker, distant lights twinkle, and courtyard floor reflections animate subtly behind the child.', effectMotion: 'Add one restrained distant firework glow above the gateway and soft edge bokeh outside the child silhouette.' },
  { id: 'boy-lantern-pathway', category: 'boy', title: 'Lantern Pathway', mood: 'A warm pathway portrait with rich Diwali depth.', masterScene: 'A real stone pathway with existing lanterns, foliage and warm Diwali illumination.', environmentMotion: 'Existing lantern flames, foliage and distant pathway bokeh move independently behind the child.', effectMotion: 'Use a narrow warm volumetric beam between background lanterns and a few floating background light specks, never across the child.' },
  { id: 'boy-lighted-corridor', category: 'boy', title: 'The Lighted Corridor', mood: 'A polished full-body portrait in heritage light.', masterScene: 'A believable heritage corridor with diya-lined walls, warm arches and restrained distant fireworks.', environmentMotion: 'Existing wall diyas flicker in sequence, distant fireworks bloom, and polished floor reflections travel naturally behind the child.', effectMotion: 'Add a restrained wave of warm illumination through the background arches and sparse particles in empty corridor space only.' },
];

const lateralShotPlans: Record<VideoConceptId, string> = {
  'men-heritage-passage': 'Track right past the near column; the distant arches drift left.',
  'men-grand-arrival': 'Track left past a foreground lantern; reveal the fountain beyond.',
  'men-royal-lounge': 'Track right past the carved chair edge; reveal the lamp wall.',
  'women-golden-courtyard': 'Track left past a lower-frame diya; reveal the rangoli and rear arches.',
  'women-heritage-balcony': 'Track left beside the near railing; distant water lights drift slowly.',
  'women-grand-hall': 'Track right past an arch edge; reveal the diya-lined hall.',
  'girl-garden-lights': 'Track right past a lantern at the outer edge; reveal the garden path.',
  'girl-festive-arch': 'Track left past the marigold arch edge; reveal the lit garden.',
  'girl-rangoli-evening': 'Track right past a floor-edge lamp; reveal the full rangoli.',
  'boy-heritage-entrance': 'Track left past the near gateway pillar; reveal the far arch.',
  'boy-lantern-pathway': 'Track right past a lantern at the outer edge; reveal the pathway.',
  'boy-lighted-corridor': 'Track left past the first corridor arch; reveal the repeating lights.',
};

const sampleCinematicPlans: Partial<Record<VideoConceptId, { camera: string; background: string }>> = {
  'women-golden-courtyard': {
    camera: 'CAMERA: 0-1s brisk stabilized horizontal reveal from behind the near diya stand. 1-4.5s continue the lateral track and gently dolly closer, with strong foreground-to-arch parallax. 4.5-6s ease to a centered full-body hero frame; never crop hands, feet or saree.',
    background: 'BACKGROUND + FX: Animate throughout. 0-2s diya flames dance and fine incense haze catches the light. 2-4.5s marigolds and leaves sway, distant fireworks streak upward and bloom, and reflections ripple across stone. 4.5-6s a bright layered firework blooms as a warm beam sweeps the far arches; gold sparks and lens flare remain behind the subject.',
  },
  'men-heritage-passage': {
    camera: 'CAMERA: 0-1s reveal from behind the near pillar at a modest elevated angle. 1-4s descend smoothly to eye level while dollying toward the man, creating strong column-to-arch parallax. 4-6s dolly back and settle into a centered full-body hero frame; keep hands and feet visible.',
    background: 'BACKGROUND + FX: Animate throughout. 0-2s diya flames flicker and lanterns ignite in a wave down the colonnade. 2-4.5s distant fireworks launch and bloom while gold reflections travel over the courtyard. 4.5-6s a bright sky burst lights the far arches; a cinematic amber beam and brief spark trails stay behind the subject.',
  },
};

const samplePoseDirections: Partial<Record<VideoConceptId, { master: string; video: string }>> = {
  'women-golden-courtyard': {
    master: 'Stand full-length with both feet visible and weight settled naturally. Rest the right hand on the hip with a relaxed elbow; let the left arm hang naturally beside the outer thigh. Keep both hands visible, below the chest, and clear of the saree drape.',
    video: 'Hold the right hand naturally on the hip and the left hand relaxed beside the outer thigh for the entire shot. Keep both hands visible and still; no hand-to-chest movement, clasp, Namaste, walking or body turn.',
  },
  'men-heritage-passage': {
    master: 'Stand full-length with both feet visible and weight balanced. Place both hands naturally at the front trouser pockets, thumbs visible outside, elbows relaxed. Keep the hands below the waist and clear of the kurta or jacket silhouette.',
    video: 'Keep both hands naturally at the front trouser pockets with thumbs visible and elbows relaxed for the entire shot. Hands remain below the waist; no hand-to-chest movement, clasp, Namaste, walking or body turn.',
  },
};

const handAnchors: Record<VideoConceptId, { prop: string; pose: string }> = {
  'men-heritage-passage': { prop: 'a solid stone column', pose: 'Rest the right palm lightly on the side of that column at hip height.' },
  'men-grand-arrival': { prop: 'a low stone parapet', pose: 'Rest the left hand lightly on the parapet top at hip height.' },
  'men-royal-lounge': { prop: 'a carved chair', pose: 'Rest the right hand on the chair back, away from the torso.' },
  'women-golden-courtyard': { prop: 'a carved stone ledge clear of the rangoli', pose: 'Rest the left fingertips on the ledge at hip height.' },
  'women-heritage-balcony': { prop: 'a sturdy balcony parapet', pose: 'Rest the right palm lightly on the parapet top at hip height.' },
  'women-grand-hall': { prop: 'a carved pillar', pose: 'Rest the left palm lightly on the pillar at hip height.' },
  'girl-garden-lights': { prop: 'a low garden wall at child hand height', pose: 'Rest the right hand on the garden wall, with the arm relaxed.' },
  'girl-festive-arch': { prop: 'a solid arch jamb at child hand height', pose: 'Rest the left fingertips on the side of the arch jamb.' },
  'girl-rangoli-evening': { prop: 'a low courtyard parapet clear of the rangoli', pose: 'Rest the right hand on the parapet top at comfortable child hand height.' },
  'boy-heritage-entrance': { prop: 'a solid gateway pillar at child hand height', pose: 'Rest the left palm on the side of the pillar.' },
  'boy-lantern-pathway': { prop: 'a low stone garden wall beside the pathway', pose: 'Rest the right hand on the wall at comfortable child hand height.' },
  'boy-lighted-corridor': { prop: 'a solid corridor column at child hand height', pose: 'Rest the left palm on the side of the column at comfortable child hand height.' },
};

const foregroundDetails: Record<VideoConceptId, string> = {
  'men-heritage-passage': 'a near stone column along the left frame edge',
  'men-grand-arrival': 'a brass lantern near the right frame edge',
  'men-royal-lounge': 'the carved chair edge in the lower-left foreground',
  'women-golden-courtyard': 'a brass diya at the lower-left frame edge',
  'women-heritage-balcony': 'the balcony rail entering along the lower frame edge',
  'women-grand-hall': 'a carved arch edge along the right frame edge',
  'girl-garden-lights': 'a garden lantern at the left frame edge',
  'girl-festive-arch': 'a marigold strand at the upper-right frame edge',
  'girl-rangoli-evening': 'a floor-edge diya beside the rangoli',
  'boy-heritage-entrance': 'a gateway pillar along the right frame edge',
  'boy-lantern-pathway': 'a pathway lantern at the left frame edge',
  'boy-lighted-corridor': 'the first corridor arch entering from the left frame edge',
};

const eventForegroundDetails: Partial<Record<EventId, string>> = {
  pongal: 'sugarcane leaves near the outer frame edge',
  'new-year': 'a strand of decorative lights near the outer frame edge',
  christmas: 'a decorated Christmas tree near the outer frame edge',
  ramadan: 'a hanging lantern near the outer frame edge',
  birthday: 'a small cluster of balloons near the outer frame edge',
};

const eventFilmSettings: Record<EventId, { label: string; set: string; motion: string; finish: string }> = {
  diwali: {
    label: 'Diwali',
    set: '',
    motion: '',
    finish: '',
  },
  pongal: {
    label: 'Pongal',
    set: 'A realistic South Indian heritage courtyard in morning light, with an existing kolam at the floor edge, sugarcane leaves at the outer frame edge, and sunlit stone architecture behind the customer. No cooking vessel or object in the customer\'s hands.',
    motion: 'Existing sugarcane leaves move in the breeze and sunlight travels across the rear wall and kolam edge. Nothing crosses the customer.',
    finish: 'A warm sunbeam reaches the far wall and its floor reflection.',
  },
  'new-year': {
    label: 'New Year',
    set: 'A refined heritage celebration hall with existing warm decorative lights at the outer frame edge, polished floor and elegant distant architecture. No confetti on the customer or object in their hands.',
    motion: 'Existing decorative lights brighten in sequence and their reflections travel across the distant floor. Keep all lights visible throughout.',
    finish: 'The rear architecture receives one celebratory light wash.',
  },
  christmas: {
    label: 'Christmas',
    set: 'A refined heritage hall with an existing decorated Christmas tree at the outer frame edge, warm window light and a distant festive arch. No gift or ornament in the customer\'s hands.',
    motion: 'Existing tree lights illuminate in sequence and warm window highlights move across the rear wall. The tree stays in place.',
    finish: 'The distant arch glows softly while the tree lights remain visible.',
  },
  ramadan: {
    label: 'Ramadan',
    set: 'A dignified heritage courtyard at evening with existing hanging lanterns at the outer frame edge, patterned rear wall and a visible crescent-lit sky. No lantern or object in the customer\'s hands.',
    motion: 'Existing lanterns glow in sequence and their patterned light shifts across the rear wall. Keep the lanterns fixed and visible.',
    finish: 'A warm glow settles across the far courtyard.',
  },
  birthday: {
    label: 'Birthday',
    set: 'An elegant heritage celebration room with existing decorative lights and distant balloons along the outer frame edge, a clear floor and warm architectural depth. No cake or gift in the customer\'s hands.',
    motion: 'Existing balloons sway behind the customer and decorative lights brighten in sequence. Nothing crosses the face or garment.',
    finish: 'The rear lights brighten for a clean celebratory finish.',
  },
};

const alternateEventCameras = [
  '0-1s: an existing foreground detail clears the outer frame edge. 1-4.5s: camera trucks sideways at the customer\'s eye height, showing clear near-to-far architectural parallax while keeping the full body in frame. 4.5-6s: settle as the background reaches its final light cue.',
  '0-1s: reveal the customer past an existing set detail at the frame edge. 1-4.5s: camera dollies diagonally backward, revealing more of the already visible set while keeping the face and garment sharp. 4.5-6s: hold on the full-body portrait and final background light cue.',
  '0-1s: reveal an existing floor detail at the lower frame edge. 1-4.5s: camera rises smoothly from waist-height to eye-height while keeping head and footwear visible. 4.5-6s: settle as the distant architecture receives the final light cue.',
] as const;

export const VIDEO_CONCEPTS = concepts;

export function conceptsForCategory(category: CustomerCategory) {
  return VIDEO_CONCEPTS.filter((concept) => concept.category === category);
}

export function getVideoConcept(value: unknown): VideoConcept | null {
  return typeof value === 'string' ? VIDEO_CONCEPTS.find((concept) => concept.id === value) || null : null;
}

export function buildVideoMasterPrompt(concept: VideoConcept, garmentType: GarmentType, eventId: EventId = 'diwali') {
  const event = eventFilmSettings[eventId];
  const anchor = handAnchors[concept.id];
  const childSafety = concept.category === 'boy' || concept.category === 'girl'
    ? 'Keep the child fully age-appropriate, naturally cheerful and free of adult glamour or mature posing.'
    : 'Keep the presentation family-friendly, refined and photorealistic.';
  const foreground = eventForegroundDetails[eventId] || foregroundDetails[concept.id];
  const samplePose = samplePoseDirections[concept.id];
  const posePrompt = samplePose?.master || `Stand naturally beside ${anchor.prop}, which must be solid, clearly visible and physically reachable, with both feet planted. ${anchor.pose} Keep the supported hand anatomically correct and visibly touching that support. The other arm hangs naturally beside the outer thigh. Both hands stay below the waist and outside the chest and garment. No held object, clasp, Namaste, hand-to-chest, step or crossed arms.`;
  const supportScene = samplePose ? 'Do not add a support object for the pose.' : `Include ${anchor.prop} beside the supported hand.`;
  return `Create a photorealistic vertical 9:16 full-body ${event.label} fashion-film opening frame, composed to animate naturally for six seconds. Frame the customer from head to footwear with both hands and both feet completely visible; use a natural full-length portrait perspective, not a tight crop.\n\nREFERENCE ROLES: Image 1 is the real customer and the sole authority for face, hair, age, skin tone, body proportions and identity. Images 2 onward show only the exact ${garmentType} and its labelled details. Never borrow a face, body, pose or background from a garment reference.\n\nIDENTITY AND WARDROBE LOCK: Preserve the customer's recognizable facial geometry, natural asymmetry, age, body shape, hairline, skin tone and real skin texture. Keep the expression natural. No makeup, beauty filter, face reshaping, skin smoothing, waxy/plastic/doll finish or glamour retouch. Reproduce the exact garment pieces, silhouette, colour, print, weave, embroidery, borders, neckline and drape from the garment references. Do not redesign, recolour, simplify or replace any part of it.\n\nFILMABLE POSE: ${posePrompt} Keep the face toward camera with a composed, natural expression and a slight warm smile. Leave clear space around the silhouette, head and footwear.\n\nLAYERED ${event.label.toUpperCase()} SET: ${eventId === 'diwali' ? concept.masterScene : event.set} Place ${foreground} as a real near-plane element, the unobstructed customer in the middle plane, and detailed luxury architecture in the far plane. Keep face, full garment and both hands readable. ${supportScene} Use practical lights, reflective surfaces and event details visible in the frame; no text, graphic overlay, motion trail or invented object.\n\nLIGHT AND CAMERA: Natural portrait-lens perspective and realistic full-body proportions. Soft frontal key light reveals the real eyes and skin texture; neutral fill preserves skin tone and exact garment colour; a restrained warm rim separates fabric from the set. Keep textile weave and embroidery crisp. Let the architecture carry the festive glow, not a beauty filter on the customer. Photographic realism, grounded anatomy, believable hands, natural fabric weight. No logo or watermark. ${childSafety}`;
}

export function buildH3MotionPrompt(
  concept: VideoConcept,
  referenceRoles: string[],
  eventId: EventId = 'diwali',
  referenceStyle: 'h3' | 'pixverse' = 'h3',
) {
  const event = eventFilmSettings[eventId];
  const anchor = handAnchors[concept.id];
  const isPixVerse = referenceStyle === 'pixverse';
  const masterRef = isPixVerse ? '@master' : 'Image 1';
  const garmentRef = (index: number) => isPixVerse ? `@garment${index + 1}` : `Image ${index + 2}`;
  const foreground = eventId === 'diwali' ? foregroundDetails[concept.id] : eventForegroundDetails[eventId] || 'a visible event decoration at the frame edge';
  const sampleCinematicPlan = eventId === 'diwali' ? sampleCinematicPlans[concept.id] : undefined;
  const camera = eventId === 'diwali'
    ? lateralShotPlans[concept.id]
    : alternateEventCameras[conceptsForCategory(concept.category).findIndex((item) => item.id === concept.id)];
  const background = eventId === 'diwali'
    ? `${concept.environmentMotion} ${concept.effectMotion}`
    : `${event.motion} ${event.finish}`;
  const samplePose = samplePoseDirections[concept.id];
  const poseDirection = samplePose?.video || `${anchor.pose} Keep the supported hand touching that same support throughout. Other hand relaxed beside outer thigh.`;
  const garmentReferences = referenceRoles.map((role, index) => `${garmentRef(index)} confirms ${role || `garment detail ${index + 1}`} only.`).join(' ');
  const cameraDirection = sampleCinematicPlan?.camera || `CAMERA: 0-1s begin a smooth physical move past ${foreground}. 1-4.5s ${camera} Create clear near-to-far depth parallax. 4.5-6s ease into a full-body hero frame.`;
  const backgroundDirection = sampleCinematicPlan?.background || `BACKGROUND: Animate only visible ${event.label} details throughout: ${background}`;
  return `${masterRef} is the approved exact opening frame and sole authority for the customer's face, natural skin, hair, body, outfit and composition. ${garmentReferences}\n\nSix-second vertical ${event.label} fashion film, one continuous real-time shot. Preserve identity and exact garment colour, pattern, border and drape. No makeup, face swap, plastic skin, wardrobe redesign, text or logo.\n\n${cameraDirection} Keep the customer sharp and full-body. The customer gives one natural blink and a small warm smile with subtle breathing; head stays nearly level and toward camera.\n${backgroundDirection}\n\nPOSE: ${poseDirection} Both hands stay below waist, away from chest and face; feet planted. No hand choreography. Preserve face, garment and natural anatomy. Effects stay behind the customer. No slow motion, freeze, digital zoom, orbit, shake, cut, transition or new prop.`;
}

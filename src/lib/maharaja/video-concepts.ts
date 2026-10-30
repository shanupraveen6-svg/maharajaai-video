import type { CustomerCategory, EventId, GarmentType } from './config';

export const VIDEO_PROMPT_ARCHITECTURE_VERSION = 'festival-v8-grounded-performance';

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
  { id: 'men-heritage-passage', category: 'men', title: 'Heritage Passage', mood: 'A composed arrival through warm heritage light.', masterScene: 'An expansive Thanjavur-inspired South Indian palace exterior at Diwali evening: carved granite colonnade, strong near-frame pillar, brass kuthu vilakku, kolam at the courtyard edge, banana-leaf torans, polished stone and clear sky for distant fireworks.', environmentMotion: 'Kuthu vilakku flames flicker at different depths; banana leaves stir; distant fireworks rise and bloom above the colonnade; warm reflections travel over polished stone.', effectMotion: 'A cinematic amber light beam sweeps the far pillars through faint haze; brief gold spark trails stay high in the sky and background, never over the customer.' },
  { id: 'men-grand-arrival', category: 'men', title: 'Grand Arrival', mood: 'A confident festive arrival in a real courtyard.', masterScene: 'A South Indian palace courtyard inspired by Thanjavur stonework, with a broad Athangudi-tile approach, brass kuthu vilakku, banana leaves and distant festive fireworks.', environmentMotion: 'The kuthu vilakku flames flicker independently, banana leaves sway, a distant rocket rises and blooms above the roofline, and reflections travel across the tile floor.', effectMotion: 'A warm beam sweeps the far colonnade; brief gold sparks stay high in the sky and never cross the customer.' },
  { id: 'men-royal-lounge', category: 'men', title: 'The Royal Lounge', mood: 'A quiet, polished portrait with cinematic depth.', masterScene: 'A Chettinad-inspired open-pillared veranda with a carved teak chair, brass kuthu vilakku, patterned Athangudi floor and deep garden beyond; the customer stands beside the chair.', environmentMotion: 'The lamp flame flickers, garden foliage moves in a light breeze, and warm reflections shift across the patterned floor.', effectMotion: 'A narrow amber light pass travels along the rear pillars; restrained lamp bloom and tiny gold flecks remain in the distant garden.' },
  { id: 'women-golden-courtyard', category: 'women', title: 'Golden Courtyard', mood: 'A luminous Diwali courtyard portrait.', masterScene: 'An expansive Chettinad-inspired South Indian palace exterior at Diwali evening, with a carved granite courtyard, tall brass kuthu vilakku in the near foreground, traditional kolam and marigolds behind the customer, banana-leaf torans and distant fireworks.', environmentMotion: 'Kuthu vilakku flames flicker independently; marigold strands and banana leaves sway; distant fireworks rise and bloom above the roofline; golden reflections ripple across the courtyard at separate depths.', effectMotion: 'A cinematic warm light sweep travels across the far pillars; brief gold spark trails and soft anamorphic flare catch the lamps, always behind the customer.' },
  { id: 'women-heritage-balcony', category: 'women', title: 'Heritage Balcony', mood: 'A calm night portrait above a lighted garden.', masterScene: 'A South Indian heritage balcony with carved stone balustrade, brass lamps, jasmine and marigold garlands, overlooking a temple-tank garden at Diwali.', environmentMotion: 'Water reflections travel gently, a distant rocket rises and blooms above the tree line, jasmine strands stir, and brass lamp flames flicker.', effectMotion: 'A soft gold reflection sweeps across the water; firework glow stays behind the roofline and never changes the customer.' },
  { id: 'women-grand-hall', category: 'women', title: 'The Grand Hall', mood: 'An elegant festive portrait in a real hall.', masterScene: 'A South Indian Chettinad celebration hall with polished Athangudi tiles, carved teak pillars, brass kuthu vilakku and marigold torans.', environmentMotion: 'Kuthu vilakku flames flicker at staggered depths, marigold torans sway lightly, and reflections move across the tiles.', effectMotion: 'A warm light sweep travels from the rear doorway across the far pillars; tiny gold particles remain near the distant lamps.' },
  { id: 'girl-garden-lights', category: 'girl', title: 'Garden of Lights', mood: 'A bright, child-safe Diwali garden moment.', masterScene: 'A safe South Indian heritage garden with low brass lamps placed well away from the child, kolam at the path edge, jasmine and banana leaves.', environmentMotion: 'Low lamp flames flicker, banana leaves sway, and distant garden lights brighten one after another behind the child.', effectMotion: 'Small warm light points drift only in the distant garden; no sparks, flame or effect approaches the child.' },
  { id: 'girl-festive-arch', category: 'girl', title: 'The Festive Arch', mood: 'A graceful portrait under a warm heritage arch.', masterScene: 'A South Indian carved granite entrance framed with marigold torans, brass lamps placed beyond reach, and a colourful kolam on the outer floor.', environmentMotion: 'Marigold strands sway gently, lamp flames flicker, and the far courtyard lights shimmer behind the child.', effectMotion: 'A restrained amber glow travels across the distant stone carving; a few gold flecks stay outside the child silhouette.' },
  { id: 'girl-rangoli-evening', category: 'girl', title: 'Rangoli Evening', mood: 'A joyful Diwali portrait with colour and light.', masterScene: 'A South Indian courtyard with a large traditional kolam made from coloured rice flour, brass lamps positioned around its outer edge, and a carved-pillared veranda.', environmentMotion: 'Outer-edge diya flames flicker in sequence, flower petals stir in a faint breeze, and warm reflections shift across the empty floor.', effectMotion: 'A soft ring of background light travels around the far edge of the kolam; no animated element crosses the child.' },
  { id: 'boy-heritage-entrance', category: 'boy', title: 'Heritage Entrance', mood: 'A confident festive arrival at a real gateway.', masterScene: 'A South Indian temple-town heritage gateway with carved granite, banana-leaf festoons, a kolam at the threshold and brass lamps placed safely to the sides.', environmentMotion: 'Banana leaves move in a light breeze, side lamps flicker, and distant fireworks bloom high beyond the gateway.', effectMotion: 'A brief warm firework glow reaches the upper stonework; all sparks remain distant and above the boy.' },
  { id: 'boy-lantern-pathway', category: 'boy', title: 'Lantern Pathway', mood: 'A warm pathway portrait with rich Diwali depth.', masterScene: 'A South Indian garden pathway lined with low kolam motifs, jasmine vines, banana leaves and brass lamps placed well away from the child.', environmentMotion: 'Banana leaves sway, lamp flames flicker at separate depths, and pathway reflections shimmer toward the far veranda.', effectMotion: 'A warm beam travels between distant pillars and a few soft gold light points drift only in the far background.' },
  { id: 'boy-lighted-corridor', category: 'boy', title: 'The Lighted Corridor', mood: 'A polished full-body portrait in heritage light.', masterScene: 'A South Indian pillared corridor with repeating brass kuthu vilakku, carved granite columns, Athangudi floor borders and marigold torans.', environmentMotion: 'Lamp flames brighten in sequence down the corridor, garlands move faintly, and floor reflections travel toward the far doorway.', effectMotion: 'A wave of warm illumination passes through the distant pillars; sparse gold particles remain in empty background space.' },
];

const lateralShotPlans: Record<VideoConceptId, string> = {
  'men-heritage-passage': 'Track right past the near column; the distant colonnade drifts left.',
  'men-grand-arrival': 'Track left past a foreground kuthu vilakku; reveal the kolam courtyard.',
  'men-royal-lounge': 'Track right past the carved teak chair edge; reveal the lamp-lit veranda.',
  'women-golden-courtyard': 'Track left past a lower-frame diya; reveal the rangoli and rear arches.',
  'women-heritage-balcony': 'Track left beside the carved balustrade; reveal the temple-tank reflections.',
  'women-grand-hall': 'Track right past a teak pillar; reveal the kuthu vilakku rows.',
  'girl-garden-lights': 'Track right past a lantern at the outer edge; reveal the garden path.',
  'girl-festive-arch': 'Track left past the marigold arch edge; reveal the lit garden.',
  'girl-rangoli-evening': 'Track right past an outer kolam diya; reveal the full kolam design.',
  'boy-heritage-entrance': 'Track left past the near gateway pillar; reveal the far arch.',
  'boy-lantern-pathway': 'Track right past a lantern at the outer edge; reveal the pathway.',
  'boy-lighted-corridor': 'Track left past the first granite column; reveal the repeating kuthu vilakku.',
};

const distinctCinematicPlans: Record<VideoConceptId, string> = {
  'men-heritage-passage': '',
  'men-grand-arrival': 'CAMERA: 0-1s start slightly elevated behind a foreground kuthu vilakku. 1-4s crane down while tracking left toward the customer; reveal the kolam and create clear lamp-to-pillar parallax. 4-6s ease backward to a full-body hero frame.',
  'men-royal-lounge': 'CAMERA: 0-1s let the chair edge frame the foreground. 1-4s make a smooth low-to-eye-level rising move while tracking right; reveal the veranda depth. 4-6s settle in a full-length composition.',
  'women-golden-courtyard': '',
  'women-heritage-balcony': 'CAMERA: 0-1s begin low beside the carved balustrade. 1-4s rise in a short jib move while tracking left; reveal water and garden layers with distinct parallax. 4-6s settle at eye level, full body visible.',
  'women-grand-hall': 'CAMERA: 0-1s frame through the near teak pillar. 1-4s glide laterally right, then make a gentle short push-in as the rear lamps emerge. 4-6s settle without cropping the saree or feet.',
  'girl-garden-lights': 'CAMERA: 0-1s reveal from behind a distant garden lantern at the frame edge. 1-4s track right at the child\'s eye level with clear garden parallax. 4-6s ease to a steady full-body frame.',
  'girl-festive-arch': 'CAMERA: 0-1s use the marigold arch edge as a soft foreground frame. 1-4s make a gentle diagonal push while panning slightly left to reveal the courtyard. 4-6s settle at child eye level with full body visible.',
  'girl-rangoli-evening': 'CAMERA: 0-1s start just above the kolam edge. 1-4s make a smooth shallow arc of no more than 20 degrees while lowering to eye level; keep the child facing camera and the full kolam legible. 4-6s settle in a full-body frame.',
  'boy-heritage-entrance': 'CAMERA: 0-1s reveal from behind the gateway pillar. 1-4s make a brisk stabilized forward track at the boy\'s eye level; stone layers slide with clear parallax. 4-6s ease back to a full-body hero frame.',
  'boy-lantern-pathway': 'CAMERA: 0-1s begin with a low pathway-lamp foreground. 1-4s rise smoothly while tracking right, revealing the long veranda and distant lights. 4-6s settle at eye level, full body visible.',
  'boy-lighted-corridor': 'CAMERA: 0-1s align the repeating columns in deep perspective. 1-4s dolly forward on a slight diagonal as the columns pass with visible parallax. 4-6s gently pull back to a centered full-body frame.',
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
    master: 'Stand full-length with both feet visible and weight balanced. For trousers, place both hands naturally at the front pockets with thumbs visible; for a dhoti or veshti, rest the right palm lightly on the broad top of the visible stone pillar at hip height, with the left arm relaxed beside the thigh. Keep both hands visible, below the waist, and outside the garment silhouette.',
    video: 'Keep the tested composed stance and let the camera perform the main move. For trousers, keep both hands at the front pockets; for a dhoti or veshti, keep the right palm resting on the visible pillar and the left arm relaxed at the side. Add a small natural weight shift and a subtle shoulder release, not a frozen mannequin hold. Hands stay below the waist; no hand-to-chest movement, clasp, Namaste or body turn.',
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
  const isChild = concept.category === 'boy' || concept.category === 'girl';
  const childSafety = isChild
    ? 'Keep the child fully age-appropriate, naturally cheerful and free of adult glamour or mature posing.'
    : 'Keep the presentation family-friendly, refined and photorealistic.';
  const foreground = eventForegroundDetails[eventId] || foregroundDetails[concept.id];
  const samplePose = samplePoseDirections[concept.id];
  const isDhoti = garmentType === 'dhoti_veshti' || garmentType === 'kurta_dhoti';
  const sampleMasterPose = concept.id === 'men-heritage-passage' && isDhoti
    ? samplePoseDirections[concept.id]!.master.replace(/For trousers,[\s\S]*?Keep both hands visible/, 'For a dhoti or veshti, rest the right palm lightly on the broad top of the visible stone pillar at hip height, with the left arm relaxed beside the thigh. Keep both hands visible')
    : samplePoseDirections[concept.id]?.master;
  const childPose = 'Stand naturally with both feet visible and place the palms gently together in a simple Namaste at mid-chest, fingers pointing upward, elbows relaxed and hands clear of the face. Keep the pose still and age-appropriate; no other gesture or held object.';
  const posePrompt = isChild ? childPose : sampleMasterPose || (samplePose?.master ?? `Stand naturally beside ${anchor.prop}, which must be solid, clearly visible and physically reachable, with both feet planted. ${anchor.pose} Keep the supported hand anatomically correct and visibly touching that support. The other arm hangs naturally beside the outer thigh. Both hands stay below the waist and outside the chest and garment. No held object, clasp, Namaste, hand-to-chest, step or crossed arms.`);
  const supportScene = isChild ? 'Do not add a support object or place anything in the child\'s hands.' : samplePose ? (isDhoti && concept.id === 'men-heritage-passage' ? 'Include a broad, visible stone pillar exactly beside the supported hand.' : 'Do not add a support object for the pose.') : `Include ${anchor.prop} beside the supported hand.`;
  return `Create a photorealistic vertical 9:16 full-body ${event.label} fashion-film opening frame, composed to animate naturally for six seconds. Frame the customer from head to footwear with both hands and both feet completely visible; use a natural full-length portrait perspective, not a tight crop.\n\nREFERENCE ROLES: Image 1 is the real customer and the sole authority for face, hair, age, skin tone, body proportions and identity. Images 2 onward show only the exact ${garmentType} and its labelled details. Never borrow a face, body, pose or background from a garment reference.\n\nIDENTITY AND WARDROBE LOCK: Preserve the customer's recognizable facial geometry, natural asymmetry, age, body shape, hairline, skin tone and real skin texture. Keep the expression natural. No makeup, beauty filter, face reshaping, skin smoothing, waxy/plastic/doll finish or glamour retouch. Reproduce the exact garment pieces, silhouette, colour, print, weave, embroidery, borders, neckline and drape from the garment references. Do not redesign, recolour, simplify or replace any part of it.\n\nFILMABLE POSE: ${posePrompt} Keep the face toward camera with a composed, natural expression and a slight warm smile. Leave clear space around the silhouette, head and footwear.\n\nLAYERED ${event.label.toUpperCase()} SET: ${eventId === 'diwali' ? concept.masterScene : event.set} Place ${foreground} as a real near-plane element, the unobstructed customer in the middle plane, and detailed luxury architecture in the far plane. Keep face, full garment and both hands readable. ${supportScene} Use practical lights, reflective surfaces and event details visible in the frame; no text, graphic overlay, motion trail or invented object.\n\nLIGHT AND CAMERA: Natural portrait-lens perspective and realistic full-body proportions. Soft frontal key light reveals the real eyes and skin texture; neutral fill preserves skin tone and exact garment colour; a restrained warm rim separates fabric from the set. Keep textile weave and embroidery crisp. Let the architecture carry the festive glow, not a beauty filter on the customer. Photographic realism, grounded anatomy, believable hands, natural fabric weight. No logo or watermark. ${childSafety}`;
}

export function buildH3MotionPrompt(
  concept: VideoConcept,
  referenceRoles: string[],
  eventId: EventId = 'diwali',
  referenceStyle: 'h3' | 'pixverse' = 'h3',
  garmentType: GarmentType = 'generic',
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
  const isDhoti = garmentType === 'dhoti_veshti' || garmentType === 'kurta_dhoti';
  const isChild = concept.category === 'boy' || concept.category === 'girl';
  const poseDirection = isChild
    ? 'Keep the child in the same simple Namaste pose shown in the approved opening frame, palms gently together at mid-chest, elbows relaxed; no hand movement or held object.'
    : samplePose
      ? (concept.id === 'men-heritage-passage' && isDhoti
        ? samplePose.video.replace(/For trousers,[\s\S]*?Add a small natural weight shift/, 'For a dhoti or veshti, keep the right palm on the visible pillar and the left arm relaxed at the side. Add a small natural weight shift')
        : samplePose.video)
      : `${anchor.pose} Keep the supported hand touching that same support throughout. Other hand relaxed beside outer thigh.`;
  const garmentReferences = referenceRoles.map((role, index) => `${garmentRef(index)} confirms ${role || `garment detail ${index + 1}`} only.`).join(' ');
  const cameraDirection = sampleCinematicPlan?.camera || distinctCinematicPlans[concept.id] || `CAMERA: 0-1s begin a smooth physical move past ${foreground}. 1-4.5s ${camera} Create clear near-to-far depth parallax. 4.5-6s ease into a full-body hero frame.`;
  const backgroundDirection = sampleCinematicPlan?.background || `BACKGROUND: Animate only visible ${event.label} details throughout: ${background}`;
  const identityLock = `${masterRef} locks the approved opening identity, face, hair, body, outfit and framing. ${garmentReferences} Keep the South Indian set and exact garment colour, pattern, border and drape. No makeup, face swap, plastic skin or wardrobe change.`;
  const groundedPerformance = isChild
    ? 'Keep both feet planted. Add one tiny natural weight settle through the knees and a subtle shoulder relaxation; no step, turn, sway or hand movement.'
    : 'Keep both feet planted. Add one small natural weight shift through the hips and knees plus a subtle shoulder release; no step, torso turn or uncontrolled sway.';
  const performance = `Keep face and fabric sharp; preserve full-body framing. One natural blink, a small warm smile and subtle breathing; head toward camera. ${groundedPerformance} Effects remain behind the customer.`;
  if (isPixVerse) {
    const handRule = isChild ? "Keep the child's Namaste pose unchanged." : 'Keep hands below waist and away from chest and face.';
    return `${identityLock}\nSix-second vertical ${event.label} fashion film, one continuous real-time shot.\n${cameraDirection} Create distinct foreground-to-background parallax.\n${performance} POSE: ${poseDirection} ${handRule}\n${backgroundDirection}\nNo slow motion, freeze, digital zoom, uncontrolled orbit, shake, cut, transition, text, logo or new prop.`;
  }
  const handRule = isChild ? "Keep the child's Namaste pose unchanged; no other hand gesture." : 'Keep both hands below waist, away from chest and face.';
  return `${masterRef} is the approved exact opening frame and sole authority for the customer's face, natural skin, hair, body, outfit and composition. ${garmentReferences}\n\nSix-second vertical ${event.label} fashion film, one continuous real-time shot. Preserve the South Indian set from the opening frame, customer identity and exact garment colour, pattern, border and drape. No makeup, face swap, plastic skin, wardrobe redesign, text or logo.\n\n${cameraDirection} Create distinct foreground-to-background parallax. Keep the customer's face and garment sharp; preserve full-body framing whenever the move allows. The customer gives one natural blink and a small warm smile with subtle breathing; head stays nearly level and toward camera. ${groundedPerformance}\n${backgroundDirection}\n\nPOSE: ${poseDirection} ${handRule} Avoid a rigid mannequin hold; use only the specific natural movement stated above. Preserve face, garment and natural anatomy. Effects stay behind the customer. No slow motion, freeze, digital zoom, uncontrolled orbit, shake, cut, transition or new prop.`;
}

/**
 * 100% Fail-Proof Medium-Flat Video Prompt:
 * Eliminates aggressive camera motion, foreground occlusion, or complex parallax.
 * Uses a stable, eye-level medium-flat composition that guarantees zero anatomical or garment distortion.
 */
export function buildFailProofMediumFlatMotionPrompt(
  concept: VideoConcept,
  referenceRoles: string[],
  eventId: EventId = 'diwali',
  referenceStyle: 'h3' | 'pixverse' = 'h3',
  garmentType: GarmentType = 'generic',
) {
  const event = eventFilmSettings[eventId];
  const isPixVerse = referenceStyle === 'pixverse';
  const masterRef = isPixVerse ? '@master' : 'Image 1';
  const garmentReferences = referenceRoles.map((role, index) => `${isPixVerse ? `@garment${index + 1}` : `Image ${index + 2}`} confirms ${role || `garment detail ${index + 1}`} only.`).join(' ');
  const isChild = concept.category === 'boy' || concept.category === 'girl';

  return `${masterRef} locks the approved opening identity, face, natural skin, hair, body, outfit and composition. ${garmentReferences}\n\nSix-second vertical 9:16 ${event.label} cinematic fashion film, one continuous real-time shot.\n\nFAIL-PROOF MEDIUM-FLAT CAMERA & MOTION:\n- Eye-level, stable medium-flat framing. Static stabilized camera without rapid dollies, sudden pans, or jarring cuts.\n- The subject remains centered in full-length hero posture facing the camera naturally.\n- Performance: Natural subtle breathing, a small warm smile, and a gentle natural blink. Both feet remain grounded on the floor.\n- No spinning, no walking, no extreme arm gestures. ${isChild ? "Keep child's gentle Namaste pose intact." : 'Keep hands relaxed naturally.'}\n- Fabric maintains realistic cloth gravity, rich authentic weave, and gentle natural drape.\n- Background: Soft, warm ambient lighting with gentle festive glow behind the subject.\n- 100% identity and garment preservation. Zero CGI, no face-swapping, no artificial makeup, no plastic skin, no extra limbs.`;
}

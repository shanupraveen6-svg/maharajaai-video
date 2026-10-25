import type { CustomerCategory, EventId, GarmentType } from './config';

export const VIDEO_PROMPT_ARCHITECTURE_VERSION = 'diwali-v3-natural-lock';

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
  environmentMotion: string;
  effectMotion: string;
};

const concepts: VideoConcept[] = [
  { id: 'men-heritage-passage', category: 'men', title: 'Heritage Passage', mood: 'A composed arrival through warm heritage light.', masterScene: 'A believable South Indian heritage colonnade at Diwali evening, warm lamps and restrained distant fireworks.', finalPose: 'Stand naturally with both arms hanging straight down and both hands open and relaxed beside the outer thighs, below the waist and clear of the torso and clothing.', environmentMotion: 'Existing diya flames flicker independently, distant fireworks bloom behind the colonnade, and polished floor reflections respond naturally.', effectMotion: 'Use a restrained warm volumetric light sweep through background haze and a few tiny golden particles confined to empty background space.' },
  { id: 'men-grand-arrival', category: 'men', title: 'Grand Arrival', mood: 'A confident festive arrival in a real courtyard.', masterScene: 'A refined palace arrival courtyard with real stone, brass lamps, lanterns, foliage, a small distant fountain, visible sky and warm Diwali light.', finalPose: 'Stand upright with both arms hanging straight down and both hands open and relaxed beside the outer thighs, below the waist and clear of the torso and clothing.', environmentMotion: 'Existing lanterns pulse softly, foliage moves in a faint breeze, fountain highlights sparkle, and stone-floor reflections remain physically consistent.', effectMotion: 'Add one distant firework light wash across the architecture and restrained edge bokeh in empty corners only.' },
  { id: 'men-royal-lounge', category: 'men', title: 'The Royal Lounge', mood: 'A quiet, polished portrait with cinematic depth.', masterScene: 'A believable luxury heritage lounge with an existing carved chair nearby, warm lamps and muted festive detail; the subject remains standing.', finalPose: 'Stand naturally with both arms hanging straight down and both hands open and relaxed beside the outer thighs, below the waist and clear of the torso and clothing.', environmentMotion: 'Existing lamp flames, distant bokeh and floor reflections shimmer at different depths behind the customer.', effectMotion: 'Use subtle anamorphic highlight bloom on background lamps and a narrow warm light pass across the rear wall, never across the customer.' },
  { id: 'women-golden-courtyard', category: 'women', title: 'Golden Courtyard', mood: 'A luminous Diwali courtyard portrait.', masterScene: 'A believable heritage courtyard with rangoli, brass lamps, marigolds and warm evening illumination.', finalPose: 'Stand naturally with both arms hanging straight down and both hands open and relaxed beside the outer thighs, below the waist and clear of the torso and garment.', environmentMotion: 'Existing diya flames, marigold strands, distant foliage and floor reflections animate at separate depths behind the customer.', effectMotion: 'Create restrained golden dust sparkle around the distant lamps and a soft background light ray, confined outside the body silhouette.' },
  { id: 'women-heritage-balcony', category: 'women', title: 'Heritage Balcony', mood: 'A calm night portrait above a lighted garden.', masterScene: 'A realistic heritage balcony overlooking a lighted water garden, distant fireworks and warm architectural lamps.', finalPose: 'Stand naturally with both arms hanging straight down and both hands open and relaxed beside the outer thighs, below the waist and clear of the torso and garment.', environmentMotion: 'Water reflections travel gently, distant fireworks bloom softly, and existing lanterns flicker behind the customer.', effectMotion: 'Add a delicate moonlit rim in the environment and one restrained distant firework glow reflected in the water, never altering the customer.' },
  { id: 'women-grand-hall', category: 'women', title: 'The Grand Hall', mood: 'An elegant festive portrait in a real hall.', masterScene: 'A grand but believable heritage hall with tall arches, diya-lined floor and restrained floral decoration.', finalPose: 'Stand in a soft side stance with both arms hanging naturally and both hands open beside the outer thighs, below the waist and clear of the torso and garment.', environmentMotion: 'Diya rows flicker in depth, archway bokeh breathes softly, and polished architectural reflections move consistently behind the customer.', effectMotion: 'Use a subtle ceiling-to-floor background light sweep and restrained gold particles along the distant arch edges only.' },
  { id: 'girl-garden-lights', category: 'girl', title: 'Garden of Lights', mood: 'A bright, child-safe Diwali garden moment.', masterScene: 'A real heritage garden at evening with warm lanterns, distant lights and age-appropriate Diwali decoration.', finalPose: 'Stand child-safe with both arms hanging naturally and both hands open beside the outer thighs, below the waist and clear of the torso and clothing.', environmentMotion: 'Existing lanterns twinkle softly, distant leaves move gently, and garden reflections shimmer behind the child.', effectMotion: 'Use small warm background firefly-like light points and soft corner bokeh only, with no effect entering the child silhouette.' },
  { id: 'girl-festive-arch', category: 'girl', title: 'The Festive Arch', mood: 'A graceful portrait under a warm heritage arch.', masterScene: 'A believable carved heritage arch with marigolds, brass lamps and warm night lighting.', finalPose: 'Stand child-safe in a soft side stance with both arms hanging naturally and both hands open beside the outer thighs, below the waist and clear of the torso and clothing.', environmentMotion: 'Existing diya flames flicker, marigold strands move faintly, and distant garden bokeh shimmers behind the child.', effectMotion: 'Add a restrained warm halo to background lamps and sparse golden particles beyond the arch, never overlapping the child.' },
  { id: 'girl-rangoli-evening', category: 'girl', title: 'Rangoli Evening', mood: 'A joyful Diwali portrait with colour and light.', masterScene: 'A realistic rangoli courtyard with lamps placed around the floor edge and warm heritage walls.', finalPose: 'Stand child-safe with both arms hanging naturally and both hands open beside the outer thighs, below the waist and clear of the torso and clothing.', environmentMotion: 'Existing floor-edge diyas and warm wall lights flicker while floor reflections shimmer in empty space.', effectMotion: 'Use a soft radial background light pulse synchronized with the diya glow and tiny particles confined beyond the child outline.' },
  { id: 'boy-heritage-entrance', category: 'boy', title: 'Heritage Entrance', mood: 'A confident festive arrival at a real gateway.', masterScene: 'A believable heritage gateway courtyard with brass lamps, warm architecture and distant festive lights.', finalPose: 'Stand child-safe with both arms hanging naturally and both hands open beside the outer thighs, below the waist and clear of the torso and clothing.', environmentMotion: 'Existing brass lamps flicker, distant lights twinkle, and courtyard floor reflections animate subtly behind the child.', effectMotion: 'Add one restrained distant firework glow above the gateway and soft edge bokeh outside the child silhouette.' },
  { id: 'boy-lantern-pathway', category: 'boy', title: 'Lantern Pathway', mood: 'A warm pathway portrait with rich Diwali depth.', masterScene: 'A real stone pathway with existing lanterns, foliage and warm Diwali illumination.', finalPose: 'Stand child-safe with both arms hanging naturally and both hands open beside the outer thighs, below the waist and clear of the torso and clothing.', environmentMotion: 'Existing lantern flames, foliage and distant pathway bokeh move independently behind the child.', effectMotion: 'Use a narrow warm volumetric beam between background lanterns and a few floating background light specks, never across the child.' },
  { id: 'boy-lighted-corridor', category: 'boy', title: 'The Lighted Corridor', mood: 'A polished full-body portrait in heritage light.', masterScene: 'A believable heritage corridor with diya-lined walls, warm arches and restrained distant fireworks.', finalPose: 'Stand child-safe with both arms hanging naturally and both hands open beside the outer thighs, below the waist and clear of the torso and clothing.', environmentMotion: 'Existing wall diyas flicker in sequence, distant fireworks bloom, and polished floor reflections travel naturally behind the child.', effectMotion: 'Add a restrained wave of warm illumination through the background arches and sparse particles in empty corridor space only.' },
];

const shotPlans: Record<VideoConceptId, string> = {
  'men-heritage-passage': '0-1s: foreground lamp wipes past the left edge. 1-4.5s: camera trucks right beside the columns; near pillars cross faster than far arches while the customer remains full-body. 4.5-6s: camera lands as one firework lights the rear arch and floor.',
  'men-grand-arrival': '0-1s: lantern reveals the customer from the lower frame edge. 1-4.5s: camera rises from waist-height to eye-height on one smooth pedestal, maintaining full-body framing as the fountain appears behind. 4.5-6s: hold on a distant firework glow across the courtyard.',
  'men-royal-lounge': '0-1s: carved chair edge clears the foreground. 1-4.5s: camera dollies diagonally backward, widening the visible lounge while holding the customer full-body at the same angle. 4.5-6s: settle as a warm light passes across the rear wall.',
  'women-golden-courtyard': '0-1s: a foreground diya passes across the lower frame edge. 1-4.5s: camera makes a short diagonal dolly from the rangoli toward the customer, keeping head and footwear visible while the rear arches shift in depth. 4.5-6s: settle as existing diya reflections brighten.',
  'women-heritage-balcony': '0-1s: near balcony rail reveals the customer without crossing her body. 1-4.5s: camera tracks left parallel to the rail at eye height; the water garden moves behind at a slower apparent speed. 4.5-6s: hold as one distant firework reflects in the water.',
  'women-grand-hall': '0-1s: reveal through one existing arch edge. 1-4.5s: camera lifts gently along the arch while tilting down just enough to keep the customer full-body; diya rows spread into view. 4.5-6s: settle as a warm light travels across the far ceiling.',
  'girl-garden-lights': '0-1s: a visible lantern clears the outer frame edge at child eye level. 1-4.5s: camera dollies backward along the path as the child takes one step, maintaining full-body scale and clear face. 4.5-6s: hold as existing garden lanterns twinkle in sequence.',
  'girl-festive-arch': '0-1s: a marigold strand moves past the outer frame edge. 1-4.5s: camera slides through the existing arch at child eye level; near carving crosses faster than the garden behind. 4.5-6s: hold as lamps under the arch brighten one after another.',
  'girl-rangoli-evening': '0-1s: reveal the full rangoli at the lower frame edge. 1-4.5s: camera rises smoothly from child waist-height to child eye-height while keeping the child head-to-foot in frame. 4.5-6s: settle as the floor-edge diya reflections brighten.',
  'boy-heritage-entrance': '0-1s: nearest gateway pillar wipes past the frame edge. 1-4.5s: camera trucks left at child eye level; the nearer gateway shifts faster than the rear arch. 4.5-6s: hold as one distant firework illuminates the gateway.',
  'boy-lantern-pathway': '0-1s: a lantern reveals the child at the outer frame edge. 1-4.5s: camera makes a short diagonal dolly backward along the path, preserving full-body framing while lanterns separate in depth. 4.5-6s: settle as far lanterns brighten in sequence.',
  'boy-lighted-corridor': '0-1s: first corridor arch clears the frame edge. 1-4.5s: camera travels forward through the repeating arches at child eye level, matching the child\'s single step and keeping head and footwear visible. 4.5-6s: settle as wall diyas light up down the far corridor.',
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
  const childSafety = concept.category === 'boy' || concept.category === 'girl'
    ? 'Keep the child fully age-appropriate, naturally cheerful and free of adult glamour or mature posing.'
    : 'Keep the presentation family-friendly, refined and photorealistic.';
  return `Create one photorealistic vertical 9:16 full-body ${event.label} fashion photograph.\n\nREFERENCE AUTHORITY: Image 1 is the real customer's identity reference. The garment images alone define the exact ${garmentType}. Do not use any previous generated portrait.\n\nIDENTITY AND GARMENT: Preserve facial geometry, natural asymmetry, age, body proportions, hairline, skin tone and real skin texture. Keep the customer's natural expression. No makeup, beauty filter, facial reshaping, skin smoothing or doll-like finish. Transfer the exact garment silhouette, pieces, colour, border, print, embroidery and drape. Never invent a different outfit.\n\nSTARTING POSE: ${concept.finalPose} Stand balanced with one foot slightly ahead, ready for a short natural step in the later video. Hands are relaxed below the waist and away from the garment front; no chest touch, clasp or Namaste. Leave 8 percent clear headroom and 8 percent space below the footwear.\n\nLUXURY ${event.label.toUpperCase()} SET: ${eventId === 'diwali' ? concept.masterScene : event.set} Show real depth between an existing foreground element at the frame edge, the customer, and the distant architecture. Place all background details visibly in this starting image so the video can animate them later; do not paint motion trails or graphic overlays into the still photograph. No object may cover the customer.\n\nLIGHT: A large soft fashion key reveals the real face and textile. Neutral fill preserves natural skin detail; a restrained warm rim separates the garment from the architecture. Let practical set lights enrich the surroundings without changing skin tone or dress colour. Full body from head to footwear. No text, logo or watermark. ${childSafety}`;
}

export function buildH3MotionPrompt(concept: VideoConcept, referenceRoles: string[], backup = false, eventId: EventId = 'diwali') {
  void referenceRoles;
  const event = eventFilmSettings[eventId];
  const camera = eventId === 'diwali' ? shotPlans[concept.id] : alternateEventCameras[conceptsForCategory(concept.category).findIndex((item) => item.id === concept.id)];
  const identity = 'The approved master is the sole visual authority. Keep the same recognizable face, age, skin texture, body shape, hairstyle and exact outfit colours, pattern, borders and drape in every frame. Photographic skin, not waxy or doll-like; no makeup, beauty filter, face swap or garment redesign.';
  const actions: Record<VideoConceptId, string> = {
    'men-heritage-passage': 'Take one measured step forward as the camera trucks, stop, then look into the lens with a confident smile.',
    'men-grand-arrival': 'Shift weight onto the front foot as the camera rises, lift the chin to meet the lens, then smile.',
    'men-royal-lounge': 'Turn the shoulders a few degrees toward the retreating camera, settle the stance, then smile.',
    'women-golden-courtyard': 'Take one short diagonal step beside the rangoli, stop with a balanced stance, then smile at the lens.',
    'women-heritage-balcony': 'Turn the head toward the water lights, return the gaze to the moving camera, then smile.',
    'women-grand-hall': 'Shift weight to the front foot while the camera rises, turn the shoulders toward the lens, then smile.',
    'girl-garden-lights': 'Take one playful short step down the path, stop, then give the camera a cheerful smile.',
    'girl-festive-arch': 'Look toward the existing arch lamps, return the gaze to camera, then smile naturally.',
    'girl-rangoli-evening': 'Take one small side step beside the rangoli, stop clear of the lamps, then smile at camera.',
    'boy-heritage-entrance': 'Take one short step through the gateway, stop, then smile at the camera.',
    'boy-lantern-pathway': 'Shift weight forward and take one short step along the path, then smile at the lens.',
    'boy-lighted-corridor': 'Take one short step in time with the advancing camera, stop, then give a cheerful smile.',
  };
  const performance = `Customer action: ${actions[concept.id]} One natural blink. Arms move naturally at the sides; hands stay below the waist and never lift toward chest, face or garment. No Namaste, clasp or hand-to-chest pose. Maintain the same face and outfit during the action.`;
  const environment = eventId === 'diwali'
    ? `Animate the existing scene continuously for all six seconds: ${concept.environmentMotion} ${concept.effectMotion} Existing lamps and lanterns remain in place and visible to the end; never dissolve, erase or replace them. Effects stay behind the person and must not cover face or clothing.`
    : `Animate only existing ${event.label} set details: ${event.motion} Finish with ${event.finish} All effects remain behind the person; never dissolve, erase or replace existing objects.`;
  if (backup) return `Six-second vertical ${event.label} fashion film. ${identity} ${performance} CAMERA CHOREOGRAPHY: ${camera} BACKGROUND ANIMATION: ${environment} Keep the customer full-body and sharp. No hard cut, face change, new prop or text.`;
  return `Create a six-second vertical cinematic ${event.label} fashion film from the approved master. ${identity}\n\n${performance}\n\nCAMERA CHOREOGRAPHY: ${camera}\nBACKGROUND ANIMATION: ${environment}\n\nDIRECTING: One continuous shot and one customer action. Begin the foreground reveal immediately. Show physical camera travel and depth parallax, not a digital zoom. Keep face, full body and footwear in frame. Preserve natural anatomy and fabric response. Use only architecture and props already visible in the master. No hard cut, orbit, new prop, text or sticker.`;
}

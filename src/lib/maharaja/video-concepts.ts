import type { CustomerCategory, GarmentType } from './config';

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
  'men-heritage-passage': '0-1.5s: glide past the visible foreground lamp at the frame edge. 1.5-4.5s: track sideways through the colonnade with distinct foreground and rear-arch parallax, keeping the customer full-body and sharp. 4.5-6s: settle as a firework illuminates the far arch and its floor reflection.',
  'men-grand-arrival': '0-1.5s: reveal the customer as the nearest existing lantern passes the frame edge. 1.5-4.5s: rise gently at the same frontal angle while the fountain and courtyard separate in depth. 4.5-6s: settle on the full-body portrait as a distant firework lights the stone behind him.',
  'men-royal-lounge': '0-1.5s: slide behind the existing carved chair edge without obscuring the face. 1.5-4.5s: pull back on a diagonal rail to reveal more of the already visible lounge, preserving body proportions. 4.5-6s: hold while the rear wall receives a warm light sweep.',
  'women-golden-courtyard': '0-1.5s: pass an existing foreground diya across one lower frame edge. 1.5-4.5s: travel sideways through the courtyard with rangoli and rear arches moving at different depths. 4.5-6s: settle full-body as the diya reflections and marigold-lit background brighten.',
  'women-heritage-balcony': '0-1.5s: reveal the customer past the near balcony rail at the frame edge. 1.5-4.5s: track sideways along the rail while the water garden shifts behind her at a different speed. 4.5-6s: hold as a distant firework reflects across the water.',
  'women-grand-hall': '0-1.5s: reveal through the nearest visible arch edge. 1.5-4.5s: glide laterally across the diya rows, letting the near arch and far arches separate in depth. 4.5-6s: settle full-body as a warm light wave travels across the distant ceiling.',
  'girl-garden-lights': '0-1.5s: pass a visible lantern at the outer frame edge at child eye level. 1.5-4.5s: track sideways through near foliage while garden lights separate behind the child. 4.5-6s: settle full-body as lanterns twinkle in a staggered sequence.',
  'girl-festive-arch': '0-1.5s: reveal past a near marigold strand at the frame edge. 1.5-4.5s: pull back through the existing arch with foreground carving moving faster than the distant garden. 4.5-6s: hold full-body as lamps under the arch brighten in sequence.',
  'girl-rangoli-evening': '0-1.5s: reveal from the nearest visible rangoli edge at child eye level. 1.5-4.5s: travel sideways above the patterned floor while wall lights slide at a slower depth. 4.5-6s: hold full-body as the floor-edge diya reflections brighten around the pattern.',
  'boy-heritage-entrance': '0-1.5s: reveal past the nearest visible gateway pillar edge. 1.5-4.5s: track sideways at child eye level while the second gateway arch separates in depth. 4.5-6s: settle full-body with one firework above the distant gateway.',
  'boy-lantern-pathway': '0-1.5s: reveal past a near lantern at the outer frame edge. 1.5-4.5s: track sideways along the visible pathway while lanterns and foliage move at different depths. 4.5-6s: settle full-body as the far lanterns brighten one after another.',
  'boy-lighted-corridor': '0-1.5s: reveal through the nearest existing corridor arch. 1.5-4.5s: glide sideways at child eye level through repeating arches with clear foreground depth. 4.5-6s: settle full-body as the distant wall diyas illuminate in sequence.',
};

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
  return `Create one photorealistic vertical 9:16 full-body Diwali fashion photograph.\n\nREFERENCE AUTHORITY: Image 1 is the real customer's identity reference. The garment images alone define the exact ${garmentType}. Do not use any previous generated portrait.\n\nIDENTITY AND GARMENT: Preserve facial geometry, natural asymmetry, age, body proportions, hairline, skin tone and real skin texture. Keep the customer's natural expression. No makeup, beauty filter, facial reshaping, skin smoothing or doll-like finish. Transfer the exact garment silhouette, pieces, colour, border, print, embroidery and drape. Never invent a different outfit.\n\nSTARTING POSE: ${concept.finalPose} Stand balanced with one foot slightly ahead, ready for a short natural step in the later video. Hands are relaxed below the waist and away from the garment front; no chest touch, clasp or Namaste. Leave 8 percent clear headroom and 8 percent space below the footwear.\n\nLUXURY DIWALI SET: ${concept.masterScene} Show real depth between an existing foreground element at the frame edge, the customer, and the distant architecture. Stage the existing lamps, reflections, festive flowers and distant lights so they can animate later; do not paint motion trails or graphic overlays into this still photograph. No object may cover the customer.\n\nLIGHT: A large soft fashion key reveals the real face and textile. Neutral fill preserves natural skin detail; a restrained warm rim separates the garment from the architecture. Let practical Diwali lights enrich the surroundings without changing skin tone or dress colour. Full body from head to footwear. No text, logo or watermark. ${childSafety}`;
}

export function buildH3MotionPrompt(concept: VideoConcept, referenceRoles: string[], backup = false) {
  void referenceRoles;
  const camera = shotPlans[concept.id];
  const identity = 'The approved master is the sole visual authority. Keep the same recognizable face, age, skin texture, body shape, hairstyle and exact outfit colours, pattern, borders and drape in every frame. Photographic skin, not waxy or doll-like; no makeup, beauty filter, face swap or garment redesign.';
  const categoryConcepts = conceptsForCategory(concept.category);
  const variant = categoryConcepts.findIndex((item) => item.id === concept.id);
  const adultActions = [
    'Take one short, natural step forward, then settle and smile toward the camera.',
    'Shift weight onto the front foot, turn the shoulders a few degrees toward camera, then hold a confident smile.',
    'Take one small diagonal step into the light, glance toward camera, then smile.',
    'Turn the head briefly toward the existing lights, then look back at camera with an easy smile.',
  ];
  const childActions = [
    'Take one playful short step forward, then stop and smile at camera.',
    'Shift weight from one foot to the other and give a cheerful natural smile.',
    'Turn the head toward the existing lights, then back to camera with a genuine smile.',
    'Take one small side step into the light and smile at camera.',
  ];
  const action = (concept.category === 'girl' || concept.category === 'boy' ? childActions : adultActions)[variant];
  const performance = `Customer action: ${action} One natural blink. Hands swing only below the waist alongside the body; never lift toward chest, face, hair or garment. No Namaste, clasp, pointing or hand-to-chest pose. Maintain the same face and outfit during the action.`;
  const environment = `Animate the existing scene continuously for all six seconds: ${concept.environmentMotion} ${concept.effectMotion} Existing lamps and lanterns remain in place and visible to the end; never dissolve, erase or replace them. Effects stay behind the person and must not cover face or clothing.`;
  if (backup) return `Six-second vertical Diwali fashion film. ${identity} ${performance} CAMERA CHOREOGRAPHY: ${camera} BACKGROUND ANIMATION: ${environment} Keep the customer full-body and sharp. No hard cut, face change, new prop or text.`;
  return `Create a six-second vertical cinematic fashion film from the approved master. ${identity}\n\n${performance}\n\nCAMERA CHOREOGRAPHY: ${camera}\nBACKGROUND ANIMATION: ${environment}\n\nDIRECTING: Begin the foreground reveal immediately. Make the camera travel and depth parallax visible, not a static zoom. Time the customer's single action with the moving camera; keep their full body, face and footwear in frame. Preserve natural anatomy and fabric motion. Use the luxurious architecture already present in the master; do not invent a replacement set. No hard cut, orbit, aggressive zoom, new prop, text or sticker.`;
}

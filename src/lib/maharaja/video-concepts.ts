import { GARMENT_TYPE_RULES, type CustomerCategory, type EventId, type GarmentType } from './config';

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
  { id: 'men-grand-arrival', category: 'men', title: 'Grand Arrival', mood: 'A confident festive arrival in a real courtyard.', masterScene: 'A South Indian palace courtyard inspired by Thanjavur stonework, with a broad Athangudi-tile approach, a far stone colonnade, brass kuthu vilakku, banana leaves and distant festive fireworks in the evening sky.', environmentMotion: 'The kuthu vilakku flames flicker independently, banana leaves sway, a distant rocket rises and blooms above the roofline, and reflections travel across the tile floor.', effectMotion: 'A warm beam sweeps the far colonnade; brief gold sparks stay high in the sky and never cross the customer.' },
  { id: 'men-royal-lounge', category: 'men', title: 'The Royal Lounge', mood: 'A quiet, polished portrait with cinematic depth.', masterScene: 'A Chettinad-inspired open-pillared veranda with a carved teak chair, brass kuthu vilakku, patterned Athangudi floor and a deep garden beyond under the Diwali night sky; the customer stands beside the chair.', environmentMotion: 'The lamp flame flickers, garden foliage moves in a light breeze, and warm reflections shift across the patterned floor.', effectMotion: 'A narrow amber light pass travels along the rear pillars; restrained lamp bloom and tiny gold flecks remain in the distant garden.' },
  { id: 'women-golden-courtyard', category: 'women', title: 'Golden Courtyard', mood: 'A luminous Diwali courtyard portrait.', masterScene: 'An expansive Chettinad-inspired South Indian palace exterior at Diwali evening, with a carved granite courtyard, tall brass kuthu vilakku in the near foreground, traditional kolam and marigolds behind the customer, banana-leaf torans and distant fireworks.', environmentMotion: 'Kuthu vilakku flames flicker independently; marigold strands and banana leaves sway; distant fireworks rise and bloom above the roofline; golden reflections ripple across the courtyard at separate depths.', effectMotion: 'A cinematic warm light sweep travels across the far pillars; brief gold spark trails and soft anamorphic flare catch the lamps, always behind the customer.' },
  { id: 'women-heritage-balcony', category: 'women', title: 'Heritage Balcony', mood: 'A calm night portrait above a lighted garden.', masterScene: 'A South Indian heritage balcony with carved stone balustrade, brass lamps, jasmine and marigold garlands, overlooking a temple-tank garden under the Diwali night sky.', environmentMotion: 'Water reflections travel gently, a distant rocket rises and blooms above the tree line, jasmine strands stir, and brass lamp flames flicker.', effectMotion: 'A soft gold reflection sweeps across the water; firework glow stays behind the roofline and never changes the customer.' },
  { id: 'women-grand-hall', category: 'women', title: 'The Grand Hall', mood: 'An elegant festive portrait in a real hall.', masterScene: 'A South Indian Chettinad celebration hall with polished Athangudi tiles, carved teak pillars, brass kuthu vilakku, marigold torans and a tall rear doorway glowing with lamplight.', environmentMotion: 'Kuthu vilakku flames flicker at staggered depths, marigold torans sway lightly, and reflections move across the tiles.', effectMotion: 'A warm light sweep travels from the rear doorway across the far pillars; tiny gold particles remain near the distant lamps.' },
  { id: 'girl-garden-lights', category: 'girl', title: 'Garden of Lights', mood: 'A bright, child-safe Diwali garden moment.', masterScene: 'A safe South Indian heritage garden at Diwali evening with low brass lamps placed well away from the child, kolam at the path edge, jasmine and banana leaves under an open night sky.', environmentMotion: 'Low lamp flames flicker, banana leaves sway, and distant garden lights brighten one after another behind the child.', effectMotion: 'Small warm light points drift only in the distant garden; no sparks, flame or effect approaches the child.' },
  { id: 'girl-festive-arch', category: 'girl', title: 'The Festive Arch', mood: 'A graceful portrait under a warm heritage arch.', masterScene: 'A South Indian carved granite entrance framed with marigold torans, brass lamps placed beyond reach, and a colourful kolam on the outer floor, with the Diwali night sky above the courtyard beyond.', environmentMotion: 'Marigold strands sway gently, lamp flames flicker, and the far courtyard lights shimmer behind the child.', effectMotion: 'A restrained amber glow travels across the distant stone carving; a few gold flecks stay outside the child silhouette.' },
  { id: 'girl-rangoli-evening', category: 'girl', title: 'Rangoli Evening', mood: 'A joyful Diwali portrait with colour and light.', masterScene: 'A South Indian courtyard at Diwali evening with a large traditional kolam made from coloured rice flour, brass lamps positioned around its outer edge, a carved-pillared veranda and an open night sky.', environmentMotion: 'Outer-edge diya flames flicker in sequence, flower petals stir in a faint breeze, and warm reflections shift across the empty floor.', effectMotion: 'A soft ring of background light travels around the far edge of the kolam; no animated element crosses the child.' },
  { id: 'boy-heritage-entrance', category: 'boy', title: 'Heritage Entrance', mood: 'A confident festive arrival at a real gateway.', masterScene: 'A South Indian temple-town heritage gateway with carved granite, banana-leaf festoons, a kolam at the threshold and brass lamps placed safely to the sides, under the Diwali night sky.', environmentMotion: 'Banana leaves move in a light breeze, side lamps flicker, and distant fireworks bloom high beyond the gateway.', effectMotion: 'A brief warm firework glow reaches the upper stonework; all sparks remain distant and above the boy.' },
  { id: 'boy-lantern-pathway', category: 'boy', title: 'Lantern Pathway', mood: 'A warm pathway portrait with rich Diwali depth.', masterScene: 'A South Indian garden pathway lined with low kolam motifs, jasmine vines, banana leaves and brass lamps placed well away from the child, leading to a long pillared veranda under the Diwali night sky.', environmentMotion: 'Banana leaves sway, lamp flames flicker at separate depths, and pathway reflections shimmer toward the far veranda.', effectMotion: 'A warm beam travels between distant pillars and a few soft gold light points drift only in the far background.' },
  { id: 'boy-lighted-corridor', category: 'boy', title: 'The Lighted Corridor', mood: 'A polished full-body portrait in heritage light.', masterScene: 'A South Indian pillared corridor with repeating brass kuthu vilakku, carved granite columns, Athangudi floor borders, marigold torans and a glowing far doorway.', environmentMotion: 'Lamp flames brighten in sequence down the corridor, garlands move faintly, and floor reflections travel toward the far doorway.', effectMotion: 'A wave of warm illumination passes through the distant pillars; sparse gold particles remain in empty background space.' },
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
  'men-grand-arrival': 'CAMERA: 0-1s start slightly elevated behind the brass lantern at the right frame edge. 1-4s crane down while tracking left toward the customer; reveal the tile approach and create clear lantern-to-colonnade parallax. 4-6s ease backward to a full-body hero frame.',
  'men-royal-lounge': 'CAMERA: 0-1s let the chair edge frame the foreground. 1-4s make a smooth low-to-eye-level rising move while tracking right; reveal the veranda depth. 4-6s settle in a full-length composition.',
  'women-golden-courtyard': '',
  'women-heritage-balcony': 'CAMERA: 0-1s begin low beside the carved balustrade. 1-4s rise in a short jib move while tracking left; reveal water and garden layers with distinct parallax. 4-6s settle at eye level, full body visible.',
  'women-grand-hall': 'CAMERA: 0-1s frame through the carved arch edge at the right frame edge. 1-4s glide laterally left, then make a gentle short push-in as the rear lamps emerge. 4-6s settle without cropping the saree or feet.',
  'girl-garden-lights': 'CAMERA: 0-1s reveal from behind the garden lantern at the left frame edge. 1-4s track right at the child\'s eye level with clear garden parallax. 4-6s ease to a steady full-body frame.',
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

/**
 * Each look's own location without Diwali decoration, so every event keeps the place the customer chose
 * (a garden stays a garden at Christmas). Each names the support its hand pose rests on.
 */
const conceptLocations: Record<VideoConceptId, string> = {
  'men-heritage-passage': 'An expansive Thanjavur-inspired South Indian palace exterior: a carved granite colonnade, a strong near-frame stone pillar, polished stone floor and open sky above.',
  'men-grand-arrival': 'A South Indian palace courtyard inspired by Thanjavur stonework, with a broad Athangudi-tile approach and a low stone parapet.',
  'men-royal-lounge': 'A Chettinad-inspired open-pillared veranda with a carved teak chair, a patterned Athangudi floor and a deep garden beyond; the customer stands beside the chair.',
  'women-golden-courtyard': 'An expansive Chettinad-inspired South Indian palace exterior with a carved granite courtyard, a carved stone ledge and tall arches.',
  'women-heritage-balcony': 'A South Indian heritage balcony with a carved stone balustrade and a sturdy parapet, overlooking a temple-tank garden.',
  'women-grand-hall': 'A South Indian Chettinad celebration hall with polished Athangudi tiles and carved teak pillars.',
  'girl-garden-lights': 'A safe South Indian heritage garden with a low garden wall, a stone path, jasmine and banana leaves.',
  'girl-festive-arch': 'A South Indian carved granite entrance arch with solid jambs, opening onto a courtyard.',
  'girl-rangoli-evening': 'A South Indian courtyard with a low parapet, an open stone floor and a carved-pillared veranda.',
  'boy-heritage-entrance': 'A South Indian temple-town heritage gateway with solid carved granite pillars.',
  'boy-lantern-pathway': 'A South Indian garden pathway beside a low stone garden wall, with jasmine vines and a veranda at the far end.',
  'boy-lighted-corridor': 'A South Indian pillared corridor with carved granite columns and Athangudi floor borders.',
};

/** How each event dresses a location (Diwali keeps each look's own tested Diwali scene). */
const eventDressing: Partial<Record<EventId, string>> = {
  pongal: 'Pongal morning in warm sunlight, with an existing kolam at the floor edge, sugarcane leaves at the outer frame edge and fresh flowers. No cooking vessel or object in the customer\'s hands.',
  'new-year': 'New Year evening, with existing warm decorative lights along the outer frame edge and an elegant celebratory glow on the architecture. No confetti on the customer or object in their hands.',
  christmas: 'Christmas, with an existing decorated Christmas tree at the outer frame edge, warm lamp light and tasteful seasonal decor. No gift or ornament in the customer\'s hands.',
  ramadan: 'Ramadan evening, with existing hanging lanterns at the outer frame edge, warm patterned light and a crescent moon wherever the sky shows. No lantern or object in the customer\'s hands.',
  birthday: 'A birthday celebration, with existing decorative lights and distant balloons along the outer frame edge and a clear floor. No cake or gift in the customer\'s hands.',
};

/** The festivals built like Diwali: one tested-style scene per look, not a generic dressing. */
export type FestivalId = 'christmas' | 'new-year' | 'pongal';
export const BUILT_FESTIVALS: readonly FestivalId[] = ['christmas', 'new-year', 'pongal'];
const isBuiltFestival = (eventId: EventId): eventId is FestivalId => (BUILT_FESTIVALS as readonly string[]).includes(eventId);

type FestivalScene = {
  /** The card's title and line on the TV and phone (Diwali keeps the concept's own). */
  title?: string;
  mood: string;
  /** The layered set for the portrait, in the same shape as the Diwali masterScene. */
  scene: string;
  /** The real near-plane detail the portrait includes and the camera reveals past. */
  foreground: string;
  /** What moves in the set (0-2 s), as Diwali's environmentMotion. */
  environment: string;
  /** The light effect (2-4.5 s), as Diwali's effectMotion; always behind the customer. */
  effect: string;
};

/**
 * Christmas, New Year and Pongal, each written the way the Diwali scenes are: the same South Indian place the
 * customer chose, dressed the way that festival is really celebrated in Tamil Nadu and Kerala, with motion and
 * light kept behind the customer. Family-friendly by rule: nothing in the customer's hands, no open flame near a
 * child, no snow, costume characters, alcohol, text or numbers, and every decoration fixed in place.
 */
const festivalScenes: Record<FestivalId, Record<VideoConceptId, FestivalScene>> = {
  christmas: {
    'men-heritage-passage': { title: 'Star Lantern Colonnade', mood: 'A composed Christmas evening arrival under star lanterns.', scene: 'An expansive Thanjavur-inspired South Indian palace exterior on Christmas evening: carved granite colonnade, strong near-frame stone pillar, paper star lanterns hanging between the arches, warm white string lights along the cornice, poinsettias in brass urns, polished stone and a clear evening sky.', foreground: 'a glowing paper star lantern hanging at the upper-left frame edge', environment: 'The star lanterns sway gently and glow, string lights twinkle along the colonnade, and warm reflections travel over the polished stone.', effect: 'A soft golden light sweep travels across the far pillars and tiny warm sparkles drift high in the evening sky, never over the customer.' },
    'men-grand-arrival': { title: 'Christmas Courtyard', mood: 'A confident festive arrival in a Christmas courtyard.', scene: 'A South Indian palace courtyard inspired by Thanjavur stonework on Christmas evening, with a broad Athangudi-tile approach, a low stone parapet, a tall decorated Christmas tree with warm gold lights at the far side, star lanterns along the far colonnade and poinsettias in brass urns.', foreground: 'a brass urn of red poinsettias at the right frame edge', environment: 'The tree lights twinkle in gentle sequence, the star lanterns sway, and warm reflections move across the tile floor.', effect: 'A warm golden glow rises behind the far colonnade and a few soft sparkles stay high in the sky.' },
    'men-royal-lounge': { title: 'Christmas Veranda', mood: 'A quiet Christmas portrait on a lamp-lit veranda.', scene: 'A Chettinad-inspired open-pillared veranda on Christmas night with a carved teak chair, a patterned Athangudi floor, a decorated Christmas tree with warm gold lights beside a far pillar, a paper star lantern at the veranda edge and a deep garden beyond; the customer stands beside the chair.', foreground: 'the carved chair edge in the lower-left foreground', environment: 'The tree lights twinkle softly, the star lantern sways in the breeze, and garden foliage moves gently.', effect: 'A narrow warm light pass travels along the rear pillars and tiny gold flecks glow in the distant garden.' },
    'women-golden-courtyard': { title: 'Star Lantern Courtyard', mood: 'A luminous Christmas courtyard portrait.', scene: 'An expansive Chettinad-inspired South Indian palace exterior on Christmas evening, with a carved granite courtyard, a carved stone ledge, tall arches hung with paper star lanterns, warm white string lights, white and gold drapes, poinsettias and a tall decorated Christmas tree in the far courtyard.', foreground: 'a brass urn of red poinsettias at the lower-left frame edge', environment: 'The star lanterns glow and sway at separate depths, string lights twinkle across the arches, and white drapes stir in a faint breeze.', effect: 'A cinematic warm light sweep crosses the far arches and soft golden sparkles drift behind the customer.' },
    'women-heritage-balcony': { title: 'Christmas Night Balcony', mood: 'A calm Christmas night portrait above a lighted garden.', scene: 'A South Indian heritage balcony with a carved stone balustrade on Christmas night, paper star lanterns hanging from the eaves, warm string lights along the parapet and a temple-tank garden below with a softly lit distant church bell tower.', foreground: 'the balcony rail with a strand of warm string lights along the lower frame edge', environment: 'The star lanterns sway, the garden lights shimmer on the water, and the string lights twinkle along the parapet.', effect: 'A soft gold reflection sweeps across the water and a gentle warm glow brightens the distant bell tower.' },
    'women-grand-hall': { title: 'The Christmas Hall', mood: 'An elegant Christmas portrait in a real hall.', scene: 'A South Indian Chettinad celebration hall at Christmas with polished Athangudi tiles, carved teak pillars wrapped in warm string lights, white and gold drapes, a tall decorated Christmas tree near the rear doorway and paper star lanterns overhead.', foreground: 'a carved arch edge with a hanging star lantern along the right frame edge', environment: 'The tree lights twinkle in sequence, the star lanterns turn slowly, and reflections move across the tiles.', effect: 'A warm light sweep travels from the rear doorway across the far pillars and tiny gold sparkles stay near the distant tree.' },
    'girl-garden-lights': { title: 'Christmas Garden', mood: 'A bright, child-safe Christmas garden moment.', scene: 'A safe South Indian heritage garden on Christmas evening with a low garden wall, a stone path, a small decorated Christmas tree with warm lights well away from the child, paper star lanterns hanging from the trees, jasmine and banana leaves.', foreground: 'a paper star lantern hanging at the left frame edge', environment: 'The star lanterns sway gently, the tree lights twinkle one after another, and banana leaves stir behind the child.', effect: 'Small warm light points drift only in the distant garden; nothing approaches the child.' },
    'girl-festive-arch': { title: 'The Star Arch', mood: 'A graceful portrait under a Christmas arch.', scene: 'A South Indian carved granite entrance arch with solid jambs on Christmas evening, framed with warm string lights and a large paper star lantern hanging at its centre, opening onto a courtyard with a decorated Christmas tree beyond.', foreground: 'a strand of warm string lights at the upper-right frame edge', environment: 'The star lantern turns slowly, the string lights twinkle, and the far tree lights shimmer behind the child.', effect: 'A restrained warm glow travels across the distant stone carving and a few gold flecks stay outside the child silhouette.' },
    'girl-rangoli-evening': { title: 'Star Kolam Evening', mood: 'A joyful Christmas portrait with a star kolam.', scene: 'A South Indian courtyard on Christmas evening with a large star-shaped kolam in white and red rice flour, a low parapet, a carved-pillared veranda hung with paper star lanterns and a small decorated Christmas tree at the far side.', foreground: 'the edge of the star kolam along the lower frame edge', environment: 'The star lanterns glow in sequence, poinsettia leaves stir, and warm reflections shift across the empty floor.', effect: 'A soft ring of warm light travels around the far edge of the kolam; nothing crosses the child.' },
    'boy-heritage-entrance': { title: 'Star Gateway', mood: 'A confident Christmas arrival at a real gateway.', scene: 'A South Indian temple-town heritage gateway with solid carved granite pillars on Christmas evening, a large paper star lantern hanging in the arch, warm string lights along the stonework and a decorated Christmas tree in the courtyard beyond.', foreground: 'a gateway pillar along the right frame edge', environment: 'The star lantern sways, the string lights twinkle along the gateway, and the far tree lights shimmer.', effect: 'A brief warm glow reaches the upper stonework; all light stays distant and above the boy.' },
    'boy-lantern-pathway': { title: 'Star Lantern Pathway', mood: 'A warm pathway portrait lit by star lanterns.', scene: 'A South Indian garden pathway beside a low stone garden wall on Christmas evening, lined with paper star lanterns hanging from the trees, jasmine vines and a long pillared veranda at the far end with a decorated Christmas tree.', foreground: 'a paper star lantern at the left frame edge', environment: 'The star lanterns sway at separate depths, banana leaves move, and pathway reflections shimmer toward the far veranda.', effect: 'A warm beam travels between the distant pillars and a few soft gold light points drift only in the far background.' },
    'boy-lighted-corridor': { title: 'The Christmas Corridor', mood: 'A polished Christmas portrait in a lighted corridor.', scene: 'A South Indian pillared corridor on Christmas evening with carved granite columns wrapped in warm string lights, paper star lanterns between the arches, Athangudi floor borders and a glowing far doorway with a decorated Christmas tree.', foreground: 'the first corridor arch with a star lantern entering from the left frame edge', environment: 'The star lanterns brighten in sequence down the corridor and floor reflections travel toward the far doorway.', effect: 'A wave of warm light passes through the distant pillars and sparse gold sparkles stay in empty background space.' },
  },
  'new-year': {
    'men-heritage-passage': { title: 'New Year Colonnade', mood: 'A composed New Year evening arrival.', scene: 'An expansive Thanjavur-inspired South Indian palace exterior on New Year evening: carved granite colonnade, strong near-frame stone pillar, brass kuthu vilakku, warm golden string lights along the cornice, jasmine and marigold garlands, polished stone and a clear sky for distant fireworks.', foreground: 'a near stone column along the left frame edge', environment: 'Golden string lights twinkle along the colonnade, garlands sway, distant fireworks rise and bloom above the roofline, and warm reflections travel over the stone.', effect: 'A cinematic golden light beam sweeps the far pillars and bright spark trails stay high in the sky, never over the customer.' },
    'men-grand-arrival': { title: 'New Year Courtyard', mood: 'A confident New Year arrival in a real courtyard.', scene: 'A South Indian palace courtyard inspired by Thanjavur stonework on New Year evening, with a broad Athangudi-tile approach, a low stone parapet, golden string lights draped across the far colonnade, marigold garlands and a clear evening sky with distant fireworks.', foreground: 'a brass kuthu vilakku at the right frame edge', environment: 'The string lights brighten in sequence, garlands sway, a distant rocket rises and blooms above the roofline, and reflections travel across the tiles.', effect: 'A warm beam sweeps the far colonnade and gold sparkles stay high in the sky.' },
    'men-royal-lounge': { title: 'New Year Veranda', mood: 'A polished New Year portrait with cinematic depth.', scene: 'A Chettinad-inspired open-pillared veranda on New Year night with a carved teak chair, brass kuthu vilakku, golden string lights along the eaves, a patterned Athangudi floor and a deep garden beyond under a night sky with distant fireworks; the customer stands beside the chair.', foreground: 'the carved chair edge in the lower-left foreground', environment: 'The lamp flame flickers, the string lights twinkle, and distant fireworks bloom above the garden.', effect: 'A narrow golden light pass travels along the rear pillars and tiny gold flecks glow in the distant garden.' },
    'women-golden-courtyard': { title: 'Golden Lights Courtyard', mood: 'A luminous New Year courtyard portrait.', scene: 'An expansive Chettinad-inspired South Indian palace exterior on New Year evening, with a carved granite courtyard, a carved stone ledge, tall arches draped with golden string lights, jasmine and marigold garlands, brass lamps and distant fireworks in the evening sky.', foreground: 'a brass lamp stand at the lower-left frame edge', environment: 'Golden string lights twinkle across the arches, garlands sway, and distant fireworks rise and bloom above the roofline.', effect: 'A bright layered firework blooms in the far sky as a warm beam sweeps the arches; gold sparks stay behind the customer.' },
    'women-heritage-balcony': { title: 'Fireworks Balcony', mood: 'A calm New Year night above a lighted garden.', scene: 'A South Indian heritage balcony with a carved stone balustrade on New Year night, golden string lights along the parapet, jasmine garlands and a temple-tank garden below under a night sky with distant fireworks.', foreground: 'the balcony rail with golden string lights along the lower frame edge', environment: 'Fireworks bloom above the tree line and reflect in the water, jasmine strands stir, and the string lights twinkle.', effect: 'A soft gold reflection sweeps across the water; the firework glow stays behind the roofline.' },
    'women-grand-hall': { title: 'The New Year Hall', mood: 'An elegant New Year portrait in a real hall.', scene: 'A South Indian Chettinad celebration hall on New Year evening with polished Athangudi tiles, carved teak pillars wrapped in golden string lights, marigold and jasmine torans, brass lamps and a tall rear doorway glowing with warm light.', foreground: 'a carved arch edge along the right frame edge', environment: 'The string lights brighten in sequence, torans sway lightly, and reflections move across the tiles.', effect: 'A warm golden light burst blooms through the rear doorway with a gentle gold glitter cascade behind the customer.' },
    'girl-garden-lights': { title: 'New Year Garden', mood: 'A bright, child-safe New Year garden moment.', scene: 'A safe South Indian heritage garden on New Year evening with a low garden wall, a stone path, golden string lights hanging in the trees well away from the child, jasmine, banana leaves and an open sky with distant soft fireworks.', foreground: 'a strand of golden string lights at the left frame edge', environment: 'The garden lights brighten one after another, banana leaves sway, and distant fireworks bloom softly high above the trees.', effect: 'Small warm light points drift only in the distant garden; no spark or effect approaches the child.' },
    'girl-festive-arch': { title: 'The Lights Arch', mood: 'A graceful New Year portrait under a lit arch.', scene: 'A South Indian carved granite entrance arch with solid jambs on New Year evening, framed with marigold torans and golden string lights, opening onto a courtyard with distant soft fireworks in the sky.', foreground: 'a marigold strand at the upper-right frame edge', environment: 'Marigold strands sway, the string lights twinkle, and distant fireworks bloom softly beyond the courtyard.', effect: 'A restrained golden glow travels across the distant carving and a few gold flecks stay outside the child silhouette.' },
    'girl-rangoli-evening': { title: 'New Year Kolam', mood: 'A joyful New Year portrait with colour and light.', scene: 'A South Indian courtyard on New Year evening with a large colourful kolam of flowers and coloured rice flour, a low parapet, a carved-pillared veranda with golden string lights and an open sky with distant soft fireworks.', foreground: 'the colourful kolam edge along the lower frame edge', environment: 'The veranda lights brighten in sequence, flower petals stir in a faint breeze, and distant fireworks bloom softly.', effect: 'A soft ring of golden light travels around the far edge of the kolam; nothing crosses the child.' },
    'boy-heritage-entrance': { title: 'New Year Gateway', mood: 'A confident New Year arrival at a real gateway.', scene: 'A South Indian temple-town heritage gateway with solid carved granite pillars on New Year evening, banana-leaf festoons, golden string lights along the stonework and a night sky with distant fireworks.', foreground: 'a gateway pillar along the right frame edge', environment: 'Banana leaves move in a light breeze, the string lights twinkle, and distant fireworks bloom high beyond the gateway.', effect: 'A brief warm firework glow reaches the upper stonework; all sparks stay distant and above the boy.' },
    'boy-lantern-pathway': { title: 'Golden Lights Pathway', mood: 'A warm New Year pathway portrait.', scene: 'A South Indian garden pathway beside a low stone garden wall on New Year evening, with golden string lights hanging in the trees, jasmine vines and a long pillared veranda at the far end under a sky with distant soft fireworks.', foreground: 'a strand of golden string lights at the left frame edge', environment: 'The string lights brighten at separate depths, banana leaves sway, and distant fireworks bloom softly.', effect: 'A warm beam travels between the distant pillars and soft gold light points drift only in the far background.' },
    'boy-lighted-corridor': { title: 'The New Year Corridor', mood: 'A polished New Year portrait in a lighted corridor.', scene: 'A South Indian pillared corridor on New Year evening with carved granite columns wrapped in golden string lights, marigold torans, Athangudi floor borders and a far doorway glowing with warm light.', foreground: 'the first corridor arch entering from the left frame edge', environment: 'The string lights brighten in sequence down the corridor and floor reflections travel toward the far doorway.', effect: 'A wave of golden light rushes down the corridor from the far doorway with a gentle gold glitter cascade behind the boy.' },
  },
  pongal: {
    'men-heritage-passage': { title: 'Sugarcane Colonnade', mood: 'A composed Pongal morning arrival in sunlight.', scene: 'An expansive Thanjavur-inspired South Indian palace exterior on Pongal morning: carved granite colonnade, strong near-frame stone pillar, tall sugarcane stalks tied to the pillars, a mango-leaf thoranam across the arches, a colourful kolam on the courtyard floor, polished stone and a clear morning sky with soft sunrise light.', foreground: 'a tall sugarcane stalk tied to the near pillar at the left frame edge', environment: 'Sugarcane leaves and the mango-leaf thoranam stir in the morning breeze and sunlight travels slowly across the colonnade and the kolam.', effect: 'A warm sunbeam sweeps the far pillars through soft golden dust, always behind the customer.' },
    'men-grand-arrival': { title: 'Pongal Courtyard', mood: 'A confident Pongal arrival in a sunlit courtyard.', scene: 'A South Indian palace courtyard inspired by Thanjavur stonework on Pongal morning, with a broad Athangudi-tile approach, a low stone parapet, a decorated clay Pongal pot with a turmeric plant tied at its neck resting on a kolam at the far side, sugarcane stalks and banana leaves at the entrance and soft sunrise light.', foreground: 'sugarcane stalks and banana leaves at the right frame edge', environment: 'Banana leaves sway, sugarcane leaves stir, and morning light moves across the tile floor.', effect: 'A golden sunbeam sweeps the far colonnade and fine golden dust floats in the light.' },
    'men-royal-lounge': { title: 'Pongal Veranda', mood: 'A quiet Pongal morning portrait on a sunlit veranda.', scene: 'A Chettinad-inspired open-pillared veranda on Pongal morning with a carved teak chair, a patterned Athangudi floor, a mango-leaf thoranam along the eaves, sugarcane stalks tied to a pillar and a sunlit paddy-green garden beyond; the customer stands beside the chair.', foreground: 'the carved chair edge in the lower-left foreground', environment: 'The mango leaves stir, garden foliage moves in the breeze, and morning light shifts across the patterned floor.', effect: 'A narrow warm sunbeam travels along the rear pillars and golden dust drifts in the distant garden.' },
    'women-golden-courtyard': { title: 'Kolam Courtyard', mood: 'A luminous Pongal morning courtyard portrait.', scene: 'An expansive Chettinad-inspired South Indian palace exterior on Pongal morning, with a carved granite courtyard, a carved stone ledge, tall arches with mango-leaf thoranam, a large colourful kolam with a Pongal pot motif behind the customer, sugarcane stalks and turmeric plants at the pillars and marigolds in warm sunrise light.', foreground: 'a tall sugarcane stalk at the lower-left frame edge', environment: 'Sugarcane leaves and marigold strands sway, the thoranam stirs, and sunrise light travels across the kolam and arches.', effect: 'A cinematic warm sunbeam sweeps the far arches and soft golden dust glows behind the customer.' },
    'women-heritage-balcony': { title: 'Paddy Field Balcony', mood: 'A calm Pongal morning above a sunlit garden.', scene: 'A South Indian heritage balcony with a carved stone balustrade on Pongal morning, a mango-leaf thoranam along the eaves, jasmine and marigold garlands and a temple-tank garden below with green paddy fields and a rising sun in the distance.', foreground: 'the balcony rail with a marigold garland along the lower frame edge', environment: 'Sunlight sparkles on the water, jasmine strands stir, and the paddy fields sway in the distance.', effect: 'A soft gold sunlight reflection sweeps across the water as the morning sun rises behind the customer.' },
    'women-grand-hall': { title: 'The Pongal Hall', mood: 'An elegant Pongal portrait in a sunlit hall.', scene: 'A South Indian Chettinad celebration hall on Pongal morning with polished Athangudi tiles, carved teak pillars with sugarcane stalks tied to them, mango-leaf thoranam, a colourful kolam and a tall rear doorway full of warm sunrise light.', foreground: 'a carved arch edge with a sugarcane stalk along the right frame edge', environment: 'The thoranam stirs, sugarcane leaves sway lightly, and sunlight moves across the tiles.', effect: 'A warm golden sunburst streams through the rear doorway with soft floating dust behind the customer.' },
    'girl-garden-lights': { title: 'Pongal Garden', mood: 'A bright, child-safe Pongal garden morning.', scene: 'A safe South Indian heritage garden on Pongal morning with a low garden wall, a stone path with a colourful kolam, sugarcane stalks and turmeric plants at the garden edge, jasmine and banana leaves in soft sunrise light; no fire or pot near the child.', foreground: 'sugarcane leaves at the left frame edge', environment: 'Banana and sugarcane leaves sway, sunlight dapples the path, and flower petals stir behind the child.', effect: 'Soft golden light drifts only in the distant garden; nothing approaches the child.' },
    'girl-festive-arch': { title: 'The Thoranam Arch', mood: 'A graceful Pongal portrait under a festive arch.', scene: 'A South Indian carved granite entrance arch with solid jambs on Pongal morning, framed with a mango-leaf thoranam and sugarcane stalks tied to each side, a colourful kolam at the threshold and a sunlit courtyard beyond.', foreground: 'a mango-leaf thoranam strand at the upper-right frame edge', environment: 'The mango leaves stir, sugarcane leaves sway, and the sunlit courtyard shimmers behind the child.', effect: 'A restrained warm sunbeam travels across the distant carving; nothing crosses the child silhouette.' },
    'girl-rangoli-evening': { title: 'Kolam Morning', mood: 'A joyful Pongal portrait with a colourful kolam.', scene: 'A South Indian courtyard on Pongal morning with a large colourful kolam showing a Pongal pot, sugarcane and the sun in coloured rice flour, a low parapet, a carved-pillared veranda with mango-leaf thoranam and soft sunrise light; no fire near the child.', foreground: 'the colourful kolam edge along the lower frame edge', environment: 'Flower petals stir, the thoranam moves in the breeze, and morning light travels across the kolam.', effect: 'A soft ring of warm sunlight moves around the far edge of the kolam; nothing crosses the child.' },
    'boy-heritage-entrance': { title: 'Pongal Gateway', mood: 'A confident Pongal arrival at a sunlit gateway.', scene: 'A South Indian temple-town heritage gateway with solid carved granite pillars on Pongal morning, sugarcane stalks and banana-leaf festoons tied to the pillars, a mango-leaf thoranam across the top, a colourful kolam at the threshold and a clear morning sky.', foreground: 'a gateway pillar with a sugarcane stalk along the right frame edge', environment: 'Banana leaves and sugarcane leaves move in the breeze and sunlight rises over the gateway.', effect: 'A warm sunbeam reaches the upper stonework; all light stays behind and above the boy.' },
    'boy-lantern-pathway': { title: 'Sugarcane Pathway', mood: 'A warm Pongal pathway portrait in morning sun.', scene: 'A South Indian garden pathway beside a low stone garden wall on Pongal morning, lined with sugarcane stalks and turmeric plants, a kolam along the path, jasmine vines and a long pillared veranda with mango-leaf thoranam at the far end.', foreground: 'sugarcane stalks at the left frame edge', environment: 'Sugarcane and banana leaves sway at separate depths and sunlight dapples the path toward the far veranda.', effect: 'A warm sunbeam travels between the distant pillars and golden dust drifts only in the far background.' },
    'boy-lighted-corridor': { title: 'The Sunlit Corridor', mood: 'A polished Pongal portrait in a sunlit corridor.', scene: 'A South Indian pillared corridor on Pongal morning with carved granite columns tied with sugarcane stalks, mango-leaf thoranam between the arches, Athangudi floor borders with kolam and a far doorway full of sunrise light.', foreground: 'the first corridor arch with a sugarcane stalk entering from the left frame edge', environment: 'The thoranam stirs and bands of sunlight move down the corridor toward the far doorway.', effect: 'A wave of warm sunlight rushes down the corridor from the far doorway behind the boy.' },
  },
};

/** The look's title and line for this festival (Diwali, and any other event, keep the concept's own). */
export function conceptCard(concept: VideoConcept, eventId: EventId): { title: string; mood: string } {
  if (!isBuiltFestival(eventId)) return { title: concept.title, mood: concept.mood };
  const scene = festivalScenes[eventId][concept.id];
  return { title: scene.title || concept.title, mood: scene.mood };
}

/** The portrait's scene: Diwali's tested scene, a built festival's own scene, or the location dressed for the event. */
function eventScene(concept: VideoConcept, eventId: EventId) {
  if (eventId === 'diwali') return concept.masterScene;
  if (isBuiltFestival(eventId)) return festivalScenes[eventId][concept.id].scene;
  return `${conceptLocations[concept.id]} Dressed for ${eventDressing[eventId] || eventFilmSettings[eventId].set}`;
}

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

/** Diwali finale for the looks without open sky (the default bursts in the far sky). */
const indoorDiwaliFinale: Partial<Record<VideoConceptId, string>> = {
  'women-grand-hall': 'A warm golden light burst blooms through the rear doorway with a gold glitter cascade and a soft lens flare behind the customer.',
  'boy-lighted-corridor': 'A wave of golden light rushes down the corridor from the far doorway with a gentle gold glitter cascade behind the boy.',
};

/** The event finale for this look. */
function finaleFor(concept: VideoConcept, eventId: EventId) {
  // Indoor looks end on a light burst through the doorway, not fireworks (Diwali and New Year).
  return ((eventId === 'diwali' || eventId === 'new-year') && indoorDiwaliFinale[concept.id]) || eventMotionGraphics[eventId].finale;
}

/** Motion graphics and finale effects per event; always behind the customer, never over face or garment. */
const eventMotionGraphics: Record<EventId, { graphics: string; finale: string }> = {
  diwali: {
    graphics: 'Soft golden bokeh drifts and tiny diya-light particles rise slowly in the background.',
    finale: 'A layered firework burst blooms in the far sky with a gold glitter cascade and a warm lens flare behind the customer.',
  },
  pongal: {
    graphics: 'Warm sun rays stream through floating golden dust and the kolam lines glow softly in sequence.',
    finale: 'The morning sun rises into a warm golden sunburst that sweeps across the far architecture.',
  },
  'new-year': {
    graphics: 'Golden light streaks and soft bokeh glide through the distant background.',
    finale: 'A bright layered firework burst blooms high in the far background with a gold glitter cascade behind the customer.',
  },
  christmas: {
    graphics: 'Warm golden sparkles drift slowly in the far background and the star lanterns and tree lights twinkle.',
    finale: 'A warm star-shaped light flare rises high in the far background and the star lanterns glow brighter.',
  },
  ramadan: {
    graphics: 'Lantern light patterns turn slowly on the rear wall and gentle light motes float under the crescent sky.',
    finale: 'A soft golden glow sweeps across the far courtyard.',
  },
  birthday: {
    graphics: 'Soft bokeh floats and a little confetti falls only in the far background.',
    finale: 'A sparkle burst opens behind the customer.',
  },
};

/** One mild, graceful hand gesture per audience and garment; supported hands stay on their support. */
function mildGesture(category: CustomerCategory, garmentType: GarmentType, supportPose = '') {
  const freeHand = /\bleft\b/i.test(supportPose) ? 'right' : 'left';
  if (category === 'girl') return 'she gives a small cheerful nod over her Namaste';
  if (category === 'boy') return 'he gives a small confident nod over his Namaste';
  // Only the pallu and the half-saree drape are always there; a salwar or lehenga may have no dupatta.
  // The pallu falls on the left: a free left hand smooths it; a free right hand stays on its own side.
  if (category === 'women' && garmentType === 'saree') return freeHand === 'left' ? 'the free hand gently lifts and smooths the pallu edge at hip height, then settles back' : 'the free hand lightly smooths the front pleats at the right hip, then settles back';
  if (category === 'women' && garmentType === 'half_saree') return 'the free hand gently smooths the drape edge at hip height, then settles back';
  return category === 'women'
    ? 'the free hand lightly brushes the side of the outfit at hip height, then settles back'
    : 'the free hand gives a relaxed open-palm turn at hip height, then settles back beside the thigh';
}

const garmentNouns: Record<GarmentType, string> = {
  saree: 'silk saree', half_saree: 'half saree', lehenga: 'lehenga choli', salwar: 'salwar suit', one_piece: 'dress', two_piece: 'two-piece outfit',
  three_piece: 'three-piece outfit', shirt_pant: 'shirt', tshirt_bottom: 'T-shirt', top: 'top', trousers: 'trousers', jacket: 'jacket', dhoti_veshti: 'veshti and shirt',
  kurta_dhoti: 'kurta set', pattu_pavadai: 'pattu pavadai', boy_ethnic: 'ethnic set', generic: 'outfit', unset: 'outfit',
};

/** H3 prompts verified on real renders; their wording stays exactly as tested. */
const TESTED_H3_CONCEPTS = new Set<VideoConceptId>(['men-heritage-passage', 'women-golden-courtyard']);

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

/**
 * The garment block appended to the AI Video portrait prompt. Gemini reads images in order, so the outfit
 * photos are named Image 2 and Image 3 (Image 1 is the customer), each with its role (top, bottom…).
 */
export function buildPortraitGarmentBlock(roles: string[], garmentType: GarmentType, garmentCount: number) {
  const named = Array.from({ length: Math.max(1, garmentCount) }, (_, index) => {
    const role = roles[index]?.trim();
    return `- Image ${index + 2} = ${role ? role.toUpperCase() : 'the garment'}${garmentCount > 1 ? '' : ' (the exact garment reference)'}`;
  }).join('\n');
  return `GARMENT REFERENCES:
${named}
- ${GARMENT_TYPE_RULES[garmentType]}
- Keep every garment colour, dye hue and colour transition exactly as in these photos, with only the embroidery and pieces they show.
- Light the scene so the fabric reads clearly while its true dye colour stays unchanged.`;
}

export function buildVideoMasterPrompt(concept: VideoConcept, garmentType: GarmentType, eventId: EventId = 'diwali') {
  const event = eventFilmSettings[eventId];
  const anchor = handAnchors[concept.id];
  const isChild = concept.category === 'boy' || concept.category === 'girl';
  const childSafety = isChild
    ? 'Keep the child fully age-appropriate, naturally cheerful and free of adult glamour or mature posing.'
    : 'Keep the presentation family-friendly, refined and photorealistic.';
  const foreground = isBuiltFestival(eventId) ? festivalScenes[eventId][concept.id].foreground : eventForegroundDetails[eventId] || foregroundDetails[concept.id];
  const samplePose = samplePoseDirections[concept.id];
  const isDhoti = garmentType === 'dhoti_veshti' || garmentType === 'kurta_dhoti';
  const sampleMasterPose = concept.id === 'men-heritage-passage' && isDhoti
    ? samplePoseDirections[concept.id]!.master.replace(/For trousers,[\s\S]*?Keep both hands visible/, 'For a dhoti or veshti, rest the right palm lightly on the broad top of the visible stone pillar at hip height, with the left arm relaxed beside the thigh. Keep both hands visible')
    : samplePoseDirections[concept.id]?.master;
  const childPose = 'Stand naturally with both feet visible and place the palms gently together in a simple Namaste at mid-chest, fingers pointing upward, elbows relaxed and hands clear of the face. Keep the pose still and age-appropriate; no other gesture or held object.';
  const posePrompt = isChild ? childPose : sampleMasterPose || (samplePose?.master ?? `Stand naturally beside ${anchor.prop}, which must be solid, clearly visible and physically reachable, with both feet planted. ${anchor.pose} Keep the supported hand anatomically correct and visibly touching that support. The other arm hangs naturally beside the outer thigh. Both hands stay below the waist and outside the chest and garment. No held object, clasp, Namaste, hand-to-chest, step or crossed arms.`);
  const supportScene = isChild ? 'Do not add a support object or place anything in the child\'s hands.' : samplePose ? (isDhoti && concept.id === 'men-heritage-passage' ? 'Include a broad, visible stone pillar exactly beside the supported hand.' : 'Do not add a support object for the pose.') : `Include ${anchor.prop} beside the supported hand.`;
  return `Create a photorealistic vertical 9:16 full-body ${event.label} fashion-film opening frame, composed to animate naturally for six seconds. Frame the customer from head to footwear with both hands and both feet completely visible; use a natural full-length portrait perspective, not a tight crop.\n\nREFERENCE ROLES: Image 1 is the real customer and the sole authority for face, hair, age, skin tone, body proportions and identity. Images 2 onward show only the exact ${garmentNouns[garmentType]} and its labelled details. Never borrow a face, body, pose or background from a garment reference.\n\nIDENTITY AND WARDROBE LOCK: Preserve the customer's recognizable facial geometry, natural asymmetry, age, body shape, hairline, skin tone and real skin texture. Keep the expression natural. No makeup, beauty filter, face reshaping, skin smoothing, waxy/plastic/doll finish or glamour retouch. Reproduce the exact garment pieces, silhouette, colour, print, weave, embroidery, borders, neckline and drape from the garment references. Do not redesign, recolour, simplify or replace any part of it.\n\nFILMABLE POSE: ${posePrompt} Keep the face toward camera with a composed, natural expression and a slight warm smile. Leave clear space around the silhouette, head and footwear.\n\nLAYERED ${event.label.toUpperCase()} SET: ${eventScene(concept, eventId)} Place ${foreground} as a real near-plane element, the unobstructed customer in the middle plane, and detailed luxury architecture in the far plane. Keep face, full garment and both hands readable. ${supportScene} Use practical lights, reflective surfaces and event details visible in the frame; no text, graphic overlay, motion trail or invented object.\n\nLIGHT AND CAMERA: Natural portrait-lens perspective and realistic full-body proportions. Soft frontal key light reveals the real eyes and skin texture; neutral fill preserves skin tone and exact garment colour; a restrained warm rim separates fabric from the set. Keep textile weave and embroidery crisp. Let the architecture carry the festive glow, not a beauty filter on the customer. Photographic realism, grounded anatomy, believable hands, natural fabric weight. No logo or watermark. ${childSafety}`;
}

/**
 * Camera moves for the non-Diwali events, in the shape of the two renders verified on Diwali: a reveal past the
 * near-plane detail the event portrait was asked to include, one main move with parallax, then a settle on
 * the full-body hero frame. They name only what that event's portrait contains (never Diwali lamps or props).
 */
const EVENT_CAMERA_MOVES = [
  (near: string) => `CAMERA: 0-1s brisk stabilized horizontal reveal from behind ${near}. 1-4.5s continue the lateral track and gently dolly closer, with strong foreground-to-architecture parallax. 4.5-6s ease to a centered full-body hero frame; never crop hands, feet or the outfit.`,
  (near: string) => `CAMERA: 0-1s reveal from behind ${near} at a modest elevated angle. 1-4s descend smoothly to eye level while dollying toward the customer, creating strong near-to-far parallax. 4-6s dolly back and settle into a centered full-body hero frame; keep hands and feet visible.`,
  (near: string) => `CAMERA: 0-1s begin low beside ${near}. 1-4.5s rise smoothly to eye level while tracking sideways, revealing the far architecture with clear parallax. 4.5-6s settle at eye level in a full-body hero frame; keep head and feet visible.`,
];

/** Camera plan shared by both video models: tuned sample plan, then concept plan, then a lateral move. */
function plannedCameraDirection(concept: VideoConcept, eventId: EventId) {
  if (eventId !== 'diwali') {
    const near = isBuiltFestival(eventId) ? festivalScenes[eventId][concept.id].foreground : eventForegroundDetails[eventId] || 'a visible event decoration at the frame edge';
    const index = conceptsForCategory(concept.category).findIndex((item) => item.id === concept.id);
    return EVENT_CAMERA_MOVES[Math.max(0, index) % EVENT_CAMERA_MOVES.length](near);
  }
  const foreground = eventId === 'diwali' ? foregroundDetails[concept.id] : eventForegroundDetails[eventId] || 'a visible event decoration at the frame edge';
  const camera = eventId === 'diwali'
    ? lateralShotPlans[concept.id]
    : alternateEventCameras[conceptsForCategory(concept.category).findIndex((item) => item.id === concept.id)];
  const sample = eventId === 'diwali' ? sampleCinematicPlans[concept.id] : undefined;
  return sample?.camera || distinctCinematicPlans[concept.id] || `CAMERA: 0-1s begin a smooth physical move past ${foreground}. 1-4.5s ${camera} Create clear near-to-far depth parallax. 4.5-6s ease into a full-body hero frame.`;
}

/** Event background animation shared by both video models. */
function plannedBackgroundDirection(concept: VideoConcept, eventId: EventId) {
  const event = eventFilmSettings[eventId];
  if (isBuiltFestival(eventId)) {
    // The Diwali shape, with this look's own festival set: set motion, its light effect, then the finale.
    const scene = festivalScenes[eventId][concept.id];
    return `BACKGROUND + FX: Animate throughout. 0-2s ${scene.environment} 2-4.5s ${scene.effect} 4.5-6s ${finaleFor(concept, eventId)} Every light and effect stays behind the subject, never over the face or outfit.`;
  }
  if (eventId !== 'diwali') {
    // Same three beats as the verified Diwali renders: set motion, event graphics, then the finale.
    const graphics = eventMotionGraphics[eventId];
    return `BACKGROUND + FX: Animate throughout. 0-2s ${event.motion} 2-4.5s ${graphics.graphics} 4.5-6s ${graphics.finale} ${event.finish} Every light and effect stays behind the subject, never over the face or outfit.`;
  }
  const sample = eventId === 'diwali' ? sampleCinematicPlans[concept.id] : undefined;
  const background = eventId === 'diwali' ? `${concept.environmentMotion} ${concept.effectMotion}` : `${event.motion} ${event.finish}`;
  return sample?.background || `BACKGROUND: Animate only visible ${event.label} details throughout: ${background}`;
}

export function buildH3MotionPrompt(
  concept: VideoConcept,
  referenceRoles: string[],
  eventId: EventId = 'diwali',
  // Kept so existing callers' arguments stay in place; H3 Max is the only reference style now.
  _referenceStyle: 'h3' = 'h3',
  garmentType: GarmentType = 'generic',
) {
  const event = eventFilmSettings[eventId];
  const anchor = handAnchors[concept.id];
  const masterRef = 'Image 1';
  const garmentRef = (index: number) => `Image ${index + 2}`;
  const samplePose = samplePoseDirections[concept.id];
  const isDhoti = garmentType === 'dhoti_veshti' || garmentType === 'kurta_dhoti';
  const isChild = concept.category === 'boy' || concept.category === 'girl';
  const tested = TESTED_H3_CONCEPTS.has(concept.id) && eventId === 'diwali';
  const graphics = eventMotionGraphics[eventId];
  const poseDirection = isChild
    ? 'Keep the child in the same simple Namaste pose shown in the approved opening frame, palms gently together at mid-chest, elbows relaxed; no hand movement or held object.'
    : samplePose
      ? (concept.id === 'men-heritage-passage' && isDhoti
        ? samplePose.video.replace(/For trousers,[\s\S]*?Add a small natural weight shift/, 'For a dhoti or veshti, keep the right palm on the visible pillar and the left arm relaxed at the side. Add a small natural weight shift')
        : samplePose.video)
      : `${anchor.pose} Keep the supported hand touching that same support throughout. Other hand relaxed beside outer thigh. Around 2-3s ${mildGesture(concept.category, garmentType, anchor.pose)}.`;
  const garmentReferences = referenceRoles.map((role, index) => `${garmentRef(index)} confirms ${role || `garment detail ${index + 1}`} only.`).join(' ');
  const plannedCamera = plannedCameraDirection(concept, eventId);
  const cameraDirection = tested || garmentType === 'saree' ? plannedCamera : plannedCamera.replace(/\bsaree\b/g, garmentNouns[garmentType]);
  const plannedBackground = plannedBackgroundDirection(concept, eventId);
  const backgroundDirection = tested || plannedBackground.startsWith('BACKGROUND + FX')
    ? plannedBackground
    : `${plannedBackground} MOTION GRAPHICS: ${graphics.graphics} 4.5-6s: ${finaleFor(concept, eventId)}`;
  const groundedPerformance = isChild
    ? 'Keep both feet planted. Add one tiny natural weight settle through the knees and a subtle shoulder relaxation; no step, turn, sway or hand movement.'
    : 'Keep both feet planted. Add one small natural weight shift through the hips and knees plus a subtle shoulder release; no step, torso turn or uncontrolled sway.';
  // A look with a verified pose (no gesture in it) keeps the verified hand line in every event.
  const handRule = isChild ? "Keep the child's Namaste pose unchanged; no other hand gesture." : tested || samplePose ? 'Keep both hands below waist, away from chest and face.' : 'Keep both hands below waist, away from chest and face; the one gesture stays slow, small and anatomically natural.';
  const sizeLock = tested ? '' : ' Keep the exact body size, height and proportions; no slimming or reshaping.';
  return `${masterRef} is the approved exact opening frame and sole authority for the customer's face, natural skin, hair, body, outfit and composition. ${garmentReferences}\n\nSix-second vertical ${event.label} fashion film, one continuous real-time shot. Preserve the South Indian set from the opening frame, customer identity and exact garment colour, pattern, border and drape.${sizeLock} No makeup, face swap, plastic skin, wardrobe redesign, text or logo.\n\n${cameraDirection} Create distinct foreground-to-background parallax. Keep the customer's face and garment sharp; preserve full-body framing whenever the move allows. The customer gives one natural blink and a small warm smile with subtle breathing; head stays nearly level and toward camera. ${groundedPerformance}\n${backgroundDirection}\n\nPOSE: ${poseDirection} ${handRule} Avoid a rigid mannequin hold; use only the specific natural movement stated above. Preserve face, garment and natural anatomy. Effects stay behind the customer. No slow motion, freeze, digital zoom, uncontrolled orbit, shake, cut, transition or new prop.`;
}

/**
 * The backup video, used on a retry: the simplest film that cannot go wrong. The customer stands still and
 * smiles, the camera makes one slow, small arc, and the event background glows and animates. Less wow, but
 * nothing in it can distort the face, hands or outfit.
 */
export function buildFailProofMediumFlatMotionPrompt(
  concept: VideoConcept,
  referenceRoles: string[],
  eventId: EventId = 'diwali',
  _referenceStyle: 'h3' = 'h3',
  garmentType: GarmentType = 'generic',
) {
  const event = eventFilmSettings[eventId];
  const graphics = eventMotionGraphics[eventId];
  const isChild = concept.category === 'boy' || concept.category === 'girl';
  const garmentReferences = referenceRoles.map((role, index) => `Image ${index + 2} shows ${role || `garment detail ${index + 1}`} only.`).join(' ');
  return `Image 1 is the approved opening frame: the customer's face, natural skin, hair, body, ${garmentNouns[garmentType]} and the set stay exactly as shown. ${garmentReferences}

Six-second vertical 9:16 ${event.label} portrait film, one continuous shot.

CUSTOMER: stands still, full-length, facing the camera, both feet planted. ${isChild ? 'The gentle Namaste stays exactly as in the opening frame.' : 'Both hands stay exactly where they are in the opening frame.'} A soft warm smile, one natural blink and gentle breathing; the face stays as in Image 1.

CAMERA: eye level and steady; one slow, smooth arc of about 15 degrees around the customer, keeping head to feet in frame the whole time.

BACKGROUND + FX: the ${event.label} background glows and shimmers softly behind the customer throughout. ${graphics.graphics} 4.5-6s: ${finaleFor(concept, eventId)} Every effect stays behind the customer, never over the face or outfit.

The outfit keeps its exact colour, border, weave and drape. No cut, shake, zoom, text or logo.`;
}

/**
 * Gemini Omni Flash (the last engine) is prompted the way Google's guide asks: the role of each image in
 * plain words, motion only (the opening image already holds the person, outfit and set), one focused
 * moment, and what should be seen rather than a list of "no"s. It always makes the calm backup film.
 */
export function buildOmniMotionPrompt(concept: VideoConcept, garmentReferenceCount: number, eventId: EventId = 'diwali', garmentType: GarmentType = 'generic') {
  const event = eventFilmSettings[eventId];
  const graphics = eventMotionGraphics[eventId];
  const isChild = concept.category === 'boy' || concept.category === 'girl';
  const person = concept.category === 'women' ? 'woman' : concept.category === 'men' ? 'man' : concept.category === 'girl' ? 'girl' : 'boy';
  const pronoun = concept.category === 'women' || concept.category === 'girl' ? 'her' : 'his';
  const outfitImages = garmentReferenceCount === 0
    ? ''
    : ` The ${garmentReferenceCount === 1 ? 'second image shows' : 'second and third images show'} the ${garmentNouns[garmentType]} up close, so its colours, border and weave stay true.`;
  const finale = finaleFor(concept, eventId).charAt(0).toLowerCase() + finaleFor(concept, eventId).slice(1);
  return `The first image is the opening frame of this video: start exactly on it, with the same ${person}, outfit and ${event.label} setting.${outfitImages}

A calm six-second vertical portrait shot. The ${person} stands still and full-length, facing the camera${isChild ? ', palms together in the same gentle Namaste' : `, ${pronoun} hands resting exactly as in the first image`}, and gives a soft warm smile, one natural blink and gentle breathing. The camera makes one slow, smooth arc shot of about 15 degrees at eye level, keeping the subject in frame from head to feet.

Behind the subject, the ${event.label} background glows and shimmers: ${graphics.graphics} In the final seconds, ${finale}

Steady camera, natural unretouched skin, the same face and outfit throughout, with every light effect staying in the background.`;
}


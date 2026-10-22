// Photo subjects. Each has a journal page, a rarity tier, readable spawn rules and a hint
// that teaches the rule. `india` subjects arrive with milestone 7.
import type { Rarity } from './economy';

export type Page = 'forest' | 'coast' | 'desert' | 'farm' | 'tropical' | 'city' | 'roadside' | 'ghat';
export type Kind = 'wildlife' | 'landmark' | 'sky' | 'quirky' | 'road';
export type Window = 'dawn' | 'golden' | 'morning' | 'midday' | 'afternoon' | 'blue' | 'night';
export type Place = 'meadow' | 'trees' | 'lake' | 'river' | 'shore' | 'offshore' | 'air' | 'rocks' | 'roadside' | 'road' | 'town' | 'field' | 'scrub' | 'parapet';

export interface SubjectDef {
  id: string;
  name: string;
  page: Page;
  tier: Rarity;
  kind: Kind;
  hint: string;
  /** spawn rule for wildlife */
  spawn?: { place: Place; perChunk: number; windows?: Window[]; group?: [number, number] };
  weather?: string[];
  /** world size for framing: radius and height (m) */
  size: [number, number];
  /** model key for wildlife */
  model?: string;
  /** landmark site kind */
  site?: string;
  india?: boolean;
}

const ALLDAY: Window[] = ['dawn', 'golden', 'morning', 'midday', 'afternoon'];
const DUSKY: Window[] = ['golden', 'blue'];

export const SUBJECTS: SubjectDef[] = [
  // ---------------- forest
  { id: 'deer', name: 'Deer', page: 'forest', tier: 'common', kind: 'wildlife', hint: 'Grazes in clearings, most often in daylight.', spawn: { place: 'meadow', perChunk: 0.9, windows: ['dawn', 'golden', 'morning', 'afternoon'], group: [1, 3] }, size: [0.9, 1.4], model: 'deer' },
  { id: 'elk', name: 'Elk', page: 'forest', tier: 'uncommon', kind: 'wildlife', hint: 'Keeps to wide clearings away from the road.', spawn: { place: 'meadow', perChunk: 0.22, windows: ALLDAY, group: [1, 2] }, size: [1.3, 2.2], model: 'elk' },
  { id: 'fox', name: 'Red fox', page: 'forest', tier: 'uncommon', kind: 'wildlife', hint: 'Trots the forest edge around dawn and dusk.', spawn: { place: 'trees', perChunk: 0.3, windows: ['dawn', 'golden', 'blue'] }, size: [0.5, 0.5], model: 'fox' },
  { id: 'heron', name: 'Grey heron', page: 'forest', tier: 'rare', kind: 'wildlife', hint: 'Seen near lakes at first light.', spawn: { place: 'lake', perChunk: 0.9, windows: ['dawn'] }, size: [0.5, 1.0], model: 'heron' },
  { id: 'owl', name: 'Owl', page: 'forest', tier: 'rare', kind: 'wildlife', hint: 'After dark, where the pines come close to the road.', spawn: { place: 'trees', perChunk: 0.35, windows: ['night'] }, size: [0.3, 0.4], model: 'owl' },
  { id: 'kingfisher', name: 'Kingfisher', page: 'forest', tier: 'uncommon', kind: 'wildlife', hint: 'A flash of blue over still water, by day.', spawn: { place: 'lake', perChunk: 0.7, windows: ['morning', 'midday', 'afternoon'] }, size: [0.15, 0.2], model: 'kingfisher', india: true },
  { id: 'lookout', name: 'Forest watchtower', page: 'forest', tier: 'common', kind: 'landmark', hint: 'The forest guards climb up here at dawn.', size: [5, 8], site: 'lookout' },
  { id: 'cabin', name: 'Khasi cottage', page: 'forest', tier: 'common', kind: 'landmark', hint: 'A tin roof and a stovepipe among the pines.', size: [7, 6], site: 'cabin' },
  { id: 'bridge', name: 'Wooden bridge', page: 'forest', tier: 'uncommon', kind: 'landmark', hint: 'Where a river crosses the road.', size: [6, 2], site: 'bridge' },
  { id: 'aurora', name: 'Aurora', page: 'forest', tier: 'rare', kind: 'sky', hint: 'On rare clear nights, the northern sky moves.', size: [0, 0] },
  { id: 'aurora-lake', name: 'Aurora over a lake', page: 'forest', tier: 'legendary', kind: 'sky', hint: 'When the sky moves at night, find still water to hold it.', size: [0, 0] },

  // ---------------- coast
  { id: 'gull', name: 'Seagull', page: 'coast', tier: 'common', kind: 'wildlife', hint: 'Always overhead where land meets sea.', spawn: { place: 'air', perChunk: 1.2, windows: [...ALLDAY, 'blue'], group: [1, 3] }, size: [0.5, 0.3], model: 'gull' },
  { id: 'seal', name: 'Seal', page: 'coast', tier: 'uncommon', kind: 'wildlife', hint: 'Hauls out on the shore when the sun is up.', spawn: { place: 'shore', perChunk: 0.35, windows: ['morning', 'midday', 'afternoon'], group: [1, 3] }, size: [0.8, 0.6], model: 'seal' },
  { id: 'whale', name: 'Whale', page: 'coast', tier: 'rare', kind: 'wildlife', hint: 'Surfaces offshore at dawn.', spawn: { place: 'offshore', perChunk: 0.45, windows: ['dawn', 'golden'] }, size: [4, 2], model: 'whale' },
  { id: 'lighthouse', name: 'Lighthouse', page: 'coast', tier: 'common', kind: 'landmark', hint: 'On the headlands.', size: [3, 21], site: 'lighthouse' },
  { id: 'pier', name: 'Pier', page: 'coast', tier: 'common', kind: 'landmark', hint: 'Where the beach is gentle.', size: [10, 4], site: 'pier' },
  { id: 'seastack', name: 'Sea stacks', page: 'coast', tier: 'uncommon', kind: 'landmark', hint: 'Rock pillars standing off the cliffs.', size: [8, 20], site: 'seastack' },
  { id: 'sunset-sea', name: 'Sunset at sea', page: 'coast', tier: 'uncommon', kind: 'sky', hint: 'Golden hour, the sun low over the water.', size: [0, 0] },
  { id: 'fishingnets', name: 'Cantilevered fishing nets', page: 'coast', tier: 'uncommon', kind: 'landmark', hint: 'Teak frames lifted at morning and evening along gentle shores.', size: [8, 10], site: 'fishingnets', india: true },

  // ---------------- desert
  { id: 'lizard', name: 'Lizard', page: 'desert', tier: 'common', kind: 'wildlife', hint: 'Basks on warm rocks in the middle of the day.', spawn: { place: 'rocks', perChunk: 0.9, windows: ['morning', 'midday', 'afternoon'] }, size: [0.2, 0.1], model: 'lizard' },
  { id: 'hawk', name: 'Hawk', page: 'desert', tier: 'uncommon', kind: 'wildlife', hint: 'Circles high over open ground by day.', spawn: { place: 'air', perChunk: 0.4, windows: ALLDAY }, size: [0.6, 0.3], model: 'hawk' },
  { id: 'coyote', name: 'Coyote', page: 'desert', tier: 'rare', kind: 'wildlife', hint: 'Comes out as the light goes.', spawn: { place: 'scrub', perChunk: 0.35, windows: DUSKY }, size: [0.6, 0.7], model: 'coyote' },
  { id: 'camel', name: 'Camels', page: 'desert', tier: 'common', kind: 'wildlife', hint: 'Patient travellers on the open sand.', spawn: { place: 'scrub', perChunk: 0.6, windows: [...ALLDAY], group: [1, 3] }, size: [1.3, 2.2], model: 'camel', india: true },
  { id: 'blackbuck', name: 'Blackbuck', page: 'desert', tier: 'uncommon', kind: 'wildlife', hint: 'Grazes the scrub edges in the cool of morning.', spawn: { place: 'scrub', perChunk: 0.3, windows: ['dawn', 'golden', 'morning'], group: [2, 4] }, size: [0.7, 1.1], model: 'blackbuck', india: true },
  { id: 'watertower', name: 'Overhead water tank', page: 'desert', tier: 'common', kind: 'landmark', hint: 'The village tank, visible for kilometres.', size: [7, 15], site: 'watertower' },
  { id: 'motelruin', name: 'Abandoned haveli', page: 'desert', tier: 'uncommon', kind: 'landmark', hint: 'Painted walls and a carved door, and nobody home.', size: [14, 8], site: 'motelruin' },
  { id: 'arch', name: 'Chhatri on the ridge', page: 'desert', tier: 'uncommon', kind: 'landmark', hint: 'A domed pavilion keeping watch over the dunes.', size: [6, 8], site: 'arch' },
  { id: 'stepwell', name: 'Stepwell', page: 'desert', tier: 'rare', kind: 'landmark', hint: 'Steps folding down to water, at the end of a quiet side road.', size: [10, 4], site: 'stepwell', india: true },
  { id: 'fortwall', name: 'Old fort wall', page: 'desert', tier: 'uncommon', kind: 'landmark', hint: 'Crowns a mesa top.', size: [14, 8], site: 'fortwall', india: true },
  { id: 'meteors', name: 'Meteor shower', page: 'desert', tier: 'rare', kind: 'sky', hint: 'Some clear nights, the desert sky throws sparks.', size: [0, 0] },
  { id: 'sunset-desert', name: 'Desert sunset', page: 'desert', tier: 'uncommon', kind: 'sky', hint: 'The sun touching the mesas.', size: [0, 0] },

  // ---------------- farmland
  { id: 'cow', name: 'Cows', page: 'farm', tier: 'common', kind: 'wildlife', hint: 'Grazing by the fields, all day.', spawn: { place: 'field', perChunk: 1.0, windows: [...ALLDAY], group: [1, 4] }, size: [1.0, 1.4], model: 'cow' },
  { id: 'horse', name: 'Horse', page: 'farm', tier: 'common', kind: 'wildlife', hint: 'In the paddocks near farmhouses.', spawn: { place: 'field', perChunk: 0.4, windows: ALLDAY, group: [1, 2] }, size: [1.0, 1.7], model: 'horse' },
  { id: 'crow', name: 'Crows', page: 'farm', tier: 'common', kind: 'wildlife', hint: 'On fresh-turned fields.', spawn: { place: 'field', perChunk: 0.8, windows: [...ALLDAY, 'blue'], group: [2, 5] }, size: [0.2, 0.2], model: 'crow' },
  { id: 'peacock', name: 'Peacock displaying', page: 'farm', tier: 'rare', kind: 'wildlife', hint: 'Fans its tail at field edges at first light.', spawn: { place: 'field', perChunk: 0.35, windows: ['dawn', 'golden'] }, size: [0.8, 1.2], model: 'peacock', india: true },
  { id: 'cow-road', name: 'Resting on the centre line', page: 'farm', tier: 'uncommon', kind: 'wildlife', hint: 'Cows and buffaloes on quiet rural roads choose the warm asphalt. Traffic eases around them.', spawn: { place: 'road', perChunk: 0.12, windows: ALLDAY }, size: [1.0, 1.0], model: 'cowlying', india: true },
  { id: 'barn', name: 'Brick kiln chimney', page: 'farm', tier: 'common', kind: 'landmark', hint: 'A tall chimney over the wheat, bricks drying round it.', size: [4, 32], site: 'barn' },
  { id: 'windmill', name: 'Wind turbine', page: 'farm', tier: 'common', kind: 'landmark', hint: 'Slow white blades over the plains.', size: [8, 42], site: 'windmill' },
  { id: 'silo', name: 'Straw stacks', page: 'farm', tier: 'common', kind: 'landmark', hint: 'Last harvest, stacked and capped for the cattle.', size: [8, 6], site: 'silo' },
  { id: 'banyan', name: 'Banyan shrine', page: 'farm', tier: 'uncommon', kind: 'landmark', hint: 'A great tree with a small shrine at its roots, beside the road.', size: [20, 13], site: 'banyan', india: true },
  { id: 'rainbow', name: 'Rainbow', page: 'farm', tier: 'rare', kind: 'sky', hint: 'After rain, with the sun low behind you.', size: [0, 0] },
  { id: 'lightning', name: 'Lightning', page: 'farm', tier: 'rare', kind: 'sky', hint: 'Storms roll across the open plains.', size: [0, 0] },
  { id: 'kites', name: 'Kite festival sky', page: 'farm', tier: 'rare', kind: 'sky', hint: 'On rare clear days, the sky over fields and towns fills with kites.', size: [0, 0], india: true },

  // ---------------- tropical
  { id: 'macaque', name: 'Macaques', page: 'tropical', tier: 'common', kind: 'wildlife', hint: 'Sit on the low walls of hill roads.', spawn: { place: 'parapet', perChunk: 0.9, windows: ALLDAY, group: [1, 4] }, size: [0.3, 0.5], model: 'monkey' },
  { id: 'parrot', name: 'Parrots', page: 'tropical', tier: 'uncommon', kind: 'wildlife', hint: 'Noisy green flocks in the morning.', spawn: { place: 'air', perChunk: 0.4, windows: ['dawn', 'golden', 'morning'], group: [3, 6] }, size: [0.15, 0.15], model: 'parrot' },
  { id: 'butterfly', name: 'Butterflies', page: 'tropical', tier: 'common', kind: 'wildlife', hint: 'Wherever the sun hits the verge.', spawn: { place: 'roadside', perChunk: 1.0, windows: ['morning', 'midday', 'afternoon'], group: [2, 5] }, size: [0.06, 0.06], model: 'butterfly' },
  { id: 'elephant', name: 'Elephant', page: 'tropical', tier: 'rare', kind: 'wildlife', hint: 'Crosses forest roads in the quiet hours of morning and evening.', spawn: { place: 'trees', perChunk: 0.12, windows: ['dawn', 'golden', 'blue'] }, size: [2, 3], model: 'elephant', india: true },
  { id: 'tiger', name: 'Tiger at dusk', page: 'tropical', tier: 'legendary', kind: 'wildlife', hint: 'At dusk, on a forest road, slow down and watch the edges.', spawn: { place: 'roadside', perChunk: 0.025, windows: ['blue'] }, size: [1.2, 1.0], model: 'tiger', india: true },
  { id: 'waterfall', name: 'Waterfall', page: 'tropical', tier: 'uncommon', kind: 'landmark', hint: 'Where the hills drop away suddenly.', size: [9, 20], site: 'waterfall' },
  { id: 'temple', name: 'Stone temple', page: 'tropical', tier: 'uncommon', kind: 'landmark', hint: 'Small, old, and looked after.', size: [5, 12], site: 'temple' },
  { id: 'ropebridge', name: 'Rope bridge', page: 'tropical', tier: 'uncommon', kind: 'landmark', hint: 'Footpaths cross the rivers on these.', size: [8, 3], site: 'ropebridge' },
  { id: 'teaestate', name: 'Tea estate', page: 'tropical', tier: 'common', kind: 'landmark', hint: 'Rows of tea follow the contours of the hills.', size: [20, 6], site: 'teaestate', india: true },
  { id: 'rainbow-tea', name: 'Rainbow over a tea estate', page: 'tropical', tier: 'legendary', kind: 'sky', hint: 'After a monsoon downpour, find the tea hills with the sun at your back.', size: [0, 0], india: true },

  // ---------------- city
  { id: 'pigeon', name: 'Pigeons', page: 'city', tier: 'common', kind: 'wildlife', hint: 'On every ledge in town.', spawn: { place: 'town', perChunk: 1.0, windows: ALLDAY, group: [2, 5] }, size: [0.15, 0.15], model: 'pigeon' },
  { id: 'cat', name: 'Street cat', page: 'city', tier: 'common', kind: 'wildlife', hint: 'Sunning on a doorstep, or prowling after dark.', spawn: { place: 'town', perChunk: 0.5, windows: ['morning', 'midday', 'blue', 'night'] }, size: [0.25, 0.3], model: 'cat' },
  { id: 'skyline', name: 'Skyline at blue hour', page: 'city', tier: 'uncommon', kind: 'sky', hint: 'Towers lit against the deep blue after sunset.', size: [0, 0] },
  { id: 'streetlights', name: 'Night street', page: 'city', tier: 'common', kind: 'sky', hint: 'A town road under its streetlights.', size: [0, 0] },
  { id: 'wedding', name: 'Wedding procession', page: 'city', tier: 'rare', kind: 'road', hint: 'Some nights a town street fills with lights and a band. Traffic waits.', size: [6, 3], india: true },
  { id: 'auto', name: 'Auto-rickshaw', page: 'city', tier: 'common', kind: 'road', hint: 'Three wheels, everywhere in town.', size: [1.2, 1.6], india: true },

  // ---------------- roadside oddities (any biome)
  { id: 'dino', name: 'Fossil-park dinosaur', page: 'roadside', tier: 'uncommon', kind: 'quirky', hint: 'Its kind once nested in this ground.', size: [5, 11], site: 'dino' },
  { id: 'cup', name: 'Giant kulhad', page: 'roadside', tier: 'uncommon', kind: 'quirky', hint: 'Chai, possibly, inside.', size: [5, 7], site: 'cup' },
  { id: 'oddsign', name: 'Hand-painted sign', page: 'roadside', tier: 'common', kind: 'quirky', hint: 'Somebody had something to say.', size: [1.8, 3], site: 'oddsign' },
  { id: 'oldcar', name: 'Abandoned car', page: 'roadside', tier: 'common', kind: 'quirky', hint: 'Slowly turning into a planter.', size: [2.2, 1.6], site: 'oldcar' },
  { id: 'phonebooth', name: 'STD-PCO booth', page: 'roadside', tier: 'rare', kind: 'quirky', hint: 'Still has a dial tone, somehow.', size: [1.3, 2.9], site: 'phonebooth' },
  { id: 'truck', name: 'Painted truck', page: 'roadside', tier: 'uncommon', kind: 'road', hint: 'Look for tassels and hand-lettered backs in traffic.', size: [1.4, 3.4], india: true },
  { id: 'milestone0', name: 'The 0 km stone', page: 'roadside', tier: 'rare', kind: 'quirky', hint: 'Every road starts somewhere. One stone says so.', size: [0.4, 0.9], site: 'milestone0', india: true },
  { id: 'milestone', name: 'Kilometre stone', page: 'roadside', tier: 'common', kind: 'quirky', hint: 'Yellow for national highways, green for state roads.', size: [0.4, 0.9], site: 'milestone', india: true },
];

// The hidden "Ghat road signs" page: one entry per original sign (see GHAT_SIGNS in sites.ts)
const GHAT_TEXT = ['Take the bend slow, my friend', 'Chai in your cup', 'Go with its flow', 'Brake before the bend', 'Mist ahead? Go slow instead', 'Horn at the curve', 'Low gear down', 'The hills will wait for you', "Don't feed the monkey", 'Slow and steady'];
GHAT_TEXT.forEach((t, i) => SUBJECTS.push({ id: `gsign${i}`, name: `"${t}"`, page: 'ghat', tier: 'common', kind: 'quirky', hint: 'A yellow board on a hill road.', size: [1.2, 2.4], india: true }));

export const SUBJECT_BY_ID: Record<string, SubjectDef> = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));
export const PAGE_NAMES: Record<Page, string> = {
  forest: 'Pine forest & lakes',
  coast: 'Coastal highway',
  desert: 'Desert mesas',
  farm: 'Farmland hills',
  tropical: 'Tropical forest',
  city: 'City & towns',
  roadside: 'Roadside oddities',
  ghat: 'Ghat road signs',
};

/** Landmark site kind → subject id */
export const SITE_SUBJECT: Record<string, string> = Object.fromEntries(SUBJECTS.filter((s) => s.site).map((s) => [s.site!, s.id]));

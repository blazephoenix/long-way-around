// Short lines for people at stops. Warm, a little wry. Picked by biome, time of day and weather.
// All text is original.
import type { Age } from '../src/render/peopleModels';
import type { Site } from '../src/world/sites';

export interface LineCtx {
  hour: number;
  weather?: string;
  day: number;
  india?: boolean;
}

type Pool = { text: string; when?: (s: Site, c: LineCtx) => boolean }[];

const night = (_: Site, c: LineCtx) => c.hour >= 19 || c.hour < 5;
const dawn = (_: Site, c: LineCtx) => c.hour >= 5 && c.hour < 7.5;
const rain = (_: Site, c: LineCtx) => c.weather === 'rain' || c.weather === 'storm';
const fog = (_: Site, c: LineCtx) => c.weather === 'fog';
const biome = (...b: string[]) => (s: Site) => b.includes(s.biome);
const india = (_: Site, c: LineCtx) => !!c.india;

export const DIALOGUE: Record<string, Pool> = {
  pumpHello: [
    { text: 'Full tank?' },
    { text: "Full tank? Meter's at zero, ready when you are.", when: india },
    { text: 'Coming down from the ghats? Let the brakes cool while I fill her up.', when: india },
    { text: "Evening. You're the third car since lunch.", when: biome('desert') },
    { text: 'Long way from anywhere out here. Fill her up?', when: biome('desert', 'forest') },
    { text: 'Rain makes everyone thirsty, cars included.', when: rain },
    { text: "Night shift's quiet. I like it. Full tank?", when: night },
    { text: "Early start? The road's all yours at this hour.", when: dawn },
    { text: 'Sea air eats paint. Nice colour though.', when: biome('coast') },
    { text: 'Arre, good timing, the tanker came this morning. Full tank?', when: india },
  ],
  pumpDone: [
    { text: 'All done. Drive slow, see more.' },
    { text: "There you go. Next pump's a fair way, but you'll make it." },
    { text: 'Done. Windshield could use a wash, but who am I to say.' },
    { text: 'Shubh yatra. Safe travels.', when: india },
    { text: 'Hogi banni, as my mother says: go, and come back.', when: india },
    { text: "Done. Watch for deer after dark, they don't watch for you.", when: biome('forest') },
  ],
  dinerHello: [
    { text: 'Sit anywhere. The thali is ready and the lassi is cold.' },
    { text: 'Window table? You can keep an eye on your car from there.' },
    { text: 'You look like you drove a long way. Sit.' },
    { text: 'Rain on the glass, chai on the table. Best seat in the house.', when: rain },
    { text: 'Kitchen stays open all night. The drivers keep us busy.', when: night },
    { text: 'Sit, sit. Chai in two minutes, rotis straight off the tawa.', when: india },
    { text: 'Ek chai, kadak? Strong, the way the truckers like it.', when: india },
  ],
  dinerBye: [
    { text: 'Light changed while you sat. Funny how it does that.' },
    { text: 'Come back when you pass this way again.' },
    { text: 'Pinne kaanam. See you later.', when: india },
    { text: 'Abar dekha hobe! We will meet again.', when: india },
  ],
  motelHello: [
    { text: 'Room 4 faces the lawn. Sunrise comes right in.' },
    { text: "Key's at the desk. Checkout is whenever you wake up." },
    { text: 'Hot water comes at six. The peacocks come earlier.', when: india },
    { text: 'Quiet night tonight. Just the crickets.', when: night },
    { text: 'Fog rolls off by morning, usually.', when: fog },
  ],
  standHello: [
    { text: 'Everything here I made myself. Mostly.' },
    { text: "That one's the only one I've got. Won't make another." },
    { text: "Take your time. I'm not going anywhere, clearly." },
    { text: 'Rain keeps the browsers away. You can have the good spot.', when: rain },
  ],
  tapriHello: [
    { text: 'One cutting? Half a glass, full taste.' },
    { text: "Less sugar or regular? Regular's already in, but I'll make you another." },
    { text: 'Vanakkam! Chai or filter coffee? The decoction is fresh.' },
    { text: 'Chala, sit on the bench. Glass is hot, hold from the top.' },
  ],
  freeRoll: [
    { text: "Out of film? Here. First one's on the house." },
    { text: "Can't let a traveller go without film. This one's on me." },
  ],
};

let counter = 0;
export function pickLine(key: string, site: Site, ctx: LineCtx): string {
  const pool = (DIALOGUE[key] ?? []).filter((l) => !l.when || l.when(site, ctx));
  if (!pool.length) return '';
  // prefer conditional lines when they apply
  const special = pool.filter((l) => l.when);
  const usable = special.length && (counter++ % 2 === 0) ? special : pool;
  const seed = Math.floor(ctx.hour * 3) + ctx.day * 31 + site.id.length * 7 + counter;
  return usable[seed % usable.length].text;
}

/** Convenience used by UI code with a game object. */
export function lines(key: string, site: Site, g: { hour: number; day: number; weatherName?: string; indiaOn?: boolean }): string {
  return pickLine(key, site, { hour: g.hour, day: g.day, weather: g.weatherName, india: g.indiaOn });
}

// ---------------------------------------------------------------- people at stops (talk)
export const TALK: Record<string, Pool> = {
  attendant: [
    { text: 'Most people just drive through. Nice to see someone stop.' },
    { text: "There's a lake past the next bend. Go slow and look left." },
    { text: "Night's the best shift. Owls come sit on the price sign." },
    { text: 'I count cars for fun. You were number nine today.' },
    { text: 'Road gets twisty further on. The view is worth it.' },
    { text: 'If the needle hits E, just keep rolling slow. Everyone makes it eventually.' },
    { text: 'Arre, you have a camera! Take one of the pumps, they never get photographed.', when: india },
  ],
  cook: [
    { text: "Today's special is whatever's left." },
    { text: 'Truckers say the sunsets are better from the hill behind us.' },
    { text: 'I make the coffee strong. Drivers need it.' },
    { text: 'Rain days are busy. Everyone wants soup.', when: rain },
    { text: 'You should come back for breakfast. The light in here is lovely at dawn.' },
    { text: 'Roti is fresh, dal is fresh, the pickle is my mother-in-law\'s. Strong.', when: india },
  ],
  clerk: [
    { text: 'Checkout is whenever you wake up. We are not strict.' },
    { text: 'Somebody saw lights in the northern sky last winter. Green ones.' },
    { text: 'Room 4. The good window. Trust me.' },
    { text: 'The crickets do the night shift here.', when: night },
  ],
  owner: [
    { text: 'I carve one of each. Then I get bored.' },
    { text: 'People drive past at speed and miss everything. Not you, I see.' },
    { text: 'The side road behind me goes somewhere nice. I won\'t say where.' },
    { text: 'Everything here is made within ten kilometres.' },
    { text: 'Rain is good for business. People stop under the awning.', when: rain },
  ],
  chaiwala: [
    { text: "First glass of the morning is the best one. Don't tell the second glass." },
    { text: 'Truck drivers tell me where the elephants cross. I tell nobody. Except you.' },
    { text: 'Cutting chai, half glass. For drivers who still have far to go.' },
    { text: 'Chala, sit. The bus is late anyway.' },
  ],
};

export function talkLine(role: string, n: number, site: Site, ctx: LineCtx): string {
  const pool = (TALK[role] ?? TALK.owner).filter((l) => !l.when || l.when(site, ctx));
  return pool[(n + site.id.length) % pool.length].text;
}

// ---------------------------------------------------------------- hitchhikers
export interface Hitcher {
  id: string;
  name: string;
  who: string;
  india?: boolean;
  ride: [number, number]; // km
  /** what the dialogue establishes about them; anything left out is rolled from the seed */
  look?: { sex?: 'm' | 'f'; age?: Age };
  lines: string[];
  bye: string;
  tip: string; // {place} is replaced with the marked spot's description
}

export const HITCHERS: Hitcher[] = [
  {
    id: 'hiker', name: 'Mira', who: 'a hiker with a map she doesn\'t trust', look: { sex: 'f' }, ride: [3, 6],
    lines: ['Thanks. My feet were filing a complaint.', 'This map says the road goes straight. The road disagrees.', 'I like a car with a radio. Leave it on, if you don\'t mind.', 'Do you ever just pull over to look at something? I do it all the time.'],
    bye: 'This is me. Thanks for the ride.',
    tip: 'Before you go: {place}. I marked it on your atlas.',
  },
  {
    id: 'musician', name: 'Tomas', who: 'a musician with a battered case', ride: [4, 8],
    lines: ['Careful with the case. It has opinions.', 'I play the night station sometimes. Not on the radio, in my head.', 'Every town has one good bench. I find it, I play, I leave.', 'You drive like someone who isn\'t late for anything. Good.'],
    bye: 'Here\'s fine. Keep the radio on.',
    tip: 'Since you carry a camera: {place}. On your map now.',
  },
  {
    id: 'farmer', name: 'Ines', who: 'a farmer heading to the market town', ride: [3, 5],
    lines: ['Bus broke down. Again. Third time this month.', 'My cows know the bus schedule better than the bus does.', 'Spring is my favourite. Everything is trying very hard.', 'You should see these fields after the rain. Like they were painted.'],
    bye: 'Market\'s just there. Thank you, really.',
    tip: 'One thing: {place}. I put it on your atlas.',
  },
  // India layer: everyday travellers from across the country
  {
    id: 'student', name: 'Meghna', who: 'a college student heading home to Kolkata for Durga Puja', india: true, ride: [5, 8],
    lines: ['Thank you, dada! Every bus was full, everyone is going home.', 'Ma will make luchi the moment I walk in. I can already smell it.', 'Five days of pandal-hopping. I will sleep after Puja.', 'My hostel friends went home for Onam and Pongal already. Now my turn.'],
    bye: 'Abar dekha hobe! See you again.',
    tip: 'Listen, {place}. I have marked it for you.',
  },
  {
    id: 'student2', name: 'Lalrin', who: 'a student going home to Aizawl for Christmas', india: true, ride: [4, 7],
    lines: ['Thank you! Long way to Mizoram, every lift helps.', 'My grandmother makes the best bread at Christmas. The whole street comes.', 'Have you heard a church choir in the hills? You must, once.', 'You drive slowly. My mother would approve.'],
    bye: 'This is my junction. Merry Christmas in advance!',
    tip: 'Since you like photographs: {place}. On your map now.',
  },
  {
    id: 'teacher', name: 'Mrs. Pillai', who: 'a retired schoolteacher visiting her old school', india: true, look: { sex: 'f', age: 'elder' }, ride: [3, 6],
    lines: ['Thirty-four years I taught geography. Now I finally see it.', 'My students write to me still. One is a pilot. One is a chef. Both are very loud.', 'Look at that cutting. Laterite. Red soil, made by centuries of monsoon. Remember that.', 'Do you know why the milestones have colours? Yellow means national highway. Green is state. Very sensible.'],
    bye: 'Here, here, near the gate. Romba nandri. Thank you very much.',
    tip: 'One more lesson, free of charge: {place}. I have marked it.',
  },
  {
    id: 'trucker', name: 'Selvam', who: 'a truck driver whose lorry is at the mechanic', india: true, ride: [4, 8],
    lines: ['Clutch plate gone. Mechanic says tomorrow. Mechanics always say tomorrow.', 'Twenty years on this highway. I know every dhaba by the taste of the dal.', 'At night, dip your lights for oncoming traffic. Half the highway forgets.', 'My son wants to drive trucks too. I told him, first learn to sleep sitting up.'],
    bye: 'Drop me at the dhaba, anna. My friends will be there.',
    tip: 'Driver to driver: {place}. Marked it.',
  },
  {
    id: 'pilgrim', name: 'Rehana-bi', who: 'a pilgrim on her way to a dargah on the coast', india: true, look: { sex: 'f', age: 'elder' }, ride: [3, 6],
    lines: ['Every year I go, since I was a girl. My knees go slower now, that\'s all.', 'The qawwali on Thursday evenings, you should hear it. Your heart sits down.', 'People from every village come. Hindu, Muslim, Christian, everyone ties a thread.', 'You are kind to stop. Not everyone stops.'],
    bye: 'Here is good, beta. Go safely.',
    tip: 'And a small thing: {place}. I asked the boy to mark it on your map.',
  },
  {
    id: 'photographer', name: 'Neha', who: 'a photographer from Pune chasing the monsoon light', india: true, ride: [4, 7],
    lines: ['Oh, you shoot film too? Respect.', 'Everyone shoots the sunset. Turn around, the light behind you is better.', 'Rain clears, sun comes low, and the hills go electric green. Wait for it.', 'Chala, I talk too much. Tell me when to stop.'],
    bye: 'This is my spot. Light is perfect in an hour.',
    tip: 'Fair trade for the ride: {place}. Marked on your atlas.',
  },
];

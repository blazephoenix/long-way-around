// Deterministic placement of everything built beside the road: stops (gas, diner, motel,
// overlook, stand, toll), landmarks, quirky roadside things, towns and city blocks.
// Pure data, computed from the seed + main road only, so the worker and main thread agree.
import { World, CHUNK, ROAD_HALF, Branch } from './world';
import { hashInts, Rng, SYS } from './prng';
import type { BiomeId } from '../../data/biomes';
import { FEATURES } from '../core/features';

export type StopKind = 'gas' | 'diner' | 'motel' | 'overlook' | 'stand' | 'toll';
export type LandmarkKind =
  | 'lookout' | 'cabin' | 'lighthouse' | 'pier' | 'seastack' | 'watertower' | 'motelruin' | 'arch'
  | 'barn' | 'windmill' | 'silo' | 'temple' | 'ropebridge' | 'waterfall'
  | 'dino' | 'cup' | 'oddsign' | 'oldcar' | 'phonebooth'
  // India layer (milestone 7)
  | 'stepwell' | 'fishingnets' | 'banyan' | 'teaestate' | 'fortwall' | 'milestone' | 'ghatsign' | 'hairpin' | 'breaker';

export interface Site {
  id: string;
  kind: string; // StopKind | LandmarkKind | 'building' | 'tower' | 'streetlight' | 'bench'
  cat: 'stop' | 'landmark' | 'building' | 'deco';
  x: number;
  z: number;
  y?: number;
  heading: number; // radians, model faces -z rotated by heading (yaw convention)
  s: number;
  side: number;
  clear: number; // vegetation-free radius
  biome: BiomeId;
  variant?: string;
  w?: number;
  d?: number;
  h?: number;
  color?: number;
  color2?: number;
  text?: string;
  /** flatten terrain: circle (r) or road-aligned pad */
  flat?: { r: number; y: number };
  pad?: { s0: number; s1: number; u0: number; u1: number; side: number };
  /** carve a pit (stepwells) inside the flattened area */
  pit?: { r: number; depth: number };
  rare?: boolean;
}

const PRIORITY: Record<StopKind, number> = { gas: 5, diner: 4, motel: 4, toll: 3, overlook: 2, stand: 1 };
const SPACING = 480;

interface Cand { kind: StopKind; s: number; side: number; seed: number }

function stopCandidates(world: World, s0: number, s1: number): Cand[] {
  const out: Cand[] = [];
  const seed = world.seed;
  const cell = (len: number, off: number, jit: number, chance: number, sys: number, f: (s: number, r: Rng) => Cand | null) => {
    for (let k = Math.floor((s0 - off - jit) / len); k <= Math.floor((s1 - off + jit) / len); k++) {
      const r = new Rng(hashInts(seed, SYS.stop, sys, k));
      const s = k * len + off + r.range(-jit, jit);
      if (!r.chance(chance)) continue;
      if (s < 600) continue; // keep the start of the road clear
      const c = f(s, r);
      if (c) out.push(c);
    }
  };
  cell(5500, 1700, 750, 1, 1, (s, r) => ({ kind: 'gas', s, side: r.chance(0.8) ? 1 : -1, seed: r.int(0, 1e9) }));
  cell(8200, 4300, 1500, 0.85, 2, (s, r) => ({ kind: r.chance(0.55) ? 'diner' : 'motel', s, side: r.chance(0.7) ? 1 : -1, seed: r.int(0, 1e9) }));
  cell(3400, 900, 900, 0.6, 3, (s, r) => ({ kind: 'overlook', s, side: r.chance(0.5) ? 1 : -1, seed: r.int(0, 1e9) }));
  cell(2600, 300, 700, 0.5, 4, (s, r) => ({ kind: 'stand', s, side: r.chance(0.7) ? 1 : -1, seed: r.int(0, 1e9) }));
  cell(23000, 12000, 4000, 0.55, 5, (s, r) => ({ kind: 'toll', s, side: 1, seed: r.int(0, 1e9) }));
  return out;
}

const stopCache = new WeakMap<World, Map<number, Site[]>>();
const siteCache = new WeakMap<World, Map<number, Site[]>>();

/** Stops whose station lies in chunk c. */
export function chunkStops(world: World, c: number): Site[] {
  let m = stopCache.get(world);
  if (!m) stopCache.set(world, (m = new Map()));
  const hit = m.get(c);
  if (hit) return hit;
  const s0 = c * CHUNK, s1 = s0 + CHUNK;
  const cands = stopCandidates(world, s0 - 3000, s1 + 3000).sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || a.s - b.s);
  const kept: Cand[] = [];
  for (const orig of cands) {
    const cd = { ...orig };
    // shift instead of dropping, so stations keep their rhythm
    let ok = false;
    for (let tries = 0; tries < 4 && !ok; tries++) {
      const clash = kept.some((k) => Math.abs(k.s - cd.s) < (cd.kind === 'gas' || k.kind === 'gas' ? 600 : SPACING));
      const F = world.chunkFeatures(Math.floor(cd.s / CHUNK));
      const river = F.river && Math.abs(F.river.s - cd.s) < 70;
      if (!clash && !river) ok = true;
      else cd.s += cd.kind === 'gas' ? 160 : 520;
    }
    if (ok) kept.push(cd);
  }
  const out: Site[] = [];
  for (const cd of kept) {
    if (cd.s < s0 || cd.s >= s1) continue;
    const r = world.road(cd.s);
    const biome = world.dominantBiome(cd.s);
    const rng = new Rng(cd.seed);
    let side = cd.side;
    if (biome === 'coast') {
      // build on the land side
      side = -world.seaSide(world.segIndex(cd.s));
    }
    const len = cd.kind === 'gas' ? 70 : cd.kind === 'overlook' ? 46 : cd.kind === 'stand' ? 26 : cd.kind === 'toll' ? 0 : 60;
    const depth = cd.kind === 'gas' ? 34 : cd.kind === 'overlook' ? 16 : cd.kind === 'stand' ? 11 : 30;
    const u = cd.kind === 'toll' ? 0 : side * (ROAD_HALF + depth * 0.5 + 1);
    const x = r.x + r.nx * u, z = r.z + r.nz * u;
    // building faces the road: heading so that model -z points toward the road
    const heading = cd.kind === 'toll' ? Math.atan2(-r.tx, -r.tz) : Math.atan2(-(r.x - x), -(r.z - z));
    out.push({
      id: `stop:${cd.kind}:${Math.round(cd.s)}`,
      kind: cd.kind,
      cat: 'stop',
      x, z, s: cd.s, side, heading,
      clear: cd.kind === 'toll' ? 18 : Math.max(len, depth) * 0.75 + 6,
      biome,
      variant: stopVariant(cd.kind, biome, rng),
      pad: cd.kind === 'toll' ? undefined : { s0: cd.s - len / 2, s1: cd.s + len / 2, u0: ROAD_HALF, u1: ROAD_HALF + depth + 2, side },
      w: len,
      d: depth,
    });
  }
  m.set(c, out);
  return out;
}

function stopVariant(kind: StopKind, biome: BiomeId, rng: Rng): string {
  const r = rng.float();
  const tail = rng.float().toFixed(4);
  if (!FEATURES.india) return tail;
  if (kind === 'diner' && biome !== 'city' && r < 0.6) return 'dhaba' + tail;
  if (kind === 'stand') {
    if ((biome === 'coast' || biome === 'tropical') && r < 0.35) return 'coconut' + tail;
    if (biome === 'farm' && r < 0.35) return 'sugarcane' + tail;
    if (r > 0.55) return 'tapri' + tail;
  }
  return tail;
}

const LANDMARKS: Record<BiomeId, [LandmarkKind, number][]> = {
  forest: [['lookout', 1], ['cabin', 2]],
  coast: [['lighthouse', 1], ['pier', 1], ['seastack', 1.5]],
  desert: [['watertower', 1], ['motelruin', 0.8], ['arch', 1]],
  farm: [['barn', 2], ['windmill', 1.2], ['silo', 1.2]],
  tropical: [['temple', 1], ['waterfall', 1.2]],
  city: [],
};
const QUIRKY: [LandmarkKind, number][] = [['dino', 0.5], ['cup', 0.6], ['oddsign', 1.5], ['oldcar', 1.2], ['phonebooth', 0.5]];
const LANDMARKS_IN: Partial<Record<BiomeId, [LandmarkKind, number][]>> = {
  coast: [['fishingnets', 1.3]],
  desert: [['fortwall', 0.9], ['stepwell', 0.5]],
  farm: [['banyan', 1.5]],
  tropical: [['teaestate', 1.6]],
};
function landmarksFor(b: BiomeId): [LandmarkKind, number][] {
  return FEATURES.india ? [...LANDMARKS[b], ...(LANDMARKS_IN[b] ?? [])] : LANDMARKS[b];
}

// invented town names for kilometre stones
const TP = ['Kanna', 'Pathra', 'Chandra', 'Sona', 'Mela', 'Hari', 'Neela', 'Kaveri', 'Gopal', 'Shanti', 'Tara', 'Belu', 'Kodi', 'Mangal', 'Vela', 'Siri', 'Amba', 'Dhara', 'Pala', 'Mohan', 'Lakshmi', 'Jamun', 'Nimba', 'Ratna'];
const TS = ['pura', 'gadh', 'palli', 'kere', 'nagar', 'pur', 'wadi', 'halli', 'ganj', 'kote', 'patti', 'ur', 'gaon', 'bari', 'kund', 'sar'];
export function townName(seed: number, k: number): string {
  const h = hashInts(seed, SYS.name, k);
  return (TP[h % TP.length] + TS[(h >>> 8) % TS.length]).toUpperCase();
}

/** original, punny road-safety rhymes for hill roads (all invented) */
export const GHAT_SIGNS = [
  'TAKE THE BEND\nSLOW, MY FRIEND',
  'DRIVE LIKE THERE IS CHAI IN YOUR CUP\nNO SPILLS ON THE WAY UP',
  'THE MOUNTAIN IS SLOW\nSO GO WITH ITS FLOW',
  'BRAKE BEFORE THE BEND\nNOT AT THE END',
  'MIST AHEAD?\nGO SLOW INSTEAD',
  'HORN AT THE CURVE\nSAVES EVERYONE\'S NERVE',
  'LOW GEAR DOWN\nALL THE WAY TO TOWN',
  'PARK TO ENJOY THE VIEW\nTHE HILLS WILL WAIT FOR YOU',
  'DON\'T FEED THE MONKEY\nHIS DIET IS FUNKY',
  'SLOW AND STEADY\nTHE VIEW IS READY',
];

const bendCache = new WeakMap<World, Map<number, number[]>>();
/** stations of the sharp bends in a tropical segment, in order */
export function segmentBends(world: World, seg: number): number[] {
  let m = bendCache.get(world);
  if (!m) bendCache.set(world, (m = new Map()));
  const hit = m.get(seg);
  if (hit) return hit;
  const a = world.segStart(seg), b = world.segStart(seg + 1);
  const hd = (s: number) => Math.atan(world.road(s).slope);
  const out: number[] = [];
  let prev = 0, best = 0, bestS = 0, inBend = false;
  for (let s = a + 50; s < b - 50; s += 10) {
    const d = Math.abs(hd(s + 40) - hd(s - 40));
    if (d > 0.22) {
      if (!inBend) { inBend = true; best = 0; }
      if (d > best) { best = d; bestS = s; }
    } else if (inBend) {
      inBend = false;
      out.push(bestS);
    }
    prev = d;
  }
  void prev;
  m.set(seg, out);
  return out;
}

const TOWN_COLORS = [0xe9d8b8, 0xb9d6e0, 0xf0c6c0, 0xcfe3c4, 0xf2e2a0, 0xe8e4dc, 0xd9b48f, 0xc4cbe8, 0xf4f0e6];
const ROOF_COLORS = [0x8a4a3a, 0x6a6a6a, 0x9a5a3a, 0x4f5f6f, 0xb5764f];

function townness(world: World, s: number): number {
  // 0..1 density of town buildings along the road
  const b = world.dominantBiome(s);
  if (b === 'city') {
    const k = world.segIndex(s);
    const a = world.segStart(k), e = world.segStart(k + 1);
    const t = (s - a) / (e - a);
    return 0.45 + 0.55 * Math.max(0, 1 - Math.abs(t - 0.5) * 2.2);
  }
  if (b === 'farm' || b === 'coast') {
    const cell = Math.floor(s / 7000);
    const r = new Rng(hashInts(world.seed, SYS.landmark, 900, cell));
    if (!r.chance(b === 'farm' ? 0.75 : 0.5)) return 0;
    const centre = cell * 7000 + r.range(1500, 5500);
    const half = r.range(180, 320);
    const d = Math.abs(s - centre);
    return d < half ? 0.55 : d < half + 120 ? 0.2 : 0;
  }
  return 0;
}

export function townDensity(world: World, s: number) {
  return townness(world, s);
}

/** All sites (stops, landmarks, buildings, deco) in chunk c. */
export function chunkSites(world: World, c: number): Site[] {
  let m = siteCache.get(world);
  if (!m) siteCache.set(world, (m = new Map()));
  const hit = m.get(c);
  if (hit) return hit;
  const out: Site[] = [...chunkStops(world, c)];
  m.set(c, out); // early set guards recursion
  const s0 = c * CHUNK;
  const sm = s0 + CHUNK / 2;
  const biome = world.dominantBiome(sm);
  const rng = new Rng(hashInts(world.seed, SYS.landmark, c));
  const blocked = (x: number, z: number, r: number) => out.some((o) => Math.hypot(o.x - x, o.z - z) < o.clear + r);

  // ---------- biome landmark
  const list = landmarksFor(biome);
  if (list.length && rng.chance(biome === 'coast' ? 0.35 : 0.28)) {
    const kind = rng.weighted(list.map((l) => l[0]), list.map((l) => l[1]));
    placeLandmark(world, out, rng, kind, biome, c, blocked);
  }
  // ---------- quirky roadside
  if (biome !== 'city' && rng.chance(0.07)) {
    const kind = rng.weighted(QUIRKY.map((l) => l[0]), QUIRKY.map((l) => l[1]));
    const s = s0 + rng.range(20, CHUNK - 20);
    const side = rng.chance(0.5) ? 1 : -1;
    const r = world.road(s);
    const u = side * (ROAD_HALF + rng.range(6, 14));
    const x = r.x + r.nx * u, z = r.z + r.nz * u;
    if (!blocked(x, z, 8)) {
      out.push({ id: `lm:${kind}:${c}`, kind, cat: 'landmark', x, z, s, side, heading: Math.atan2(-(r.x - x), -(r.z - z)) + rng.range(-0.4, 0.4), clear: 9, biome, variant: rng.float().toFixed(4), flat: { r: 6, y: world.heightBase(x, z) } });
    }
  }
  // ---------- branch point of interest
  const br = world.chunkFeatures(c).branch;
  if (br?.poi) placePoi(world, out, br, biome, rng);

  // ---------- India layer: kilometre stones, ghat signs, hairpin boards, speed breakers
  if (FEATURES.india) indiaRoad(world, out, c, biome);

  // ---------- towns and city
  const town = townness(world, sm);
  if (town > 0) placeTown(world, out, c, biome, town, rng, blocked);
  m.set(c, out);
  return out;
}

function indiaRoad(world: World, out: Site[], c: number, biome: BiomeId) {
  const s0 = c * CHUNK;
  const seg = world.segIndex(s0 + CHUNK / 2);
  // national highway (yellow) or state highway (green) for this stretch
  const nh = hashInts(world.seed, SYS.india, seg, 1) % 10 < 6;
  const roadNo = 10 + (hashInts(world.seed, SYS.india, seg, 2) % 89);
  for (let k = Math.ceil(s0 / 1000); k * 1000 < s0 + CHUNK; k++) {
    const s = k * 1000;
    const r = world.road(s);
    const u = ROAD_HALF + 1.3;
    const zero = hashInts(world.seed, SYS.india, k, 3) % 250 === 0;
    const dist = zero ? 0 : 3 + (hashInts(world.seed, SYS.india, k, 4) % 60);
    out.push({
      id: zero ? `ms0:${k}` : `ms:${k}`, kind: zero ? 'milestone0' : 'milestone', cat: 'landmark',
      x: r.x + r.nx * u, z: r.z + r.nz * u, s, side: 1, heading: Math.atan2(-r.tx, -r.tz), clear: 1.5, biome,
      text: `${nh ? 'NH' : 'SH'} ${roadNo}|${townName(world.seed, Math.floor(k / 7) + (zero ? 0 : 1))}|${dist}`,
      color: nh ? 0xf2c230 : 0x2f8a4a,
    });
  }
  const rng = new Rng(hashInts(world.seed, SYS.india, c, 9));
  const r0 = world.road(s0 + CHUNK / 2);
  // punny safety rhymes on hill stretches
  if ((biome === 'tropical' || biome === 'forest') && Math.abs(r0.grade) > 0.025 && rng.chance(0.28)) {
    const s = s0 + rng.range(30, CHUNK - 30);
    const r = world.road(s);
    const u = ROAD_HALF + 1.6;
    const k = hashInts(world.seed, SYS.india, c, 11) % GHAT_SIGNS.length;
    out.push({ id: `gs:${c}`, kind: 'ghatsign', cat: 'landmark', x: r.x + r.nx * u, z: r.z + r.nz * u, s, side: 1, heading: Math.atan2(-r.tx, -r.tz), clear: 2, biome, text: GHAT_SIGNS[k], variant: String(k) });
  }
  // numbered hairpin boards on ghat roads
  if (biome === 'tropical') {
    const bends = segmentBends(world, seg);
    bends.forEach((bs, i) => {
      if (bs < s0 || bs >= s0 + CHUNK) return;
      const s = bs - 45;
      const r = world.road(s);
      const u = ROAD_HALF + 1.4;
      out.push({ id: `hp:${seg}:${i}`, kind: 'hairpin', cat: 'deco', x: r.x + r.nx * u, z: r.z + r.nz * u, s, side: 1, heading: Math.atan2(-r.tx, -r.tz), clear: 2, biome, text: `HAIRPIN BEND\n${i + 1}/${bends.length}` });
    });
  }
  // speed breaker at the edge of a village, with its warning painted just after it
  if ((biome === 'farm' || biome === 'coast' || biome === 'city') && townness(world, s0 + CHUNK / 2) > 0 && townness(world, s0 - CHUNK / 2) === 0) {
    const s = s0 + 25;
    const r = world.road(s);
    out.push({ id: `sb:${c}`, kind: 'breaker', cat: 'deco', x: r.x, z: r.z, s, side: 0, heading: Math.atan2(-r.tx, -r.tz), clear: 0, biome });
    const r2 = world.road(s + 16);
    const u = ROAD_HALF + 1.2;
    out.push({ id: `sbs:${c}`, kind: 'breakersign', cat: 'deco', x: r2.x + r2.nx * u, z: r2.z + r2.nz * u, s: s + 16, side: 1, heading: Math.atan2(-r2.tx, -r2.tz), clear: 1.5, biome, text: 'SPEED BREAKER\nAHEAD' });
  }
}

/** Height added by a speed breaker under (x,z), 0 if none. */
export function breakerBump(world: World, x: number, z: number): number {
  const c = Math.floor(z / CHUNK);
  for (const s of chunkSites(world, c)) {
    if (s.kind !== 'breaker') continue;
    const d = Math.abs(z - s.s);
    if (d > 0.9) continue;
    if (Math.abs(world.lateral(x, z)) > ROAD_HALF) continue;
    return 0.11 * Math.cos((d / 0.9) * Math.PI * 0.5);
  }
  return 0;
}

function placeLandmark(world: World, out: Site[], rng: Rng, kind: LandmarkKind, biome: BiomeId, c: number, blocked: (x: number, z: number, r: number) => boolean) {
  const s0 = c * CHUNK;
  let best: Site | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 5; i++) {
    const s = s0 + rng.range(20, CHUNK - 20);
    const r = world.road(s);
    let side = rng.chance(0.5) ? 1 : -1;
    let u: number;
    if (kind === 'lighthouse' || kind === 'pier' || kind === 'seastack' || kind === 'fishingnets') {
      side = world.seaSide(world.segIndex(s));
      u = side * (kind === 'seastack' ? rng.range(120, 220) : kind === 'pier' || kind === 'fishingnets' ? rng.range(60, 120) : rng.range(40, 60));
    } else if (kind === 'banyan') u = side * rng.range(16, 26);
    else if (kind === 'stepwell') u = side * rng.range(32, 60);
    else u = side * rng.range(kind === 'cabin' || kind === 'barn' ? 30 : 45, kind === 'lookout' || kind === 'windmill' || kind === 'fortwall' ? 220 : 140);
    const x = r.x + r.nx * u, z = r.z + r.nz * u;
    const h = world.heightBase(x, z);
    // landmarks like ridgelines (visible from the road); coast ones need the right ground
    let score = h - r.y;
    if (kind === 'seastack') score = h < -1 ? 10 : -100;
    if (kind === 'lighthouse') score = h > 3 ? 10 - Math.abs(Math.abs(u) - 50) * 0.1 : -100;
    if (kind === 'pier') score = h < 2 && h > -3 ? 10 : -50;
    if (kind === 'fishingnets') score = h < 1.2 && h > -1.5 ? 12 : -50;
    if (kind === 'banyan') score = 5 - Math.abs(h - r.y) + rng.float();
    if (kind === 'stepwell') score = 5 - Math.abs(h - r.y) * 0.5 + rng.float();
    if (kind === 'teaestate') score = world.noise.n2(x / 700 + 9, z / 700 - 4) > 0.28 ? 10 + rng.float() : -60;
    if (kind === 'cabin' || kind === 'barn' || kind === 'temple') score = -Math.abs(h - r.y) + rng.float();
    if (kind === 'waterfall') score = h - r.y > 12 ? 20 : h - r.y;
    if (blocked(x, z, 20)) score -= 1000;
    if (kind !== 'seastack' && kind !== 'pier' && world.waterAt(x, z) !== null) score -= 1000;
    if (score > bestScore) {
      bestScore = score;
      const heading = Math.atan2(-(r.x - x), -(r.z - z));
      const pitty = kind === 'stepwell';
      best = { id: `lm:${kind}:${c}`, kind, cat: 'landmark', x, z, s, side, heading, pit: pitty ? { r: 9.5, depth: 7.5 } : undefined, clear: kind === 'seastack' || kind === 'teaestate' ? 0 : kind === 'fortwall' ? 22 : kind === 'banyan' ? 12 : 16, biome, variant: rng.float().toFixed(4), flat: kind === 'seastack' || kind === 'pier' || kind === 'fishingnets' || kind === 'teaestate' ? undefined : { r: kind === 'barn' || kind === 'temple' ? 12 : kind === 'fortwall' ? 16 : kind === 'stepwell' ? 14 : 7, y: h } };
    }
  }
  if (best && bestScore > -100) out.push(best);
}

function placePoi(world: World, out: Site[], br: Branch, biome: BiomeId, rng: Rng) {
  const p = br.poi!;
  const id = `poi:${br.id}`;
  const y = world.heightBase(p.x, p.z);
  if (p.kind === 'overlook') out.push({ id: `${id}:overlook`, kind: 'bench', cat: 'deco', x: p.x, z: p.z, s: br.s0, side: br.side, heading: p.heading, clear: 10, biome, flat: { r: 8, y } });
  else if (p.kind === 'landmark') {
    const list = LANDMARKS[biome].length ? LANDMARKS[biome] : QUIRKY;
    let kind: LandmarkKind = rng.weighted(list.map((l) => l[0]), list.map((l) => l[1]));
    // quiet desert side roads end at a stepwell
    if (FEATURES.india && biome === 'desert' && rng.chance(0.65)) kind = 'stepwell';
    const lx = p.x + Math.sin(p.heading) * 16, lz = p.z + Math.cos(p.heading) * 16;
    if (kind !== 'seastack' && kind !== 'pier' && kind !== 'lighthouse')
      out.push({ id: `${id}:${kind}`, kind, cat: 'landmark', x: lx, z: lz, s: br.s0, side: br.side, heading: p.heading + Math.PI, clear: kind === 'stepwell' ? 22 : 16, biome, variant: rng.float().toFixed(4), flat: { r: kind === 'stepwell' ? 14 : 10, y: world.heightBase(lx, lz) }, pit: kind === 'stepwell' ? { r: 9.5, depth: 7.5 } : undefined });
  } else if (p.kind === 'stand') {
    out.push({ id: `stop:stand:b${br.chunk}`, kind: 'stand', cat: 'stop', x: p.x + Math.cos(p.heading) * 7, z: p.z - Math.sin(p.heading) * 7, s: br.s0, side: br.side, heading: p.heading - Math.PI / 2, clear: 12, biome, variant: rng.float().toFixed(4), flat: { r: 9, y }, w: 26, d: 11 });
  } else if (p.kind === 'hidden') {
    out.push({ id: `${id}:hidden`, kind: 'hidden', cat: 'deco', x: p.x, z: p.z, s: br.s0, side: br.side, heading: p.heading, clear: 12, biome, flat: { r: 8, y }, rare: true });
  }
}

function placeTown(world: World, out: Site[], c: number, biome: BiomeId, dens: number, rng: Rng, blocked: (x: number, z: number, r: number) => boolean) {
  const s0 = c * CHUNK;
  const city = biome === 'city';
  // frontage buildings both sides
  for (const side of [1, -1]) {
    let s = s0 + rng.range(0, 8);
    while (s < s0 + CHUNK) {
      const w = rng.range(7, city ? 16 : 12);
      if (rng.float() < dens) {
        const d = rng.range(7, 13);
        const floors = city ? rng.int(2, 6) : rng.int(1, 3);
        const r = world.road(s + w / 2);
        const u = side * (ROAD_HALF + 4.5 + d / 2 + rng.range(0, 3));
        const x = r.x + r.nx * u, z = r.z + r.nz * u;
        if (!blocked(x, z, Math.max(w, d) / 2)) {
          out.push({
            id: `bld:${c}:${side}:${Math.round(s)}`, kind: 'building', cat: 'building', x, z, s, side,
            heading: Math.atan2(-(r.x - x), -(r.z - z)), clear: Math.max(w, d) * 0.6 + 2, biome,
            w, d, h: floors * 3.2, color: rng.pick(TOWN_COLORS), color2: rng.pick(ROOF_COLORS), variant: rng.float().toFixed(4),
            flat: { r: Math.max(w, d) * 0.6, y: r.y },
          });
        }
      }
      s += w + rng.range(1, city ? 3 : 10);
    }
    // street lights
    for (let s = s0 + 15; s < s0 + CHUNK; s += 40) {
      const r = world.road(s);
      const u = side * (ROAD_HALF + 2.2);
      out.push({ id: `sl:${c}:${side}:${s}`, kind: 'streetlight', cat: 'deco', x: r.x + r.nx * u, z: r.z + r.nz * u, s, side, heading: Math.atan2(-r.nx * side, -r.nz * side), clear: 1.5, biome });
    }
  }
  // skyline towers behind the frontage in the city core
  if (city && dens > 0.7) {
    const n = rng.int(3, 7);
    for (let i = 0; i < n; i++) {
      const s = s0 + rng.range(0, CHUNK);
      const side = rng.chance(0.5) ? 1 : -1;
      const r = world.road(s);
      const u = side * rng.range(45, 240);
      const x = r.x + r.nx * u, z = r.z + r.nz * u;
      const w = rng.range(14, 26);
      if (blocked(x, z, w)) continue;
      out.push({
        id: `twr:${c}:${i}`, kind: 'tower', cat: 'building', x, z, s, side, heading: Math.atan2(-r.nx, -r.nz) + rng.range(-0.2, 0.2),
        clear: w * 0.75 + 3, biome, w, d: rng.range(14, 26), h: rng.range(30, 90) * (0.6 + dens * 0.4),
        color: rng.pick([0xc9d3dc, 0xdedad0, 0xb8c4cc, 0xe4d6c4, 0xa9b8c2]), color2: 0x6f7a84, variant: rng.float().toFixed(4),
        flat: { r: w * 0.7, y: world.heightBase(x, z) },
      });
    }
  }
}

/** Flattening for sites: returns adjusted height. Called by World.height. */
export function siteFlatten(world: World, x: number, z: number, h: number): number {
  const c = Math.floor(z / CHUNK);
  for (let i = c - 1; i <= c + 1; i++) {
    const arr = chunkSites(world, i);
    for (const s of arr) {
      if (s.pad) {
        const P = s.pad;
        if (z < P.s0 - 14 || z > P.s1 + 14) continue;
        const d = world.lateral(x, z) * P.side;
        if (d < P.u0 - 1 || d > P.u1 + 14) continue;
        const along = Math.min(z - (P.s0 - 14), P.s1 + 14 - z) / 14;
        const across = Math.min(1, (P.u1 + 14 - d) / 14);
        const k = Math.max(0, Math.min(1, Math.min(along, across)));
        const ky = k * k * (3 - 2 * k);
        const ty = world.roadY(z) - 0.1;
        h = h + (ty - h) * ky;
      } else if (s.flat) {
        const dx = x - s.x, dz = z - s.z;
        const R = s.flat.r + 10;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        const d = Math.sqrt(d2);
        const k = d < s.flat.r ? 1 : 1 - (d - s.flat.r) / 10;
        const ky = k * k * (3 - 2 * k);
        h = h + (s.flat.y - h) * ky;
        if (s.pit) {
          // square pit for a stepwell (Chebyshev distance keeps the edges straight)
          const ca = Math.cos(s.heading), sa = Math.sin(s.heading);
          const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
          const m = Math.max(Math.abs(lx), Math.abs(lz));
          if (m < s.pit.r) h = s.flat.y - s.pit.depth * Math.min(1, (s.pit.r - m) / 1.0);
        }
      }
    }
  }
  return h;
}

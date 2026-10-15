// Deterministic world: biome sequence, main road, terrain height, lakes, rivers, branches.
// Everything here is a pure function of the seed. It runs both on the main thread
// (physics, placement) and inside the generation worker (meshes, vegetation).
import { BIOMES, BiomeConfig, BiomeId } from '../../data/biomes';
import { Noise, smoothstep, clamp, lerp } from './noise';
import { hashInts, hashString, Rng, SYS } from './prng';
import { siteFlatten, breakerBump } from './sites';

export const CHUNK = 250;
export const ROAD_HALF = 3.75; // two 3.5 m lanes + markings
export const LANE = 1.85; // lane centre offset (traffic keeps left)
export const BRANCH_HALF = 2.4;
export const SEA_LEVEL = 0;
const SEG = 7000; // nominal biome segment length
const SEG_JITTER = 1500;
const BLEND_HALF = 750; // 1.5 km transitions

export interface BiomeBlend {
  a: BiomeId;
  b: BiomeId;
  t: number; // weight of b
  seg: number; // segment index of the dominant biome
}

export interface RoadSample {
  s: number;
  x: number;
  y: number;
  z: number;
  slope: number; // dX/ds
  grade: number; // dY/ds
  nx: number; // leftward unit normal (xz)
  nz: number;
  tx: number; // unit tangent (xz)
  tz: number;
  cosA: number;
  blend: BiomeBlend;
}

export interface Lake {
  x: number;
  z: number;
  r: number;
  level: number;
  poi?: boolean;
}

export interface River {
  s: number; // station where it crosses the main road
  level: number;
  width: number;
  wig: number;
}

export type PoiKind = 'lake' | 'overlook' | 'landmark' | 'stand' | 'hidden';
export type Surface = 'asphalt' | 'gravel' | 'dirt' | 'offroad';

export interface Branch {
  id: string;
  chunk: number;
  kind: 'deadend' | 'loop';
  side: number;
  s0: number;
  s1: number; // rejoin station for loops
  surface: 'gravel' | 'dirt';
  pts: Float32Array; // x,z pairs
  heights?: Float32Array; // lazily computed
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  poi?: { kind: PoiKind; x: number; z: number; heading: number };
  grid?: Map<number, number[]>;
}

export interface ChunkFeatures {
  c: number;
  lakes: Lake[];
  river: River | null;
  branch: Branch | null;
}

function key2(ix: number, iz: number) {
  return ix * 73856093 ^ iz * 19349663;
}

export class World {
  readonly seedStr: string;
  readonly seed: number;
  readonly noise: Noise;
  private n2: Noise;
  readonly n3: Noise;
  private segBiome = new Map<number, BiomeId>();
  private features = new Map<number, ChunkFeatures>();
  private roadCache = new Map<number, RoadSample>();
  private offsets: number[] = [];
  /** restrict to a single biome (milestone 1 / tests) */
  onlyBiome: BiomeId | null = null;

  constructor(seedStr: string, onlyBiome: BiomeId | null = null) {
    this.seedStr = seedStr;
    this.seed = hashString(seedStr);
    this.noise = new Noise(hashInts(this.seed, SYS.terrain));
    this.n2 = new Noise(hashInts(this.seed, SYS.road));
    this.n3 = new Noise(hashInts(this.seed, SYS.river));
    const r = new Rng(hashInts(this.seed, SYS.road, 99));
    for (let i = 0; i < 16; i++) this.offsets.push(r.range(0, 200));
    this.onlyBiome = onlyBiome;
  }

  // ---------------------------------------------------------------- biomes
  segStart(k: number): number {
    if (k === 0) return -1500;
    return k * SEG - 1500 + (hashInts(this.seed, SYS.biome, k, 1) / 4294967296 - 0.5) * 2 * SEG_JITTER;
  }

  segIndex(s: number): number {
    let k = Math.floor((s + 1500) / SEG);
    while (this.segStart(k) > s) k--;
    while (this.segStart(k + 1) <= s) k++;
    return k;
  }

  biomeOfSeg(k: number): BiomeId {
    if (this.onlyBiome) return this.onlyBiome;
    if (k === 0) return 'forest';
    const cached = this.segBiome.get(k);
    if (cached) return cached;
    // Walk the Markov chain from the nearest cached segment toward k.
    const dir = k > 0 ? 1 : -1;
    let j = k - dir;
    while (j !== 0 && !this.segBiome.has(j)) j -= dir;
    let prev: BiomeId = j === 0 ? 'forest' : this.segBiome.get(j)!;
    for (let i = j + dir; dir > 0 ? i <= k : i >= k; i += dir) {
      const adj = BIOMES[prev].adjacency;
      const ids = Object.keys(adj) as BiomeId[];
      const ws = ids.map((id) => adj[id]!);
      const rng = new Rng(hashInts(this.seed, SYS.biome, i, 2));
      prev = rng.weighted(ids, ws);
      this.segBiome.set(i, prev);
    }
    return prev;
  }

  biomeBlend(s: number): BiomeBlend {
    const k = this.segIndex(s);
    const cur = this.biomeOfSeg(k);
    const st = this.segStart(k);
    const en = this.segStart(k + 1);
    if (s - st < BLEND_HALF) {
      const t = smoothstep(-BLEND_HALF, BLEND_HALF, s - st);
      return { a: this.biomeOfSeg(k - 1), b: cur, t, seg: t > 0.5 ? k : k - 1 };
    }
    if (en - s < BLEND_HALF) {
      const t = smoothstep(-BLEND_HALF, BLEND_HALF, s - en);
      return { a: cur, b: this.biomeOfSeg(k + 1), t, seg: t > 0.5 ? k + 1 : k };
    }
    return { a: cur, b: cur, t: 0, seg: k };
  }

  dominantBiome(s: number): BiomeId {
    const b = this.biomeBlend(s);
    return b.t > 0.5 ? b.b : b.a;
  }

  biomeCfg(s: number): BiomeConfig {
    return BIOMES[this.dominantBiome(s)];
  }

  /** per-segment flag: which side the sea is on for coastal segments (+1 left / -1 right) */
  seaSide(seg: number): number {
    return hashInts(this.seed, SYS.biome, seg, 7) & 1 ? 1 : -1;
  }

  // ---------------------------------------------------------------- road
  private curveOf(b: BiomeConfig, s: number): number {
    const o = this.offsets;
    const r = b.road;
    return r.curveAmp * this.n2.n1(s / r.curveLen + o[1]) + r.curveAmp2 * this.n2.n1(s / r.curveLen2 + o[2]);
  }
  private elevOf(b: BiomeConfig, s: number): number {
    const o = this.offsets;
    const r = b.road;
    return r.baseElev + r.hillAmp * this.n2.n1(s / r.hillLen + o[3]) + r.hillAmp * 0.4 * this.n2.n1(s / (r.hillLen * 0.37) + o[4]);
  }

  roadX(s: number, bl?: BiomeBlend): number {
    const b = bl ?? this.biomeBlend(s);
    const meander = 1300 * this.n2.n1(s / 9000 + this.offsets[0]);
    const ca = this.curveOf(BIOMES[b.a], s);
    const cb = b.t > 0 ? this.curveOf(BIOMES[b.b], s) : ca;
    return meander + lerp(ca, cb, b.t);
  }

  roadY(s: number, bl?: BiomeBlend): number {
    const b = bl ?? this.biomeBlend(s);
    const ya = this.elevOf(BIOMES[b.a], s);
    const yb = b.t > 0 ? this.elevOf(BIOMES[b.b], s) : ya;
    return lerp(ya, yb, b.t) + 14 * this.n2.n1(s / 6500 + this.offsets[5]);
  }

  /** Full road frame at station s. Main road station s equals world z. */
  road(s: number): RoadSample {
    const hit = this.roadCache.get(s);
    if (hit) return hit;
    const bl = this.biomeBlend(s);
    const x = this.roadX(s, bl);
    const y = this.roadY(s, bl);
    const e = 0.75;
    const slope = (this.roadX(s + e) - this.roadX(s - e)) / (2 * e);
    const grade = (this.roadY(s + e) - this.roadY(s - e)) / (2 * e);
    const len = Math.sqrt(1 + slope * slope);
    const r: RoadSample = {
      s, x, y, z: s, slope, grade,
      nx: 1 / len, nz: -slope / len,
      tx: slope / len, tz: 1 / len,
      cosA: 1 / len, blend: bl,
    };
    if (this.roadCache.size > 6000) this.roadCache.clear();
    this.roadCache.set(s, r);
    return r;
  }

  /** Point at lateral offset u (leftward positive) from the main road at station s. */
  roadPoint(s: number, u: number): [number, number] {
    const r = this.road(s);
    return [r.x + r.nx * u, r.z + r.nz * u];
  }

  // ---------------------------------------------------------------- terrain
  /** Terrain detail relative to the road plane for one biome. */
  private detail(b: BiomeConfig, x: number, z: number, d: number, seg: number): number {
    const n = this.noise;
    const t = b.terrain;
    const sc = t.scale;
    switch (t.kind) {
      case 'rolling': {
        const h = n.fbm(x * sc, z * sc, 4) * t.amp + n.fbm(x * sc * 0.3 + 40, z * sc * 0.3, 2) * t.amp * 0.6;
        return h + 4;
      }
      case 'farm': {
        return n.fbm(x * sc, z * sc, 3) * t.amp + n.n2(x * sc * 3.1, z * sc * 3.1) * 2 + 2;
      }
      case 'steep': {
        const r = n.ridged(x * sc, z * sc, 4);
        return (r - 0.45) * t.amp * 1.35 + n.fbm(x * sc * 2, z * sc * 2, 2) * 6;
      }
      case 'flat': {
        return n.fbm(x * sc, z * sc, 2) * t.amp;
      }
      case 'mesa': {
        const m = n.fbm(x * sc + 11, z * sc - 7, 3);
        const plateau = smoothstep(0.18, 0.24, m) * t.amp + smoothstep(0.42, 0.46, m) * t.amp * 0.45;
        const dunes = n.fbm(x * sc * 2.4, z * sc * 2.4, 2) * 5;
        return plateau + dunes + 1;
      }
      case 'coast': {
        const side = this.seaSide(seg);
        const sd = d * side; // >0 toward sea
        const land = n.fbm(x * sc, z * sc, 4) * t.amp + 6;
        if (sd <= 0) return Math.max(land, -2);
        const cliffAt = 34 + n.n1(z / 260 + 3) * 12;
        const beachy = smoothstep(-0.2, 0.4, this.n3.n1(z / 1400 + 9)); // 1 = gentle beach, 0 = cliffs
        const width = lerp(14, 70, beachy);
        const drop = smoothstep(cliffAt, cliffAt + width, sd);
        const rel = lerp(Math.min(land, 4 + sd * 0.05), -(this.roadY(z) + 6) - sd * 0.02, drop);
        return rel + n.fbm(x * 0.02, z * 0.02, 2) * 2.5 * (1 - drop);
      }
    }
  }

  /** Road plane + biome detail only. No water carving, no branches. */
  heightBase(x: number, z: number): number {
    const r = this.road(z);
    const d = (x - r.x) * r.cosA;
    const ad = Math.abs(d);
    const bl = r.blend;
    const A = BIOMES[bl.a];
    const B = BIOMES[bl.b];
    const k = this.segIndex(z);
    let det = this.detail(A, x, z, d, bl.a === 'coast' ? this.coastSeg(k, bl.a) : k);
    let corr = A.terrain.corridor;
    if (bl.t > 0) {
      const dB = this.detail(B, x, z, d, bl.b === 'coast' ? this.coastSeg(k, bl.b) : k);
      det = lerp(det, dB, bl.t);
      corr = lerp(corr, B.terrain.corridor, bl.t);
    }
    const f = smoothstep(ROAD_HALF + 1.8, ROAD_HALF + corr, ad);
    let h = r.y + f * det;
    // keep a gentle verge right next to the road
    h = lerp(r.y - 0.12, h, smoothstep(ROAD_HALF + 0.2, ROAD_HALF + 2.5, ad));
    return h;
  }

  /** Terrain height with lakes and rivers, ignoring branch flattening (used to route branches). */
  heightNoBranch(x: number, z: number): number {
    let h = this.heightBase(x, z);
    const d = this.lateral(x, z);
    // lakes + rivers
    const c = Math.floor(z / CHUNK);
    for (let i = c - 3; i <= c + 3; i++) {
      const F = this.chunkFeatures(i);
      for (const L of F.lakes) {
        const dx = x - L.x, dz = z - L.z;
        const dd = dx * dx + dz * dz;
        const R = L.r * 1.7;
        if (dd > R * R) continue;
        const dist = Math.sqrt(dd);
        let carved: number;
        if (dist < L.r) carved = L.level - 0.4 - 3.5 * (1 - (dist / L.r) ** 2);
        else carved = lerp(L.level + 0.25, h, smoothstep(L.r, R, dist));
        if (carved < h) h = carved;
      }
      if (F.river) h = this.carveRiver(F.river, x, z, d, h);
    }
    return h;
  }

  private coastSeg(k: number, id: BiomeId): number {
    // the segment index that holds the coastal biome near segment k
    for (const j of [k, k - 1, k + 1]) if (this.biomeOfSeg(j) === id) return j;
    return k;
  }

  /** z of a river's centreline at lateral offset d from the main road */
  riverZ(R: River, d: number): number {
    return R.s + R.wig * this.n3.n1(d / 90 + R.s * 0.001) + d * 0.08 * Math.sign(R.wig);
  }

  private carveRiver(R: River, x: number, z: number, d: number, h: number): number {
    const along = Math.abs(d);
    if (along > 520) return h;
    const zr = this.riverZ(R, d);
    const dd = Math.abs(z - zr) * 0.95;
    const w = R.width;
    if (dd > w + 14) return h;
    const fade = 1 - smoothstep(380, 520, along);
    let carved: number;
    if (dd < w) carved = R.level - 0.4 - 1.6 * (1 - (dd / w) ** 2);
    else carved = lerp(R.level + 0.3, h, smoothstep(w, w + 14, dd));
    carved = lerp(h, carved, fade);
    return Math.min(h, carved);
  }

  /** Full terrain height including branch-road flattening. */
  height(x: number, z: number): number {
    let h = this.heightNoBranch(x, z);
    const c = Math.floor(z / CHUNK);
    for (let i = c - 13; i <= c + 2; i++) {
      const br = this.chunkFeatures(i).branch;
      if (!br) continue;
      if (x < br.minX - 20 || x > br.maxX + 20 || z < br.minZ - 20 || z > br.maxZ + 20) continue;
      const q = this.branchQuery(br, x, z);
      if (q.dist < BRANCH_HALF + 14) {
        const k = 1 - smoothstep(BRANCH_HALF + 0.6, BRANCH_HALF + 14, q.dist);
        h = lerp(h, q.y - 0.05, k);
      }
    }
    return siteFlatten(this, x, z, h);
  }

  /** Height a wheel or foot actually rests on: road decks bridge rivers. */
  ground(x: number, z: number): number {
    const r = this.road(z);
    const d = (x - r.x) * r.cosA;
    if (Math.abs(d) < ROAD_HALF + 1.2) return Math.max(this.height(x, z), r.y + 0.06) + breakerBump(this, x, z);
    return this.height(x, z);
  }

  /** Lateral distance from the main road centreline (leftward positive). */
  lateral(x: number, z: number): number {
    const r = this.road(z);
    return (x - r.x) * r.cosA;
  }

  surfaceAt(x: number, z: number): Surface {
    if (Math.abs(this.lateral(x, z)) < ROAD_HALF + 0.4) return 'asphalt';
    const c = Math.floor(z / CHUNK);
    for (let i = c - 13; i <= c + 2; i++) {
      const br = this.chunkFeatures(i).branch;
      if (!br) continue;
      if (x < br.minX - 6 || x > br.maxX + 6 || z < br.minZ - 6 || z > br.maxZ + 6) continue;
      if (this.branchQuery(br, x, z).dist < BRANCH_HALF + 0.5) return br.surface;
    }
    return 'offroad';
  }

  /** Water level at a point if inside a lake/river/sea, else null. */
  waterAt(x: number, z: number): number | null {
    const c = Math.floor(z / CHUNK);
    for (let i = c - 3; i <= c + 3; i++) {
      const F = this.chunkFeatures(i);
      for (const L of F.lakes) {
        const dx = x - L.x, dz = z - L.z;
        if (dx * dx + dz * dz < L.r * L.r * 1.1) return L.level;
      }
    }
    if (this.heightNoBranch(x, z) < SEA_LEVEL) return SEA_LEVEL;
    return null;
  }

  // ---------------------------------------------------------------- chunk features
  chunkFeatures(c: number): ChunkFeatures {
    const hit = this.features.get(c);
    if (hit) return hit;
    const F: ChunkFeatures = { c, lakes: [], river: null, branch: null };
    this.features.set(c, F); // set early: lake levels sample terrain which reads features
    const s0 = c * CHUNK;
    const sm = s0 + CHUNK / 2;
    const B = BIOMES[this.dominantBiome(sm)];
    const rng = new Rng(hashInts(this.seed, SYS.lake, c));
    // branch first (lakes may sit at its end)
    const brng = new Rng(hashInts(this.seed, SYS.branch, c));
    const branchChance = B.id === 'city' ? 0.3 : 0.32;
    if (c > 1 && brng.chance(branchChance)) F.branch = this.makeBranch(c, brng);
    const lakeCands: Lake[] = [];
    if (rng.chance(B.lakes)) {
      const s = s0 + rng.range(20, CHUNK - 20);
      const r = rng.range(28, 75);
      const side = rng.chance(0.5) ? 1 : -1;
      const u = side * (ROAD_HALF + r + rng.range(30, 200));
      const [x, z] = this.roadPoint(s, u);
      lakeCands.push({ x, z, r, level: 0 });
    }
    if (F.branch?.poi?.kind === 'lake') {
      const p = F.branch.poi;
      const r = 40 + rng.range(0, 30);
      lakeCands.push({ x: p.x + Math.sin(p.heading) * (r + 10), z: p.z + Math.cos(p.heading) * (r + 10), r, level: 0, poi: true });
    }
    // river crossing
    const rrng = new Rng(hashInts(this.seed, SYS.river, c));
    if (rrng.chance(B.rivers)) {
      const s = s0 + rrng.range(40, CHUNK - 40);
      F.river = { s, level: this.roadY(s) - 5, width: rrng.range(5, 9), wig: rrng.range(-40, 40) };
    }
    // lake levels: lowest surrounding base terrain so water never floats.
    for (const L of lakeCands) {
      let lo = Infinity;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        lo = Math.min(lo, this.heightBase(L.x + Math.cos(a) * L.r * 1.25, L.z + Math.sin(a) * L.r * 1.25));
      }
      L.level = lo - 0.6;
      const lat = Math.abs(this.lateral(L.x, L.z));
      if (lat < ROAD_HALF + L.r + 12) continue;
      if (L.level < SEA_LEVEL + 1) continue;
      F.lakes.push(L);
    }
    return F;
  }

  private makeBranch(c: number, rng: Rng): Branch {
    const s0 = c * CHUNK + rng.range(30, CHUNK - 30);
    const side = rng.chance(0.5) ? 1 : -1;
    const loop = rng.chance(0.4);
    const surface: 'gravel' | 'dirt' = rng.chance(0.55) ? 'gravel' : 'dirt';
    const pts: number[] = [];
    let s1 = s0;
    let poi: Branch['poi'];
    if (loop) {
      s1 = s0 + rng.range(1000, 3000);
      const A = rng.range(150, 400);
      const n = Math.ceil((s1 - s0) / 5);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const s = lerp(s0, s1, t);
        // leaves and rejoins nearly perpendicular, wanders in between
        const bump = Math.pow(Math.sin(Math.PI * t), 0.45);
        const wob = Math.sin(t * Math.PI * 3 + rng.float() * 0) * 0.08;
        const u = side * (ROAD_HALF + 0.5 + (A * (1 + wob)) * bump);
        const [x, z] = this.roadPoint(s, u);
        pts.push(x, z);
      }
      // mid-loop point of interest
      const mid = Math.floor(n / 2) * 2;
      poi = { kind: rng.pick(['overlook', 'landmark', 'stand', 'hidden'] as const), x: pts[mid], z: pts[mid + 1], heading: 0 };
    } else {
      const L = rng.range(260, 700);
      const n = Math.ceil(L / 5);
      const fwd = rng.range(-0.4, 0.6);
      const wig = rng.range(15, 40);
      const ph = rng.range(0, 6);
      let px = 0, pz = 0;
      const r0 = this.road(s0);
      // local frame: u along normal (side), v along tangent
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = side * (ROAD_HALF + 0.5 + L * t);
        const v = fwd * L * t * t + wig * Math.sin(t * 5 + ph) * t;
        px = r0.x + r0.nx * u + r0.tx * v;
        pz = r0.z + r0.nz * u + r0.tz * v;
        pts.push(px, pz);
      }
      const hx = pts[pts.length - 2] - pts[pts.length - 4];
      const hz = pts[pts.length - 1] - pts[pts.length - 3];
      poi = { kind: rng.pick(['lake', 'lake', 'overlook', 'landmark', 'stand', 'hidden'] as const), x: px, z: pz, heading: Math.atan2(hx, hz) };
    }
    const arr = new Float32Array(pts);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < arr.length; i += 2) {
      minX = Math.min(minX, arr[i]); maxX = Math.max(maxX, arr[i]);
      minZ = Math.min(minZ, arr[i + 1]); maxZ = Math.max(maxZ, arr[i + 1]);
    }
    return { id: `b${c}`, chunk: c, kind: loop ? 'loop' : 'deadend', side, s0, s1, surface, pts: arr, minX, maxX, minZ, maxZ, poi };
  }

  /** Heights along a branch: smoothed terrain, anchored to the main road at its ends. */
  branchHeights(br: Branch): Float32Array {
    if (br.heights) return br.heights;
    const n = br.pts.length / 2;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = this.heightNoBranch(br.pts[i * 2], br.pts[i * 2 + 1]);
    const out = new Float32Array(n);
    const W = 10;
    for (let i = 0; i < n; i++) {
      let s = 0, k = 0;
      for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) { s += raw[j]; k++; }
      out[i] = s / k;
    }
    // anchor ends to main road
    const y0 = this.roadY(br.s0);
    const ramp = Math.min(12, n);
    for (let i = 0; i < ramp; i++) out[i] = lerp(y0, out[i], smoothstep(0, ramp, i));
    if (br.kind === 'loop') {
      const y1 = this.roadY(br.s1);
      for (let i = 0; i < ramp; i++) out[n - 1 - i] = lerp(y1, out[n - 1 - i], smoothstep(0, ramp, i));
    }
    // grade clamp (max 9%) forward then backward
    const step = 5;
    for (let i = 1; i < n; i++) out[i] = clamp(out[i], out[i - 1] - 0.09 * step, out[i - 1] + 0.09 * step);
    for (let i = n - 2; i >= 0; i--) out[i] = clamp(out[i], out[i + 1] - 0.09 * step, out[i + 1] + 0.09 * step);
    // never below water: lift to a causeway
    br.heights = out;
    return out;
  }

  private branchGrid(br: Branch): Map<number, number[]> {
    if (br.grid) return br.grid;
    const g = new Map<number, number[]>();
    const n = br.pts.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const ax = br.pts[i * 2], az = br.pts[i * 2 + 1];
      const bx = br.pts[i * 2 + 2], bz = br.pts[i * 2 + 3];
      const x0 = Math.floor((Math.min(ax, bx) - 20) / 32), x1 = Math.floor((Math.max(ax, bx) + 20) / 32);
      const z0 = Math.floor((Math.min(az, bz) - 20) / 32), z1 = Math.floor((Math.max(az, bz) + 20) / 32);
      for (let ix = x0; ix <= x1; ix++)
        for (let iz = z0; iz <= z1; iz++) {
          const k = key2(ix, iz);
          let a = g.get(k);
          if (!a) g.set(k, (a = []));
          a.push(i);
        }
    }
    br.grid = g;
    return g;
  }

  /** Nearest point on a branch: distance, height, and parameter index. */
  branchQuery(br: Branch, x: number, z: number): { dist: number; y: number; i: number; t: number } {
    const g = this.branchGrid(br);
    const segs = g.get(key2(Math.floor(x / 32), Math.floor(z / 32)));
    if (!segs) return { dist: Infinity, y: 0, i: 0, t: 0 };
    const H = this.branchHeights(br);
    let best = Infinity, by = 0, bi = 0, bt = 0;
    for (const i of segs) {
      const ax = br.pts[i * 2], az = br.pts[i * 2 + 1];
      const bx = br.pts[i * 2 + 2], bz = br.pts[i * 2 + 3];
      const ex = bx - ax, ez = bz - az;
      const L2 = ex * ex + ez * ez || 1;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1);
      const px = ax + ex * t - x, pz = az + ez * t - z;
      const d = Math.sqrt(px * px + pz * pz);
      if (d < best) { best = d; by = lerp(H[i], H[i + 1], t); bi = i; bt = t; }
    }
    return { dist: best, y: by, i: bi, t: bt };
  }

  /** All branches whose chunk lies in [c0, c1]. */
  branchesIn(c0: number, c1: number): Branch[] {
    const out: Branch[] = [];
    for (let c = c0; c <= c1; c++) {
      const b = this.chunkFeatures(c).branch;
      if (b) out.push(b);
    }
    return out;
  }
}

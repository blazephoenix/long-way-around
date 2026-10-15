// Terrain tile meshes and vegetation scatter. Pure data (typed arrays) so it can run
// in a Web Worker; the main thread turns the arrays into GPU buffers.
import { BIOMES, BiomeConfig, VegType, VegSpec, BiomeId } from '../../data/biomes';
import { World, ROAD_HALF, SEA_LEVEL, CHUNK } from './world';
import { hashInts, Rng, SYS } from './prng';
import { smoothstep, lerp, clamp } from './noise';
import { reservedAt } from './reserve';
import { townDensity } from './sites';

export const TILE = 256;
export const LOD_SEGS = [64, 32, 16];

export interface TileRequest {
  ix: number;
  iz: number;
  lod: number;
  veg: number; // 0 none, 1 trees only (sparse), 2 full
  density: number; // quality multiplier
}

export interface TileResult {
  ix: number;
  iz: number;
  lod: number;
  veg: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  index: Uint32Array;
  vegTypes: VegType[];
  vegData: Float32Array[]; // x,y,z,rot,scale,r,g,b per instance
  colliders: Float32Array; // x,z,r triples
}

// sRGB hex → linear rgb (matches three's colour management)
const linCache = new Map<number, [number, number, number]>();
function s2l(c: number) {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}
export function hexLin(h: number): [number, number, number] {
  let v = linCache.get(h);
  if (!v) {
    v = [s2l(((h >> 16) & 255) / 255), s2l(((h >> 8) & 255) / 255), s2l((h & 255) / 255)];
    linCache.set(h, v);
  }
  return v;
}
function mixc(a: number[], b: number[], t: number, out: number[]) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

const FIELD_COLS = [0x8fb257, 0x6f9a3a, 0xe0c44a, 0x9a7a52, 0xb9b06a, 0x7fa64f, 0xa8c46a];

/** Ground colour for one biome at a point. */
function biomeGround(world: World, B: BiomeConfig, x: number, z: number, h: number, slope: number, lat: number, water: number | null, out: number[]) {
  const n = world.noise;
  const P = B.palette;
  const v = n.fbm(x / 90, z / 90, 2) * 0.5 + 0.5;
  const gi = clamp(v * 3, 0, 2.999);
  const i0 = Math.floor(gi);
  mixc(hexLin(P.ground[i0]), hexLin(P.ground[i0 + 1]), gi - i0, out);
  const al = Math.abs(lat);
  const t2 = n.n2(x / 140 + 50, z / 140) ;
  if (B.id === 'farm' && al > ROAD_HALF + 14) {
    // patchwork fields on a rotated grid, hedges between
    const ang = 0.4 + 0.5 * Math.sin(Math.floor(z / 900) * 1.7);
    const u = x * Math.cos(ang) - z * Math.sin(ang);
    const w = x * Math.sin(ang) + z * Math.cos(ang);
    const fu = u / 58, fw = w / 40;
    const cell = hashInts(world.seed, 77, Math.floor(fu), Math.floor(fw));
    const edge = Math.min(fu - Math.floor(fu), 1 - (fu - Math.floor(fu)), (fw - Math.floor(fw)) * 1.45, (1 - (fw - Math.floor(fw))) * 1.45);
    const fc = hexLin(FIELD_COLS[cell % FIELD_COLS.length]);
    if (edge > 0.05) mixc(out, fc, 0.9, out);
    else mixc(out, hexLin(0x4f7a3a), 0.8, out);
  } else if (t2 > 0.35 && B.id !== 'tropical') {
    mixc(out, hexLin(P.ground2), smoothstep(0.35, 0.45, t2) * 0.8, out);
  }
  if (B.id === 'tropical') {
    // tea estates: bright, even green on hillsides inside an estate mask
    const tea = n.n2(x / 700 + 9, z / 700 - 4);
    if (tea > 0.25 && al > 30 && slope < 0.8) mixc(out, hexLin(0x5fae3e), smoothstep(0.25, 0.3, tea), out);
  }
  const rockAt = B.id === 'tropical' ? 1.25 : B.id === 'desert' ? 0.7 : 0.6;
  if (slope > rockAt) mixc(out, hexLin(B.terrain.kind === 'coast' ? P.cliff : P.rock), smoothstep(rockAt, rockAt + 0.3, slope), out);
  if (B.id === 'tropical' && slope > 0.75 && al < 16) mixc(out, hexLin(P.ground2), 0.7 * smoothstep(0.75, 0.95, slope), out);
  if (water !== null && h < water + 1.6) mixc(out, hexLin(P.beach), smoothstep(water + 1.6, water + 0.4, h), out);
  if (B.id === 'coast' && h < 3.5) mixc(out, hexLin(P.beach), smoothstep(3.5, 1.5, h), out);
  if (water !== null && h < water - 0.3) mixc(out, hexLin(P.waterDeep), 0.7, out);
  // town paving
  const town = townDensity(world, z);
  if (town > 0 && al < (B.id === 'city' ? 60 : 30)) mixc(out, hexLin(B.id === 'city' ? 0x9d9a92 : 0xb8ab90), smoothstep(B.id === 'city' ? 60 : 30, (B.id === 'city' ? 50 : 22), al) * Math.min(1, town * 1.6), out);
  // verge / shoulder
  if (al < ROAD_HALF + 1.8) mixc(out, hexLin(B.road.shoulder), smoothstep(ROAD_HALF + 1.8, ROAD_HALF + 0.6, al), out);
  return out;
}

export function buildTile(world: World, req: TileRequest): TileResult {
  const segs = LOD_SEGS[req.lod];
  const step = TILE / segs;
  const x0 = req.ix * TILE;
  const z0 = req.iz * TILE;
  const G = segs + 3; // with one-vertex border
  const H = new Float32Array(G * G);
  for (let j = 0; j < G; j++) {
    const z = z0 + (j - 1) * step;
    for (let i = 0; i < G; i++) {
      const x = x0 + (i - 1) * step;
      H[j * G + i] = world.height(x, z);
    }
  }
  const V = segs + 1;
  const nSkirt = segs * 4;
  const total = V * V + nSkirt + 4;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const tmp = [0, 0, 0];
  const tmpB = [0, 0, 0];
  for (let j = 0; j < V; j++) {
    const z = z0 + j * step;
    const r = world.road(z);
    const bl = r.blend;
    const A = BIOMES[bl.a], B = BIOMES[bl.b];
    for (let i = 0; i < V; i++) {
      const x = x0 + i * step;
      const gi = (j + 1) * G + (i + 1);
      const h = H[gi];
      const hx = (H[gi + 1] - H[gi - 1]) / (2 * step);
      const hz = (H[gi + G] - H[gi - G]) / (2 * step);
      let nx = -hx, ny = 1, nz = -hz;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl; ny /= nl; nz /= nl;
      const k = (j * V + i) * 3;
      positions[k] = x; positions[k + 1] = h; positions[k + 2] = z;
      normals[k] = nx; normals[k + 1] = ny; normals[k + 2] = nz;
      const slope = Math.sqrt(hx * hx + hz * hz);
      const lat = (x - r.x) * r.cosA;
      const water = h < SEA_LEVEL + 4 ? SEA_LEVEL : (A.lakes > 0 || B.lakes > 0 || A.rivers > 0 || B.rivers > 0) ? world.waterAt(x, z) : null;
      biomeGround(world, A, x, z, h, slope, lat, water, tmp);
      if (bl.t > 0.001) {
        biomeGround(world, B, x, z, h, slope, lat, water, tmpB);
        mixc(tmp, tmpB, bl.t, tmp);
      }
      colors[k] = tmp[0]; colors[k + 1] = tmp[1]; colors[k + 2] = tmp[2];
    }
  }
  // skirts hide LOD cracks
  const drop = 6 + req.lod * 6;
  let sk = V * V;
  const skirtIdx: [number, number][] = [];
  const edges: number[] = [];
  for (let i = 0; i < segs; i++) edges.push(i); // bottom row j=0
  const addSk = (src: number) => {
    const k = src * 3, d = sk * 3;
    positions[d] = positions[k]; positions[d + 1] = positions[k + 1] - drop; positions[d + 2] = positions[k + 2];
    normals[d] = normals[k]; normals[d + 1] = normals[k + 1]; normals[d + 2] = normals[k + 2];
    colors[d] = colors[k]; colors[d + 1] = colors[k + 1]; colors[d + 2] = colors[k + 2];
    skirtIdx.push([src, sk]);
    return sk++;
  };
  const idx: number[] = [];
  for (let j = 0; j < segs; j++)
    for (let i = 0; i < segs; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  // perimeter loop (counter-clockwise when viewed from above)
  const loop: number[] = [];
  for (let i = 0; i < segs; i++) loop.push(i); // z0 edge
  for (let j = 0; j < segs; j++) loop.push(j * V + segs); // x1 edge
  for (let i = segs; i > 0; i--) loop.push(segs * V + i); // z1 edge
  for (let j = segs; j > 0; j--) loop.push(j * V); // x0 edge
  const skv = loop.map((v) => addSk(v));
  for (let q = 0; q < loop.length; q++) {
    const a = loop[q], b = loop[(q + 1) % loop.length];
    const sa = skv[q], sb = skv[(q + 1) % loop.length];
    idx.push(a, b, sa, b, sb, sa);
    idx.push(a, sa, b, b, sa, sb); // both windings: skirts are seen from either side
  }
  const index = new Uint32Array(idx);

  const veg = req.veg > 0 ? scatter(world, req) : { types: [] as VegType[], data: [] as Float32Array[], colliders: new Float32Array(0) };
  return {
    ix: req.ix, iz: req.iz, lod: req.lod, veg: req.veg,
    positions: positions.subarray(0, sk * 3), normals: normals.subarray(0, sk * 3), colors: colors.subarray(0, sk * 3), index,
    vegTypes: veg.types, vegData: veg.data, colliders: veg.colliders,
  };
}

const TREEISH = new Set<VegType>(['pine', 'broadleaf', 'palm', 'acacia', 'silveroak', 'bamboo', 'boulder']);
const BASE_R: Partial<Record<VegType, number>> = { pine: 0.6, broadleaf: 0.7, palm: 0.4, acacia: 0.5, euphorbia: 0.7, bamboo: 1.0, rock: 1.0, boulder: 2.2, silveroak: 0.6, banana: 0.3 };

function scatter(world: World, req: TileRequest) {
  const x0 = req.ix * TILE, z0 = req.iz * TILE;
  const biomes = new Set<BiomeId>();
  for (const z of [z0, z0 + TILE * 0.33, z0 + TILE * 0.66, z0 + TILE]) {
    const bl = world.road(z).blend;
    biomes.add(bl.a);
    if (bl.t > 0) biomes.add(bl.b);
  }
  const byType = new Map<VegType, number[]>();
  const coll: number[] = [];
  const area = (TILE * TILE) / 10000;
  const teaSlots = new Set<number>();
  for (const bid of biomes) {
    const B = BIOMES[bid];
    B.vegetation.forEach((spec: VegSpec, si: number) => {
      if (req.veg === 1 && !TREEISH.has(spec.type)) return;
      const dens = spec.density * req.density * (req.veg === 1 ? 0.55 : 1);
      const n = Math.round(dens * area);
      const rng = new Rng(hashInts(world.seed, SYS.veg, req.ix, req.iz, si * 7 + bid.length * 131 + bid.charCodeAt(0)));
      let arr = byType.get(spec.type);
      if (!arr) byType.set(spec.type, (arr = []));
      for (let q = 0; q < n; q++) {
        const x = x0 + rng.float() * TILE;
        const z = z0 + rng.float() * TILE;
        const rot = rng.float() * Math.PI * 2;
        const sc = rng.range(spec.scale[0], spec.scale[1]);
        const ci = rng.int(0, spec.colors.length - 1);
        const roll = rng.float();
        const r = world.road(z);
        const bl = r.blend;
        const w = (bl.a === bid ? 1 - bl.t : 0) + (bl.b === bid ? bl.t : 0);
        if (roll > w) continue;
        if (spec.patchy) {
          const m = world.noise.n2(x / 85 + si * 17, z / 85 - si * 5) * 0.5 + 0.5;
          if (m < spec.patchy) continue;
        }
        // tea estates: bushes in bands that follow the contours; other trees keep out of them
        const teaMask = bid === 'tropical' ? world.noise.n2(x / 700 + 9, z / 700 - 4) : -1;
        if ((spec.type === 'tea' || spec.type === 'silveroak') && teaMask <= 0.28) continue;
        if (teaMask > 0.3 && (spec.type === 'broadleaf' || spec.type === 'bamboo' || spec.type === 'banana' || spec.type === 'palm' || spec.type === 'bush')) continue;
        const lat = Math.abs((x - r.x) * r.cosA);
        if (lat < (spec.minRoad ?? 6)) continue;
        if (world.surfaceAt(x, z) !== 'offroad') continue;
        if (reservedAt(world, x, z)) continue;
        const h = world.height(x, z);
        const water = world.waterAt(x, z);
        if (water !== null && h < water + 0.4) continue;
        if (h < SEA_LEVEL + 1.2) continue;
        if (spec.maxSlope !== undefined || TREEISH.has(spec.type)) {
          const hx = world.height(x + 1.5, z) - h, hz = world.height(x, z + 1.5) - h;
          const sl = Math.sqrt(hx * hx + hz * hz) / 1.5;
          if (sl > (spec.maxSlope ?? 0.8)) continue;
        }
        let rr = rot;
        let px = x, pz = z, ph = h;
        if (spec.type === 'tea') {
          // snap to rows that run along the local contour: row spacing 2.2 m, hedge length 4 m
          let gx = world.height(x + 1, z) - h, gz = world.height(x, z + 1) - h;
          const gl = Math.hypot(gx, gz);
          if (gl < 0.04) { gx = 1; gz = 0; } else { gx /= gl; gz /= gl; }
          // quantise the direction so neighbouring rows stay parallel
          const ang = Math.round(Math.atan2(gz, gx) / 0.26) * 0.26;
          gx = Math.cos(ang); gz = Math.sin(ang);
          const cx = -gz, cz = gx;
          const a = Math.round((x * gx + z * gz) / 2.2) * 2.2;
          const b = Math.round((x * cx + z * cz) / 4.0) * 4.0;
          px = a * gx + b * cx;
          pz = a * gz + b * cz;
          const key = Math.round(px * 2) * 100003 + Math.round(pz * 2);
          if (teaSlots.has(key)) continue;
          teaSlots.add(key);
          ph = world.height(px, pz);
          rr = Math.atan2(-cz, cx); // local x along the contour
        }
        const c = hexLin(spec.colors[ci]);
        arr.push(px, ph - (spec.type === 'tea' ? 0.22 : 0.08), pz, rr, sc, c[0], c[1], c[2]);
        if (spec.collide && (req.veg === 2)) coll.push(x, z, (BASE_R[spec.type] ?? 0.5) * sc * spec.collide * 2);
      }
    });
  }
  const types: VegType[] = [];
  const data: Float32Array[] = [];
  for (const [t, a] of byType) {
    if (a.length === 0) continue;
    types.push(t);
    data.push(new Float32Array(a));
  }
  return { types, data, colliders: new Float32Array(coll) };
}

export function chunkOfZ(z: number) {
  return Math.floor(z / CHUNK);
}

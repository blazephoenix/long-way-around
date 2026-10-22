// Main-thread builders for road chunks: asphalt + markings, branch roads, water, roadside props.
import * as THREE from 'three';
import { World, CHUNK, ROAD_HALF, BRANCH_HALF, Branch } from './world';
import { BIOMES } from '../../data/biomes';
import { Soup, ModelBuilder } from '../render/models';
import { matRoad, matVC } from '../render/toon';
import { waterMaterial, waterGeometry } from '../render/water';
import { discWater, stripWater } from './waterGeo';
import { hexLin } from './tilegen';

const C = (h: number) => new THREE.Color(h);

export interface ChunkMeshes {
  group: THREE.Group;
  colliders: number[]; // x,z,r
}

export type ExtraGen = (world: World, c: number, props: ModelBuilder, colliders: number[], group: THREE.Group) => Generator<void, void>;

export function buildRoadChunk(world: World, c: number, extra?: ExtraGen): ChunkMeshes {
  const it = buildRoadChunkGen(world, c, extra);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** Builds a chunk a slice at a time so the streamer can spread the work over frames. */
export function* buildRoadChunkGen(world: World, c: number, extra?: ExtraGen): Generator<void, ChunkMeshes> {
  const group = new THREE.Group();
  group.name = `chunk${c}`;
  const soup = new Soup();
  const s0 = c * CHUNK;
  const STEP = 2;
  const n = CHUNK / STEP;
  const cols: Record<string, THREE.Color> = {};
  const prev: number[][] = [];
  const W = ROAD_HALF;
  // cross-section offsets
  const xs = [-W, -W + 0.2, -W + 0.35, -0.08, 0.08, W - 0.35, W - 0.2, W];
  for (let i = 0; i <= n; i++) {
    const s = s0 + i * STEP;
    const r = world.road(s);
    const B = BIOMES[r.blend.t > 0.5 ? r.blend.b : r.blend.a];
    const y = r.y + 0.06;
    const row = xs.map((u) => [r.x + r.nx * u, u === -W || u === W ? y - 0.02 : y, r.z + r.nz * u]);
    if (i > 0) {
      const asph = cols['a' + B.id] ?? (cols['a' + B.id] = C(B.road.asphalt));
      const edge = cols['e' + B.id] ?? (cols['e' + B.id] = C(B.road.edgeLine));
      const ctr = cols['c' + B.id] ?? (cols['c' + B.id] = C(B.road.centerLine));
      const dash = Math.floor((s - STEP / 2) / 3) % 3 === 0;
      for (let k = 0; k < xs.length - 1; k++) {
        let col = asph;
        if (k === 1 || k === 5) col = edge;
        if (k === 3 && dash) col = ctr;
        const a = prev[k], b = prev[k + 1], cc = row[k + 1], d = row[k];
        soup.quad(a, d, cc, b, col);
      }
    }
    prev.length = 0;
    prev.push(...row);
  }
  const road = new THREE.Mesh(soup.build(), matRoad);
  road.receiveShadow = true;
  group.add(road);
  yield;

  const props = new ModelBuilder();
  const colliders: number[] = [];
  const F = world.chunkFeatures(c);

  // branch road
  if (F.branch) {
    group.add(buildBranch(world, F.branch));
    yield;
  }

  // lakes
  for (const L of F.lakes) {
    const B = world.biomeCfg(L.z);
    const r = L.r * 1.18;
    const w = discWater(L.x, L.z, r, L.level, (x, z) => world.height(x, z), Math.max(6, Math.min(28, Math.round(r / 3.5))), 48);
    if (w) group.add(new THREE.Mesh(waterGeometry(w), waterMaterial('lake', B.palette.water, B.palette.waterDeep)));
    yield;
  }
  // river + bridge
  if (F.river) {
    const R = F.river;
    const B = world.biomeCfg(R.s);
    const rows: number[][] = [];
    for (let d = -520; d <= 520; d += 6) {
      const zr = world.riverZ(R, d);
      const rr = world.road(zr);
      const x = rr.x + d / rr.cosA;
      const w = R.width + 1.5;
      rows.push([x, zr - w, x, zr + w]);
    }
    const rw = stripWater(rows, 6, R.level, (x, z) => world.height(x, z));
    if (rw) group.add(new THREE.Mesh(waterGeometry(rw), waterMaterial('river', B.palette.water, B.palette.waterDeep)));
    yield;
    // a rope footbridge downstream in the tropics
    if (B.id === 'tropical') {
      const d = 70;
      const zc = world.riverZ(R, d);
      const rr = world.road(zc);
      const x = rr.x + d / rr.cosA;
      const span = R.width + 5;
      const yEnd = world.height(x, zc - span - 2);
      const yEnd2 = world.height(x, zc + span + 2);
      const y0 = Math.max(yEnd, yEnd2, R.level + 1.5);
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const z = zc - span + t * span * 2;
        const sag = Math.sin(t * Math.PI) * 1.2;
        props.box(1.4, 0.08, 0.5, 0x8a6448, { p: [x, y0 - sag, z] });
        props.box(0.04, 0.9, 0.04, 0x6a4a34, { p: [x - 0.7, y0 - sag + 0.45, z] });
        props.box(0.04, 0.9, 0.04, 0x6a4a34, { p: [x + 0.7, y0 - sag + 0.45, z] });
      }
      for (const sz of [-1, 1]) for (const sx of [-0.8, 0.8]) props.box(0.25, 2.6, 0.25, 0x6a4a34, { p: [x + sx, y0 + 0.4, zc + sz * (span + 0.4)] });
      for (const sx of [-0.7, 0.7]) props.box(0.03, 0.03, span * 2, 0xc8b48a, { p: [x + sx, y0 + 0.4, zc] });
    }
    // bridge: railings + deck sides
    const zr = world.riverZ(R, 0);
    const span = R.width + 6;
    for (const side of [-1, 1]) {
      for (let s = zr - span; s <= zr + span; s += 2.5) {
        const r = world.road(s);
        const u = side * (ROAD_HALF + 0.25);
        const px = r.x + r.nx * u, pz = r.z + r.nz * u;
        props.box(0.18, 1.0, 0.18, 0x8a6a4a, { p: [px, r.y + 0.5, pz] });
      }
      const ra = world.road(zr - span), rb = world.road(zr + span);
      const ax = ra.x + ra.nx * side * (ROAD_HALF + 0.25), az = ra.z + ra.nz * side * (ROAD_HALF + 0.25);
      const bx = rb.x + rb.nx * side * (ROAD_HALF + 0.25), bz = rb.z + rb.nz * side * (ROAD_HALF + 0.25);
      const len = Math.hypot(bx - ax, bz - az);
      props.box(0.12, 0.12, len, 0x9a7a52, { p: [(ax + bx) / 2, (ra.y + rb.y) / 2 + 0.95, (az + bz) / 2], r: [0, Math.atan2(bx - ax, bz - az), 0] });
      props.box(0.1, 0.1, len, 0x9a7a52, { p: [(ax + bx) / 2, (ra.y + rb.y) / 2 + 0.55, (az + bz) / 2], r: [0, Math.atan2(bx - ax, bz - az), 0] });
      // deck fascia
      props.box(0.3, 0.8, len, 0x6f6a60, { p: [(ax + bx) / 2, (ra.y + rb.y) / 2 - 0.35, (az + bz) / 2], r: [0, Math.atan2(bx - ax, bz - az), 0] });
    }
  }

  yield;
  // reflector posts on bends
  for (let s = s0 + 25; s < s0 + CHUNK; s += 25) {
    const r = world.road(s);
    const r2 = world.road(s + 10);
    const curv = Math.abs(r2.slope - r.slope);
    if (curv < 0.025) continue;
    for (const side of [-1, 1]) {
      const u = side * (ROAD_HALF + 0.9);
      const px = r.x + r.nx * u, pz = r.z + r.nz * u;
      const gy = world.height(px, pz);
      props.box(0.12, 0.9, 0.12, 0xf0f0ea, { p: [px, gy + 0.45, pz] });
      props.box(0.13, 0.12, 0.13, side > 0 ? 0xd8a020 : 0xc83a2a, { p: [px, gy + 0.78, pz] });
    }
  }

  if (extra) yield* extra(world, c, props, colliders, group);
  yield;

  if (!props.empty) {
    const pm = new THREE.Mesh(props.build(), matVC);
    pm.castShadow = true;
    pm.receiveShadow = true;
    group.add(pm);
  }
  return { group, colliders };
}

export function worldRiverWig(world: World, d: number, s: number) {
  // must match World.carveRiver
  return (world as any).n3.n1(d / 90 + s * 0.001);
}

export function buildBranch(world: World, br: Branch): THREE.Mesh {
  const H = world.branchHeights(br);
  const soup = new Soup();
  const col = C(br.surface === 'gravel' ? 0x9b927f : 0x8c6b4b);
  const col2 = C(br.surface === 'gravel' ? 0x8a826f : 0x7a5c40);
  const n = br.pts.length / 2;
  let prevL: number[] | null = null, prevR: number[] | null = null;
  for (let i = 0; i < n; i++) {
    const x = br.pts[i * 2], z = br.pts[i * 2 + 1];
    const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1);
    let dx = br.pts[j1 * 2] - br.pts[j0 * 2], dz = br.pts[j1 * 2 + 1] - br.pts[j0 * 2 + 1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const nx = dz, nz = -dx;
    const y = H[i] + 0.05;
    const L = [x + nx * BRANCH_HALF, y, z + nz * BRANCH_HALF];
    const R = [x - nx * BRANCH_HALF, y, z - nz * BRANCH_HALF];
    if (prevL && prevR) soup.quad(prevL, prevR, R, L, i % 6 < 3 ? col : col2);
    prevL = L; prevR = R;
  }
  const m = new THREE.Mesh(soup.build(), matRoad);
  m.receiveShadow = true;
  return m;
}

export { hexLin };

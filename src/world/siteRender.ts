// Builds all sites of a chunk into the chunk group: merged toon mesh, night-glow mesh, extras.
import * as THREE from 'three';
import { World, CHUNK, ROAD_HALF } from './world';
import { FEATURES } from '../core/features';
import { chunkSites } from './sites';
import { buildSite, matGlow, PropOut } from '../render/props';
import { ModelBuilder } from '../render/models';
import '../stops/stopModels';
import '../render/indiaModels';

export const booms = new Set<THREE.Object3D>();

export const spinners = new Set<THREE.Object3D>();

export function* siteExtra(world: World, c: number, props: ModelBuilder, colliders: number[], group: THREE.Group): Generator<void, void> {
  const glow = new ModelBuilder();
  const out: PropOut = { mb: props, glow, colliders, extras: [] };
  let n = 0;
  for (const s of chunkSites(world, c)) {
    buildSite(world, s, out);
    if (++n % 1 === 0) yield;
  }
  yield;
  // ghat parapets: low walls on the valley side of tropical hill roads, painted in alternating bands
  if (FEATURES.india && world.dominantBiome(c * CHUNK + CHUNK / 2) === 'tropical') {
    for (let s = c * CHUNK; s < (c + 1) * CHUNK; s += 3.2) {
      const r = world.road(s);
      for (const side of [1, -1]) {
        const u = side * (ROAD_HALF + 0.9);
        const drop = world.heightBase(r.x + r.nx * side * (ROAD_HALF + 7), r.z + r.nz * side * (ROAD_HALF + 7)) < r.y - 2.2;
        if (!drop) continue;
        const k = Math.round(s / 3.2);
        const x = r.x + r.nx * u, z = r.z + r.nz * u;
        props.box(0.35, 0.55, 2.9, k % 2 ? 0xf2f2ee : 0x2a2a2a, { p: [x, r.y + 0.3, z], r: [0, Math.atan2(r.tx, r.tz), 0] });
        colliders.push(x, z, 0.5);
      }
    }
  }
  if (!glow.empty) {
    const gm = new THREE.Mesh(glow.build(), matGlow);
    group.add(gm);
  }
  for (const e of out.extras) {
    e.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    group.add(e);
    if (e.userData.boom) {
      booms.add(e);
      group.userData.booms = (group.userData.booms ?? []).concat([e]);
    }
    if (e.userData.spin) {
      spinners.add(e);
      group.userData.spinners = (group.userData.spinners ?? []).concat([e]);
    }
  }
}

export function forgetChunk(group: THREE.Group) {
  for (const e of group.userData.spinners ?? []) spinners.delete(e);
  for (const e of group.userData.booms ?? []) booms.delete(e);
}

export function spin(dt: number) {
  for (const s of spinners) s.rotateZ(s.userData.spin * dt);
}

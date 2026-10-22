// People (and the shared life material), built from primitives. Vehicles live in vehicleModels.ts.
import * as THREE from 'three';
import { ModelBuilder } from './models';
import { toon } from './toon';

export const lifeMat = toon({ vertexColors: true });
export const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });

// ------------------------------------------------------------ people
export interface PersonLook {
  skin: number;
  top: number;
  bottom: number;
  hair: number;
  outfit: 'shirt' | 'kurta' | 'saree' | 'salwar' | 'jacket' | 'apron';
  head?: 'none' | 'cap' | 'turban' | 'scarf' | 'bun' | 'grey';
  height: number;
  stick?: boolean;
  bag?: boolean;
}

// A broad range of skin tones; clothing mixes everyday regional and modern wear.
const SKIN = [0x5a3a26, 0x6e4630, 0x7e5236, 0x8e5e3c, 0x9e6c46, 0xae7a52, 0xc08a5e, 0xd09a6e, 0x4a2e1e];
const TOPS = [0xf2f2ee, 0x3a6a9a, 0xd8442a, 0x2a8a5a, 0xe8a03a, 0x6a4a8a, 0x9ab0c8, 0x2a2a2a, 0xc86a8a, 0x8a9a5a];
const BOTTOMS = [0x2a3440, 0x4a4a52, 0x6a5a4a, 0xe8e2d0, 0x1e2a4a, 0x8a7a62];
const HAIR = [0x1a1412, 0x2a1e18, 0x3a2a20, 0x8a8a86, 0xd8d4cc];

export function randomLook(r: () => number): PersonLook {
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length) % a.length];
  const o = r();
  const outfit: PersonLook['outfit'] = o < 0.34 ? 'shirt' : o < 0.5 ? 'kurta' : o < 0.66 ? 'saree' : o < 0.8 ? 'salwar' : 'jacket';
  const hr = r();
  const old = r() < 0.15;
  return {
    skin: pick(SKIN),
    top: pick(TOPS),
    bottom: pick(BOTTOMS),
    hair: old ? pick([0x8a8a86, 0xd8d4cc]) : pick(HAIR),
    outfit,
    head: outfit === 'saree' || outfit === 'salwar' ? (hr < 0.4 ? 'bun' : hr < 0.6 ? 'scarf' : 'none') : hr < 0.12 ? 'turban' : hr < 0.3 ? 'cap' : 'none',
    height: 1.55 + r() * 0.3 - (old ? 0.05 : 0),
    stick: old && r() < 0.5,
    bag: r() < 0.3,
  };
}

/** Person: body mesh + two leg pivots (for walking). Faces -z. */
export function makePerson(look: PersonLook): THREE.Group {
  const g = new THREE.Group();
  const H = look.height;
  const legH = H * 0.47;
  const b = new ModelBuilder();
  const torsoH = H * 0.32;
  const ty = legH + torsoH / 2;
  const long = look.outfit === 'kurta' || look.outfit === 'saree' || look.outfit === 'salwar';
  b.box(0.42, torsoH, 0.24, look.top, { p: [0, ty, 0] });
  if (long) b.cyl(0.2, look.outfit === 'saree' ? 0.3 : 0.26, legH * (look.outfit === 'saree' ? 0.98 : 0.55), 8, look.outfit === 'saree' ? look.top : look.top, { p: [0, legH - legH * (look.outfit === 'saree' ? 0.98 : 0.55) / 2 + 0.02, 0] });
  if (look.outfit === 'saree') b.box(0.12, torsoH * 1.1, 0.26, look.bottom === 0xe8e2d0 ? 0xd8a03a : 0xe8a03a, { p: [0.14, ty + 0.02, 0], r: [0, 0, -0.5] }); // pallu
  if (look.outfit === 'salwar') b.box(0.5, 0.08, 0.27, look.bottom, { p: [0, ty + torsoH * 0.38, 0], r: [0, 0, 0.3] }); // dupatta
  if (look.outfit === 'jacket') b.box(0.44, torsoH * 0.95, 0.26, 0x3a4a5a, { p: [0, ty, 0.005] });
  if (look.outfit === 'apron') b.box(0.38, torsoH * 1.4, 0.05, 0xf2f2ee, { p: [0, ty - 0.1, -0.13] });
  // arms
  for (const sx of [1, -1]) b.box(0.1, torsoH * 1.05, 0.11, look.top, { p: [sx * 0.27, ty - 0.03, 0], r: [0, 0, sx * 0.08] });
  for (const sx of [1, -1]) b.sphere(0.055, 5, 4, look.skin, { p: [sx * 0.29, ty - torsoH * 0.58, 0] });
  // head
  const hy = legH + torsoH + 0.13;
  b.box(0.1, 0.08, 0.1, look.skin, { p: [0, legH + torsoH + 0.03, 0] });
  b.sphere(0.12, 8, 6, look.skin, { p: [0, hy, 0], s: [1, 1.1, 1] });
  b.sphere(0.125, 8, 5, look.hair, { p: [0, hy + 0.04, 0.02], s: [1, 0.85, 1] });
  if (look.head === 'cap') b.cyl(0.13, 0.13, 0.07, 8, look.top, { p: [0, hy + 0.11, 0] }), b.box(0.18, 0.02, 0.12, look.top, { p: [0, hy + 0.08, -0.12] });
  if (look.head === 'turban') b.sphere(0.15, 8, 6, [0xd8442a, 0x2a5ab8, 0xe8a03a, 0xf2f2ee][Math.floor(look.height * 100) % 4], { p: [0, hy + 0.07, 0.01], s: [1, 0.85, 1.05] });
  if (look.head === 'scarf') b.sphere(0.14, 8, 6, look.bottom, { p: [0, hy + 0.03, 0.02], s: [1.05, 1, 1.05] });
  if (look.head === 'bun') b.sphere(0.06, 6, 4, look.hair, { p: [0, hy + 0.02, 0.13] });
  if (look.stick) b.cyl(0.015, 0.015, H * 0.55, 4, 0x6a4a34, { p: [0.33, H * 0.27, -0.08] });
  if (look.bag) b.box(0.28, 0.3, 0.14, 0x5a6a4a, { p: [0, ty, 0.2] });
  const body = new THREE.Mesh(b.build(), lifeMat);
  body.castShadow = true;
  g.add(body);
  const legs: THREE.Object3D[] = [];
  for (const sx of [1, -1]) {
    const piv = new THREE.Group();
    piv.position.set(sx * 0.1, legH, 0);
    const lb = new ModelBuilder();
    lb.box(0.13, legH, 0.14, long && look.outfit !== 'saree' ? look.bottom : look.bottom, { p: [0, -legH / 2, 0] });
    lb.box(0.13, 0.07, 0.24, 0x2a2420, { p: [0, -legH + 0.035, -0.04] });
    const lm = new THREE.Mesh(lb.build(), lifeMat);
    lm.castShadow = true;
    piv.add(lm);
    piv.userData.side = sx;
    g.add(piv);
    legs.push(piv);
  }
  g.userData.legs = legs;
  return g;
}

export function animateWalk(p: THREE.Group, phase: number, moving: number) {
  for (const l of p.userData.legs as THREE.Object3D[]) l.rotation.x = Math.sin(phase + (l.userData.side > 0 ? 0 : Math.PI)) * 0.45 * moving;
}

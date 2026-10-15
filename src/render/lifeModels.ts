// Traffic vehicles and people, built from primitives. Vehicles face -z.
import * as THREE from 'three';
import { ModelBuilder } from './models';
import { toon } from './toon';
import { signMesh } from './props';

export const lifeMat = toon({ vertexColors: true });
export const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });

export type VehicleKind = 'car' | 'hatch' | 'van' | 'truck' | 'bus' | 'tractor' | 'auto' | 'painted';

const CAR_COLS = [0xd8d4cc, 0x8a2a2a, 0x2a4a6a, 0x3a3a3a, 0x9aa4ac, 0xe8e2d0, 0x4a6a4a, 0xc89a3a, 0x6a8ab0, 0xf2f2ee];

export interface VehicleModel {
  body: THREE.BufferGeometry;
  lamps: THREE.BufferGeometry;
  length: number;
  width: number;
  speed: [number, number]; // km/h
}

function wheels(m: ModelBuilder, xs: number, zs: number[], r: number, y = r) {
  for (const z of zs) for (const x of [-xs, xs]) m.cyl(r, r, 0.22, 10, 0x1e1e1e, { p: [x, y, z], r: [0, 0, Math.PI / 2] });
}

export function vehicleModel(kind: VehicleKind, seed: number): VehicleModel {
  const m = new ModelBuilder();
  const L = new ModelBuilder();
  const col = CAR_COLS[seed % CAR_COLS.length];
  const glass = 0x2c3e50;
  switch (kind) {
    case 'car':
    case 'hatch': {
      const len = kind === 'car' ? 4.3 : 3.7;
      m.box(1.72, 0.62, len, col, { p: [0, 0.62, 0] });
      m.box(1.5, 0.55, kind === 'car' ? 2.1 : 2.0, col, { p: [0, 1.18, kind === 'car' ? 0.2 : 0.35] });
      m.box(1.52, 0.42, 0.06, glass, { p: [0, 1.18, kind === 'car' ? -0.86 : -0.66], r: [-0.4, 0, 0] });
      m.box(1.53, 0.4, 1.6, glass, { p: [0, 1.2, kind === 'car' ? 0.2 : 0.35] });
      wheels(m, 0.78, [-len * 0.32, len * 0.32], 0.32);
      L.box(0.3, 0.12, 0.05, 0xfff4d0, { p: [0.6, 0.72, -len / 2 - 0.01] });
      L.box(0.3, 0.12, 0.05, 0xfff4d0, { p: [-0.6, 0.72, -len / 2 - 0.01] });
      L.box(0.3, 0.12, 0.05, 0xff3a2a, { p: [0.6, 0.72, len / 2 + 0.01] });
      L.box(0.3, 0.12, 0.05, 0xff3a2a, { p: [-0.6, 0.72, len / 2 + 0.01] });
      return { body: m.build(), lamps: L.build(), length: len, width: 1.8, speed: [55, 85] };
    }
    case 'van': {
      m.box(1.9, 1.7, 4.8, col, { p: [0, 1.2, 0] });
      m.box(1.7, 0.6, 0.06, glass, { p: [0, 1.6, -2.42] });
      m.box(1.92, 0.5, 3.0, glass, { p: [0, 1.6, 0.6] });
      wheels(m, 0.85, [-1.6, 1.6], 0.36);
      L.box(0.3, 0.14, 0.05, 0xfff4d0, { p: [0.65, 0.75, -2.41] });
      L.box(0.3, 0.14, 0.05, 0xfff4d0, { p: [-0.65, 0.75, -2.41] });
      L.box(0.2, 0.3, 0.05, 0xff3a2a, { p: [0.75, 0.9, 2.41] });
      L.box(0.2, 0.3, 0.05, 0xff3a2a, { p: [-0.75, 0.9, 2.41] });
      return { body: m.build(), lamps: L.build(), length: 4.8, width: 1.9, speed: [50, 75] };
    }
    case 'truck':
    case 'painted': {
      const painted = kind === 'painted';
      const cab = painted ? [0xe8a03a, 0x2a8a5a, 0xd8442a, 0x2a5ab8][seed % 4] : [0xd8d4cc, 0x3a6a8a, 0x8a3a2a][seed % 3];
      m.box(2.3, 2.1, 2.0, cab, { p: [0, 1.75, -3.0] });
      m.box(2.1, 0.7, 0.06, glass, { p: [0, 2.2, -4.02] });
      if (painted) {
        // decorated cab front: painted bands and a visor
        m.box(2.34, 0.25, 2.04, 0xf2c230, { p: [0, 2.9, -3.0] });
        m.box(2.34, 0.15, 2.04, 0xd8442a, { p: [0, 1.0, -3.0] });
        m.box(2.4, 0.12, 0.6, cab, { p: [0, 2.85, -4.2], r: [0.3, 0, 0] });
      }
      m.box(2.4, 2.4, 5.4, painted ? 0xd8b04a : 0x9a8a6a, { p: [0, 2.0, 0.9] });
      if (painted) {
        for (let i = 0; i < 4; i++) m.box(2.44, 0.12, 5.44, [0xd8442a, 0x2a8a5a, 0x2a5ab8, 0xf2f2ee][i], { p: [0, 1.0 + i * 0.5, 0.9] });
        // tassels and a black charm at the back
        for (let i = 0; i < 9; i++) m.cyl(0.02, 0.04, 0.35, 4, [0xd8442a, 0xf2c230, 0x2a8a5a][i % 3], { p: [-1.0 + i * 0.25, 0.55, 3.62] });
        m.cyl(0.004, 0.004, 0.3, 3, 0x1a1a1a, { p: [0.9, 0.5, 3.63] });
        m.box(0.08, 0.12, 0.02, 0x1a1a1a, { p: [0.9, 0.3, 3.63] });
      }
      wheels(m, 1.0, [-3.0, 0.2, 2.6], 0.48);
      L.box(0.3, 0.2, 0.05, 0xfff4d0, { p: [0.85, 1.0, -4.01] });
      L.box(0.3, 0.2, 0.05, 0xfff4d0, { p: [-0.85, 1.0, -4.01] });
      L.box(0.25, 0.25, 0.05, 0xff3a2a, { p: [0.95, 0.9, 3.61] });
      L.box(0.25, 0.25, 0.05, 0xff3a2a, { p: [-0.95, 0.9, 3.61] });
      return { body: m.build(), lamps: L.build(), length: 8, width: 2.4, speed: [45, 65] };
    }
    case 'bus': {
      const c = [0x3a7ab0, 0xd8442a, 0x2a8a6a, 0xe8a03a][seed % 4];
      m.box(2.5, 2.7, 10.5, c, { p: [0, 1.85, 0] });
      m.box(2.52, 0.9, 9.4, glass, { p: [0, 2.4, 0.3] });
      m.box(2.3, 1.1, 0.06, glass, { p: [0, 2.3, -5.26] });
      m.box(2.54, 0.25, 10.54, 0xf2f2ee, { p: [0, 1.25, 0] });
      wheels(m, 1.1, [-3.5, 3.5], 0.5);
      L.box(0.3, 0.2, 0.05, 0xfff4d0, { p: [0.9, 0.9, -5.26] });
      L.box(0.3, 0.2, 0.05, 0xfff4d0, { p: [-0.9, 0.9, -5.26] });
      L.box(2.3, 0.86, 0.05, 0xffe6a0, { p: [0, 2.4, 5.26] });
      L.box(2.4, 0.5, 9, 0xffe6a0, { p: [0, 2.4, 0.3], s: [1.01, 1, 1] });
      return { body: m.build(), lamps: L.build(), length: 10.5, width: 2.5, speed: [40, 60] };
    }
    case 'tractor': {
      m.box(1.2, 1.0, 2.0, 0xc8402a, { p: [0, 1.1, -0.6] });
      m.box(1.0, 1.2, 1.0, 0xc8402a, { p: [0, 1.6, 0.6] });
      m.box(0.06, 1.0, 0.06, 0x2a2a2a, { p: [0.3, 2.0, -1.2] });
      m.cyl(0.75, 0.75, 0.4, 12, 0x1e1e1e, { p: [0.8, 0.75, 0.7], r: [0, 0, Math.PI / 2] });
      m.cyl(0.75, 0.75, 0.4, 12, 0x1e1e1e, { p: [-0.8, 0.75, 0.7], r: [0, 0, Math.PI / 2] });
      m.cyl(0.42, 0.42, 0.3, 10, 0x1e1e1e, { p: [0.7, 0.42, -1.2], r: [0, 0, Math.PI / 2] });
      m.cyl(0.42, 0.42, 0.3, 10, 0x1e1e1e, { p: [-0.7, 0.42, -1.2], r: [0, 0, Math.PI / 2] });
      // trolley of hay
      m.box(2.0, 0.6, 3.2, 0x8a6448, { p: [0, 0.9, 3.0] });
      m.box(1.9, 1.0, 3.0, 0xd8c070, { p: [0, 1.7, 3.0] });
      L.box(0.2, 0.15, 0.05, 0xfff4d0, { p: [0.4, 1.4, -1.62] });
      L.box(0.2, 0.15, 0.05, 0xff3a2a, { p: [0.8, 0.9, 4.61] });
      return { body: m.build(), lamps: L.build(), length: 6, width: 2.0, speed: [18, 26] };
    }
    case 'auto': {
      // three-wheeled auto-rickshaw: green/yellow, black canopy
      m.box(1.3, 0.55, 2.5, 0x2a7a3a, { p: [0, 0.6, 0.1] });
      m.box(1.32, 0.95, 1.9, 0xf2c230, { p: [0, 1.35, 0.35] });
      m.box(1.36, 0.08, 2.0, 0x1e1e1e, { p: [0, 1.85, 0.35] });
      m.box(1.2, 0.5, 0.05, glass, { p: [0, 1.4, -0.62] });
      m.cyl(0.25, 0.25, 0.14, 10, 0x1e1e1e, { p: [0, 0.25, -1.0], r: [0, 0, Math.PI / 2] });
      m.cyl(0.25, 0.25, 0.14, 10, 0x1e1e1e, { p: [0.6, 0.25, 0.9], r: [0, 0, Math.PI / 2] });
      m.cyl(0.25, 0.25, 0.14, 10, 0x1e1e1e, { p: [-0.6, 0.25, 0.9], r: [0, 0, Math.PI / 2] });
      L.box(0.2, 0.15, 0.05, 0xfff4d0, { p: [0, 0.85, -1.16] });
      L.box(0.15, 0.1, 0.05, 0xff3a2a, { p: [0.5, 0.7, 1.36] });
      L.box(0.15, 0.1, 0.05, 0xff3a2a, { p: [-0.5, 0.7, 1.36] });
      return { body: m.build(), lamps: L.build(), length: 2.6, width: 1.35, speed: [30, 45] };
    }
  }
}

/** Original painted slogans for the back of goods carriers ("please honk" tradition). */
export const TRUCK_SLOGANS = [
  'HONK SOFTLY\nI AM LISTENING',
  'AMMA SAYS\nDRIVE SLOW',
  'MAA SAYS\nKEEP DISTANCE',
  'AAI SAYS\nUSE DIPPER AT NIGHT',
  'SLOW IS ALSO\nA SPEED',
  'TOOT TOOT\nTHEN OVERTAKE',
  'SEE YOU\nAT THE NEXT DHABA',
  'GOOD ROADS\nGOOD DAYS',
];

export function truckBack(seed: number): THREE.Mesh {
  const s = signMesh(TRUCK_SLOGANS[seed % TRUCK_SLOGANS.length], 2.2, 1.0, ['#f2c230', '#f7f3e8', '#e8f0e4'][seed % 3], ['#c8302a', '#1d3a8a', '#1a6a3a'][seed % 3]);
  s.position.set(0, 2.1, 3.62);
  return s;
}

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

const AUTO_STICKERS = ['THREE WHEELS\nONE HEART', 'RUNS ON CHAI', 'SLOWLY SLOWLY\nSAFELY', 'DRIVER LOVES\nFILTER COFFEE', 'SMILE, YOU ARE\nIN TRAFFIC'];
export function autoSticker(seed: number): THREE.Mesh {
  const s = signMesh(AUTO_STICKERS[seed % AUTO_STICKERS.length], 0.9, 0.36, '#f7f3e8', '#1d3a8a');
  s.position.set(0, 1.2, 1.37);
  return s;
}

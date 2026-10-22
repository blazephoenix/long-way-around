// Procedural animals: low-poly bodies plus separate limbs/wings for simple animation.
import * as THREE from 'three';
import { ModelBuilder } from './models';
import { toon } from './toon';

export type Gait = 'quad' | 'bird' | 'flyer' | 'whale' | 'flutter' | 'still' | 'sitter';

export interface AnimalModel {
  body: THREE.BufferGeometry;
  limbs: { geo: THREE.BufferGeometry; pivot: [number, number, number]; phase: number; axis: 'x' | 'z' }[];
  gait: Gait;
  speed: number; // walk speed m/s
  scale: number;
}

const mat = toon({ vertexColors: true });
export const animalMat = mat;

interface QuadP {
  len: number; h: number; legH: number; r: number;
  col: number; belly?: number; leg?: number;
  neck?: number; neckUp?: number; head?: number; headLen?: number;
  tail?: number; tailCol?: number;
  ears?: number; antlers?: number; horns?: 'spiral' | 'short'; hump?: number; trunk?: boolean; mane?: number;
  stripes?: number; legR?: number;
}

function quad(p: QuadP): AnimalModel {
  const b = new ModelBuilder();
  const y = p.legH + p.r * 0.7;
  b.sphere(1, 8, 6, p.col, { p: [0, y, 0], s: [p.r, p.r * 0.9, p.len / 2] });
  if (p.belly) b.sphere(1, 8, 4, p.belly, { p: [0, y - p.r * 0.35, 0], s: [p.r * 0.85, p.r * 0.6, p.len * 0.42] });
  if (p.stripes) {
    for (let i = -3; i <= 3; i++) b.box(p.r * 2.05, p.r * 0.3, 0.05, p.stripes, { p: [0, y + p.r * 0.25, (i * p.len) / 9], r: [0, 0, 0] });
  }
  if (p.hump) b.sphere(p.hump, 7, 5, p.col, { p: [0, y + p.r * 0.75, -p.len * 0.12] });
  const nk = p.neck ?? p.len * 0.3;
  const up = p.neckUp ?? 0.9;
  const nx = 0, ny = y + p.r * 0.4, nz = -p.len / 2 + p.r * 0.2;
  const hy = ny + Math.sin(up) * nk, hz = nz - Math.cos(up) * nk;
  b.cyl(p.r * 0.32, p.r * 0.45, nk, 6, p.col, { p: [nx, (ny + hy) / 2, (nz + hz) / 2], r: [-(Math.PI / 2 - up), 0, 0] });
  if (p.mane) b.box(0.06, nk * 0.9, p.r * 0.4, p.mane, { p: [0, (ny + hy) / 2 + p.r * 0.2, (nz + hz) / 2 + p.r * 0.1], r: [-(Math.PI / 2 - up), 0, 0] });
  const hs = p.head ?? p.r * 0.55;
  const hl = p.headLen ?? hs * 1.8;
  b.sphere(1, 7, 5, p.col, { p: [0, hy, hz - hl * 0.3], s: [hs, hs * 0.9, hl / 2] });
  b.sphere(hs * 0.12, 4, 3, 0x111111, { p: [hs * 0.6, hy + hs * 0.3, hz - hl * 0.35] });
  b.sphere(hs * 0.12, 4, 3, 0x111111, { p: [-hs * 0.6, hy + hs * 0.3, hz - hl * 0.35] });
  if (p.ears) {
    b.cone(p.ears * 0.4, p.ears, 4, p.col, { p: [hs * 0.6, hy + hs * 0.8, hz - hl * 0.05], r: [0, 0, -0.4] });
    b.cone(p.ears * 0.4, p.ears, 4, p.col, { p: [-hs * 0.6, hy + hs * 0.8, hz - hl * 0.05], r: [0, 0, 0.4] });
  }
  if (p.antlers) {
    for (const sx of [1, -1]) {
      b.cyl(0.03, 0.04, p.antlers, 4, 0xd8c8a0, { p: [sx * hs * 0.5, hy + hs + p.antlers * 0.4, hz], r: [0.3, 0, -sx * 0.5] });
      b.cyl(0.025, 0.03, p.antlers * 0.6, 4, 0xd8c8a0, { p: [sx * hs * 0.9, hy + hs + p.antlers * 0.7, hz - 0.1], r: [-0.4, 0, -sx * 0.9] });
    }
  }
  if (p.horns === 'spiral') for (const sx of [1, -1]) for (let i = 0; i < 4; i++) b.sphere(0.035, 4, 3, 0x2a2a2a, { p: [sx * (hs * 0.3 + Math.sin(i * 1.5) * 0.04), hy + hs * 0.7 + i * 0.09, hz + i * 0.03] });
  if (p.horns === 'short') for (const sx of [1, -1]) b.cone(0.04, 0.18, 4, 0xe8e0cc, { p: [sx * hs * 0.6, hy + hs * 0.8, hz], r: [0, 0, -sx * 0.7] });
  if (p.trunk) {
    for (let i = 0; i < 5; i++) b.cyl(hs * (0.28 - i * 0.03), hs * (0.3 - i * 0.03), hs * 0.5, 6, p.col, { p: [0, hy - hs * 0.3 - i * hs * 0.4, hz - hl * 0.55 - i * 0.04], r: [0.15, 0, 0] });
    for (const sx of [1, -1]) b.box(0.05, hs * 1.6, hs * 1.4, p.col, { p: [sx * hs * 1.05, hy, hz + hs * 0.2], r: [0, sx * 0.4, 0] });
    b.cone(0.05, 0.4, 4, 0xf2ead8, { p: [hs * 0.4, hy - hs * 0.6, hz - hl * 0.5], r: [-1.2, 0, 0] });
    b.cone(0.05, 0.4, 4, 0xf2ead8, { p: [-hs * 0.4, hy - hs * 0.6, hz - hl * 0.5], r: [-1.2, 0, 0] });
  }
  if (p.tail) b.cyl(0.02, p.r * 0.12, p.tail, 4, p.tailCol ?? p.col, { p: [0, y + p.r * 0.2 - p.tail * 0.3, p.len / 2 + p.tail * 0.3], r: [-0.8, 0, 0] });
  const limbs: AnimalModel['limbs'] = [];
  const lr = p.legR ?? Math.max(0.035, p.r * 0.18);
  for (const [lx, lz, ph] of [[p.r * 0.55, -p.len * 0.32, 0], [-p.r * 0.55, -p.len * 0.32, Math.PI], [p.r * 0.55, p.len * 0.32, Math.PI], [-p.r * 0.55, p.len * 0.32, 0]]) {
    const lg = new ModelBuilder();
    lg.cyl(lr * 0.8, lr, p.legH + p.r * 0.3, 5, p.leg ?? p.col, { p: [0, -(p.legH + p.r * 0.3) / 2, 0] });
    limbs.push({ geo: lg.build(), pivot: [lx, p.legH + p.r * 0.3, lz], phase: ph, axis: 'x' });
  }
  return { body: b.build(), limbs, gait: 'quad', speed: Math.max(0.4, p.len * 0.6), scale: 1 };
}

interface BirdP { len: number; col: number; wing: number; belly?: number; beak?: number; legs?: number; neck?: number; tail?: number; tailCol?: number; span: number; fan?: boolean; head?: number }

function bird(p: BirdP, gait: Gait): AnimalModel {
  const b = new ModelBuilder();
  const legH = p.legs ?? p.len * 0.3;
  const y = legH + p.len * 0.2;
  b.sphere(1, 7, 5, p.col, { p: [0, y, 0], s: [p.len * 0.22, p.len * 0.22, p.len * 0.45] });
  if (p.belly) b.sphere(1, 7, 4, p.belly, { p: [0, y - p.len * 0.06, -p.len * 0.05], s: [p.len * 0.18, p.len * 0.16, p.len * 0.35] });
  const nk = p.neck ?? 0;
  const hy = y + p.len * 0.15 + nk, hz = -p.len * 0.42;
  if (nk) b.cyl(p.len * 0.05, p.len * 0.07, nk, 5, p.col, { p: [0, y + nk / 2 + p.len * 0.08, hz + 0.02], r: [0.15, 0, 0] });
  const hs = p.head ?? p.len * 0.14;
  b.sphere(hs, 6, 5, p.col, { p: [0, hy, hz] });
  b.cone(hs * 0.45, p.beak ?? hs * 1.6, 4, 0xd8a03a, { p: [0, hy, hz - hs - (p.beak ?? hs * 1.6) / 2], r: [-Math.PI / 2, 0, 0] });
  b.sphere(hs * 0.2, 4, 3, 0x111111, { p: [hs * 0.7, hy + hs * 0.25, hz - hs * 0.3] });
  b.sphere(hs * 0.2, 4, 3, 0x111111, { p: [-hs * 0.7, hy + hs * 0.25, hz - hs * 0.3] });
  if (p.fan) {
    // display fan of a peacock: a big ring of eye feathers
    for (let i = 0; i < 17; i++) {
      const a = -Math.PI * 0.45 + (i / 16) * Math.PI * 0.9;
      const R = p.len * 1.2;
      b.box(0.14, R, 0.02, 0x3a8a4a, { p: [Math.sin(a) * R * 0.5, y + Math.cos(a) * R * 0.5, p.len * 0.35], r: [0, 0, -a] });
      b.sphere(0.07, 6, 4, 0x2a5ab8, { p: [Math.sin(a) * R * 0.95, y + Math.cos(a) * R * 0.95, p.len * 0.34] });
      b.sphere(0.035, 5, 3, 0xd8a03a, { p: [Math.sin(a) * R * 0.95, y + Math.cos(a) * R * 0.95, p.len * 0.33] });
    }
    b.cone(0.02, 0.12, 4, 0x2a5ab8, { p: [0, hy + hs + 0.05, hz] });
  } else if (p.tail) b.box(p.len * 0.18, 0.02, p.tail, p.tailCol ?? p.col, { p: [0, y + 0.01, p.len * 0.45 + p.tail / 2], r: [0.2, 0, 0] });
  if (legH > 0.05) {
    b.cyl(0.012, 0.012, legH, 3, 0xc8a050, { p: [p.len * 0.07, legH / 2, 0] });
    b.cyl(0.012, 0.012, legH, 3, 0xc8a050, { p: [-p.len * 0.07, legH / 2, 0] });
  }
  const limbs: AnimalModel['limbs'] = [];
  for (const sx of [1, -1]) {
    const w = new ModelBuilder();
    w.box(p.span / 2, 0.02, p.wing, p.col, { p: [(sx * p.span) / 4, 0, 0] });
    w.box(p.span / 4, 0.02, p.wing * 0.6, p.belly ?? p.col, { p: [(sx * p.span) / 2.2, 0, p.wing * 0.15] });
    limbs.push({ geo: w.build(), pivot: [sx * p.len * 0.18, y + p.len * 0.1, -p.len * 0.05], phase: 0, axis: 'z' });
  }
  return { body: b.build(), limbs, gait, speed: gait === 'bird' ? 0.3 : 7, scale: 1 };
}

function cache<T>(f: () => T) {
  let v: T | null = null;
  return () => (v ??= f());
}

const MODELS: Record<string, () => AnimalModel> = {
  deer: cache(() => quad({ len: 1.3, h: 1.3, legH: 0.75, r: 0.32, col: 0xa8744a, belly: 0xe8d8c0, neck: 0.5, neckUp: 1.0, head: 0.13, headLen: 0.32, tail: 0.1, tailCol: 0xffffff, ears: 0.14 })),
  elk: cache(() => quad({ len: 1.9, h: 1.8, legH: 0.95, r: 0.45, col: 0x8a5a3a, belly: 0x5a3a26, neck: 0.65, neckUp: 0.9, head: 0.18, headLen: 0.45, tail: 0.08, ears: 0.15, antlers: 0.7 })),
  fox: cache(() => quad({ len: 0.7, h: 0.5, legH: 0.25, r: 0.15, col: 0xd8692a, belly: 0xf2ead8, leg: 0x2a1a12, neck: 0.15, neckUp: 0.6, head: 0.1, headLen: 0.22, tail: 0.45, tailCol: 0xe8742a, ears: 0.09 })),
  coyote: cache(() => quad({ len: 0.9, h: 0.65, legH: 0.38, r: 0.19, col: 0xa8906a, belly: 0xd8c8a8, neck: 0.2, neckUp: 0.6, head: 0.11, headLen: 0.26, tail: 0.38, tailCol: 0x8a7050, ears: 0.1 })),
  camel: cache(() => quad({ len: 2.0, h: 2.2, legH: 1.2, r: 0.42, col: 0xc8a06a, belly: 0xd8b880, neck: 0.95, neckUp: 0.75, head: 0.16, headLen: 0.45, tail: 0.3, hump: 0.42, ears: 0.06 })),
  blackbuck: cache(() => quad({ len: 1.1, h: 1.0, legH: 0.6, r: 0.24, col: 0x2a2420, belly: 0xf2ece0, leg: 0xd8d0c0, neck: 0.35, neckUp: 1.0, head: 0.1, headLen: 0.26, tail: 0.1, ears: 0.1, horns: 'spiral' })),
  cow: cache(() => quad({ len: 1.9, h: 1.4, legH: 0.7, r: 0.46, col: 0xe8e2d8, belly: 0xd8d0c4, neck: 0.4, neckUp: 0.5, head: 0.2, headLen: 0.45, tail: 0.6, tailCol: 0x3a3a3a, hump: 0.24, ears: 0.12, horns: 'short' })),
  horse: cache(() => quad({ len: 1.9, h: 1.7, legH: 0.95, r: 0.38, col: 0x6a4028, neck: 0.7, neckUp: 1.0, head: 0.17, headLen: 0.55, tail: 0.6, tailCol: 0x2a1a12, ears: 0.12, mane: 0x2a1a12 })),
  elephant: cache(() => quad({ len: 3.2, h: 3.0, legH: 1.3, r: 1.0, col: 0x7a7672, neck: 0.3, neckUp: 0.3, head: 0.6, headLen: 0.9, tail: 0.8, legR: 0.24 })),
  tiger: cache(() => quad({ len: 1.8, h: 1.0, legH: 0.5, r: 0.34, col: 0xe0782a, belly: 0xf2ead8, neck: 0.25, neckUp: 0.4, head: 0.22, headLen: 0.4, tail: 0.9, tailCol: 0xe0782a, ears: 0.08, stripes: 0x1a1412, legR: 0.07 })),
  cat: cache(() => quad({ len: 0.45, h: 0.3, legH: 0.15, r: 0.1, col: 0x8a8278, belly: 0xe8e0d4, neck: 0.08, neckUp: 0.8, head: 0.07, headLen: 0.12, tail: 0.28, ears: 0.05 })),
  heron: cache(() => bird({ len: 0.7, col: 0x9aa4ac, belly: 0xe8eaec, wing: 0.35, span: 1.6, legs: 0.55, neck: 0.4, beak: 0.15, tail: 0.1 }, 'bird')),
  owl: cache(() => bird({ len: 0.35, col: 0x8a6a4a, belly: 0xd8c8a8, wing: 0.18, span: 0.9, legs: 0.02, head: 0.11, beak: 0.04, tail: 0.08 }, 'bird')),
  kingfisher: cache(() => bird({ len: 0.18, col: 0x1a7ac8, belly: 0xe8742a, wing: 0.08, span: 0.25, legs: 0.02, head: 0.045, beak: 0.06, tail: 0.04 }, 'bird')),
  gull: cache(() => bird({ len: 0.45, col: 0xf2f2f0, belly: 0xffffff, wing: 0.2, span: 1.2, legs: 0.1, tail: 0.1, tailCol: 0x9aa4ac }, 'flyer')),
  hawk: cache(() => bird({ len: 0.55, col: 0x7a5a3a, belly: 0xe8d8b8, wing: 0.28, span: 1.3, legs: 0.08, tail: 0.18 }, 'flyer')),
  crow: cache(() => bird({ len: 0.4, col: 0x1e1e22, wing: 0.15, span: 0.8, legs: 0.08, tail: 0.12 }, 'bird')),
  parrot: cache(() => bird({ len: 0.3, col: 0x3aa04a, belly: 0x9ad84a, wing: 0.1, span: 0.45, legs: 0.03, tail: 0.18, tailCol: 0x2a7a3a }, 'flyer')),
  pigeon: cache(() => bird({ len: 0.3, col: 0x8a909a, belly: 0xa8aeb8, wing: 0.12, span: 0.6, legs: 0.05, tail: 0.08 }, 'bird')),
  peacock: cache(() => bird({ len: 0.7, col: 0x1e5ab0, belly: 0x2a6ac8, wing: 0.25, span: 1.1, legs: 0.4, neck: 0.25, beak: 0.05, fan: true }, 'bird')),
  butterfly: cache(() => {
    const limbs: AnimalModel['limbs'] = [];
    for (const sx of [1, -1]) {
      const w = new ModelBuilder();
      w.box(0.07, 0.003, 0.06, 0xe8a03a, { p: [sx * 0.04, 0, 0] });
      w.box(0.03, 0.004, 0.03, 0x1a1a1a, { p: [sx * 0.06, 0, 0.01] });
      limbs.push({ geo: w.build(), pivot: [0, 0, 0], phase: 0, axis: 'z' });
    }
    const b = new ModelBuilder();
    b.cyl(0.005, 0.005, 0.05, 3, 0x1a1a1a, { r: [Math.PI / 2, 0, 0] });
    return { body: b.build(), limbs, gait: 'flutter' as Gait, speed: 1.5, scale: 1 };
  }),
  monkey: cache(() => {
    const b = new ModelBuilder();
    b.sphere(0.16, 7, 5, 0x8a7a62, { p: [0, 0.22, 0], s: [1, 1.2, 0.9] });
    b.sphere(0.1, 7, 5, 0x8a7a62, { p: [0, 0.45, -0.04] });
    b.sphere(0.065, 6, 4, 0xd8a890, { p: [0, 0.43, -0.12] });
    b.sphere(0.012, 4, 3, 0x111111, { p: [0.03, 0.46, -0.17] });
    b.sphere(0.012, 4, 3, 0x111111, { p: [-0.03, 0.46, -0.17] });
    b.cyl(0.02, 0.025, 0.5, 4, 0x8a7a62, { p: [0, 0.15, 0.25], r: [1.2, 0, 0] });
    for (const sx of [1, -1]) b.cyl(0.03, 0.035, 0.2, 4, 0x7a6a52, { p: [sx * 0.1, 0.08, -0.06], r: [0.6, 0, 0] });
    return { body: b.build(), limbs: [], gait: 'sitter' as Gait, speed: 0.6, scale: 1 };
  }),
  seal: cache(() => {
    const b = new ModelBuilder();
    b.sphere(1, 8, 6, 0x6a6e72, { p: [0, 0.22, 0], s: [0.3, 0.24, 0.8] });
    b.sphere(0.17, 7, 5, 0x6a6e72, { p: [0, 0.42, -0.7] });
    b.sphere(0.02, 4, 3, 0x111111, { p: [0.08, 0.47, -0.84] });
    b.sphere(0.02, 4, 3, 0x111111, { p: [-0.08, 0.47, -0.84] });
    b.box(0.5, 0.04, 0.2, 0x5a5e62, { p: [0, 0.08, 0.8] });
    return { body: b.build(), limbs: [], gait: 'still' as Gait, speed: 0, scale: 1 };
  }),
  whale: cache(() => {
    const b = new ModelBuilder();
    b.sphere(1, 10, 6, 0x2a3440, { p: [0, 0, 0], s: [2.2, 1.2, 7] });
    b.cone(0.5, 1.2, 4, 0x2a3440, { p: [0, 1.3, 1.5] });
    b.box(4, 0.2, 1.4, 0x2a3440, { p: [0, 0.2, 7.2] });
    return { body: b.build(), limbs: [], gait: 'whale' as Gait, speed: 2, scale: 1 };
  }),
  lizard: cache(() => {
    const b = new ModelBuilder();
    b.sphere(1, 6, 4, 0x8a9a5a, { p: [0, 0.04, 0], s: [0.05, 0.03, 0.12] });
    b.sphere(0.035, 6, 4, 0x8a9a5a, { p: [0, 0.05, -0.13] });
    b.cyl(0.005, 0.03, 0.2, 4, 0x7a8a4a, { p: [0, 0.03, 0.2], r: [Math.PI / 2, 0, 0] });
    for (const [x, z] of [[0.06, -0.06], [-0.06, -0.06], [0.06, 0.06], [-0.06, 0.06]]) b.box(0.06, 0.01, 0.015, 0x7a8a4a, { p: [x, 0.015, z] });
    return { body: b.build(), limbs: [], gait: 'still' as Gait, speed: 0.4, scale: 1 };
  }),
  cowlying: cache(() => {
    const b = new ModelBuilder();
    b.sphere(1, 8, 6, 0xe8e2d8, { p: [0, 0.42, 0], s: [0.5, 0.42, 0.95] });
    b.sphere(0.24, 7, 5, 0xe8e2d8, { p: [0, 0.6, -0.4] }); // hump
    b.sphere(1, 7, 5, 0xe8e2d8, { p: [0.05, 0.62, -1.05], s: [0.2, 0.2, 0.25] });
    b.cone(0.04, 0.18, 4, 0xe8e0cc, { p: [0.15, 0.8, -1.05], r: [0, 0, -0.7] });
    b.cone(0.04, 0.18, 4, 0xe8e0cc, { p: [-0.05, 0.8, -1.05], r: [0, 0, 0.7] });
    b.box(0.25, 0.15, 0.6, 0xd8d0c4, { p: [0.35, 0.12, -0.5] });
    b.box(0.25, 0.15, 0.6, 0xd8d0c4, { p: [-0.35, 0.12, 0.4] });
    b.cyl(0.02, 0.03, 0.6, 4, 0x3a3a3a, { p: [0.2, 0.15, 1.0], r: [1.3, 0, 0.4] });
    return { body: b.build(), limbs: [], gait: 'still' as Gait, speed: 0, scale: 1 };
  }),
  buffalolying: cache(() => {
    const b = new ModelBuilder();
    b.sphere(1, 8, 6, 0x2e2c2c, { p: [0, 0.45, 0], s: [0.55, 0.45, 1.0] });
    b.sphere(1, 7, 5, 0x2e2c2c, { p: [0.05, 0.6, -1.1], s: [0.24, 0.22, 0.3] });
    b.torus(0.22, 0.05, 4, 8, 0x5a5650, { p: [0.05, 0.8, -1.0], r: [Math.PI / 2, 0, 0] }, Math.PI * 1.3);
    b.box(0.28, 0.16, 0.6, 0x2a2828, { p: [0.38, 0.12, -0.5] });
    b.box(0.28, 0.16, 0.6, 0x2a2828, { p: [-0.38, 0.12, 0.4] });
    b.cyl(0.02, 0.03, 0.6, 4, 0x2a2828, { p: [0.2, 0.15, 1.05], r: [1.3, 0, 0.4] });
    return { body: b.build(), limbs: [], gait: 'still' as Gait, speed: 0, scale: 1 };
  }),
};

export const ANIMAL_KEYS = Object.keys(MODELS);

export function animalModel(key: string): AnimalModel {
  return (MODELS[key] ?? MODELS.deer)();
}

/** Build a scene object for an animal. Limbs are child meshes rotating around their pivots. */
export function makeAnimal(key: string): THREE.Group {
  const m = animalModel(key);
  const g = new THREE.Group();
  const body = new THREE.Mesh(m.body, mat);
  body.castShadow = true;
  g.add(body);
  const limbs: THREE.Object3D[] = [];
  for (const l of m.limbs) {
    const piv = new THREE.Group();
    piv.position.set(...l.pivot);
    const lm = new THREE.Mesh(l.geo, mat);
    lm.castShadow = true;
    piv.add(lm);
    piv.userData.phase = l.phase;
    piv.userData.axis = l.axis;
    piv.userData.side = l.pivot[0] >= 0 ? 1 : -1;
    g.add(piv);
    limbs.push(piv);
  }
  g.userData.limbs = limbs;
  g.userData.gait = m.gait;
  g.userData.speed = m.speed;
  return g;
}

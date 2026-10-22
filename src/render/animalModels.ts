// Animals: makeAnimal picks a pack model (animalPack.ts) or a model rigged at load (animalRig.ts); the
// birds, butterfly and lizard stay code-built here, low-poly bodies with separate limbs and wings.
import * as THREE from 'three';
import { hasPackAnimal, makePackAnimal, PACK_SPECIES } from './animalPack';
import { hasStaticAnimal, makeStaticAnimal, STATIC_SPECIES } from './animalRig';
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
  lizard: cache(() => {
    const b = new ModelBuilder();
    b.sphere(1, 6, 4, 0x8a9a5a, { p: [0, 0.04, 0], s: [0.05, 0.03, 0.12] });
    b.sphere(0.035, 6, 4, 0x8a9a5a, { p: [0, 0.05, -0.13] });
    b.cyl(0.005, 0.03, 0.2, 4, 0x7a8a4a, { p: [0, 0.03, 0.2], r: [Math.PI / 2, 0, 0] });
    for (const [x, z] of [[0.06, -0.06], [-0.06, -0.06], [0.06, 0.06], [-0.06, 0.06]]) b.box(0.06, 0.01, 0.015, 0x7a8a4a, { p: [x, 0.015, z] });
    return { body: b.build(), limbs: [], gait: 'still' as Gait, speed: 0.4, scale: 1 };
  }),
};

/** every species the game shows: model-based (pack or rigged at load) and the code-built small fry */
export const ANIMAL_KEYS = [...new Set([...PACK_SPECIES, ...STATIC_SPECIES, ...Object.keys(MODELS)])];

export function animalModel(key: string): AnimalModel {
  return (MODELS[key] ?? MODELS.crow)();
}

/** Build a scene object for an animal: the pack model where there is one, else the code-built one. */
export function makeAnimal(key: string): THREE.Group {
  return hasStaticAnimal(key) ? makeStaticAnimal(key) : hasPackAnimal(key) ? makePackAnimal(key) : makeCodeAnimal(key);
}

/** The code-built animal. Limbs are child meshes rotating around their pivots. */
export function makeCodeAnimal(key: string): THREE.Group {
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

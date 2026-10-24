// Animals: makeAnimal picks a pack model (animalPack.ts) or a model rigged at load (animalRig.ts, the
// birds and the hand-built peacock included); the butterfly and lizard stay code-built here.
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

function cache<T>(f: () => T) {
  let v: T | null = null;
  return () => (v ??= f());
}

const MODELS: Record<string, () => AnimalModel> = {
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
  return (MODELS[key] ?? MODELS.butterfly)();
}

/** Build a scene object for an animal: the model-based one where there is one, else the code-built one. */
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

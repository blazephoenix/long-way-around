// Animals from the Quaternius CC0 animated animals (built into src/assets/animals/*.glb by
// scripts/animal-assets.mjs): deer, fox, zebu cow, horse, whale, street dog, and cattle lying down.
// Each is recoloured and resized and keeps the pack's walk, gallop, idle and grazing clips. Species no
// pack covers come from unrigged models rigged at load; see animalRig.ts. One skinned mesh per animal.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ModelBuilder } from './models';
import { personMat, Rig } from './peopleModels';
import { loadStaticAnimals } from './animalRig';
import deerUrl from '../assets/animals/deer.glb?url';
import foxUrl from '../assets/animals/fox.glb?url';
import cowUrl from '../assets/animals/cow.glb?url';
import bullUrl from '../assets/animals/bull.glb?url';
import horseUrl from '../assets/animals/horse.glb?url';
import whaleUrl from '../assets/animals/whale.glb?url';
import dogUrl from '../assets/animals/dog.glb?url';

type PackKey = 'deer' | 'fox' | 'cow' | 'bull' | 'horse' | 'whale' | 'dog';
const URLS: Record<PackKey, string> = { deer: deerUrl, fox: foxUrl, cow: cowUrl, bull: bullUrl, horse: horseUrl, whale: whaleUrl, dog: dogUrl };

interface Prim {
  /** rest-pose positions in the pack's scene units */
  pos: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint32Array;
  mat: string;
  /** the material's own colour (sRGB hex) */
  base: number;
}

interface Pack {
  armature: THREE.Object3D;
  boneNames: string[];
  boneInverses: THREE.Matrix4[];
  clips: Map<string, THREE.AnimationClip>;
  prims: Prim[];
  /** rest-pose bounds; the packs face +z */
  box: THREE.Box3;
}

const packs = new Map<PackKey, Pack>();
let loading: Promise<void> | null = null;

/** Load every animal pack once; makeAnimal falls back to the code-built models until this resolves. */
export function loadAnimals(fetchBytes: (url: string) => Promise<ArrayBuffer> = (u) => fetch(u).then((r) => r.arrayBuffer())): Promise<void> {
  if (!loading) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loading = Promise.all([
      ...(Object.keys(URLS) as PackKey[]).map(async (k) => { packs.set(k, toPack(await loader.parseAsync(await fetchBytes(URLS[k]), ''))); }),
      loadStaticAnimals(fetchBytes),
    ]).then(() => undefined);
  }
  return loading;
}

function toPack(gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }): Pack {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  const skeleton = meshes[0].skeleton;
  const bind = meshes[0].bindMatrix.clone();
  const toBind = bind.clone().invert();
  // as for people: vertices to the rest pose in scene units, the quantization scale folded out of the
  // inverse binds (D = bone world * inverse bind * bind)
  const D = new THREE.Matrix4().multiplyMatrices(skeleton.bones[0].matrixWorld, skeleton.boneInverses[0]).multiply(bind);
  const Dinv = D.clone().invert();
  const boneInverses = skeleton.boneInverses.map((m) => m.clone().multiply(bind).multiply(Dinv));
  const box = new THREE.Box3();
  const prims: Prim[] = [];
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const g = m.geometry, n = g.attributes.position.count;
    const xf = new THREE.Matrix4().multiplyMatrices(toBind, m.bindMatrix).premultiply(D);
    const pos = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const P = g.attributes.position, I = g.attributes.skinIndex, W = g.attributes.skinWeight;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(xf).toArray(pos, i * 3);
      box.expandByPoint(v);
      for (let k = 0; k < 4; k++) { si[i * 4 + k] = I.getComponent(i, k); sw[i * 4 + k] = W.getComponent(i, k); }
    }
    const index = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: n }, (_, i) => i);
    const mat = m.material as THREE.MeshStandardMaterial;
    prims.push({ pos, skinIndex: si, skinWeight: sw, index, mat: mat.name, base: mat.color?.getHex() ?? 0x888888 });
    g.dispose();
  }
  for (const m of meshes) m.removeFromParent();
  let armature: THREE.Object3D = skeleton.bones[0];
  while (armature.parent && armature.parent !== scene) armature = armature.parent;
  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of gltf.animations) {
    c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale')); // species shaping owns bone scale
    clips.set(c.name, c);
  }
  return { armature, boneNames: skeleton.bones.map((b) => b.name), boneInverses, clips, prims, box };
}

// ------------------------------------------------------------------ species
type Gait = 'quad' | 'whale' | 'still' | 'sitter';

/** Extra rigid parts, authored in the pack's rest space (the animal faces +z, feet on y = 0). */
interface Kit {
  /** a bone's rest position */
  at(bone: string): THREE.Vector3;
  /** the pack's rest bounds */
  box: THREE.Box3;
  /** bounds of the vertices that mostly follow a bone (e.g. the head) */
  boneBox(bone: string): THREE.Box3;
  add(mb: ModelBuilder, bone: string): void;
}

interface Species {
  src: PackKey;
  /** standing height (or, for swimmers, length) in metres */
  height?: number;
  length?: number;
  /** colours by material name; others keep the pack's */
  colors?: Record<string, number>;
  /** per-vertex override (stripes, patches); p is the rest position, box the rest bounds */
  paint?: (mat: string, p: THREE.Vector3, box: THREE.Box3) => number | undefined;
  /** whole-body stretch on top of the size (x across, y up, z length) */
  stretch?: [number, number, number];
  /** materials to leave out (a bull's horns on an elephant) */
  drop?: string[];
  /** bone scale: uniform, or per axis in the bone's own frame */
  bones?: Record<string, number | [number, number, number]>;
  parts?: (k: Kit) => void;
  /** static bends about the left-right axis (lying down, sitting) */
  pose?: [string, number][];
  /** drop the body this far (metres) when posed lying down */
  sink?: number;
  gait: Gait;
  speed: number;
  /** grazers play the eating clip when they stand */
  grazes?: boolean;
}

/** a white zebu: pale coat, grey muzzle, light horns */
const COW = { Main: 0xe8e2d8, Main_Light: 0xf4f0e8, Muzzle: 0x6a625c, Horns: 0xd8ccb0 };
/** water buffalo: slate coat */
const BUFFALO = { Main: 0x34312f, Main_Light: 0x45403c, Muzzle: 0x2a2826, Horns: 0x5a5650 };

function zebuHump(k: Kit) {
  // the zebu's hump over the shoulders, bound to the front of the spine
  const sh = k.at('Torso3'), h = k.box.max.y - k.box.min.y;
  const mb = new ModelBuilder().sphere(h * 0.13, 8, 6, 0xffffff, { p: [sh.x, sh.y + h * 0.17, sh.z + h * 0.02], s: [0.8, 0.9, 1.1] });
  k.add(mb, 'Torso3');
}






/** legs folded under the body */
function lying(): [string, number][] {
  return [['FrontUpperLeg.L', -1.2], ['FrontUpperLeg.R', -1.2], ['FrontLowerLeg.L', 2.4], ['FrontLowerLeg.R', 2.4], ['BackUpperLeg.L', 1.3], ['BackUpperLeg.R', 1.3], ['BackLowerLeg.L', -2.2], ['BackLowerLeg.R', -2.2]];
}

const SPECIES: Record<string, Species> = {
  deer: { src: 'deer', height: 1.3, gait: 'quad', speed: 0.8, grazes: true },
  fox: { src: 'fox', height: 0.5, gait: 'quad', speed: 0.6 },
  cow: { src: 'cow', height: 1.4, colors: COW, parts: zebuHump, gait: 'quad', speed: 0.7, grazes: true },
  horse: { src: 'horse', height: 1.7, gait: 'quad', speed: 1.0, grazes: true },
  // Indian street dog (pariah dog): the Shiba's build, upright ears and curled tail, in common coats
  dog: { src: 'dog', height: 0.6, gait: 'quad', speed: 0.6 },
  whale: { src: 'whale', length: 9, gait: 'whale', speed: 2 },
  cowlying: { src: 'cow', height: 1.4, colors: COW, parts: zebuHump, pose: lying(), sink: 0.55, gait: 'still', speed: 0 },
  buffalolying: { src: 'bull', height: 1.4, colors: BUFFALO, pose: lying(), sink: 0.55, gait: 'still', speed: 0 },
};

export const PACK_SPECIES = Object.keys(SPECIES);
export const animalsReady = () => packs.size === Object.keys(URLS).length;
export const hasPackAnimal = (key: string) => animalsReady() && key in SPECIES;

const _c = new THREE.Color(), _v = new THREE.Vector3();

/** Build a species standing on y = 0, facing -z. userData: rig, gait, speed, grazes, limbs (empty). */
export function makePackAnimal(key: string): THREE.Group {
  const sp = SPECIES[key];
  const pack = packs.get(sp.src)!;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const armature = pack.armature.clone(true);
  body.add(armature);
  const size = pack.box.getSize(new THREE.Vector3());
  body.scale.setScalar(sp.length ? sp.length / size.z : (sp.height ?? 1) / size.y);
  if (sp.stretch) body.scale.multiply(new THREE.Vector3(...sp.stretch));
  body.rotation.y = Math.PI;
  body.position.y = -(sp.sink ?? 0);
  const bones: THREE.Bone[] = [];
  armature.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone); });
  const byName = new Map(bones.map((b) => [PropertyName(b.name), b]));
  const skeleton = new THREE.Skeleton(pack.boneNames.map((n) => byName.get(PropertyName(n))!), pack.boneInverses.map((m) => m.clone()));
  for (const [name, s] of Object.entries(sp.bones ?? {})) {
    const b = byName.get(PropertyName(name));
    if (b) typeof s === 'number' ? b.scale.setScalar(s) : b.scale.set(...s);
  }

  // parts bound rigidly to one bone each
  const extra: { prim: Prim; color: number[] }[] = [];
  const restOf = (bone: string) => new THREE.Vector3().setFromMatrixPosition(pack.boneInverses[pack.boneNames.findIndex((n) => PropertyName(n) === PropertyName(bone))].clone().invert());
  const boneBox = (bone: string) => {
    const bi = pack.boneNames.findIndex((n) => PropertyName(n) === PropertyName(bone));
    const b = new THREE.Box3();
    for (const p of pack.prims) for (let i = 0; i < p.pos.length / 3; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (p.skinIndex[i * 4 + k] === bi) w += p.skinWeight[i * 4 + k];
      if (w > 0.5) b.expandByPoint(_v.fromArray(p.pos, i * 3));
    }
    return b;
  };
  sp.parts?.({
    at: restOf,
    box: pack.box,
    boneBox,
    add(mb, bone) {
      const bi = pack.boneNames.findIndex((n) => PropertyName(n) === PropertyName(bone));
      if (bi < 0) return;
      const g = mb.build();
      const n = g.attributes.position.count;
      extra.push({
        prim: {
          pos: Float32Array.from(g.attributes.position.array as ArrayLike<number>),
          skinIndex: new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? bi : 0)),
          skinWeight: new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)),
          index: Uint32Array.from({ length: n }, (_, i) => i),
          mat: '', base: 0xffffff,
        },
        // parts carry their own vertex colours, linear like ModelBuilder's
        color: Array.from(g.attributes.color.array as ArrayLike<number>),
      });
      g.dispose();
    },
  });

  // painted patterns are decided per triangle (at its centre), so bands stay crisp instead of blending
  // across shared vertices: those prims get their own vertices per triangle
  const prims = pack.prims.filter((p) => !sp.drop?.includes(p.mat)).map((p) => (sp.paint ? deindex(p) : p));
  let nv = 0, ni = 0;
  for (const p of [...prims, ...extra.map((e) => e.prim)]) { nv += p.pos.length / 3; ni += p.index.length; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  const put = (p: Prim, colorAt: (i: number) => void) => {
    const n = p.pos.length / 3;
    pos.set(p.pos, ov * 3); si.set(p.skinIndex, ov * 4); sw.set(p.skinWeight, ov * 4);
    for (let i = 0; i < n; i++) { colorAt(i); col[(ov + i) * 3] = _c.r; col[(ov + i) * 3 + 1] = _c.g; col[(ov + i) * 3 + 2] = _c.b; }
    for (let i = 0; i < p.index.length; i++) idx[oi + i] = p.index[i] + ov;
    ov += n; oi += p.index.length;
  };
  for (const p0 of prims) {
    const flat = sp.colors?.[p0.mat] ?? p0.base;
    if (!sp.paint) { put(p0, () => _c.setHex(flat)); continue; }
    const p = p0, ctr = new THREE.Vector3();
    put(p, (i) => {
      const t = Math.floor(i / 3) * 9;
      ctr.set((p.pos[t] + p.pos[t + 3] + p.pos[t + 6]) / 3, (p.pos[t + 1] + p.pos[t + 4] + p.pos[t + 7]) / 3, (p.pos[t + 2] + p.pos[t + 5] + p.pos[t + 8]) / 3);
      _c.setHex(sp.paint!(p.mat, ctr, pack.box) ?? flat);
    });
  }
  for (const e of extra) put(e.prim, (i) => _c.setRGB(e.color[i * 3], e.color[i * 3 + 1], e.color[i * 3 + 2]));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.SkinnedMesh(geo, personMat);
  mesh.castShadow = true;
  armature.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());

  const rig = new Rig(root, pack.clips, 1);
  rig.extra = (sp.pose ?? []).map(([b, a]) => [PropertyName(b), a]);
  rig.play(sp.gait === 'whale' ? 'Swim' : 'Idle', 0);
  rig.update(Math.random() * 2);
  root.updateMatrixWorld(true);
  // bounds around the whole animal, carried into the mesh's space (cheaper than skinning every vertex)
  const toMesh = mesh.matrixWorld.clone().invert();
  const s = body.scale.x;
  mesh.boundingBox = new THREE.Box3(pack.box.min.clone().multiplyScalar(s).addScalar(-0.3), pack.box.max.clone().multiplyScalar(s).addScalar(0.3));
  mesh.boundingBox.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI)).applyMatrix4(toMesh);
  mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
  mesh.boundingSphere.radius *= 1.3;
  root.userData.rig = rig;
  root.userData.gait = sp.gait;
  root.userData.speed = sp.speed;
  root.userData.grazes = !!sp.grazes;
  root.userData.limbs = [];
  return root;
}

/** a prim with every triangle given its own three vertices */
function deindex(p: Prim): Prim {
  const n = p.index.length;
  const pos = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const j = p.index[i];
    pos.set(p.pos.subarray(j * 3, j * 3 + 3), i * 3);
    si.set(p.skinIndex.subarray(j * 4, j * 4 + 4), i * 4);
    sw.set(p.skinWeight.subarray(j * 4, j * 4 + 4), i * 4);
  }
  return { ...p, pos, skinIndex: si, skinWeight: sw, index: Uint32Array.from({ length: n }, (_, i) => i) };
}

/** GLTFLoader strips '.', ':' and similar from node names; compare names that way. */
function PropertyName(n: string) {
  return THREE.PropertyBinding.sanitizeNodeName(n);
}

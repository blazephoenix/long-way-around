// People assembled from the Quaternius CC0 character packs (built into src/assets/people-*.glb by
// scripts/people-assets.mjs). Each person mixes a head, body, legs and feet from one skeleton family,
// recolours every part from Indian palettes, fakes age by scale, head size and posture, and is merged
// into one skinned mesh (one draw call) driven by the pack's clips.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { toon } from './toon';
import { ModelBuilder } from './models';
import manUrl from '../assets/people-man.glb?url';
import womanUrl from '../assets/people-woman.glb?url';
import boyUrl from '../assets/people-boy.glb?url';
import girlUrl from '../assets/people-girl.glb?url';

/** Flat-shaded toon: the packs are faceted low-poly, and the files carry no normals. */
// (MeshToonMaterial has no flatShading parameter, but its shader honours the flag.)
export const personMat = Object.assign(toon({ vertexColors: true }), { flatShading: true });

type FamilyKey = 'man' | 'woman' | 'boy' | 'girl';
type Part = 'head' | 'body' | 'legs' | 'feet' | 'all';
type Slot = 'skin' | 'skinDark' | 'hair' | 'dark' | 'metal' | 'white' | 'top' | 'top2' | 'bottom' | 'bottom2' | 'shoe' | 'hat';

interface Prim {
  /** bind-space positions (the template mesh's bind matrix applied) */
  pos: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint32Array;
  slot: Slot;
}

interface Family {
  armature: THREE.Object3D;
  boneNames: string[];
  boneInverses: THREE.Matrix4[];
  clips: Map<string, THREE.AnimationClip>;
  parts: Map<string, Partial<Record<Part, Prim[]>>>;
  /** lowest point of each character's legs part and highest of its feet part, to avoid bare gaps */
  legsBottom: Map<string, number>;
  feetTop: Map<string, number>;
  /** bind-pose height in file units, and the bind matrix every part was baked to */
  height: number;
  bind: THREE.Matrix4;
}

const URLS: Record<FamilyKey, string> = { man: manUrl, woman: womanUrl, boy: boyUrl, girl: girlUrl };
const families = new Map<FamilyKey, Family>();
let loading: Promise<void> | null = null;

/** Load every family once; makePerson needs this to have resolved. */
export function loadPeople(fetchBytes: (url: string) => Promise<ArrayBuffer> = (u) => fetch(u).then((r) => r.arrayBuffer())): Promise<void> {
  if (!loading) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loading = Promise.all(
      (Object.keys(URLS) as FamilyKey[]).map(async (k) => families.set(k, toFamily(await loader.parseAsync(await fetchBytes(URLS[k]), '')))),
    ).then(() => undefined);
  }
  return loading;
}

export const peopleReady = () => families.size === 4;

// ------------------------------------------------------------------ loading
const PART_RE = /^part-([a-z]+)-([a-z]+)$/;

function toFamily(gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }): Family {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  const skeleton = meshes[0].skeleton;
  const bind = meshes[0].bindMatrix.clone();
  const toBind = new THREE.Matrix4().copy(bind).invert();
  // Quantized files keep vertices in a normalised space and fold the scale into the inverse bind
  // matrices. Move vertices to the rest pose in scene units (D = bone world * inverse bind) and fold
  // D back out of the inverse binds, so skinning is unchanged and accessories can be placed in metres.
  const D = new THREE.Matrix4().multiplyMatrices(skeleton.bones[0].matrixWorld, skeleton.boneInverses[0]).multiply(bind);
  const Dinv = D.clone().invert();
  const boneInverses = skeleton.boneInverses.map((m) => m.clone().multiply(bind).multiply(Dinv));
  const parts = new Map<string, Partial<Record<Part, Prim[]>>>();
  let minY = Infinity, maxY = -Infinity;
  // material names a character uses on its legs: the same cloth on the body (overalls) is the bottom colour
  const legMats = new Map<string, Set<string>>();
  const legsBottom = new Map<string, number>(), feetTop = new Map<string, number>();
  const tagged = meshes.map((m) => {
    let o: THREE.Object3D | null = m;
    while (o && !PART_RE.test(o.name)) o = o.parent;
    const [, char, part] = PART_RE.exec(o?.name ?? '') ?? [, 'unknown', 'all'];
    if (part === 'legs') (legMats.get(char!) ?? legMats.set(char!, new Set()).get(char!)!).add((m.material as THREE.Material).name);
    return { m, char: char!, part: part as Part };
  });
  for (const { m, char, part } of tagged) {
    const g = m.geometry;
    const n = g.attributes.position.count;
    const xf = new THREE.Matrix4().multiplyMatrices(toBind, m.bindMatrix).premultiply(D);
    const pos = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const v = new THREE.Vector3();
    const P = g.attributes.position, I = g.attributes.skinIndex, W = g.attributes.skinWeight;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(xf);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      if (part === 'legs') legsBottom.set(char, Math.min(legsBottom.get(char) ?? Infinity, v.y));
      if (part === 'feet') feetTop.set(char, Math.max(feetTop.get(char) ?? -Infinity, v.y));
      for (let k = 0; k < 4; k++) { si[i * 4 + k] = I.getComponent(i, k); sw[i * 4 + k] = W.getComponent(i, k); }
    }
    const index = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: n }, (_, i) => i);
    const matName = (m.material as THREE.Material).name;
    const entry = parts.get(char) ?? parts.set(char, {}).get(char)!;
    const prim: Prim = { pos, skinIndex: si, skinWeight: sw, index, slot: slotFor(char, part, matName, legMats.get(char)) };
    (entry[part] ??= []).push(...(GLOVED.has(char) && part === 'body' && prim.slot === 'top' ? splitHands(prim, skeleton) : [prim]));
    g.dispose();
  }
  // keep only the bones: the armature is cloned per person
  for (const m of meshes) m.removeFromParent();
  let armature: THREE.Object3D = skeleton.bones[0];
  while (armature.parent && armature.parent !== scene) armature = armature.parent;
  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of gltf.animations) {
    c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale')); // age scaling owns bone scale
    clips.set(c.name, c);
  }
  return { armature, boneNames: skeleton.bones.map((b) => b.name), boneInverses, clips, parts, legsBottom, feetTop, height: maxY - minY, bind: new THREE.Matrix4() };
}

/** Characters whose gloves share the shirt material; their hand triangles become skin. */
const GLOVED = new Set(['farmer']);
const HAND_BONE = /^(Wrist|Index|Middle|Ring|Pinky|Thumb)/;

function splitHands(p: Prim, skeleton: THREE.Skeleton): Prim[] {
  const hand = (v: number) => {
    let w = 0;
    for (let k = 0; k < 4; k++) if (HAND_BONE.test(skeleton.bones[p.skinIndex[v * 4 + k]]?.name ?? '')) w += p.skinWeight[v * 4 + k];
    return w > 0.5;
  };
  const a: number[] = [], b: number[] = [];
  for (let t = 0; t < p.index.length; t += 3) {
    const tri = [p.index[t], p.index[t + 1], p.index[t + 2]];
    (tri.every(hand) ? b : a).push(...tri);
  }
  return [{ ...p, index: Uint32Array.from(a) }, { ...p, index: Uint32Array.from(b), slot: 'skin' }];
}

/** Which recolour slot a source material feeds. */
function slotFor(char: string, part: Part, mat: string, legMats?: Set<string>): Slot {
  if (/^Skin$/.test(mat)) return 'skin';
  if (/Skin_Darker/.test(mat)) return 'skinDark';
  if (/Hair/.test(mat)) return 'hair';
  if (/^(Eye|Eyes|Eyebrows)$/.test(mat) || (part === 'head' && /^Brown$/.test(mat))) return 'dark';
  if (/Gold|Earrings/.test(mat)) return 'metal';
  if (/^White$/.test(mat) && part !== 'body') return 'white';
  if (part === 'all') return /Pants|Socks/.test(mat) ? 'bottom' : /Shoes/.test(mat) ? 'shoe' : 'top';
  // the formal woman's hair is 'Red' and the worker's 'DarkBrown'; the farmer's 'Red' is his hat band
  if (part === 'head') return /^(Red|DarkBrown)$/.test(mat) ? (char === 'farmer' ? 'top2' : 'hair') : 'hat';
  if (part === 'feet') return 'shoe';
  if (part === 'legs') return /Light|Brown2|Grey/.test(mat) && !/LightBlue/.test(mat) ? 'bottom2' : 'bottom';
  if (legMats?.has(mat)) return 'bottom';
  if (/^Beige$/.test(mat)) return 'skin'; // the farmer's gloves: bare hands read better here
  return /Light|White|Gold|Beige/.test(mat) ? 'top2' : 'top';
}

// ------------------------------------------------------------------ looks
export type Age = 'child' | 'teen' | 'adult' | 'elder';
export type Headwear = 'none' | 'cap' | 'topi' | 'turban';

export interface PersonLook {
  age: Age;
  sex: 'm' | 'f';
  head: string;
  body: string;
  legs: string;
  feet: string;
  skin: number;
  hair: number;
  top: number;
  top2: number;
  bottom: number;
  shoe: number;
  hat: number;
  /** standing height in metres */
  height: number;
  headwear: Headwear;
  headwearColor: number;
  stick: boolean;
  bag: boolean;
}

// Skin tones across the subcontinent; everyday clothing colours.
const SKIN = [0x5a3a26, 0x6e4630, 0x7e5236, 0x8e5e3c, 0x9e6c46, 0xae7a52, 0xc08a5e, 0xd09a6e, 0x4a2e1e];
const HAIR = [0x141010, 0x1c1512, 0x241a14, 0x2e2018];
const GREY = [0x8a8884, 0xa8a6a0, 0xd8d4cc];
const MEN_TOPS = [0xf2f0e8, 0xe8e0c8, 0x3a6a9a, 0x9ab0c8, 0x2a2a2a, 0x8a3a2a, 0x2a6a4a, 0xc8a050, 0x6a4a8a, 0xd8d0b0, 0x4a5a6a, 0xb04a3a];
const WOMEN_TOPS = [0xc8306a, 0xe8742a, 0x2a8a8a, 0xf2c230, 0xd8302a, 0x7a3a9a, 0x2a5ab8, 0xe8a0b0, 0x3a8a4a, 0xf2e6c8, 0x8a1a3a];
const BOTTOMS = [0x2a3440, 0x3a3a42, 0x5a5048, 0x1e2a4a, 0x6a6050, 0x2a2420, 0xd8d2c0, 0x4a4a3a];
const SHOES = [0x2a2420, 0x4a3426, 0x6a4a30, 0x1a1a1a, 0x8a6a4a, 0x3a3a4a];
const HATS = [0xd8c08a, 0xc8b078, 0xe8e0c8];
const TURBANS = [0xd8442a, 0x2a5ab8, 0xe8a03a, 0xf2f2ee, 0xc8306a, 0xf2c230, 0x2a8a5a];

const HEADS: Record<FamilyKey, string[]> = { man: ['casual', 'beach', 'farmer', 'hoodie', 'adventurer'], woman: ['formal', 'adventurer', 'suit', 'worker', 'soldier'], boy: ['man'], girl: ['casual', 'dress'] };
const HAT_HEADS = new Set(['farmer', 'worker']);
/** bodies that only make sense with their own legs (overalls, a dress), and heads tied to a body */
const PAIRED_BODY = new Set(['farmer', 'formal']);
const HEAD_NEEDS_BODY: Record<string, string> = { worker: 'worker' };

const familyOf = (age: Age, sex: 'm' | 'f'): FamilyKey => (age === 'child' ? (sex === 'm' ? 'boy' : 'girl') : sex === 'm' ? 'man' : 'woman');

export function randomLook(r: () => number, age?: Age, sex?: 'm' | 'f'): PersonLook {
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length) % a.length];
  const a: Age = age ?? (() => { const x = r(); return x < 0.14 ? 'child' : x < 0.26 ? 'teen' : x < 0.86 ? 'adult' : 'elder'; })();
  const s = sex ?? (r() < 0.5 ? 'm' : 'f');
  const fam = familyOf(a, s);
  const chars = HEADS[fam];
  // no beards or hard hats on the young
  let head = pick(a === 'teen' ? chars.filter((c) => c !== 'worker' && (c !== 'adventurer' || s === 'f')) : a === 'elder' ? chars.filter((c) => c !== 'worker') : chars);
  const bodies = fam === 'man' ? ['casual', 'beach', 'farmer', 'hoodie', 'adventurer', 'punk'] : fam === 'woman' ? ['formal', 'adventurer', 'suit', 'worker', 'soldier'] : [head];
  // no hi-vis vests, fatigues or punk vests on the elderly
  let body = HEAD_NEEDS_BODY[head] ?? pick(a === 'elder' ? bodies.filter((b) => !['worker', 'soldier', 'punk'].includes(b)) : bodies);
  if (fam === 'woman' && body === 'worker' && head !== 'worker' && a !== 'teen' && r() < 0.5) head = 'worker';
  const legs = PAIRED_BODY.has(body) || fam === 'boy' || fam === 'girl' ? body : pick(bodies.filter((b) => !PAIRED_BODY.has(b)));
  // shoes must reach the bottom of the trousers or skirt (boots cover the shins of some legs parts)
  const fdata = families.get(fam);
  const fits = (f: string) => !fdata || (fdata.feetTop.get(f) ?? 0) >= (fdata.legsBottom.get(legs) ?? 0) - 0.01 * fdata.height;
  const feet = fam === 'boy' || fam === 'girl' ? body : pick(bodies.filter(fits).length ? bodies.filter(fits) : [legs]);
  const old = a === 'elder';
  const H = { child: [1.0, 1.35], teen: [1.42, 1.62], adult: s === 'm' ? [1.6, 1.8] : [1.5, 1.66], elder: s === 'm' ? [1.55, 1.72] : [1.45, 1.6] }[a];
  const hr = r();
  let headwear: Headwear = 'none';
  if (!HAT_HEADS.has(head)) {
    if (s === 'm' && a !== 'child') headwear = hr < 0.1 ? 'turban' : hr < 0.2 ? 'topi' : hr < 0.3 ? 'cap' : 'none';
    else if (s === 'f') headwear = 'none';
    else headwear = hr < 0.12 ? 'cap' : 'none';
  }
  const tops = s === 'm' ? MEN_TOPS : WOMEN_TOPS;
  const top = pick(tops);
  // trims and second panels: mostly a shade of the main colour, sometimes a contrast
  const top2 = r() < 0.6 ? _c.setHex(top).multiplyScalar(r() < 0.5 ? 0.7 : 1.25).getHex() : pick(tops);
  return {
    age: a, sex: s, head, body, legs, feet,
    skin: pick(SKIN),
    hair: old ? pick(GREY) : pick(HAIR),
    top,
    top2,
    bottom: pick(BOTTOMS),
    shoe: pick(SHOES),
    hat: pick(HATS),
    height: H[0] + r() * (H[1] - H[0]),
    headwear,
    headwearColor: headwear === 'topi' ? 0xf2f0e8 : pick(TURBANS),
    stick: old && r() < 0.45,
    bag: a !== 'child' && r() < 0.08,
  };
}

// ------------------------------------------------------------------ building
const AGE_HEAD: Record<Age, number> = { child: 1.18, teen: 1.05, adult: 1, elder: 1 };
const _c = new THREE.Color();

function colourFor(look: PersonLook, slot: Slot): number {
  switch (slot) {
    case 'skin': return look.skin;
    case 'skinDark': return _c.setHex(look.skin).multiplyScalar(0.82).getHex();
    case 'hair': return look.hair;
    case 'dark': return 0x1a1210;
    case 'metal': return 0xc8a040;
    case 'white': return 0xe8e4dc;
    case 'top': return look.top;
    case 'top2': return look.top2;
    case 'bottom': return look.bottom;
    case 'bottom2': return _c.setHex(look.bottom).multiplyScalar(0.72).getHex();
    case 'shoe': return look.shoe;
    case 'hat': return look.hat;
  }
}

/** Spine bend for elders, per bone (the neck and head lift back so the gaze stays level). */
const STOOP: [string, number][] = [['Abdomen', 0.35], ['Torso', 0.35], ['Chest', 0.3], ['Neck', -0.5], ['Head', -0.4]];

const _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _ax = new THREE.Vector3();

/** Seated: thighs forward, shins down. */
const SIT: [string, number][] = [['UpperLegL', 1.5], ['UpperLegR', 1.5], ['LowerLegL', -1.5], ['LowerLegR', -1.5]];

/** Animation state for one skinned character (people and animals): a mixer over its own skeleton, plus bend offsets on top of the clips. */
export class Rig {
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private bones = new Map<string, THREE.Bone>();
  private saved = new Map<THREE.Bone, THREE.Quaternion>();
  /** forward bend in radians, spread over the spine (elders) */
  stoop = 0;
  /** leg pose override: 'sit' folds the legs after the clip runs */
  pose: 'none' | 'sit' = 'none';
  /** further bends about the left-right axis, e.g. arms reaching for a handlebar */
  extra: [string, number][] = [];

  constructor(private root: THREE.Object3D, private clips: Map<string, THREE.AnimationClip>, private baseRate: number) {
    this.mixer = new THREE.AnimationMixer(root);
    root.traverse((o) => { if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone); });
  }

  has(name: string) { return this.clips.has(name); }

  /** Cross-fade to a clip by name ('Walk', 'Idle', 'Wave', 'Interact', 'Sitting', 'Clapping'). */
  play(name: string, fade = 0.3, rate = 1) {
    const clip = this.clips.get(name) ?? this.clips.get('Idle') ?? this.clips.values().next().value!;
    let a = this.actions.get(clip.name);
    if (!a) { a = this.mixer.clipAction(clip); this.actions.set(clip.name, a); }
    a.timeScale = rate * this.baseRate;
    if (a === this.current) return;
    a.reset().play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
  }

  /** Advance the clip, then lay age and pose offsets on top of it. */
  update(dt: number) {
    // put back the clip's pose before bending again: bones the clip doesn't animate would
    // otherwise keep last frame's bend and add to it every frame
    for (const [b, q] of this.saved) b.quaternion.copy(q);
    this.mixer.update(dt);
    if (this.stoop) for (const [name, k] of STOOP) this.bend(name, this.stoop * k);
    if (this.pose === 'sit') for (const [name, a] of SIT) this.bend(name, a);
    for (const [name, a] of this.extra) this.bend(name, a);
  }

  /**
   * Bend a bone about the person's left-right axis (positive folds forward), on top of the clip's
   * pose. The packs' bones have twisted local frames, so the axis is carried into the parent's frame.
   */
  bend(name: string, a: number) {
    const b = this.bones.get(name);
    if (!b || !b.parent) return;
    (this.saved.get(b) ?? this.saved.set(b, new THREE.Quaternion()).get(b)!).copy(b.quaternion);
    b.parent.updateWorldMatrix(true, false);
    b.parent.getWorldQuaternion(_pq).invert();
    _ax.set(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_rq)).applyQuaternion(_pq);
    b.quaternion.premultiply(_bq.setFromAxisAngle(_ax, a));
  }

  bone(name: string) { return this.bones.get(name); }
}

/** Build a person standing on y = 0, facing -z. userData.rig drives it; call rig.update(dt) each frame. */
export function makePerson(look: PersonLook): THREE.Group {
  const famKey = familyOf(look.age, look.sex);
  const fam = families.get(famKey);
  if (!fam) throw new Error('makePerson before loadPeople() resolved');
  const root = new THREE.Group();
  const body = new THREE.Group(); // scaled to the person's height
  root.add(body);
  const armature = fam.armature.clone(true);
  body.add(armature);
  body.scale.setScalar(look.height / fam.height);
  body.rotation.y = Math.PI; // the packs face +z
  const bones: THREE.Bone[] = [];
  armature.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone); });
  const byName = new Map(bones.map((b) => [b.name, b]));
  const skeleton = new THREE.Skeleton(fam.boneNames.map((n) => byName.get(n)!), fam.boneInverses.map((m) => m.clone()));

  // pose first: the stick and bag are placed against the idle pose, then mapped back to rest space
  const rig = new Rig(root, fam.clips, look.age === 'elder' ? 0.8 : 1);
  const head = byName.get('Head');
  if (head) head.scale.setScalar(AGE_HEAD[look.age]);
  if (look.age === 'elder') rig.stoop = 0.16;
  rig.play('Idle', 0);
  rig.update(0);
  root.updateMatrixWorld(true);
  const toRest = (bone: string) => {
    const i = fam.boneNames.indexOf(bone);
    const m = new THREE.Matrix4().multiplyMatrices(skeleton.bones[i].matrixWorld, skeleton.boneInverses[i]).invert();
    return (v: THREE.Vector3) => v.applyMatrix4(m);
  };

  // gather the chosen parts and recolour them
  const prims: Prim[] = [];
  const kid = famKey === 'boy' || famKey === 'girl';
  const want: [string, Part][] = kid ? [[look.body, 'all']] : [[look.head, 'head'], [look.body, 'body'], [look.legs, 'legs'], [look.feet, 'feet']];
  for (const [char, part] of want) prims.push(...(fam.parts.get(char)?.[part] ?? []));
  const extra = accessories(look, fam, kid ? prims : fam.parts.get(look.head)?.head ?? [], skeleton, toRest);

  let nv = 0, ni = 0;
  for (const p of [...prims, ...extra]) { nv += p.pos.length / 3; ni += p.index.length; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of [...prims, ...extra]) {
    const n = p.pos.length / 3;
    pos.set(p.pos, ov * 3); si.set(p.skinIndex, ov * 4); sw.set(p.skinWeight, ov * 4);
    _c.setHex(accColour.get(p) ?? colourFor(look, p.slot)); // linear, like ModelBuilder
    for (let i = 0; i < n; i++) { col[(ov + i) * 3] = _c.r; col[(ov + i) * 3 + 1] = _c.g; col[(ov + i) * 3 + 2] = _c.b; }
    for (let i = 0; i < p.index.length; i++) idx[oi + i] = p.index[i] + ov;
    ov += n; oi += p.index.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.SkinnedMesh(geo, personMat);
  mesh.castShadow = true;
  armature.add(mesh);
  mesh.bind(skeleton, fam.bind);
  // refresh the attached bind inverse, then bound the person (culling and layout read these). The
  // skinned mesh's own compute* skins every vertex; a box around the standing figure, carried into
  // the mesh's local space, is as good for culling and much cheaper.
  root.updateMatrixWorld(true);
  const toMesh = mesh.matrixWorld.clone().invert();
  const w = look.height * 0.32;
  mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-w, 0, -w), new THREE.Vector3(w, look.height * 1.12, w)).applyMatrix4(toMesh);
  mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
  root.userData.rig = rig;
  root.userData.look = look;
  return root;
}

/**
 * Headwear, walking stick and bag as extra prims rigidly bound to one bone each. Headwear is placed
 * around the head part in rest space; the stick and bag are placed in the posed person (root space)
 * and mapped back to rest space through their bone.
 */
function accessories(look: PersonLook, fam: Family, headPrims: Prim[], skeleton: THREE.Skeleton, toRest: (bone: string) => (v: THREE.Vector3) => THREE.Vector3): Prim[] {
  const out: Prim[] = [];
  const add = (mb: ModelBuilder, bone: string, color: number, map?: (v: THREE.Vector3) => THREE.Vector3) => {
    const bi = fam.boneNames.indexOf(bone);
    if (bi < 0) return;
    const g = mb.build();
    const p = g.attributes.position;
    const n = p.count;
    const pos = Float32Array.from(p.array as ArrayLike<number>);
    if (map) for (let i = 0; i < n; i++) map(_v.fromArray(pos, i * 3)).toArray(pos, i * 3);
    const prim: Prim = {
      pos,
      skinIndex: new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? bi : 0)),
      skinWeight: new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)),
      index: g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: n }, (_, i) => i),
      slot: 'top',
    };
    accColour.set(prim, color);
    out.push(prim);
    g.dispose();
  };
  // head box from the head part's vertices (hair included), in rest space; the packs face +z there
  if (look.headwear !== 'none' && headPrims.length) {
    const hb = new THREE.Box3();
    const hi = fam.boneNames.indexOf('Head');
    for (const p of headPrims) for (let i = 0; i < p.pos.length / 3; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (p.skinIndex[i * 4 + k] === hi) w += p.skinWeight[i * 4 + k];
      if (w > 0.5) hb.expandByPoint(_v.fromArray(p.pos, i * 3));
    }
    const c = hb.getCenter(new THREE.Vector3()), s = hb.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.z) / 2, top = hb.max.y, col = look.headwearColor;
    const mb = new ModelBuilder();
    if (look.headwear === 'turban') {
      mb.sphere(r * 1.06, 10, 7, col, { p: [c.x, top - r * 0.42, c.z - r * 0.06], s: [1, 0.66, 1.04] });
      mb.torus(r * 0.9, r * 0.18, 6, 14, col, { p: [c.x, top - r * 0.66, c.z - r * 0.02], r: [Math.PI / 2 + 0.16, 0, 0] });
    } else if (look.headwear === 'topi') {
      mb.cyl(r * 0.94, r * 1.0, r * 0.46, 12, col, { p: [c.x, top - r * 0.5, c.z - r * 0.04], s: [0.84, 1, 1.12], r: [0.08, 0, 0] });
    } else if (look.headwear === 'cap') {
      mb.sphere(r * 1.02, 10, 5, col, { p: [c.x, top - r * 0.5, c.z], s: [1, 0.66, 1] });
      mb.box(r * 1.2, r * 0.07, r * 0.8, col, { p: [c.x, top - r * 0.62, c.z + r * 1.2], r: [0.12, 0, 0] });
    }
    add(mb, 'Head', col);
  }
  if (look.stick && skeleton.getBoneByName('WristR')) {
    // from the right hand straight down to the ground, in the idle pose
    const w = new THREE.Vector3().setFromMatrixPosition(skeleton.getBoneByName('WristR')!.matrixWorld);
    const mb = new ModelBuilder().cyl(0.014, 0.016, w.y + 0.02, 5, 0x6a4a34, { p: [w.x, (w.y - 0.02) / 2, w.z] });
    mb.sphere(0.024, 5, 4, 0x5a3a24, { p: [w.x, w.y + 0.02, w.z] });
    add(mb, 'WristR', 0x6a4a34, toRest('WristR'));
  }
  if (look.bag) {
    // a cloth shoulder bag at the left hip
    const h = new THREE.Vector3().setFromMatrixPosition(skeleton.getBoneByName('Hips')!.matrixWorld);
    const mb = new ModelBuilder().box(0.07, 0.24, 0.22, 0x5a4a3a, { p: [h.x + 0.2, h.y - 0.04, h.z] });
    add(mb, 'Hips', 0x8a6a4a, toRest('Hips'));
  }
  return out;
}
const _v = new THREE.Vector3();
const accColour = new WeakMap<Prim, number>();

/** Put headwear on a look unless its head part already has a hat. */
export function wearHeadwear(look: PersonLook, kind: Headwear, color: number) {
  if (HAT_HEADS.has(look.head) || look.age === 'child') return;
  look.headwear = kind;
  look.headwearColor = color;
}

/** A person's current pose as a static, flat-shaded geometry in the skinned mesh's local space (for merging). */
export function bakePose(mesh: THREE.SkinnedMesh): THREE.BufferGeometry {
  const src = mesh.geometry, idx = src.index!, C = src.attributes.color;
  const n = src.attributes.position.count;
  const posed = new Float32Array(n * 3);
  for (let j = 0; j < n; j++) mesh.getVertexPosition(j, _v).toArray(posed, j * 3);
  const pos = new Float32Array(idx.count * 3), col = new Float32Array(idx.count * 3);
  for (let i = 0; i < idx.count; i++) {
    const j = idx.getX(i);
    pos[i * 3] = posed[j * 3]; pos[i * 3 + 1] = posed[j * 3 + 1]; pos[i * 3 + 2] = posed[j * 3 + 2];
    col[i * 3] = C.getX(j); col[i * 3 + 1] = C.getY(j); col[i * 3 + 2] = C.getZ(j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A seated figure baked into static vehicle geometry (position, normal, color, aTint, like
 * ModelBuilder output), with the hips on `seat` and, if given, the hands reaching for `grips`
 * (left, right). Coordinates are the vehicle's local space, facing -z. Null before loadPeople().
 */
const reach = new Map<string, number[]>();

export function seatedFigure(look: PersonLook, seat: THREE.Vector3, grips?: [THREE.Vector3, THREE.Vector3]): THREE.BufferGeometry | null {
  if (!peopleReady()) return null;
  const p = makePerson(look);
  const rig = p.userData.rig as Rig;
  rig.pose = 'sit';
  const settle = () => { p.updateMatrixWorld(true); rig.update(0); p.updateMatrixWorld(true); };
  settle();
  p.position.add(seat.clone().sub(rig.bone('Hips')!.getWorldPosition(_v)));
  settle();
  if (grips) {
    // coarse-to-fine search over shoulder and elbow bends for the wrists closest to the grips;
    // the answer depends only on the body and the grips, so it is cached
    const key = `${familyOf(look.age, look.sex)}:${look.body}:${look.age}:${look.height.toFixed(2)}:${seat.toArray()}:${grips[0].toArray()}:${grips[1].toArray()}`;
    const err = (a: number, b: number) => {
      rig.extra = [['UpperArmL', a], ['UpperArmR', a], ['LowerArmL', b], ['LowerArmR', b]];
      settle();
      return rig.bone('WristL')!.getWorldPosition(_v).distanceTo(grips[0]) + rig.bone('WristR')!.getWorldPosition(_v).distanceTo(grips[1]);
    };
    let best = reach.get(key);
    if (!best) {
      let be = Infinity;
      best = [0, 0];
      for (let a = 0; a <= 1.8; a += 0.2) for (let b = 0; b <= 1.6; b += 0.2) { const e = err(a, b); if (e < be) { be = e; best = [a, b]; } }
      const [a0, b0] = best;
      for (let a = a0 - 0.15; a <= a0 + 0.15; a += 0.05) for (let b = b0 - 0.15; b <= b0 + 0.15; b += 0.05) { const e = err(a, b); if (e < be) { be = e; best = [a, b]; } }
      reach.set(key, best);
    }
    err(best[0], best[1]);
  }
  let mesh: THREE.SkinnedMesh | null = null;
  p.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
  const g = bakePose(mesh!).applyMatrix4(mesh!.matrixWorld);
  g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  mesh!.geometry.dispose();
  return g;
}

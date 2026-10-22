// Animals from unrigged low-poly models (Poly by Google, CC-BY 3.0; see THIRD-PARTY-NOTICES.md), baked
// to flat-coloured meshes by scripts/animal-assets.mjs. At load each mesh is bound to a skeleton made
// for it — a body, hip and knee per leg, a neck and a tail, placed from the model's own shape — with
// weights that blend across each joint, and a procedural rig drives walk, gallop, graze and idle.
// One skinned mesh (one draw call) per animal.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { personMat } from './peopleModels';
import tigerUrl from '../assets/animals/tiger.glb?url';
import elephantUrl from '../assets/animals/elephant.glb?url';
import monkeyUrl from '../assets/animals/monkey.glb?url';
import camelUrl from '../assets/animals/camel.glb?url';
import sambarUrl from '../assets/animals/sambar.glb?url';
import jackalUrl from '../assets/animals/jackal.glb?url';
import turtleUrl from '../assets/animals/turtle.glb?url';
import blackbuckUrl from '../assets/animals/blackbuck.glb?url';
import catUrl from '../assets/animals/cat.glb?url';

type StaticKey = 'tiger' | 'elephant' | 'monkey' | 'camel' | 'sambar' | 'jackal' | 'turtle' | 'blackbuck' | 'cat';
const URLS: Record<StaticKey, string> = { tiger: tigerUrl, elephant: elephantUrl, monkey: monkeyUrl, camel: camelUrl, sambar: sambarUrl, jackal: jackalUrl, turtle: turtleUrl, blackbuck: blackbuckUrl, cat: catUrl };

interface Mesh {
  /** non-indexed flat faces in file units, facing +z, feet on y = 0 */
  pos: Float32Array;
  /** linear colour per vertex */
  col: Float32Array;
  box: THREE.Box3;
}
const meshes = new Map<StaticKey, Mesh>();
let loading: Promise<void> | null = null;

export function loadStaticAnimals(fetchBytes: (url: string) => Promise<ArrayBuffer> = (u) => fetch(u).then((r) => r.arrayBuffer())): Promise<void> {
  if (!loading) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loading = Promise.all((Object.keys(URLS) as StaticKey[]).map(async (k) => {
      const gltf = await loader.parseAsync(await fetchBytes(URLS[k]), '');
      // the compressed file keeps positions in a unit box and puts the real scale on the node
      gltf.scene.updateMatrixWorld(true);
      let g: THREE.BufferGeometry | null = null, xf = new THREE.Matrix4();
      gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { g = (o as THREE.Mesh).geometry; xf = o.matrixWorld; } });
      const ng = g!.index ? g!.toNonIndexed() : g!;
      const P = ng.attributes.position, C = ng.attributes.color;
      const pos = new Float32Array(P.count * 3), col = new Float32Array(P.count * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(xf).toArray(pos, i * 3); col[i * 3] = C.getX(i); col[i * 3 + 1] = C.getY(i); col[i * 3 + 2] = C.getZ(i); }
      meshes.set(k, { pos, col, box: new THREE.Box3().setFromArray(pos) });
    })).then(() => undefined);
  }
  return loading;
}

// ------------------------------------------------------------------ species
type Gait = 'quad' | 'sitter' | 'crawl';

interface Spec {
  src: StaticKey;
  /** standing height (or, for the turtle, length) in metres */
  height?: number;
  length?: number;
  /** -1 when the model's head points to -z */
  forward?: 1 | -1;
  /** where the legs meet the body, as a fraction of height */
  legTop: number;
  /** the neck's root along the body (-0.5 tail end .. 0.5 head end) and its height fraction */
  neck?: [number, number];
  /** where the tail starts along the body */
  tail?: number;
  /** turtle: flippers are the parts wider than this fraction of the half-width */
  flippers?: number;
  /** recolour a vertex (sRGB hex in, hex out); p is in metres-normalised model space */
  recolor?: (hex: number, p: THREE.Vector3, box: THREE.Box3) => number;
  /** squeeze geometry above this height fraction (antlers) by k towards the head */
  shrinkAbove?: [number, number];
  gait: Gait;
  speed: number;
  grazes?: boolean;
  /** too heavy to gallop: flees at a fast walk */
  noGallop?: boolean;
}

const _hsl = { h: 0, s: 0, l: 0 };
const hsl = (hex: number, f: (h: { h: number; s: number; l: number }) => void) => {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl);
  f(_hsl);
  return c.setHSL(_hsl.h, _hsl.s, _hsl.l).getHex();
};

const SPECS: Record<string, Spec> = {
  tiger: { src: 'tiger', height: 1.05, legTop: 0.5, neck: [0.28, 0.6], tail: -0.32, gait: 'quad', speed: 0.9 },
  elephant: { src: 'elephant', height: 2.9, legTop: 0.42, neck: [0.3, 0.6], tail: -0.42, gait: 'quad', speed: 0.8, grazes: true, noGallop: true },
  monkey: { src: 'monkey', height: 0.55, legTop: 0, gait: 'sitter', speed: 0.6 },
  camel: { src: 'camel', height: 2.2, legTop: 0.48, neck: [0.22, 0.6], tail: -0.42, gait: 'quad', speed: 0.9, grazes: true },
  // the Indian elk is the sambar: same bulk and colour, smaller antlers
  elk: { src: 'sambar', height: 1.9, legTop: 0.42, neck: [0.25, 0.55], tail: -0.42, shrinkAbove: [0.66, 0.5], gait: 'quad', speed: 1.0, grazes: true },
  // golden jackal: the coyote turned golden
  coyote: { src: 'jackal', height: 0.6, legTop: 0.45, neck: [0.25, 0.55], tail: -0.3, recolor: (h) => hsl(h, (c) => { if (c.l > 0.15 && c.l < 0.85) { c.h = 0.09; c.s = Math.min(0.55, c.s + 0.15); } }), gait: 'quad', speed: 0.7 },
  // olive ridley sea turtle on the beach
  seal: { src: 'turtle', length: 0.8, legTop: 0, flippers: 0.62, recolor: (h) => hsl(h, (c) => { c.h = 0.16; c.s *= 0.45; c.l *= 0.85; }), gait: 'crawl', speed: 0.15 },
  // blackbuck: the gazelle's back goes black over its white belly
  cat: { src: 'cat', height: 0.3, legTop: 0.45, neck: [0.28, 0.6], tail: -0.3, gait: 'quad', speed: 0.4 },
  blackbuck: { src: 'blackbuck', height: 1.25, legTop: 0.45, neck: [0.25, 0.55], tail: -0.42, recolor: (h) => hsl(h, (c) => { if (c.l < 0.62) { c.s *= 0.3; c.l *= 0.25; } }), gait: 'quad', speed: 0.9, grazes: true },
};

export const STATIC_SPECIES = Object.keys(SPECS);
export const hasStaticAnimal = (key: string) => key in SPECS && meshes.size === Object.keys(URLS).length;

/** What animals.ts drives: the people's Rig and the procedural rig below both fit. */
export interface AnimalRig {
  play(name: string, fade?: number, rate?: number): void;
  update(dt: number): void;
  extra: [string, number][];
}

/** Bones made for one model; the procedural rig moves them. */
interface Bones {
  body: THREE.Bone;
  legs: { hip: THREE.Bone; knee: THREE.Bone; front: boolean; side: number }[];
  neck?: THREE.Bone;
  tail?: THREE.Bone;
  flippers: { bone: THREE.Bone; front: boolean; side: number }[];
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Build a species standing on y = 0, facing -z (like the other animals). */
export function makeStaticAnimal(key: string): THREE.Group {
  const sp = SPECS[key];
  const src = meshes.get(sp.src)!;
  const f = sp.forward ?? 1;
  const n = src.pos.length / 3;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  // the head end becomes +z
  for (let i = 0; i < n * 3; i += 3) { pos[i] = src.pos[i] * f; pos[i + 1] = src.pos[i + 1]; pos[i + 2] = src.pos[i + 2] * f; }
  const box = new THREE.Box3().setFromArray(pos), H = box.max.y - box.min.y, L = box.max.z - box.min.z, W = box.max.x - box.min.x;
  const p = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    p.fromArray(pos, i * 3);
    if (sp.shrinkAbove && p.y > sp.shrinkAbove[0] * H) {
      // pull antlers in towards the top of the head
      const y0 = sp.shrinkAbove[0] * H, k = sp.shrinkAbove[1];
      const hz = box.max.z * 0.62; // roughly over the head
      p.y = y0 + (p.y - y0) * k; p.x *= k; p.z = hz + (p.z - hz) * k;
    }
    p.toArray(pos, i * 3);
    c.setRGB(src.col[i * 3], src.col[i * 3 + 1], src.col[i * 3 + 2]);
    if (sp.recolor) c.setHex(sp.recolor(c.getHex(), p, box));
    c.toArray(col, i * 3);
  }

  // ---- skeleton, in file units (the body group scales it to metres)
  const legY = sp.legTop * H;
  const body = new THREE.Bone();
  body.name = 'body';
  body.position.set(0, legY || H * 0.4, 0);
  const bones: Bones = { body, legs: [], flippers: [] };
  const all: THREE.Bone[] = [body];
  const at = (b: THREE.Bone, parent: THREE.Bone, x: number, y: number, z: number) => {
    parent.add(b);
    parent.updateMatrixWorld(true);
    b.position.copy(parent.worldToLocal(new THREE.Vector3(x, y, z)));
    all.push(b);
    return b;
  };
  const zAt = (u: number) => box.min.z + (u + 0.5) * L;
  const neckZ = sp.neck ? zAt(sp.neck[0]) : Infinity;
  // legs: the low vertices behind the neck (not a hanging trunk or a lowered head) fall into four
  // clusters by side and by front/back of their middle
  const low: number[] = [];
  if (sp.legTop > 0) for (let i = 0; i < n; i++) if (pos[i * 3 + 1] < legY * 0.6 && pos[i * 3 + 2] < neckZ) low.push(i);
  const zMid = low.reduce((s, i) => s + pos[i * 3 + 2], 0) / Math.max(1, low.length);
  const legOf = (x: number, z: number) => (z > zMid ? 0 : 2) + (x > 0 ? 0 : 1);
  if (low.length) {
    const sums = [0, 1, 2, 3].map(() => ({ x: 0, z: 0, n: 0 }));
    for (const i of low) { const s = sums[legOf(pos[i * 3], pos[i * 3 + 2])]; s.x += pos[i * 3]; s.z += pos[i * 3 + 2]; s.n++; }
    sums.forEach((s, k) => {
      const x = s.n ? s.x / s.n : (k % 2 ? -W / 4 : W / 4), z = s.n ? s.z / s.n : (k < 2 ? L / 4 : -L / 4);
      const hip = at(new THREE.Bone(), body, x, legY, z);
      const knee = at(new THREE.Bone(), hip, x, legY * 0.48, z);
      bones.legs.push({ hip, knee, front: k < 2, side: k % 2 ? -1 : 1 });
    });
  }
  if (sp.neck) bones.neck = at(new THREE.Bone(), body, 0, sp.neck[1] * H, neckZ);
  if (sp.tail !== undefined) bones.tail = at(new THREE.Bone(), body, 0, legY * 1.1, zAt(sp.tail));
  if (sp.flippers) {
    for (const [front, side] of [[true, 1], [true, -1], [false, 1], [false, -1]] as const) {
      bones.flippers.push({ bone: at(new THREE.Bone(), body, side * W * 0.5 * sp.flippers, H * 0.3, front ? L * 0.18 : -L * 0.25), front, side });
    }
  }
  const index = new Map(all.map((b, i) => [b, i]));

  // ---- weights: each vertex blends between the body and the part it belongs to, across a band
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const band = H * 0.08;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const w: [number, number][] = [];
    if (bones.neck && z > neckZ - L * 0.06) {
      w.push([index.get(bones.neck)!, smooth(neckZ - L * 0.06, neckZ + L * 0.06, z)]);
    } else if (bones.legs.length && y < legY + band) {
      const leg = bones.legs[legOf(x, z)];
      const wl = smooth(legY + band, legY - band, y);
      const wk = smooth(legY * 0.48 + band * 0.6, legY * 0.48 - band * 0.6, y);
      w.push([index.get(leg.hip)!, wl * (1 - wk)], [index.get(leg.knee)!, wl * wk]);
    } else if (bones.tail && z < zAt(sp.tail!) + L * 0.04) {
      w.push([index.get(bones.tail)!, smooth(zAt(sp.tail!) + L * 0.04, zAt(sp.tail!) - L * 0.04, z)]);
    }
    if (sp.flippers && Math.abs(x) > W * 0.5 * sp.flippers * 0.85) {
      const fl = bones.flippers.find((b) => b.side === Math.sign(x) && b.front === z > 0)!;
      w.push([index.get(fl.bone)!, smooth(W * 0.5 * sp.flippers * 0.85, W * 0.5 * sp.flippers * 1.1, Math.abs(x))]);
    }
    let rest = 1;
    w.forEach(([b, v], k) => { si[i * 4 + k] = b; sw[i * 4 + k] = v; rest -= v; });
    si[i * 4 + w.length] = 0;
    sw[i * 4 + w.length] = Math.max(0, rest);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  const mesh = new THREE.SkinnedMesh(geo, personMat);
  mesh.castShadow = true;
  const root = new THREE.Group();
  const holder = new THREE.Group(); // scaled to metres, turned to face -z
  root.add(holder);
  holder.scale.setScalar(sp.length ? sp.length / L : (sp.height ?? 1) / H);
  holder.rotation.y = Math.PI;
  holder.add(body, mesh);
  holder.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(all);
  mesh.bind(skeleton);
  mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-W, 0, -L), new THREE.Vector3(W, H * 1.2, L));
  mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());

  const rig = new ProcRig(bones, sp.gait, legY / Math.max(H, 1e-6), !sp.noGallop);
  rig.update(0);
  root.userData.rig = rig;
  root.userData.gait = sp.gait === 'crawl' ? 'quad' : sp.gait;
  root.userData.speed = sp.speed;
  root.userData.grazes = !!sp.grazes;
  root.userData.limbs = [];
  return root;
}

/**
 * Procedural motion on the generated bones: walk (diagonal pairs), gallop (front pair, then back
 * pair), graze (neck down) and idle (breathing, a slow head and tail), easing between them.
 */
class ProcRig implements AnimalRig {
  extra: [string, number][] = [];
  private t = Math.random() * 10;
  private want = { walk: 0, gallop: 0, graze: 0 };
  private now = { walk: 0, gallop: 0, graze: 0 };
  private rate = 1;
  private hurry = 1;
  private rest: { b: THREE.Bone; q: THREE.Quaternion; p: THREE.Vector3 }[];

  constructor(private bones: Bones, private gait: Gait, legFrac: number, private gallops: boolean) {
    const list = [bones.body, ...bones.legs.flatMap((l) => [l.hip, l.knee]), ...(bones.neck ? [bones.neck] : []), ...(bones.tail ? [bones.tail] : []), ...bones.flippers.map((f) => f.bone)];
    this.rest = list.map((b) => ({ b, q: b.quaternion.clone(), p: b.position.clone() }));
    // longer legs step more slowly
    this.rate = 1.6 / Math.max(0.35, legFrac * 2);
  }

  /** 'Walk', 'Gallop', 'Eating' or anything else for idle; the fade is the fixed easing in update() */
  play(name: string) {
    const run = name === 'Gallop' && this.gallops;
    this.want = { walk: name === 'Walk' || name === 'Swim' || (name === 'Gallop' && !run) ? 1 : 0, gallop: run ? 1 : 0, graze: name === 'Eating' ? 1 : 0 };
    this.hurry = name === 'Gallop' && !run ? 1.8 : 1;
  }

  update(dt: number) {
    const k = Math.min(1, dt * 4);
    for (const key of ['walk', 'gallop', 'graze'] as const) this.now[key] += (this.want[key] - this.now[key]) * k;
    const { walk, gallop, graze } = this.now;
    this.t += dt * this.rate * (1 + gallop * 1.2) * this.hurry;
    const ph = this.t * Math.PI * 2;
    for (const r of this.rest) { r.b.quaternion.copy(r.q); r.b.position.copy(r.p); }
    const B = this.bones;
    if (this.gait === 'sitter') {
      // a sitting monkey: breathing and looking around
      B.body.rotateY(Math.sin(this.t * 0.4) * 0.15);
      B.body.position.y += Math.sin(ph * 0.3) * 0.004;
      return;
    }
    // body: a bob with each step, a rock when galloping
    B.body.position.y += (Math.abs(Math.sin(ph)) * 0.02 * walk + Math.sin(ph) * 0.05 * gallop) * B.body.position.y;
    B.body.rotateX(Math.sin(ph) * 0.06 * gallop);
    for (const leg of B.legs) {
      // walk: diagonal pairs swing together; gallop: the front pair, then the back pair
      const walkPh = ph + (leg.front === (leg.side > 0) ? 0 : Math.PI);
      const galPh = ph + (leg.front ? 0 : Math.PI * 0.6) + (leg.side > 0 ? 0.25 : 0);
      const swing = Math.sin(walkPh) * 0.42 * walk + Math.sin(galPh) * 0.75 * gallop;
      leg.hip.rotateX(swing);
      // the lower leg folds as it comes forward
      const lift = Math.max(0, Math.cos(walkPh)) * 0.6 * walk + Math.max(0, Math.cos(galPh)) * 1.1 * gallop;
      leg.knee.rotateX(leg.front ? -lift : lift);
    }
    for (const fl of B.flippers) {
      // turtle: flippers sweep the sand in pairs
      fl.bone.rotateZ(fl.side * Math.sin(ph * 0.7 + (fl.front ? 0 : Math.PI)) * 0.35 * walk);
      fl.bone.rotateY(fl.side * Math.cos(ph * 0.7) * 0.3 * walk);
    }
    if (B.neck) B.neck.rotateX(graze * 0.75 + Math.sin(ph * (walk > 0.1 ? 1 : 0.15)) * 0.04 + walk * 0.05);
    if (B.tail) B.tail.rotateY(Math.sin(this.t * 1.7) * 0.25);
  }
}

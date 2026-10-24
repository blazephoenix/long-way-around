// Animals from unrigged low-poly models (Poly by Google, CC-BY 3.0; see THIRD-PARTY-NOTICES.md), baked
// to flat-coloured meshes by scripts/animal-assets.mjs. At load each mesh is bound to a skeleton made
// for it — a body, hip and knee per leg, a neck and a tail, placed from the model's own shape — with
// weights that blend across each joint, and a procedural rig drives walk, gallop, graze and idle.
// Birds get wing bones (shoulder and wrist) instead of legs, and fly, hover, hop and peck. The peacock
// is hand-built (peacock.ts) and rigged the same way. One skinned mesh (one draw call) per animal.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { personMat } from './peopleModels';
import tigerUrl from '../assets/animals/tiger.glb?url';
import elephantUrl from '../assets/animals/elephant.glb?url';
import macaqueUrl from '../assets/animals/macaque.glb?url';
import camelUrl from '../assets/animals/camel.glb?url';
import sambarUrl from '../assets/animals/sambar.glb?url';
import jackalUrl from '../assets/animals/jackal.glb?url';
import turtleUrl from '../assets/animals/turtle.glb?url';
import blackbuckUrl from '../assets/animals/blackbuck.glb?url';
import catUrl from '../assets/animals/cat.glb?url';
import crowUrl from '../assets/animals/crow.glb?url';
import doveUrl from '../assets/animals/dove.glb?url';
import owlUrl from '../assets/animals/owl.glb?url';
import heronUrl from '../assets/animals/heron.glb?url';
import gullUrl from '../assets/animals/gull.glb?url';
import parrotUrl from '../assets/animals/parrot.glb?url';
import kingfisherUrl from '../assets/animals/kingfisher.glb?url';
import hawkUrl from '../assets/animals/hawk.glb?url';
import { buildPeacock } from './peacock';

const URLS = {
  tiger: tigerUrl, elephant: elephantUrl, macaque: macaqueUrl, camel: camelUrl, sambar: sambarUrl, jackal: jackalUrl, turtle: turtleUrl, blackbuck: blackbuckUrl, cat: catUrl,
  crow: crowUrl, dove: doveUrl, owl: owlUrl, heron: heronUrl, gull: gullUrl, parrot: parrotUrl, kingfisher: kingfisherUrl, hawk: hawkUrl,
};
type StaticKey = keyof typeof URLS | 'peacock';

interface Mesh {
  /** non-indexed flat faces in file units, facing +z, feet on y = 0 */
  pos: Float32Array;
  /** linear colour per vertex */
  col: Float32Array;
  box: THREE.Box3;
  /** per vertex, 1 to bind to the tail bone whatever the shape says (the peacock's train) */
  tag?: Uint8Array;
}
const meshes = new Map<StaticKey, Mesh>();
let loading: Promise<void> | null = null;

export function loadStaticAnimals(fetchBytes: (url: string) => Promise<ArrayBuffer> = (u) => fetch(u).then((r) => r.arrayBuffer())): Promise<void> {
  if (!loading) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const pea = buildPeacock();
    meshes.set('peacock', { ...pea, box: new THREE.Box3().setFromArray(pea.pos) });
    loading = Promise.all((Object.keys(URLS) as (keyof typeof URLS)[]).map(async (k) => {
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
type Gait = 'quad' | 'crawl' | 'bird' | 'flyer' | 'hover' | 'perch';
const BIRD_GAITS: Gait[] = ['bird', 'flyer', 'hover', 'perch'];

interface Spec {
  src: StaticKey;
  /** standing height in metres, or the length nose to tail (turtle, birds in flight); native: the
   * model is built in metres */
  height?: number;
  length?: number;
  native?: boolean;
  /** -1 when the model's head points to -z */
  forward?: 1 | -1;
  /** where the legs meet the body, as a fraction of height */
  legTop: number;
  /** two legs (birds), told apart by side only */
  biped?: boolean;
  /** stands its ground (a macaque on a wall) until scared, then runs */
  stays?: boolean;
  /** the neck's root along the body (-0.5 tail end .. 0.5 head end) and its height fraction */
  neck?: [number, number];
  /** upright birds (owl): the head is everything above the neck's height, not in front of it */
  neckUp?: boolean;
  /** birds: wings are the parts beyond this fraction of the half-width, the wrist beyond `tip`;
   * hz is the wingbeat; hop scales the bob of a walk (a hop for crows, a stride for a heron) */
  wings?: { from: number; tip?: number; hz: number; rest?: number };
  hop?: number;
  /** the train shivers now and then (peacock) */
  shiver?: boolean;
  /** stretch everything behind this length fraction backwards by k (a parakeet's long tail) */
  stretchTail?: [number, number];
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
  // rhesus macaque: the baboon turned brown-grey (the pink face and rump are right already)
  monkey: { src: 'macaque', height: 0.5, legTop: 0.4, neck: [0.3, 0.6], tail: -0.3, recolor: (h) => hsl(h, (c) => { if (c.s < 0.15) { c.h = 0.09; c.s = 0.28; c.l *= 1.1; } }), gait: 'quad', stays: true, speed: 0.6 },
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
  // ---- birds
  // house crow: black with the grey nape and breast collar
  crow: { src: 'crow', height: 0.3, legTop: 0.26, biped: true, neck: [0.2, 0.62], tail: -0.22, recolor: (h, p, b) => { const f = frac(p, b); return f.z > 0.55 && f.z < 0.78 && f.y > 0.5 && f.y < 0.85 ? 0x50535a : h; }, gait: 'bird', speed: 0.35, grazes: true },
  // rock pigeon: the white dove turned blue-grey, with a dark head, a green and purple neck, two black
  // wing bars and a dark tail band
  pigeon: { src: 'dove', height: 0.25, legTop: 0.16, biped: true, neck: [0.22, 0.6], tail: -0.25, recolor: pigeon, gait: 'bird', speed: 0.3, grazes: true },
  owl: { src: 'owl', height: 0.38, legTop: 0, neck: [0, 0.72], neckUp: true, gait: 'perch', speed: 1.8 },
  // grey heron: the blue heron greyed, with a pale neck and head
  heron: { src: 'heron', height: 0.95, legTop: 0.38, biped: true, neck: [0.12, 0.55], tail: -0.4, hop: 0.015, recolor: (h, p, b) => hsl(h, (c) => { if (c.s < 0.45 && c.l > 0.15) { const f = frac(p, b); c.s = 0.05; c.h = 0.55; c.l = f.z > 0.55 && f.y > 0.55 ? 0.82 : 0.6; } }), gait: 'bird', speed: 0.25, grazes: true },
  // brown-headed gull on the coast: pale grey mantle, black wingtips
  gull: { src: 'gull', length: 0.45, legTop: 0, wings: { from: 0.14, tip: 0.6, hz: 2.8, rest: -0.3 }, recolor: (h, p, b) => hsl(h, (c) => { if (c.s < 0.2 && c.l < 0.45) { const f = frac(p, b); c.l = Math.abs(f.x - 0.5) > 0.42 ? 0.06 : 0.7; c.h = 0.6; c.s = 0.06; } }), gait: 'flyer', speed: 7 },
  // rose-ringed parakeet: the African grey turned green, red beak, long tail
  parrot: { src: 'parrot', length: 0.42, legTop: 0, wings: { from: 0.12, tip: 0.55, hz: 5 }, stretchTail: [0.3, 2], recolor: parakeet, gait: 'flyer', speed: 7 },
  // white-throated kingfisher: blue wings, chestnut body, white throat, red bill
  kingfisher: { src: 'kingfisher', length: 0.28, legTop: 0, wings: { from: 0.12, tip: 0.55, hz: 9 }, recolor: (h, p, b) => hsl(h, (c) => { const f = frac(p, b); if (f.z > 0.94 && c.l > 0.55) { c.h = 0.01; c.s = 0.8; c.l = 0.45; } else if (c.h < 0.08 && c.s > 0.3) { c.h = 0.035; c.s = 0.7; c.l *= 0.62; } }), gait: 'hover', speed: 1 },
  // the hawk of the dry country is a kestrel
  hawk: { src: 'hawk', length: 0.55, legTop: 0, wings: { from: 0.12, tip: 0.55, hz: 3 }, gait: 'flyer', speed: 7 },
  peacock: { src: 'peacock', native: true, legTop: 0.26, biped: true, neck: [0.3, 0.55], tail: -0.5, hop: 0.012, shiver: true, gait: 'bird', speed: 0.3 },
};

/** a point's place in the model's box, each axis 0..1 (z: 0 tail, 1 head) */
function frac(p: THREE.Vector3, b: THREE.Box3) {
  return new THREE.Vector3((p.x - b.min.x) / (b.max.x - b.min.x), (p.y - b.min.y) / (b.max.y - b.min.y), (p.z - b.min.z) / (b.max.z - b.min.z));
}

function pigeon(hex: number, p: THREE.Vector3, b: THREE.Box3): number {
  new THREE.Color(hex).getHSL(_hsl, THREE.SRGBColorSpace);
  if (_hsl.l < 0.6 || _hsl.s > 0.5) return hex; // eye, bill, feet
  const f = frac(p, b), side = Math.abs(f.x - 0.5) > 0.3;
  if (f.z > 0.8 && f.y > 0.72) return 0x5a616d; // head
  if (f.z > 0.64 && f.y > 0.5) return f.y > 0.7 ? 0x4c7a68 : 0x6c5a86; // neck sheen
  if (f.z < 0.14) return 0x3c414a; // tail band
  if (side && ((f.z > 0.34 && f.z < 0.39) || (f.z > 0.43 && f.z < 0.48))) return 0x24262a; // wing bars
  return side ? 0x9ea7b5 : 0x8c95a5;
}

function parakeet(hex: number, p: THREE.Vector3, b: THREE.Box3): number {
  new THREE.Color(hex).getHSL(_hsl, THREE.SRGBColorSpace);
  const f = frac(p, b);
  if (_hsl.l < 0.12 && f.z > 0.88) return 0xc8202a; // hooked red bill
  if (_hsl.s > 0.4 && (_hsl.h < 0.05 || _hsl.h > 0.95)) return 0x3a9a8a; // tail: blue-green
  if (_hsl.l > 0.8) return 0x9ae070; // face
  if (_hsl.l > 0.12) return f.z > 0.78 ? 0x86d45c : Math.abs(f.x - 0.5) > 0.2 ? 0x4fa83a : 0x6cc04a;
  return hex;
}

export const STATIC_SPECIES = Object.keys(SPECS);
export const hasStaticAnimal = (key: string) => key in SPECS && meshes.has(SPECS[key].src);

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
  wings: { root: THREE.Bone; tip?: THREE.Bone; side: number }[];
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
  const box0 = box.clone();
  for (let i = 0; i < n; i++) {
    p.fromArray(pos, i * 3);
    if (sp.stretchTail) {
      const zc = box0.min.z + sp.stretchTail[0] * L;
      if (p.z < zc) p.z = zc - (zc - p.z) * sp.stretchTail[1];
    }
    if (sp.shrinkAbove && p.y > sp.shrinkAbove[0] * H) {
      // pull antlers in towards the top of the head
      const y0 = sp.shrinkAbove[0] * H, k = sp.shrinkAbove[1];
      const hz = box.max.z * 0.62; // roughly over the head
      p.y = y0 + (p.y - y0) * k; p.x *= k; p.z = hz + (p.z - hz) * k;
    }
    c.setRGB(src.col[i * 3], src.col[i * 3 + 1], src.col[i * 3 + 2]);
    if (sp.recolor) c.setHex(sp.recolor(c.getHex(), p, box0));
    p.toArray(pos, i * 3);
    c.toArray(col, i * 3);
  }
  if (sp.stretchTail) { box.setFromArray(pos); }
  const Lz = box.max.z - box.min.z;

  // ---- skeleton, in file units (the body group scales it to metres)
  const legY = sp.legTop * H;
  const body = new THREE.Bone();
  body.name = 'body';
  body.position.set(0, legY || H * 0.4, 0);
  const bones: Bones = { body, legs: [], flippers: [], wings: [] };
  const all: THREE.Bone[] = [body];
  const at = (b: THREE.Bone, parent: THREE.Bone, x: number, y: number, z: number) => {
    parent.add(b);
    parent.updateMatrixWorld(true);
    b.position.copy(parent.worldToLocal(new THREE.Vector3(x, y, z)));
    all.push(b);
    return b;
  };
  const zAt = (u: number) => box.min.z + (u + 0.5) * Lz;
  const neckZ = sp.neck ? zAt(sp.neck[0]) : Infinity;
  // legs: the low vertices behind the neck (not a hanging trunk or a lowered head) fall into four
  // clusters by side and by front/back of their middle
  const low: number[] = [];
  if (sp.legTop > 0) for (let i = 0; i < n; i++) if (pos[i * 3 + 1] < legY * 0.6 && pos[i * 3 + 2] < neckZ && !src.tag?.[i]) low.push(i);
  const zMid = low.reduce((s, i) => s + pos[i * 3 + 2], 0) / Math.max(1, low.length);
  // birds stand on two legs, one each side
  const legOf = (x: number, z: number) => (sp.biped || z > zMid ? 0 : 2) + (x > 0 ? 0 : 1);
  const legZ: number[] = [];
  if (low.length) {
    const sums = (sp.biped ? [0, 1] : [0, 1, 2, 3]).map(() => ({ x: 0, z: 0, n: 0 }));
    for (const i of low) { const s = sums[legOf(pos[i * 3], pos[i * 3 + 2])]; s.x += pos[i * 3]; s.z += pos[i * 3 + 2]; s.n++; }
    sums.forEach((s, k) => {
      const x = s.n ? s.x / s.n : (k % 2 ? -W / 4 : W / 4), z = s.n ? s.z / s.n : (k < 2 ? L / 4 : -L / 4);
      legZ.push(z);
      const hip = at(new THREE.Bone(), body, x, legY, z);
      const knee = at(new THREE.Bone(), hip, x, legY * 0.48, z);
      bones.legs.push({ hip, knee, front: k < 2, side: k % 2 ? -1 : 1 });
    });
  }
  if (sp.neck && sp.neckUp) {
    // an upright bird's head turns about its own middle
    let x = 0, z = 0, k = 0;
    for (let i = 0; i < n; i++) if (pos[i * 3 + 1] > sp.neck[1] * H) { x += pos[i * 3]; z += pos[i * 3 + 2]; k++; }
    bones.neck = at(new THREE.Bone(), body, k ? x / k : 0, sp.neck[1] * H, k ? z / k : 0);
  } else if (sp.neck) bones.neck = at(new THREE.Bone(), body, 0, sp.neck[1] * H, neckZ);
  if (sp.tail !== undefined) bones.tail = at(new THREE.Bone(), body, 0, legY ? legY * 1.1 : H * 0.45, zAt(sp.tail));
  if (sp.flippers) {
    for (const [front, side] of [[true, 1], [true, -1], [false, 1], [false, -1]] as const) {
      bones.flippers.push({ bone: at(new THREE.Bone(), body, side * W * 0.5 * sp.flippers, H * 0.3, front ? L * 0.18 : -L * 0.25), front, side });
    }
  }
  // wings: a shoulder where the wing leaves the body and a wrist further out, each at the middle of
  // the vertices beyond it
  const hw = W / 2;
  if (sp.wings) {
    for (const side of [1, -1]) {
      const mid = (from: number) => {
        let y = 0, z = 0, k = 0;
        for (let i = 0; i < n; i++) if (pos[i * 3] * side > from * hw) { y += pos[i * 3 + 1]; z += pos[i * 3 + 2]; k++; }
        return k ? [y / k, z / k] : [H * 0.6, 0];
      };
      const [ry, rz] = mid(sp.wings.from);
      const root = at(new THREE.Bone(), body, side * sp.wings.from * hw, ry, rz);
      let tip: THREE.Bone | undefined;
      if (sp.wings.tip) { const [ty, tz] = mid(sp.wings.tip); tip = at(new THREE.Bone(), root, side * sp.wings.tip * hw, ty, tz); }
      bones.wings.push({ root, tip, side });
    }
  }
  const index = new Map(all.map((b, i) => [b, i]));

  // ---- weights: each vertex blends between the body and the part it belongs to, across a band
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const band = H * 0.08;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const w: [number, number][] = [];
    const ax = Math.abs(x);
    if (src.tag?.[i] && bones.tail) {
      w.push([index.get(bones.tail)!, 1]);
    } else if (sp.wings && ax > sp.wings.from * hw * 0.85) {
      const wing = bones.wings[x > 0 ? 0 : 1];
      const ww = smooth(sp.wings.from * hw * 0.85, sp.wings.from * hw * 1.15, ax);
      const wt = wing.tip ? smooth(sp.wings.tip! * hw * 0.9, sp.wings.tip! * hw * 1.1, ax) : 0;
      w.push([index.get(wing.root)!, ww * (1 - wt)]);
      if (wing.tip) w.push([index.get(wing.tip)!, ww * wt]);
    } else if (bones.neck && sp.neckUp && y > sp.neck![1] * H - band) {
      w.push([index.get(bones.neck)!, smooth(sp.neck![1] * H - band, sp.neck![1] * H + band, y)]);
    } else if (bones.neck && !sp.neckUp && z > neckZ - L * 0.06) {
      w.push([index.get(bones.neck)!, smooth(neckZ - L * 0.06, neckZ + L * 0.06, z)]);
    } else if (bones.legs.length && y < legY + band && (!sp.biped || Math.abs(z - legZ[legOf(x, z)]) < L * 0.12)) {
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
  holder.scale.setScalar(sp.native ? 1 : sp.length ? sp.length / Lz : (sp.height ?? 1) / H);
  holder.rotation.y = Math.PI;
  holder.add(body, mesh);
  holder.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(all);
  mesh.bind(skeleton);
  // bounds for culling, in the mesh's own units: a sphere about the middle holding every vertex,
  // with room for wings raised or a body swung by the rig
  const mid = new THREE.Vector3(0, H / 2, (box.min.z + box.max.z) / 2);
  let r2 = 0;
  for (let i = 0; i < n; i++) r2 = Math.max(r2, p.fromArray(pos, i * 3).distanceToSquared(mid));
  mesh.boundingSphere = new THREE.Sphere(mid, Math.sqrt(r2) * 1.25);
  mesh.boundingBox = new THREE.Box3().setFromCenterAndSize(mid, new THREE.Vector3().setScalar(mesh.boundingSphere.radius * 2));

  const rig = new ProcRig(bones, sp, legY / Math.max(H, 1e-6));
  rig.update(0);
  root.userData.rig = rig;
  // what animals.ts moves by: a perched owl sits until scared, then flies
  root.userData.gait = sp.gait === 'crawl' ? 'quad' : sp.gait === 'perch' || sp.stays ? 'sitter' : sp.gait;
  // only birds modelled with open wings fly; the perched ones (and the peacock) walk off when
  // scared, and the owl just watches
  root.userData.flies = !!sp.wings;
  root.userData.flees = sp.gait !== 'perch';
  root.userData.speed = sp.speed;
  root.userData.grazes = !!sp.grazes;
  root.userData.limbs = [];
  return root;
}

/**
 * Procedural motion on the generated bones: walk (diagonal pairs), gallop (front pair, then back
 * pair), graze (neck down) and idle (breathing, a slow head and tail), easing between them. Birds:
 * fly (wingbeats broken by glides), hover, take off (fast beats), hop, peck and look about.
 */
class ProcRig implements AnimalRig {
  extra: [string, number][] = [];
  private t = Math.random() * 10;
  private want = { walk: 0, gallop: 0, graze: 0, fly: 0, flap: 0, hover: 0, glide: 0 };
  private now = { ...this.want };
  private rate = 1;
  private hurry = 1;
  /** wingbeat phase, accumulated so a change of rate never jumps */
  private beat = 0;
  private gait: Gait;
  private gallops: boolean;
  private rest: { b: THREE.Bone; q: THREE.Quaternion; p: THREE.Vector3 }[];

  constructor(private bones: Bones, private sp: Spec, legFrac: number) {
    this.gait = sp.gait;
    this.gallops = !sp.noGallop;
    const list = [bones.body, ...bones.legs.flatMap((l) => [l.hip, l.knee]), ...(bones.neck ? [bones.neck] : []), ...(bones.tail ? [bones.tail] : []), ...bones.flippers.map((f) => f.bone),
      ...bones.wings.flatMap((w) => (w.tip ? [w.root, w.tip] : [w.root]))];
    this.rest = list.map((b) => ({ b, q: b.quaternion.clone(), p: b.position.clone() }));
    // longer legs step more slowly
    this.rate = 1.6 / Math.max(0.35, legFrac * 2);
  }

  /** 'Walk', 'Gallop', 'Eating', 'Fly', 'Hover' or anything else for idle; the fade is the fixed easing in update().
   * A bird without wing bones answers 'Gallop' with a hurried walk. */
  play(name: string) {
    if (BIRD_GAITS.includes(this.gait)) {
      const wings = this.bones.wings.length > 0;
      this.want = { walk: name === 'Walk' || (name === 'Gallop' && !wings) ? 1 : 0, gallop: 0, graze: name === 'Eating' ? 1 : 0, fly: name === 'Fly' ? 1 : 0, flap: name === 'Gallop' && wings ? 1 : 0, hover: name === 'Hover' ? 1 : 0, glide: this.want.glide };
      return;
    }
    const run = name === 'Gallop' && this.gallops;
    this.want = { ...this.want, walk: name === 'Walk' || name === 'Swim' || (name === 'Gallop' && !run) ? 1 : 0, gallop: run ? 1 : 0, graze: name === 'Eating' ? 1 : 0 };
    this.hurry = name === 'Gallop' && !run ? 1.8 : 1;
  }

  update(dt: number) {
    const k = Math.min(1, dt * 4);
    for (const key of Object.keys(this.now) as (keyof typeof this.now)[]) this.now[key] += (this.want[key] - this.now[key]) * k;
    for (const r of this.rest) { r.b.quaternion.copy(r.q); r.b.position.copy(r.p); }
    if (BIRD_GAITS.includes(this.gait)) { this.bird(dt); return; }
    const { walk, gallop, graze } = this.now;
    this.t += dt * this.rate * (1 + gallop * 1.2) * this.hurry;
    const ph = this.t * Math.PI * 2;
    const B = this.bones;
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

  private bird(dt: number) {
    const B = this.bones, sp = this.sp, t = (this.t += dt);
    const hz = sp.wings?.hz ?? 4;
    // flying birds glide for a few seconds now and then
    this.want.glide = Math.sin(t * 0.45) > 0.35 ? 1 : 0;
    const { walk, graze, fly, flap, hover, glide } = this.now;
    // wings: beat about the shoulder, the wrist trailing
    const amp = fly * (1 - glide) * 0.6 + flap * 1.0 + hover * 0.85;
    this.beat += dt * hz * (1 + flap * 0.4 + hover * 0.6) * Math.PI * 2;
    for (const w of B.wings) {
      w.root.rotateZ(w.side * (Math.sin(this.beat) * amp + fly * glide * 0.06 + (sp.wings?.rest ?? 0) * (fly + hover)));
      w.tip?.rotateZ(w.side * Math.sin(this.beat - 0.8) * amp * 0.55);
    }
    // the body rises a touch on each downstroke; a hovering bird hangs head-up
    B.body.position.y += Math.cos(this.beat) * 0.02 * amp * B.body.position.y;
    B.body.rotateX(-0.5 * hover);
    // walking: the legs step in turn, the body rising over each step
    const step = t * 3.2 * Math.PI;
    B.body.position.y += Math.abs(Math.sin(step)) * (sp.hop ?? 0.03) * walk * B.body.position.y;
    for (const leg of B.legs) {
      const ph = step + (leg.side > 0 ? 0 : Math.PI);
      leg.hip.rotateX(Math.sin(ph) * 0.4 * walk);
      // the foot lifts as it swings forward (a bird's ankle bends the other way to a knee)
      leg.knee.rotateX(Math.max(0, Math.cos(ph)) * 0.7 * walk);
    }
    if (B.neck) {
      if (sp.neckUp) {
        // an owl swivels its head, holding each look for a while
        const look = Math.sin(t * 0.35) + 0.5 * Math.sin(t * 0.9);
        B.neck.rotateY(THREE.MathUtils.clamp(look, -1, 1) * 1.3 * (1 - flap));
      } else {
        // pecking: quick jabs; walking: the head bobs; idle: a look about
        const peck = Math.pow(Math.max(0, Math.sin(t * 2.6)), 6);
        B.neck.rotateX(graze * (0.2 + peck * 0.8) + Math.sin(step * 2) * 0.1 * walk);
        B.neck.rotateY(Math.sin(t * 0.6) * 0.4 * (1 - graze) * (1 - walk) * (1 - amp));
      }
    }
    if (B.tail) {
      if (sp.shiver) {
        // a peacock rattles its train in bursts
        const burst = THREE.MathUtils.smoothstep(Math.sin(t * 0.5), 0.5, 0.8);
        B.tail.rotateX(Math.sin(t * 48) * 0.012 * burst - 0.04 * walk);
      } else B.tail.rotateX(Math.sin(t * 1.3) * 0.06 * (1 - amp) - hover * 0.4);
    }
  }
}

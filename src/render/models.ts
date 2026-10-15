// Procedural model builder: compose primitives with colours, merge into one geometry
// with vertex colours, so each model is a single draw call.
import * as THREE from 'three';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

export interface Xf {
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number] | number;
}

interface Tpl {
  pos: Float32Array;
  nrm: Float32Array;
}
const tplCache = new Map<string, Tpl>();
function toTpl(geo: THREE.BufferGeometry, flat: boolean): Tpl {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (flat || !g.attributes.normal) g.computeVertexNormals();
  const t = { pos: (g.attributes.position.array as Float32Array).slice(), nrm: (g.attributes.normal.array as Float32Array).slice() };
  if (g !== geo) g.dispose();
  geo.dispose();
  return t;
}
function tpl(key: string, make: () => THREE.BufferGeometry): Tpl {
  let t = tplCache.get(key);
  if (!t) tplCache.set(key, (t = toTpl(make(), true)));
  return t;
}

/** growable Float32Array (avoids number[] churn and GC pauses) */
class FBuf {
  a: Float32Array;
  n = 0;
  constructor(cap = 4096) {
    this.a = new Float32Array(cap);
  }
  reserve(k: number) {
    if (this.n + k <= this.a.length) return;
    let c = this.a.length * 2;
    while (c < this.n + k) c *= 2;
    const b = new Float32Array(c);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  get view() {
    return this.a.subarray(0, this.n);
  }
}

const tmpN = new THREE.Matrix3();
const tmpM2 = new THREE.Matrix4();
const tmpC = new THREE.Color();

/**
 * Appends transformed primitives straight into flat arrays (no per-part geometries), using
 * cached unit templates for boxes, cylinders, cones and spheres. One build() = one draw call.
 */
export class ModelBuilder {
  private P = new FBuf();
  private N = new FBuf();
  private C = new FBuf();
  private T = new FBuf(1024);
  private tintOn = 0;
  private base: THREE.Matrix4 | null = null;
  /** pre-multiply every following part by this transform (null clears) */
  setBase(xf: Xf | null): this {
    if (!xf) { this.base = null; return this; }
    this.base = this.matrix(xf).clone();
    return this;
  }
  /** parts added after tint(true) are multiplied by per-instance colour */
  tint(on: boolean): this {
    this.tintOn = on ? 1 : 0;
    return this;
  }

  private matrix(xf: Xf, scale?: [number, number, number]): THREE.Matrix4 {
    tmpV.set(...(xf.p ?? [0, 0, 0]));
    tmpE.set(...(xf.r ?? [0, 0, 0]));
    tmpQ.setFromEuler(tmpE);
    const s = xf.s ?? 1;
    if (typeof s === 'number') tmpS.set(s, s, s);
    else tmpS.set(...s);
    tmpM.compose(tmpV, tmpQ, tmpS);
    if (scale) tmpM.multiply(tmpM2.makeScale(scale[0], scale[1], scale[2]));
    return tmpM;
  }

  private push(t: Tpl, m: THREE.Matrix4, color: number | THREE.Color) {
    if (this.base) m = tmpM2.multiplyMatrices(this.base, m);
    const e = m.elements;
    tmpN.getNormalMatrix(m);
    const n = tmpN.elements;
    const c = color instanceof THREE.Color ? color : tmpC.setHex(color);
    const { pos, nrm } = t;
    const k = pos.length;
    this.P.reserve(k); this.N.reserve(k); this.C.reserve(k); this.T.reserve(k / 3);
    const P = this.P.a, N = this.N.a, C = this.C.a, T = this.T.a;
    let o = this.P.n, ot = this.T.n;
    const cr = c.r, cg = c.g, cb = c.b, tint = this.tintOn;
    for (let i = 0; i < k; i += 3, o += 3, ot++) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      P[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = nrm[i], b = nrm[i + 1], d = nrm[i + 2];
      let nx = n[0] * a + n[3] * b + n[6] * d, ny = n[1] * a + n[4] * b + n[7] * d, nz = n[2] * a + n[5] * b + n[8] * d;
      const l = Math.hypot(nx, ny, nz) || 1;
      N[o] = nx / l; N[o + 1] = ny / l; N[o + 2] = nz / l;
      C[o] = cr; C[o + 1] = cg; C[o + 2] = cb;
      T[ot] = tint;
    }
    this.P.n = this.N.n = this.C.n = o;
    this.T.n = ot;
  }

  add(geo: THREE.BufferGeometry, color: number | THREE.Color, xf: Xf = {}, flat = true): this {
    this.push(toTpl(geo, flat), this.matrix(xf), color);
    return this;
  }

  box(w: number, h: number, d: number, color: number, xf: Xf = {}) {
    this.push(tpl('box', () => new THREE.BoxGeometry(1, 1, 1)), this.matrix(xf, [w, h, d]), color);
    return this;
  }
  cyl(rt: number, rb: number, h: number, seg: number, color: number, xf: Xf = {}, _open = false) {
    if (rb <= 1e-6) return this.cone(rt, h, seg, color, { ...xf, r: [(xf.r?.[0] ?? 0) + Math.PI, xf.r?.[1] ?? 0, xf.r?.[2] ?? 0] });
    const ratio = Math.round((rt / rb) * 100) / 100;
    this.push(tpl(`cyl:${seg}:${ratio}`, () => new THREE.CylinderGeometry(ratio, 1, 1, seg)), this.matrix(xf, [rb, h, rb]), color);
    return this;
  }
  cone(r: number, h: number, seg: number, color: number, xf: Xf = {}) {
    this.push(tpl(`cone:${seg}`, () => new THREE.ConeGeometry(1, 1, seg)), this.matrix(xf, [r, h, r]), color);
    return this;
  }
  sphere(r: number, ws: number, hs: number, color: number, xf: Xf = {}) {
    this.push(tpl(`sph:${ws}:${hs}`, () => new THREE.SphereGeometry(1, ws, hs)), this.matrix(xf, [r, r, r]), color);
    return this;
  }
  ico(r: number, detail: number, color: number, xf: Xf = {}) {
    this.push(tpl(`ico:${detail}`, () => new THREE.IcosahedronGeometry(1, detail)), this.matrix(xf, [r, r, r]), color);
    return this;
  }
  dodeca(r: number, color: number, xf: Xf = {}) {
    this.push(tpl('dod', () => new THREE.DodecahedronGeometry(1, 0)), this.matrix(xf, [r, r, r]), color);
    return this;
  }
  torus(r: number, tube: number, rs: number, ts: number, color: number, xf: Xf = {}, arc = Math.PI * 2) {
    return this.add(new THREE.TorusGeometry(r, tube, rs, ts, arc), color, xf);
  }
  plane(w: number, h: number, color: number, xf: Xf = {}) {
    this.push(tpl('plane', () => new THREE.PlaneGeometry(1, 1)), this.matrix(xf, [w, h, 1]), color);
    return this;
  }
  /** extruded 2D shape (xy plane, extruded along z) */
  shape(pts: [number, number][], depth: number, color: number, xf: Xf = {}) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    return this.add(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }), color, xf);
  }
  /** append another builder's parts with a transform */
  merge(other: ModelBuilder, xf: Xf = {}) {
    const m = this.matrix(xf);
    const e = m.elements;
    tmpN.getNormalMatrix(m);
    const n = tmpN.elements;
    const P = other.P.view, N = other.N.view;
    const k = P.length;
    this.P.reserve(k); this.N.reserve(k); this.C.reserve(k); this.T.reserve(k / 3);
    let o = this.P.n;
    for (let i = 0; i < k; i += 3, o += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      this.P.a[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      this.P.a[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      this.P.a[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = N[i], b = N[i + 1], d = N[i + 2];
      this.N.a[o] = n[0] * a + n[3] * b + n[6] * d;
      this.N.a[o + 1] = n[1] * a + n[4] * b + n[7] * d;
      this.N.a[o + 2] = n[2] * a + n[5] * b + n[8] * d;
    }
    this.C.a.set(other.C.view, this.C.n);
    this.T.a.set(other.T.view, this.T.n);
    this.P.n = this.N.n = this.C.n = o;
    this.T.n += other.T.n;
    return this;
  }

  get empty() {
    return this.P.n === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    if (this.P.n === 0) {
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
      g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(3), 1));
      return g;
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.P.view.slice(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.view.slice(), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.C.view.slice(), 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(this.T.view.slice(), 1));
    this.P.n = this.N.n = this.C.n = this.T.n = 0;
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Raw triangle soup helper for custom shapes (roads, water strips). */
export class Soup {
  pos: number[] = [];
  col: number[] = [];
  tri(a: number[], b: number[], c: number[], color: THREE.Color) {
    const p = this.pos;
    p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const r = color.r, g = color.g, bl = color.b;
    this.col.push(r, g, bl, r, g, bl, r, g, bl);
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: THREE.Color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export function hexColor(h: number): THREE.Color {
  return new THREE.Color(h);
}

/**
 * Free GPU buffers for an object tree that is leaving the scene. Shared materials are left alone;
 * a material flagged with userData.own (made for this one object) is disposed with its texture.
 */
export function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      if (!mat.userData?.own) continue;
      (mat as THREE.MeshBasicMaterial).map?.dispose();
      mat.dispose();
    }
  });
}

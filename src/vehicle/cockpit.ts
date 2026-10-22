// The player's car: exterior model (seen on foot) and a right-hand-drive cockpit
// (traffic keeps left). The dashboard is the HUD: speedometer, fuel gauge, clock, radio.
import * as THREE from 'three';
import { ModelBuilder } from '../render/models';
import { toon, matVC } from '../render/toon';

export const EYE = new THREE.Vector3(0.36, 0.74, 0.16);

export interface DashState {
  kmh: number;
  fuel: number;
  hour: number;
  station: string;
  freq: string;
  lowFuel: boolean;
  reserve: boolean;
  cruise: boolean;
  headlights: boolean;
  units: 'km' | 'mi';
  odometerKm: number;
  night: number;
  film: number;
  money: string;
}

function canvasTex(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, ctx: c.getContext('2d')!, t };
}

// Cabin outline shared by the body, the glass and the cockpit trim, so the pillars seen from the
// driver's seat sit where the glass edges are outside. Car-local: y up, -z forward, +x driver side.
const BELT = 0.44; // window line
const ROOF = 1.04; // roof top
const WS_BASE = -0.98, WS_TOP = -0.45; // windshield z at the belt and at the roof
const RW_TOP = 1.05, RW_BASE = 1.5; // rear window z at the roof and at the belt
const HB = 0.86, HR = 0.74; // greenhouse half-width at the belt and at the roof (tumblehome)
const B_PIL = 0.42; // B-pillar, just behind the front seat backs
const WHEEL_Z = 1.3, WHEEL_Y = -0.22, ARCH_R = 0.41;
/** point on the greenhouse side (side = ±1) at height fraction s (0 belt, 1 roof) */
const gh = (side: number, s: number, z: number): P3 => [side * (HB + (HR - HB) * s), BELT + s * (ROOF - BELT), z];
const wsZ = (s: number) => WS_BASE + (WS_TOP - WS_BASE) * s;
const rwZ = (s: number) => RW_BASE + (RW_TOP - RW_BASE) * s;

type P3 = [number, number, number];
type P2 = [number, number];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** flat convex polygon whose front face points towards `toward` */
function face(m: ModelBuilder, pts: P3[], color: number, toward: P3) {
  const [a, b, c] = pts;
  const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
  const o = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
  const ordered = n.dot(_v.set(toward[0] - o[0], toward[1] - o[1], toward[2] - o[2])) < 0 ? [...pts].reverse() : pts;
  const pos: number[] = [];
  for (let i = 1; i + 1 < ordered.length; i++) pos.push(...ordered[0], ...ordered[i], ...ordered[i + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  m.add(g, color);
}

/** box running from a to b along its local y; w and d are its cross-section */
function beam(m: ModelBuilder, a: P3, b: P3, w: number, d: number, color: number) {
  _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _v.length();
  _e.setFromQuaternion(_q.setFromUnitVectors(UP, _v.normalize()));
  m.box(w, len, d, color, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [_e.x, _e.y, _e.z] });
}

/** side profile given as (z, y) points, extruded across x and centred on cx */
function profile(m: ModelBuilder, pts: P2[], width: number, color: number, cx = 0, bevel = 0) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const depth = width - 2 * bevel;
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  m.add(geo, color, { p: [cx + depth / 2, 0, 0], r: [0, -Math.PI / 2, 0] });
}

/** wheel-arch cut-out along the sill, front to back, over a wheel at zc */
function arch(zc: number, sill: number): P2[] {
  const a0 = Math.asin((sill - WHEEL_Y) / ARCH_R);
  const pts: P2[] = [];
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI - a0 + (2 * a0 - Math.PI) * (k / 10);
    pts.push([zc + Math.cos(a) * ARCH_R, WHEEL_Y + Math.sin(a) * ARCH_R]);
  }
  return pts;
}

// hood and boot lines, nose to windshield and rear window to tail
const HOOD: P2[] = [[WS_BASE, BELT], [-1.7, 0.425], [-2.0, 0.37], [-2.1, 0.25]];
const BOOT: P2[] = [[2.1, 0.27], [2.03, 0.39], [1.78, 0.43], [RW_BASE, BELT]];
const SILL = -0.27;

const C = {
  dash: 0x4a423a, trim: 0x6a6157, liner: 0xd2c8b4, carpet: 0x3b3631, door: 0x7a6e60,
  black: 0x2a2622, chrome: 0xbfbab0, wood: 0x7a5232, glass: 0x2c3e50,
};

class Pendulum {
  angleX = 0;
  angleZ = 0;
  vx = 0;
  vz = 0;
  constructor(public group: THREE.Group, public length: number) {}
  update(dt: number, accFwd: number, accSide: number) {
    const g = 9.81 / this.length;
    this.vx += (-g * Math.sin(this.angleX) - accFwd * 0.9 / this.length) * dt;
    this.vz += (-g * Math.sin(this.angleZ) + accSide * 0.9 / this.length) * dt;
    this.vx *= Math.exp(-1.1 * dt);
    this.vz *= Math.exp(-1.1 * dt);
    this.angleX += this.vx * dt;
    this.angleZ += this.vz * dt;
    this.angleX = THREE.MathUtils.clamp(this.angleX, -1.2, 1.2);
    this.angleZ = THREE.MathUtils.clamp(this.angleZ, -1.2, 1.2);
    this.group.rotation.set(this.angleX, 0, this.angleZ);
  }
}

export class PlayerCar {
  readonly root = new THREE.Group(); // positioned/rotated by physics
  readonly exterior = new THREE.Group();
  readonly cockpit = new THREE.Group();
  readonly hood: THREE.Mesh;
  readonly paintMat = toon({ vertexColors: true, color: 0x2f6f8f });
  readonly paint2Mat = toon({ vertexColors: true, color: 0xf2efe6 });
  readonly seatMat = toon({ color: 0x5a4636 });
  readonly wheelCoverMat = toon({ color: 0x2a2a2a });
  readonly wheels: THREE.Mesh[] = [];
  readonly steering = new THREE.Group();
  readonly wipers: THREE.Group[] = [];
  readonly mirrorRT: THREE.WebGLRenderTarget;
  readonly mirrorCam: THREE.PerspectiveCamera;
  readonly mirrorPlane: THREE.Mesh;
  readonly headlights: THREE.SpotLight[] = [];
  readonly headGlow: THREE.MeshBasicMaterial;
  readonly tailGlow: THREE.MeshBasicMaterial;
  readonly dashTex;
  readonly radioTex;
  readonly hangPoint = new THREE.Group();
  readonly dashSlot = new THREE.Group();
  readonly bumperSlot = new THREE.Group();
  readonly rearSticker = new THREE.Group();
  hanging: Pendulum;
  private bobble: Pendulum;
  private dashTimer = 0;
  wiperPhase = 0;
  wiping = false;

  constructor() {
    this.root.add(this.exterior, this.cockpit);
    // ---------------- exterior
    // body: one side profile with wheel arches, extruded across the width
    const bodyPts: P2[] = [[-2.04, SILL], ...arch(-WHEEL_Z, SILL), ...arch(WHEEL_Z, SILL), [2.04, SILL], [2.1, -0.15], ...BOOT, ...HOOD, [-2.1, -0.15]];
    const paint = new ModelBuilder();
    profile(paint, bodyPts, 1.78, 0xffffff);
    const body = new THREE.Mesh(paint.build(), this.paintMat);
    body.castShadow = true;
    this.exterior.add(body);
    // greenhouse (second paint colour): a frustum from the belt line to the roof
    const roof = new ModelBuilder();
    const ghC: P3 = [0, 0.7, 0.3];
    const out = (pts: P3[]): P3 => {
      const o = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);
      return [o[0] * 2 - ghC[0], o[1] * 2 - ghC[1], o[2] * 2 - ghC[2]];
    };
    const ghFace = (pts: P3[], m = roof, color = 0xffffff) => face(m, pts, color, out(pts));
    for (const sd of [-1, 1]) ghFace([gh(sd, 0, WS_BASE), gh(sd, 1, WS_TOP), gh(sd, 1, RW_TOP), gh(sd, 0, RW_BASE)]);
    ghFace([gh(-1, 0, WS_BASE), gh(1, 0, WS_BASE), gh(1, 1, WS_TOP), gh(-1, 1, WS_TOP)]);
    ghFace([gh(-1, 0, RW_BASE), gh(1, 0, RW_BASE), gh(1, 1, RW_TOP), gh(-1, 1, RW_TOP)]);
    ghFace([gh(-1, 1, WS_TOP), gh(1, 1, WS_TOP), gh(1, 1, RW_TOP), gh(-1, 1, RW_TOP)]);
    const roofM = new THREE.Mesh(roof.build(), this.paint2Mat);
    roofM.castShadow = true;
    this.exterior.add(roofM);
    const trim = new ModelBuilder();
    // glass, set just proud of the greenhouse so the pillars and roof rails keep the roof colour
    const lift = (p: P3, n: P3): P3 => [p[0] + n[0] * 0.006, p[1] + n[1] * 0.006, p[2] + n[2] * 0.006];
    const ws = (u: number, s: number): P3 => lift([u * (HB + (HR - HB) * s), BELT + s * (ROOF - BELT), wsZ(s)], [0, 0.66, -0.75]);
    const rw = (u: number, s: number): P3 => lift([u * (HB + (HR - HB) * s), BELT + s * (ROOF - BELT), rwZ(s)], [0, 0.6, 0.8]);
    ghFace([ws(-0.9, 0.06), ws(0.9, 0.06), ws(0.88, 0.93), ws(-0.88, 0.93)], trim, C.glass);
    ghFace([rw(-0.86, 0.08), rw(0.86, 0.08), rw(0.84, 0.9), rw(-0.84, 0.9)], trim, C.glass);
    for (const sd of [-1, 1]) {
      const sg = (s: number, z: number) => lift(gh(sd, s, z), [sd, 0.15, 0]);
      const [s0, s1] = [0.07, 0.87];
      ghFace([sg(s0, wsZ(s0) + 0.1), sg(s1, wsZ(s1) + 0.08), sg(s1, B_PIL - 0.05), sg(s0, B_PIL - 0.05)], trim, C.glass);
      ghFace([sg(s0, B_PIL + 0.07), sg(s1, B_PIL + 0.07), sg(s1, rwZ(s1) - 0.18), sg(s0, rwZ(s0) - 0.24)], trim, C.glass);
      const x = sd * 0.9;
      // chrome belt strip, door shut lines and handles
      trim.box(0.012, 0.025, RW_BASE - WS_BASE, C.chrome, { p: [x, BELT - 0.01, (RW_BASE + WS_BASE) / 2] });
      for (const z of [WS_BASE + 0.08, B_PIL, RW_BASE - 0.12]) trim.box(0.008, BELT - SILL - 0.12, 0.012, 0x1e1e1e, { p: [x, (BELT + SILL) / 2 + 0.03, z] });
      for (const z of [B_PIL - 0.2, RW_BASE - 0.32]) trim.box(0.02, 0.03, 0.12, C.chrome, { p: [x + sd * 0.006, 0.3, z] });
      // door mirror on an arm at the base of the A-pillar
      trim.box(0.08, 0.03, 0.05, 0x222222, { p: [sd * 0.92, BELT + 0.05, WS_BASE + 0.12] });
      trim.box(0.16, 0.1, 0.07, 0x222222, { p: [sd * 1.0, BELT + 0.1, WS_BASE + 0.12], r: [0, sd * 0.15, 0] });
    }
    // bumpers, grille, number plates
    for (const z of [-2.18, 2.18]) {
      trim.box(1.86, 0.17, 0.14, 0x3a3a3a, { p: [0, -0.17, z] });
      trim.box(1.7, 0.03, 0.02, C.chrome, { p: [0, -0.12, z + Math.sign(z) * 0.07] });
    }
    trim.box(0.86, 0.2, 0.04, 0x1e1e1e, { p: [0, 0.1, -2.13] });
    for (let i = 0; i < 4; i++) trim.box(0.84, 0.014, 0.02, C.chrome, { p: [0, 0.03 + i * 0.05, -2.155] });
    trim.box(0.9, 0.025, 0.03, C.chrome, { p: [0, 0.215, -2.14] });
    trim.box(1.0, 0.16, 0.02, 0xf2f2f2, { p: [0, -0.02, 2.145] });
    trim.box(1.0, 0.16, 0.02, 0xf2f2f2, { p: [0, -0.17, -2.26] });
    const trimM = new THREE.Mesh(trim.build(), matVC);
    trimM.castShadow = true;
    this.exterior.add(trimM);
    this.headGlow = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    this.tailGlow = new THREE.MeshBasicMaterial({ color: 0x8a2a20 });
    for (const sx of [-0.64, 0.64]) {
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14), this.headGlow);
      hl.rotation.x = Math.PI / 2;
      hl.position.set(sx, 0.12, -2.13);
      this.exterior.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.04), this.tailGlow);
      tl.position.set(sx, 0.14, 2.13);
      this.exterior.add(tl);
    }
    const wheelGeo = new ModelBuilder()
      .cyl(0.33, 0.33, 0.24, 16, 0x222222, { r: [0, 0, Math.PI / 2] })
      .cyl(0.2, 0.2, 0.25, 12, 0xb8b8b8, { r: [0, 0, Math.PI / 2] })
      .cyl(0.08, 0.08, 0.27, 8, 0x8a8a8a, { r: [0, 0, Math.PI / 2] })
      .box(0.26, 0.05, 0.3, 0x8a8a8a, {})
      .build();
    for (const [x, z] of [[-0.82, -WHEEL_Z], [0.82, -WHEEL_Z], [-0.82, WHEEL_Z], [0.82, WHEEL_Z]]) {
      const w = new THREE.Mesh(wheelGeo, matVC);
      w.position.set(x, WHEEL_Y, z);
      w.castShadow = true;
      this.wheels.push(w);
      this.exterior.add(w);
    }
    this.bumperSlot.position.set(0, -0.32, -2.25);
    this.exterior.add(this.bumperSlot);
    const st = rw(0, 0.45);
    this.rearSticker.position.set(st[0], st[1], st[2]);
    this.rearSticker.rotation.x = -0.64;
    this.exterior.add(this.rearSticker);

    // ---------------- cockpit (only visible from the driver's seat)
    const ck = new ModelBuilder();
    const inC: P3 = [0, 0.5, 0.3]; // a point inside the cabin, for inward-facing panels
    for (const sd of [-1, 1]) {
      // A-pillars follow the windshield edges; B-pillars sit behind the front seats; C-pillars are broad panels
      beam(ck, [sd * (HB - 0.06), BELT, WS_BASE + 0.05], [sd * (HR - 0.05), ROOF - 0.06, WS_TOP + 0.04], 0.1, 0.08, C.trim);
      beam(ck, [sd * (HB - 0.05), BELT, B_PIL], [sd * (HR - 0.05), ROOF - 0.05, B_PIL], 0.06, 0.13, C.trim);
      const cp = (s: number, z: number): P3 => { const p = gh(sd, s, z); return [p[0] - sd * 0.04, p[1], p[2]]; };
      face(ck, [cp(0, rwZ(0) - 0.26), cp(0, rwZ(0)), cp(0.97, rwZ(0.97)), cp(0.97, rwZ(0.97) - 0.2)], C.trim, inC);
      // roof rail and door cards (front and rear), with sill cap, armrest and handle
      beam(ck, [sd * (HR - 0.04), ROOF - 0.06, WS_TOP], [sd * (HR - 0.04), ROOF - 0.06, RW_TOP], 0.07, 0.07, C.trim);
      const x = sd * (HB - 0.03);
      for (const [z0, z1] of [[WS_BASE + 0.14, B_PIL - 0.03], [B_PIL + 0.03, RW_BASE - 0.12]]) {
        const zm = (z0 + z1) / 2, len = z1 - z0;
        ck.box(0.05, BELT + 0.22, len, C.door, { p: [x, (BELT - 0.22) / 2, zm] });
        ck.box(0.1, 0.03, len, C.black, { p: [x - sd * 0.02, BELT, zm] });
        ck.box(0.07, 0.05, len * 0.45, C.trim, { p: [x - sd * 0.055, 0.17, zm + len * 0.08] });
        ck.box(0.02, 0.03, 0.09, C.chrome, { p: [x - sd * 0.03, 0.3, z0 + 0.12] });
        ck.cyl(0.06, 0.06, 0.01, 12, C.black, { p: [x - sd * 0.03, -0.08, z0 + 0.18], r: [0, 0, Math.PI / 2] });
      }
    }
    // header rails, roof liner, sun visors, dome light
    ck.box(2 * HR - 0.04, 0.07, 0.12, C.trim, { p: [0, ROOF - 0.07, WS_TOP + 0.05] });
    ck.box(2 * HR - 0.04, 0.07, 0.1, C.trim, { p: [0, ROOF - 0.07, RW_TOP - 0.05] });
    ck.box(2 * HR, 0.03, RW_TOP - WS_TOP, C.liner, { p: [0, ROOF - 0.035, (WS_TOP + RW_TOP) / 2] });
    for (const sx of [-0.36, 0.36]) {
      ck.box(0.38, 0.02, 0.17, 0xc4baa4, { p: [sx, ROOF - 0.08, WS_TOP + 0.15], r: [0.12, 0, 0] });
      ck.cyl(0.012, 0.012, 0.2, 6, C.chrome, { p: [sx + Math.sign(sx) * 0.1, ROOF - 0.07, WS_TOP + 0.07], r: [0, 0, Math.PI / 2] });
    }
    ck.box(0.18, 0.02, 0.09, 0xf2ead8, { p: [0, ROOF - 0.06, 0.35] });
    // parcel shelf under the rear window
    ck.box(2 * HB - 0.12, 0.03, 0.24, C.black, { p: [0, BELT - 0.035, RW_BASE - 0.12] });
    // dashboard: a profile extruded across the car, stepped down in front of the driver so the
    // binnacle can sit low; wood strip across the passenger side
    const dashFace: P2[] = [[-0.485, 0.37], [-0.53, 0.26], [-0.56, 0.12], [-0.66, 0.02], [WS_BASE + 0.02, 0], [WS_BASE + 0.02, BELT + 0.012], [WS_BASE + 0.2, BELT + 0.035]];
    const DRV = 0.07; // split between the passenger/centre dash and the driver's lowered section
    profile(ck, [[-0.58, BELT + 0.025], [-0.5, BELT - 0.005], ...dashFace], DRV + HB - 0.03, C.dash, (DRV - HB + 0.03) / 2);
    profile(ck, [[-0.72, BELT + 0.03], [-0.68, 0.4], [-0.5, 0.395], ...dashFace], HB - 0.03 - DRV, C.dash, (DRV + HB - 0.03) / 2);
    ck.box(1.0, 0.04, 0.012, C.wood, { p: [-0.32, 0.37, -0.484] });
    ck.box(0.38, 0.13, 0.014, 0x433b34, { p: [-0.4, 0.26, -0.533], r: [0.38, 0, 0] }); // glovebox lid
    ck.box(0.08, 0.018, 0.016, C.chrome, { p: [-0.4, 0.3, -0.522], r: [0.38, 0, 0] });
    for (const sx of [-0.72, 0.72]) ck.cyl(0.045, 0.045, 0.02, 12, C.black, { p: [sx, 0.38, -0.49], r: [Math.PI / 2, 0, 0] });
    // instrument binnacle in front of the driver: backing, visor and cheeks
    ck.box(0.5, 0.2, 0.03, 0x161616, { p: [0.36, 0.48, -0.61], r: [-0.35, 0, 0] });
    ck.box(0.56, 0.018, 0.17, C.dash, { p: [0.36, 0.6, -0.6], r: [0.08, 0, 0] });
    for (const sx of [0.085, 0.635]) ck.box(0.025, 0.2, 0.17, C.dash, { p: [sx, 0.5, -0.6] });
    // centre stack: vents, radio bezel and knobs
    ck.box(0.36, 0.42, 0.2, C.dash, { p: [0, 0.2, -0.5] });
    for (const sx of [-0.08, 0.08]) {
      ck.box(0.13, 0.055, 0.012, C.black, { p: [sx, 0.34, -0.398] });
      for (let i = 0; i < 3; i++) ck.box(0.12, 0.006, 0.014, 0x55504a, { p: [sx, 0.325 + i * 0.015, -0.395] });
    }
    ck.box(0.3, 0.11, 0.012, C.black, { p: [0, 0.235, -0.397] });
    ck.cyl(0.022, 0.022, 0.03, 10, C.chrome, { p: [0.14, 0.235, -0.39], r: [Math.PI / 2, 0, 0] });
    ck.cyl(0.022, 0.022, 0.03, 10, C.chrome, { p: [-0.14, 0.235, -0.39], r: [Math.PI / 2, 0, 0] });
    // floor, toe board, transmission tunnel
    ck.box(2 * HB - 0.08, 0.04, 2.6, C.carpet, { p: [0, -0.22, 0.25] });
    ck.box(2 * HB - 0.08, 0.04, 0.4, C.carpet, { p: [0, -0.1, -0.86], r: [0.85, 0, 0] });
    ck.box(0.3, 0.14, 1.7, C.carpet, { p: [0, -0.14, -0.05] });
    // pedals (clutch, brake, accelerator), hanging from under the dash
    for (const [sx, w] of [[0.2, 0.07], [0.34, 0.08], [0.5, 0.05]]) {
      ck.box(w, 0.1, 0.02, C.black, { p: [sx, -0.07, -0.7], r: [-0.5, 0, 0] });
      beam(ck, [sx, -0.04, -0.71], [sx, 0.06, -0.82], 0.02, 0.02, C.black);
    }
    // gear lever with boot and knob, handbrake beside it
    ck.cone(0.07, 0.07, 10, C.black, { p: [0, -0.04, -0.22] });
    beam(ck, [0, -0.04, -0.22], [0, 0.22, -0.14], 0.018, 0.018, 0x333333);
    ck.sphere(0.034, 10, 8, 0x222222, { p: [0, 0.23, -0.137] });
    beam(ck, [0.1, -0.06, 0.1], [0.1, 0.02, 0.3], 0.035, 0.03, C.black);
    // steering column shroud with indicator and wiper stalks
    const colAt = (d: number): P3 => [0.36, 0.3 - 0.479 * d, -0.26 - 0.878 * d];
    ck.box(0.11, 0.1, 0.26, C.black, { p: colAt(0.18), r: [-0.5, 0, 0] });
    for (const sx of [-1, 1]) ck.box(0.12, 0.014, 0.014, 0x333333, { p: [0.36 + sx * 0.1, colAt(0.1)[1], colAt(0.1)[2]], r: [0, 0, sx * -0.2] });
    // rear-view mirror stem, glued to the top of the windshield
    beam(ck, [0.02, 0.9, -0.53], [0.02, 0.98, -0.51], 0.016, 0.016, 0x222222);
    const ckM = new THREE.Mesh(ck.build(), matVC);
    this.cockpit.add(ckM);
    // seats (covers are cosmetics) and door inserts in the same cloth
    const seats = new ModelBuilder();
    // side profiles (z, y): the outer one is the bolsters, the centre panel sits slightly recessed
    const SEAT_OUT: P2[] = [[-0.25, -0.16], [-0.26, -0.05], [-0.22, 0.02], [0.22, 0.0], [0.27, 0.03], [0.41, 0.64], [0.45, 0.68], [0.52, 0.66], [0.4, -0.04], [0.33, -0.16]];
    const SEAT_IN: P2[] = [[-0.24, -0.16], [-0.245, -0.07], [-0.21, -0.005], [0.22, -0.025], [0.29, 0.01], [0.435, 0.62], [0.46, 0.655], [0.505, 0.635], [0.395, -0.03], [0.33, -0.15]];
    for (const sx of [-0.36, 0.36]) {
      profile(seats, SEAT_IN, 0.4, 0xffffff, sx);
      for (const bx of [-0.225, 0.225]) profile(seats, SEAT_OUT, 0.05, 0xe2e2e2, sx + bx);
      seats.box(0.28, 0.17, 0.09, 0xffffff, { p: [sx, 0.83, 0.5], r: [-0.2, 0, 0] });
      for (const px of [-0.08, 0.08]) seats.cyl(0.008, 0.008, 0.14, 5, C.chrome, { p: [sx + px, 0.71, 0.48] });
    }
    profile(seats, [[0.68, -0.2], [0.67, -0.07], [0.71, 0.0], [1.15, -0.02], [1.2, 0.02], [1.29, 0.55], [1.32, 0.59], [1.37, 0.57], [1.31, -0.1], [1.25, -0.2]], 2 * HB - 0.2, 0xffffff);
    for (const sd of [-1, 1]) {
      for (const [z0, z1] of [[WS_BASE + 0.14, B_PIL - 0.03], [B_PIL + 0.03, RW_BASE - 0.12]]) {
        seats.box(0.012, 0.2, (z1 - z0) * 0.7, 0xe8e8e8, { p: [sd * (HB - 0.06), 0.0, (z0 + z1) / 2] });
      }
    }
    const seatM = new THREE.Mesh(seats.build(), this.seatMat);
    this.cockpit.add(seatM);
    // hood and boot lid seen through the glass (paint colour)
    const hb = new ModelBuilder();
    profile(hb, [...HOOD, [-2.1, 0.1], [WS_BASE, 0.1]], 1.78, 0xffffff);
    profile(hb, [...BOOT, [RW_BASE, 0.1], [2.1, 0.1]], 1.78, 0xffffff);
    this.hood = new THREE.Mesh(hb.build(), this.paintMat);
    this.cockpit.add(this.hood);

    // steering wheel (rotates with input): rim, three spokes, horn pad
    const sw = new ModelBuilder();
    sw.add(new THREE.TorusGeometry(0.185, 0.02, 8, 28), 0x2a2a2a, {}, false);
    sw.box(0.36, 0.035, 0.016, 0x3a3a3a, { p: [0, 0.01, 0] });
    sw.box(0.035, 0.17, 0.016, 0x3a3a3a, { p: [0, -0.09, 0] });
    sw.cyl(0.06, 0.06, 0.05, 14, 0x444444, { r: [Math.PI / 2, 0, 0] });
    sw.cyl(0.045, 0.045, 0.012, 14, 0x5a5a5a, { p: [0, 0, 0.027], r: [Math.PI / 2, 0, 0] });
    const swMesh = new THREE.Mesh(sw.build(), matVC);
    const swCover = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.026, 8, 28), this.wheelCoverMat);
    swCover.visible = false;
    swCover.name = 'wheelCover';
    this.steering.add(swMesh, swCover);
    this.steering.position.set(0.36, 0.3, -0.26);
    this.steering.rotation.set(-0.5, 0, 0, 'YXZ');
    const swAxis = new THREE.Group();
    swAxis.add(this.steering);
    this.cockpit.add(swAxis);

    // gauges (backlit canvas), set into the binnacle backing
    this.dashTex = canvasTex(512, 192);
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.1725), new THREE.MeshBasicMaterial({ map: this.dashTex.t, toneMapped: false }));
    dash.position.set(0.36, 0.486, -0.594);
    dash.rotation.x = -0.35;
    this.cockpit.add(dash);
    this.radioTex = canvasTex(256, 96);
    const radio = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.075), new THREE.MeshBasicMaterial({ map: this.radioTex.t, toneMapped: false }));
    radio.position.set(0, 0.235, -0.39);
    radio.rotation.set(-0.1, 0, 0);
    this.cockpit.add(radio);

    // rear-view mirror with its own low-res render
    this.mirrorRT = new THREE.WebGLRenderTarget(256, 96, { type: THREE.UnsignedByteType });
    this.mirrorRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.mirrorCam = new THREE.PerspectiveCamera(32, 256 / 96, 0.5, 400);
    const mframe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.03), toon({ color: 0x222222 }));
    const mplane = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.08), new THREE.MeshBasicMaterial({ map: this.mirrorRT.texture }));
    mplane.position.z = 0.017;
    mplane.scale.x = -1; // mirror image
    this.mirrorPlane = mplane;
    const mirror = new THREE.Group();
    mirror.add(mframe, mplane);
    mirror.position.set(0.02, 0.86, -0.52);
    mirror.rotation.set(-0.08, 0.2, 0);
    this.cockpit.add(mirror);
    // hanging items swing from below the mirror
    this.hangPoint.position.set(0.02, 0.8, -0.52);
    this.cockpit.add(this.hangPoint);
    this.hanging = new Pendulum(this.hangPoint, 0.16);
    // dashboard trinket (bobbles on a spring), on the passenger side of the dash top
    this.dashSlot.position.set(-0.3, BELT + 0.03, -0.66);
    this.cockpit.add(this.dashSlot);
    this.bobble = new Pendulum(this.dashSlot, 0.06);

    // wipers, parked along the base of the windshield and sweeping in its plane
    for (const sx of [-0.45, 0.25]) {
      const g = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.015, 0.015), toon({ color: 0x1a1a1a }));
      arm.position.x = 0.31;
      g.add(arm);
      g.position.set(sx, BELT + 0.02, WS_BASE - 0.02);
      g.rotation.set(0.76, 0, 0, 'XYZ');
      this.wipers.push(g);
      this.cockpit.add(g);
    }

    // headlights
    for (const sx of [-0.62, 0.62]) {
      const L = new THREE.SpotLight(0xfff0d0, 0, 70, 0.45, 0.6, 1.2);
      L.position.set(sx, 0.2, -2.1);
      L.target.position.set(sx * 1.5, -1.2, -22);
      L.castShadow = false;
      this.root.add(L, L.target);
      this.headlights.push(L);
    }
  }

  setInterior(inside: boolean) {
    this.cockpit.visible = inside;
    this.exterior.visible = !inside;
  }

  setPaint(c1: number, c2: number) {
    this.paintMat.color.setHex(c1);
    this.paint2Mat.color.setHex(c2);
  }

  setHeadlights(on: boolean, intensity = 40) {
    for (const L of this.headlights) L.intensity = on ? intensity : 0;
    this.headGlow.color.setHex(on ? 0xfffbe8 : 0xd8d4c8);
    this.tailGlow.color.setHex(on ? 0xff3a2a : 0x8a2a20);
  }

  /** animate wheel, wipers, trinkets */
  animate(dt: number, steer: number, wheelSpin: number, accFwd: number, accSide: number) {
    this.steering.rotation.z = -steer * 4.2; // wheel turns ~240°
    for (const w of this.wheels) w.rotation.x = -wheelSpin;
    this.wheels[0].rotation.y = this.wheels[1].rotation.y = -steer;
    this.hanging.update(dt, accFwd, accSide);
    this.bobble.update(dt, accFwd * 1.6, accSide * 1.6);
    this.dashSlot.rotation.x *= 0.25;
    this.dashSlot.rotation.z *= 0.25;
    if (this.wiping || this.wiperPhase > 0) {
      this.wiperPhase += dt * 3.2;
      if (this.wiperPhase >= Math.PI * 2) this.wiperPhase = this.wiping ? this.wiperPhase - Math.PI * 2 : 0;
    }
    const a = (1 - Math.cos(this.wiperPhase)) * 0.5; // 0 parked, 1 fully up
    for (const w of this.wipers) w.rotation.y = 0;
    this.wipers[0].rotation.z = a * 1.7;
    this.wipers[1].rotation.z = a * 1.7;
  }

  updateDash(dt: number, s: DashState) {
    this.dashTimer -= dt;
    if (this.dashTimer > 0) return;
    this.dashTimer = 1 / 12;
    const { ctx, c, t } = this.dashTex;
    const W = c.width, H = c.height;
    const night = s.night;
    ctx.fillStyle = '#121313';
    ctx.fillRect(0, 0, W, H);
    const glow = night > 0.4 ? '#ffd08a' : '#f3ede0';
    // speedometer
    const cx = 120, cy = 108, R = 82;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3a3a38';
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();
    const maxV = s.units === 'km' ? 140 : 90;
    const v = s.units === 'km' ? s.kmh : s.kmh * 0.6214;
    ctx.fillStyle = glow;
    ctx.strokeStyle = glow;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k <= maxV; k += maxV / 7) {
      const a = Math.PI * 0.8 + (k / maxV) * Math.PI * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4));
      ctx.lineTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14));
      ctx.stroke();
      ctx.fillText(String(Math.round(k)), cx + Math.cos(a) * (R - 28), cy + Math.sin(a) * (R - 28));
    }
    const na = Math.PI * 0.8 + Math.min(1, v / maxV) * Math.PI * 1.4;
    ctx.strokeStyle = '#e8643c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * (R - 10), cy + Math.sin(na) * (R - 10));
    ctx.stroke();
    ctx.fillStyle = glow;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(String(Math.round(v)), cx, cy + 34);
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(s.units === 'km' ? 'km/h' : 'mph', cx, cy + 54);
    // fuel gauge
    const fx = 330, fy = 120;
    ctx.strokeStyle = '#3a3a38';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(fx, fy, 52, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.strokeStyle = s.lowFuel ? '#e8a33c' : '#9fc88a';
    ctx.beginPath();
    ctx.arc(fx, fy, 52, Math.PI * 1.15, Math.PI * (1.15 + 0.7 * Math.max(0.001, s.fuel)));
    ctx.stroke();
    ctx.fillStyle = glow;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('E', fx - 50, fy + 4);
    ctx.fillText('F', fx + 50, fy + 4);
    ctx.fillText('⛽', fx, fy - 10);
    if (s.lowFuel) {
      ctx.fillStyle = s.reserve ? '#e8643c' : '#e8a33c';
      ctx.beginPath();
      ctx.arc(fx, fy + 22, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(s.reserve ? 'RESERVE' : 'LOW', fx, fy + 42);
    }
    // clock + odometer
    const hh = Math.floor(s.hour), mm = Math.floor((s.hour - hh) * 60);
    ctx.fillStyle = glow;
    ctx.font = '700 26px ui-monospace, monospace';
    ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 450, 46);
    ctx.font = '500 13px ui-monospace, monospace';
    const odo = s.units === 'km' ? s.odometerKm : s.odometerKm * 0.6214;
    ctx.fillText(`${odo.toFixed(1)} ${s.units}`, 450, 78);
    ctx.fillText(`${s.money}`, 450, 104);
    ctx.fillText(`film ${s.film}`, 450, 128);
    if (s.cruise) {
      ctx.fillStyle = '#7fd0a0';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillText('CRUISE', 450, 160);
    }
    if (s.headlights) {
      ctx.fillStyle = '#6fa8e8';
      ctx.fillText('◐ LIGHTS', 330, 168);
    }
    t.needsUpdate = true;

    // radio display
    const r = this.radioTex;
    r.ctx.fillStyle = '#0f1a14';
    r.ctx.fillRect(0, 0, 256, 96);
    r.ctx.fillStyle = s.lowFuel ? '#6fb08a' : '#8ff0b4';
    r.ctx.font = '700 30px ui-monospace, monospace';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText(s.freq, 128, 32);
    r.ctx.font = '600 20px ui-monospace, monospace';
    r.ctx.fillText(s.station, 128, 70);
    r.t.needsUpdate = true;
  }
}

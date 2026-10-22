// Shape helpers for vehicles: side profiles extruded across the width, wheel arches, flat panels,
// beams between two points, and a greenhouse (cabin) with glass. Vehicle-local: y up, -z forward.
import * as THREE from 'three';
import { ModelBuilder } from './models';

export type P3 = [number, number, number];
export type P2 = [number, number];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** flat convex polygon whose front face points towards `toward` */
export function face(m: ModelBuilder, pts: P3[], color: number, toward: P3) {
  const [a, b, c] = pts;
  const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
  const o = centroid(pts);
  const ordered = n.dot(_v.set(toward[0] - o[0], toward[1] - o[1], toward[2] - o[2])) < 0 ? [...pts].reverse() : pts;
  const pos: number[] = [];
  for (let i = 1; i + 1 < ordered.length; i++) pos.push(...ordered[0], ...ordered[i], ...ordered[i + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  m.add(g, color);
}

/** flat polygon facing away from `center` (an outer skin panel) */
export function skin(m: ModelBuilder, pts: P3[], color: number, center: P3) {
  const o = centroid(pts);
  face(m, pts, color, [o[0] * 2 - center[0], o[1] * 2 - center[1], o[2] * 2 - center[2]]);
}

function centroid(pts: P3[]): P3 {
  const o: P3 = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) o[k] += p[k] / pts.length;
  return o;
}

/** box running from a to b along its local y; w and d are its cross-section */
export function beam(m: ModelBuilder, a: P3, b: P3, w: number, d: number, color: number) {
  _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _v.length();
  _e.setFromQuaternion(_q.setFromUnitVectors(UP, _v.normalize()));
  m.box(w, len, d, color, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [_e.x, _e.y, _e.z] });
}

/** round tapering rod from a (radius r0) to b (radius r1) */
export function rod(m: ModelBuilder, a: P3, b: P3, r0: number, r1: number, seg: number, color: number) {
  _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _v.length();
  if (len < 1e-4) return;
  _e.setFromQuaternion(_q.setFromUnitVectors(UP, _v.normalize()));
  m.cyl(r1, r0, len, seg, color, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [_e.x, _e.y, _e.z] });
}

/** side profile given as (z, y) points in order around the outline, extruded across x and centred on cx */
export function profile(m: ModelBuilder, pts: P2[], width: number, color: number, cx = 0) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  m.add(new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false, curveSegments: 8 }), color, { p: [cx + width / 2, 0, 0], r: [0, -Math.PI / 2, 0] });
}

/** front cross-section given as (x, y) points, extruded along z from z0 to z1 */
export function section(m: ModelBuilder, pts: P2[], z0: number, z1: number, color: number) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  m.add(new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 8 }), color, { p: [0, 0, z0] });
}

/**
 * Lofted solid: one convex cross-section (x, y) placed at stations along z, each scaled in x about cx
 * and in y about baseY. Faces take colorAt(y) of the section edge they come from (unscaled y), so a
 * colour band follows the section even where the ends are squashed.
 */
export function loft(m: ModelBuilder, shape: P2[], stations: { z: number; sx: number; sy?: number }[], baseY: number, colorAt: (y: number) => number, capColor?: [number, number], cx = 0) {
  const ring = (st: { z: number; sx: number; sy?: number }): P3[] => shape.map(([x, y]) => [cx + x * st.sx, baseY + (y - baseY) * (st.sy ?? 1), st.z]);
  const rings = stations.map(ring);
  const cy = shape.reduce((s, p) => s + p[1], 0) / shape.length;
  for (let i = 0; i + 1 < rings.length; i++) {
    const a = rings[i], b = rings[i + 1];
    const center: P3 = [cx, cy, (stations[i].z + stations[i + 1].z) / 2];
    for (let j = 0; j < shape.length; j++) {
      const k = (j + 1) % shape.length;
      skin(m, [a[j], a[k], b[k], b[j]], colorAt((shape[j][1] + shape[k][1]) / 2), center);
    }
  }
  if (capColor) {
    const f = rings[0], l = rings[rings.length - 1];
    const dir = Math.sign(stations[stations.length - 1].z - stations[0].z);
    face(m, f, capColor[0], [cx, cy, stations[0].z - dir]);
    face(m, l, capColor[1], [cx, cy, stations[stations.length - 1].z + dir]);
  }
}

/** wheel-arch cut-out along the sill, front to back, over a wheel at (zc, wy) */
export function arch(zc: number, sill: number, wy: number, r: number, steps = 10): P2[] {
  const a0 = Math.asin(Math.max(-1, Math.min(1, (sill - wy) / r)));
  const pts: P2[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = Math.PI - a0 + (2 * a0 - Math.PI) * (k / steps);
    pts.push([zc + Math.cos(a) * r, wy + Math.sin(a) * r]);
  }
  return pts;
}

/** arc of points (x, y) around a centre, from angle a0 to a1 */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps: number): P2[] {
  const pts: P2[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + (a1 - a0) * (k / steps);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** road wheel: tyre, rim and hub, axle along x */
export function wheel(m: ModelBuilder, x: number, y: number, z: number, r: number, w: number, rim = 0xb8b8b8, seg = 14) {
  m.cyl(r, r, w, seg, 0x1e1e1e, { p: [x, y, z], r: [0, 0, Math.PI / 2] });
  m.cyl(r * 0.6, r * 0.6, w + 0.01, seg, rim, { p: [x, y, z], r: [0, 0, Math.PI / 2] });
  m.cyl(r * 0.22, r * 0.22, w + 0.03, 8, 0x8a8a8a, { p: [x, y, z], r: [0, 0, Math.PI / 2] });
}

/**
 * Greenhouse: the cabin above the belt line, as a frustum from the belt to the roof (tumblehome),
 * with windshield, rear window and side windows split by pillars.
 */
export interface Cabin {
  belt: number;
  roof: number;
  /** windshield z at the belt and at the roof */
  wsBase: number;
  wsTop: number;
  /** rear window z at the roof and at the belt */
  rwTop: number;
  rwBase: number;
  /** half-width at the belt and at the roof */
  hb: number;
  hr: number;
}

export class Greenhouse {
  readonly center: P3;
  constructor(readonly c: Cabin) {
    this.center = [0, (c.belt + c.roof) / 2, (c.wsBase + c.rwBase) / 2];
  }
  wsZ(s: number) { return this.c.wsBase + (this.c.wsTop - this.c.wsBase) * s; }
  rwZ(s: number) { return this.c.rwBase + (this.c.rwTop - this.c.rwBase) * s; }
  /** point on the side (side = ±1) at height fraction s (0 belt, 1 roof) */
  side(sd: number, s: number, z: number): P3 {
    const { c } = this;
    return [sd * (c.hb + (c.hr - c.hb) * s), c.belt + s * (c.roof - c.belt), z];
  }
  /** point on the windshield (u -1..1 across) or the rear window, lifted just proud of the shell */
  ws(u: number, s: number, lift = 0.006): P3 {
    const p = this.side(1, s, this.wsZ(s));
    const n = this.normal(this.c.wsBase, this.c.wsTop, -1);
    return [u * p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
  }
  rw(u: number, s: number, lift = 0.006): P3 {
    const p = this.side(1, s, this.rwZ(s));
    const n = this.normal(this.c.rwBase, this.c.rwTop, 1);
    return [u * p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
  }
  private normal(z0: number, z1: number, dir: number): P3 {
    const dy = this.c.roof - this.c.belt, dz = z1 - z0, l = Math.hypot(dy, dz);
    return [0, Math.abs(dz) / l, (dir * dy) / l];
  }
  /** the closed shell: two sides, windshield and rear panels, roof */
  shell(m: ModelBuilder, color: number) {
    const { c } = this, s = this.side.bind(this);
    for (const sd of [-1, 1]) skin(m, [s(sd, 0, c.wsBase), s(sd, 1, c.wsTop), s(sd, 1, c.rwTop), s(sd, 0, c.rwBase)], color, this.center);
    skin(m, [s(-1, 0, c.wsBase), s(1, 0, c.wsBase), s(1, 1, c.wsTop), s(-1, 1, c.wsTop)], color, this.center);
    skin(m, [s(-1, 0, c.rwBase), s(1, 0, c.rwBase), s(1, 1, c.rwTop), s(-1, 1, c.rwTop)], color, this.center);
    skin(m, [s(-1, 1, c.wsTop), s(1, 1, c.wsTop), s(1, 1, c.rwTop), s(-1, 1, c.rwTop)], color, this.center);
  }
  /** windshield and rear glass panels, inset from the pillars */
  frontRearGlass(m: ModelBuilder, color: number, rear = true) {
    skin(m, [this.ws(-0.9, 0.06), this.ws(0.9, 0.06), this.ws(0.88, 0.93), this.ws(-0.88, 0.93)], color, this.center);
    if (rear) skin(m, [this.rw(-0.86, 0.08), this.rw(0.86, 0.08), this.rw(0.84, 0.9), this.rw(-0.84, 0.9)], color, this.center);
  }
  /**
   * Side windows between the A-pillar, the given pillar positions and the C-pillar.
   * gaps: how far the glass stays off the A- and C-pillars at the belt and at the top.
   */
  sideGlass(m: ModelBuilder, color: number, pillars: number[], gaps = { a: [0.1, 0.08], c: [0.24, 0.18] }, s0 = 0.07, s1 = 0.87) {
    for (const sd of [-1, 1]) {
      const g = (s: number, z: number): P3 => { const p = this.side(sd, s, z); return [p[0] + sd * 0.006, p[1] + 0.0009, p[2]]; };
      const fronts = [[this.wsZ(s0) + gaps.a[0], this.wsZ(s1) + gaps.a[1]], ...pillars.map((z) => [z + 0.07, z + 0.07])];
      const backs = [...pillars.map((z) => [z - 0.05, z - 0.05]), [this.rwZ(s0) - gaps.c[0], this.rwZ(s1) - gaps.c[1]]];
      for (let i = 0; i < fronts.length; i++) {
        const [f0, f1] = fronts[i], [b0, b1] = backs[i];
        skin(m, [g(s0, f0), g(s1, f1), g(s1, b1), g(s0, b0)], color, this.center);
      }
    }
  }
}

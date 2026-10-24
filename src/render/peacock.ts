// The Indian peafowl in display, built by hand from reference photos (no usable low-poly model exists):
// an iridescent blue neck and breast, white face stripes, a fan-tipped crest, bronze-barred back,
// chestnut primaries drooped at the sides, and the train raised behind in a cupped fan of three rows of
// feathers, each with its eye (bronze, turquoise, blue). Built facing +z with the feet on y = 0, in
// metres, as flat faces with linear vertex colours; animalRig.ts rigs it like the loaded models.
import * as THREE from 'three';
import { ModelBuilder } from './models';

export interface BuiltMesh {
  pos: Float32Array;
  col: Float32Array;
  /** per vertex: 1 for the train (driven by the tail bone), 0 for the rest */
  tag: Uint8Array;
}

const V = THREE.Vector3;

export function buildPeacock(): BuiltMesh {
  // ---- body, from primitives
  const b = new ModelBuilder();
  const BLUE = 0x1d4fb8, NECK = 0x1f5ac8;
  b.sphere(1, 9, 7, 0x24303a, { p: [0, 0.5, 0.02], s: [0.12, 0.13, 0.24], r: [-0.2, 0, 0] }); // dark belly and flanks
  b.sphere(1, 9, 7, BLUE, { p: [0, 0.58, 0.15], s: [0.105, 0.12, 0.13] }); // breast
  b.sphere(1, 8, 6, 0x6f7a3a, { p: [0, 0.6, -0.07], s: [0.11, 0.075, 0.17] }); // bronze-green barred back
  for (const sx of [1, -1]) {
    b.sphere(1, 7, 5, 0x8a7a4a, { p: [sx * 0.1, 0.52, -0.03], s: [0.035, 0.09, 0.19], r: [0.15, 0, sx * 0.12] }); // coverts
    b.sphere(1, 7, 5, 0xa0522d, { p: [sx * 0.1, 0.43, -0.15], s: [0.03, 0.06, 0.14], r: [0.3, 0, sx * 0.1] }); // chestnut primaries
  }
  b.cyl(0.035, 0.055, 0.27, 7, NECK, { p: [0, 0.73, 0.2], r: [0.23, 0, 0] });
  b.sphere(0.042, 7, 6, NECK, { p: [0, 0.885, 0.235], s: [0.85, 1, 1.15] });
  b.cone(0.012, 0.045, 5, 0xb8a890, { p: [0, 0.875, 0.29], r: [Math.PI / 2, 0, 0] });
  for (const sx of [1, -1]) {
    b.sphere(1, 5, 4, 0xf2f2f0, { p: [sx * 0.034, 0.894, 0.244], s: [0.006, 0.008, 0.028] }); // white stripe above the eye
    b.sphere(1, 5, 4, 0xf2f2f0, { p: [sx * 0.033, 0.873, 0.246], s: [0.006, 0.006, 0.024] }); // and below
    b.sphere(0.007, 4, 3, 0x111111, { p: [sx * 0.036, 0.884, 0.252] });
  }
  // crest: bare stalks with small fan tips
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 0.9;
    const base = new V(0, 0.92, 0.232), tip = base.clone().add(new V(Math.sin(a) * 0.035, 0.07, -0.012));
    const mid = base.clone().lerp(tip, 0.5), len = base.distanceTo(tip);
    b.cyl(0.0025, 0.0025, len, 3, 0x2a3a6a, { p: [mid.x, mid.y, mid.z], r: [-0.17, 0, -a * 0.45] });
    b.sphere(1, 5, 3, 0x2a7ab8, { p: [tip.x, tip.y, tip.z], s: [0.012, 0.012, 0.004] });
  }
  // legs and feet
  for (const sx of [1, -1]) {
    b.cyl(0.012, 0.014, 0.36, 5, 0x8a8070, { p: [sx * 0.06, 0.2, 0.03] });
    for (const a of [-0.45, 0, 0.45]) b.box(0.012, 0.01, 0.07, 0x8a8070, { p: [sx * 0.06 + Math.sin(a) * 0.035, 0.005, 0.03 + Math.cos(a) * 0.035], r: [0, a, 0] });
    b.box(0.01, 0.01, 0.04, 0x8a8070, { p: [sx * 0.06, 0.005, 0.0] });
  }
  const body = b.build();
  const bp = body.attributes.position.array as Float32Array, bc = body.attributes.color.array as Float32Array;

  // ---- the train, as raw two-sided triangles
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  const push = (p: THREE.Vector3, hex: number) => { c.setHex(hex); pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); };
  /** a triangle facing +z in front, and its back face in the back colour (if any) */
  const tri = (a: THREE.Vector3, bb: THREE.Vector3, cc: THREE.Vector3, front: number, back?: number) => {
    const n = new V().subVectors(bb, a).cross(new V().subVectors(cc, a));
    if (n.z < 0) [bb, cc] = [cc, bb];
    push(a, front); push(bb, front); push(cc, front);
    if (back !== undefined) { push(a, back); push(cc, back); push(bb, back); }
  };
  const C = new V(0, 0.5, -0.2);
  const BACK = 0x7d6a48;
  const feather = (a: number, L: number, dz: number, w: number) => {
    // the feather's line from the fan's centre, leaning forward at the top and cupped at the sides
    const d = new V(Math.sin(a), Math.cos(a), 0.12 * Math.cos(a) + 0.1 * Math.abs(Math.sin(a))).normalize();
    const s = new V(d.y, -d.x, 0).normalize();
    const n = new V().crossVectors(s, d).normalize();
    if (n.z < 0) n.negate();
    const at = (t: number, off: number, lift = 0) => C.clone().addScaledVector(d, 0.06 + t * L).addScaledVector(s, off).addScaledVector(n, dz + lift);
    // vane: narrow at the quill, widest around the eye, rounded off at the tip
    const T = [0, 0.55, 0.8, 0.95, 1.02], W = [0.012, 0.03, w, w * 0.8, 0], COL = [0x8a8a3a, 0x4a8a3c, 0x2f7a40, 0x2f7a40];
    for (let i = 0; i < 4; i++) {
      const l0 = at(T[i], -W[i] / 2), r0 = at(T[i], W[i] / 2), l1 = at(T[i + 1], -W[i + 1] / 2), r1 = at(T[i + 1], W[i + 1] / 2);
      tri(l0, r0, r1, COL[i], BACK);
      if (W[i + 1] > 0) tri(l0, r1, l1, COL[i], BACK);
    }
    // the eye: three nested ovals, each a little proud of the last
    const RINGS: [number, number][] = [[0.46, 0xc8a83a], [0.33, 0x38c0b0], [0.2, 0x1a3aa8]];
    RINGS.forEach(([r, hex], k) => {
      const ctr = at(0.85, 0, 0.003 * (k + 1));
      const rr = r * w;
      const ring = [0, 1, 2, 3, 4].map((j) => {
        const t = (j / 5) * Math.PI * 2;
        return ctr.clone().addScaledVector(d, Math.cos(t) * rr * 1.3).addScaledVector(s, Math.sin(t) * rr);
      });
      for (let j = 0; j < 5; j++) tri(ctr, ring[j], ring[(j + 1) % 5], hex);
    });
  };
  const tag0 = pos.length;
  // stiff brown tail feathers propping the train from behind
  for (let i = 0; i < 14; i++) {
    const a = (i / 13 - 0.5) * 2.6;
    const d = new V(Math.sin(a), Math.cos(a), -0.15).normalize(), s = new V(d.y, -d.x, 0).normalize();
    const p0 = C.clone().addScaledVector(d, 0.04).add(new V(0, 0, -0.04)), p1 = p0.clone().addScaledVector(d, 0.42);
    tri(p0.clone().addScaledVector(s, -0.015), p0.clone().addScaledVector(s, 0.015), p1.clone().addScaledVector(s, 0.03), 0x6a5236, 0x6a5236);
    tri(p0.clone().addScaledVector(s, -0.015), p1.clone().addScaledVector(s, 0.03), p1.clone().addScaledVector(s, -0.03), 0x6a5236, 0x6a5236);
  }
  // three rows: the longest behind, shorter rows in front of them
  const ROWS: [number, number, number, number, number][] = [[44, 2.0, 0.95, 0, 0.1], [34, 1.9, 0.72, 0.014, 0.09], [24, 1.75, 0.48, 0.028, 0.075]];
  for (const [n, span, L, dz, w] of ROWS) {
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * 2 * span;
      // the lowest feathers stop short of the ground
      const lim = Math.cos(a) < 0 ? (C.y - 0.06) / -Math.cos(a) - 0.06 : Infinity;
      feather(a, Math.min(L * (0.96 + 0.08 * ((i * 7) % 5) / 4), lim), dz, w);
    }
  }

  const nb = bp.length / 3, nt = pos.length / 3;
  const out: BuiltMesh = { pos: new Float32Array((nb + nt) * 3), col: new Float32Array((nb + nt) * 3), tag: new Uint8Array(nb + nt) };
  out.pos.set(bp, 0);
  out.col.set(bc, 0);
  out.pos.set(pos, nb * 3);
  out.col.set(col, nb * 3);
  out.tag.fill(1, nb + tag0 / 3);
  body.dispose();
  return out;
}

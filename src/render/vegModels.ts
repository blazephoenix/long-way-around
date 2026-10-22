// Low-poly vegetation and natural props. Parts marked with tint(true) take the
// per-instance colour (biome palette); trunks and stems keep their own colour.
import * as THREE from 'three';
import { ModelBuilder } from './models';
import type { VegType } from '../../data/biomes';
import { rod } from './carKit';

type V3 = [number, number, number];

const TRUNK = 0x6b4a32;

/** One species' geometry; `far` asks for a lighter version where the species has one (beyond about 200 m). */
export function vegGeometry(t: VegType, far = false): THREE.BufferGeometry {
  const m = new ModelBuilder();
  switch (t) {
    case 'pine': {
      // Khasi pine (Pinus kesiya), after Shillong and Benguet stands: a tall straight trunk bare for
      // most of its height, a few branches sweeping up and out, and the needles in bright, fluffy,
      // flattened tufts at the branch ends, so the crown is open and irregular rather than a cone
      const trunk: V3[] = [[0, 0, 0], [0.12, 4.2, 0.05], [0.05, 8.2, -0.08], [0.18, 10.6, 0]];
      if (far) rod(m, trunk[0], trunk[3], 0.26, 0.08, 4, 0x6e5c4a);
      else for (let i = 0; i < 3; i++) rod(m, trunk[i], trunk[i + 1], 0.26 - i * 0.07, 0.2 - i * 0.07, 5, i ? 0x6e5c4a : 0x5e4c3c);
      const branches = far ? 3 : 6;
      const tufts: [V3, number][] = [[trunk[3], 1.25]];
      for (let i = 0; i < branches; i++) {
        const az = i * 2.4 + 0.6, y = 6.2 + (i / branches) * 3.6, L = 2.6 - (i / branches) * 1.1;
        const up = 0.55 + (i % 2) * 0.25;
        const b: V3 = [trunk[1][0] * 0.5, y, 0];
        const tip: V3 = [b[0] + Math.cos(az) * L * Math.cos(up), y + L * Math.sin(up), b[2] + Math.sin(az) * L * Math.cos(up)];
        rod(m, b, tip, 0.09, 0.05, 4, 0x6e5c4a);
        tufts.push([tip, far ? 1.35 : 1.0 + (i % 3) * 0.12]);
      }
      m.tint(true);
      tufts.forEach(([c, r], i) => m.add(tuft(i), i % 3 ? 0xffffff : 0xe2ecd8, { p: c, s: [r * 1.15, r * 0.55, r * 1.05], r: [0, i * 1.3, 0] }));
      break;
    }
    case 'broadleaf': {
      m.cyl(0.18, 0.3, 3.0, 6, TRUNK, { p: [0, 1.5, 0] });
      m.cyl(0.08, 0.12, 1.6, 4, TRUNK, { p: [0.5, 3.0, 0], r: [0, 0, -0.7] });
      m.tint(true);
      m.ico(1.9, 0, 0xffffff, { p: [0, 4.3, 0], s: [1, 0.85, 1] });
      m.ico(1.4, 0, 0xe6ece4, { p: [1.2, 3.8, 0.4], s: [1, 0.85, 1] });
      m.ico(1.3, 0, 0xf2f2ee, { p: [-0.9, 3.9, -0.7], s: [1, 0.85, 1] });
      break;
    }
    case 'palm': {
      // coconut palm, after Kerala and coastal palms: a slender ringed trunk leaning and curving
      // back up, a crown of long feathery fronds arching out and drooping (leaflets hang off both
      // sides of the rachis, so each frond is a steep inverted V), coconuts under the crown, and a
      // couple of dead fronds hanging
      const lean = 0.32, segs = 6, segL = 1.45;
      const trunk: V3[] = [[0, 0, 0]];
      for (let i = 1; i <= segs; i++) {
        const a = lean * (1 - (i / segs) * 0.9), p = trunk[i - 1];
        trunk.push([p[0] + Math.sin(a) * segL, p[1] + Math.cos(a) * segL, p[2]]);
      }
      for (let i = 0; i < segs; i++) rod(m, trunk[i], trunk[i + 1], 0.2 - i * 0.012, 0.18 - i * 0.012, 7, i % 2 ? 0x8a7a66 : 0x7e6e5a);
      m.cyl(0.24, 0.3, 0.5, 7, 0x7a6a56, { p: [0, 0.25, 0] }); // swollen base
      const top = trunk[segs];
      m.sphere(0.24, 7, 5, 0x8a7a50, { p: [top[0], top[1] + 0.05, top[2]] }); // crown shaft
      m.tint(true);
      const fronds = far ? 8 : 12;
      for (let i = 0; i < fronds; i++) {
        const az = i * 2.4, dx = Math.cos(az), dz = Math.sin(az);
        const rise = 0.8 - (i % 4) * 0.3, L = 4.2 + (i % 3) * 0.4, droop = 0.42 + (i % 4) * 0.1;
        const rib: V3[] = [], w: number[] = [];
        const N = far ? 5 : 11;
        for (let k = 0; k <= N; k++) {
          const t = k / N, r = L * t * Math.cos(rise);
          rib.push([top[0] + dx * r, top[1] + L * t * Math.sin(rise) - droop * L * t * t, top[2] + dz * r]);
          // leaflets longest a third of the way out, a bare stalk at the base; alternate widths
          // give the saw-tooth fringe of the leaflets
          const env = t < 0.08 ? 0.05 : 1.05 * Math.sin(Math.PI * Math.min(1, (t - 0.04) / 1.0)) ** 0.7;
          w.push(k === N ? 0 : env * (far || k % 2 ? 1.1 : 0.25));
        }
        m.add(blade(rib, w, [-dz, 0, dx], 1.3), i % 2 ? 0xffffff : 0xeef0e0);
      }
      m.tint(false);
      for (const az of [1.1, 3.5]) {
        const dx = Math.cos(az), dz = Math.sin(az);
        const rib: V3[] = [[top[0] + dx * 0.15, top[1] - 0.1, top[2] + dz * 0.15], [top[0] + dx * 0.6, top[1] - 0.6, top[2] + dz * 0.6], [top[0] + dx * 0.75, top[1] - 1.8, top[2] + dz * 0.75]];
        m.add(blade(rib, [0.15, 0.55, 0], [-dz, 0, dx], 0.9), 0x9a7a4a);
      }
      for (let i = 0; i < (far ? 0 : 6); i++) {
        const az = i * 1.05;
        m.ico(0.13, 0, 0x8a9a3a, { p: [top[0] + Math.cos(az) * 0.24, top[1] - 0.22 - (i % 2) * 0.12, top[2] + Math.sin(az) * 0.24] });
      }
      break;
    }
    case 'bush': {
      m.tint(true);
      m.ico(0.8, 0, 0xffffff, { p: [0, 0.5, 0], s: [1.2, 0.8, 1] });
      m.ico(0.6, 0, 0xe8ece6, { p: [0.6, 0.45, 0.3] });
      break;
    }
    case 'rock': {
      m.tint(true);
      m.dodeca(0.8, 0xffffff, { p: [0, 0.3, 0], s: [1.2, 0.7, 1] });
      break;
    }
    case 'boulder': {
      m.tint(true);
      m.dodeca(1.0, 0xffffff, { p: [0, 0.5, 0], s: [1.3, 0.95, 1.1] });
      m.dodeca(0.6, 0xe6e0da, { p: [0.9, 0.3, 0.4] });
      break;
    }
    case 'grass': {
      m.tint(true);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        m.cone(0.07, 0.6 + (i % 3) * 0.15, 3, 0xffffff, { p: [Math.cos(a) * 0.18, 0.3, Math.sin(a) * 0.18], r: [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25] });
      }
      break;
    }
    case 'flowers': {
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25;
        m.cyl(0.015, 0.015, 0.45, 3, 0x5a8a3a, { p: [Math.cos(a) * 0.25, 0.22, Math.sin(a) * 0.25] });
      }
      m.tint(true);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25;
        m.ico(0.07, 0, 0xffffff, { p: [Math.cos(a) * 0.25, 0.47, Math.sin(a) * 0.25] });
      }
      break;
    }
    case 'euphorbia': {
      m.tint(true);
      m.cyl(0.16, 0.2, 2.0, 6, 0xffffff, { p: [0, 1, 0] });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.3;
        const r = 0.35 + (i % 2) * 0.1;
        m.cyl(0.08, 0.08, 0.5, 5, 0xffffff, { p: [Math.cos(a) * r * 0.5, 1.0 + i * 0.15, Math.sin(a) * r * 0.5], r: [Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3] });
        m.cyl(0.1, 0.11, 0.9 + (i % 2) * 0.3, 5, 0xeeeeee, { p: [Math.cos(a) * r, 1.45 + i * 0.15, Math.sin(a) * r] });
      }
      break;
    }
    case 'acacia': {
      m.cyl(0.15, 0.24, 2.4, 5, 0x5c4632, { p: [0, 1.2, 0], r: [0, 0, 0.12] });
      m.cyl(0.08, 0.1, 1.4, 4, 0x5c4632, { p: [0.4, 2.5, 0], r: [0, 0, -0.6] });
      m.cyl(0.08, 0.1, 1.4, 4, 0x5c4632, { p: [-0.2, 2.5, 0.2], r: [0.5, 0, 0.4] });
      m.tint(true);
      m.cyl(2.4, 2.0, 0.6, 7, 0xffffff, { p: [0.2, 3.2, 0] });
      m.cyl(1.4, 1.6, 0.4, 7, 0xe6ecdc, { p: [0.6, 3.6, 0.3] });
      break;
    }
    case 'banana': {
      // after Kerala plantations: a green pseudostem, eight paddle leaves rising then arching over,
      // their halves drooping off a raised midrib; two dry leaves hanging; a bunch with its purple bud
      m.tint(true);
      m.cyl(0.1, 0.17, 2.3, 7, 0xc8d09a, { p: [0, 1.15, 0] });
      const top: V3 = [0, 2.25, 0];
      for (let i = 0; i < 8; i++) {
        const az = i * 2.4, dx = Math.cos(az), dz = Math.sin(az);
        const young = i < 2;
        const rise = young ? 1.25 : 0.98 - (i - 2) * 0.07;
        const L = young ? 1.7 : 2.2 + (i % 3) * 0.15;
        const droop = young ? 0.12 : 0.5 + (i % 2) * 0.15;
        const rib: V3[] = [], w: number[] = [];
        const N = 6;
        for (let k = 0; k <= N; k++) {
          const t = k / N, r = L * t * Math.cos(rise), y = L * t * Math.sin(rise) - droop * L * t * t;
          rib.push([top[0] + dx * r, top[1] + y, top[2] + dz * r]);
          // a short petiole, then the blade, wide almost to its blunt tip
          w.push(t < 0.1 ? 0.05 : k === N ? 0.1 : 0.56 * Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.06) / 1.02)), 0.4));
        }
        m.add(blade(rib, w, [-dz, 0, dx], 0.35), i % 2 ? 0xffffff : 0xeef2e4);
      }
      m.tint(false);
      for (const az of [0.9, 3.9]) {
        const dx = Math.cos(az), dz = Math.sin(az);
        const rib: V3[] = [[dx * 0.12, 2.2, dz * 0.12], [dx * 0.35, 2.0, dz * 0.35], [dx * 0.42, 1.5, dz * 0.42], [dx * 0.4, 0.95, dz * 0.4]];
        m.add(blade(rib, [0.05, 0.3, 0.28, 0.08], [-dz, 0, dx], 0.25), 0x8a7048);
      }
      // the bunch: a stalk arching out and down, hands of fruit, the bud at the end
      const bx = Math.cos(5.2), bz = Math.sin(5.2);
      rod(m, [0, 2.2, 0], [bx * 0.35, 2.15, bz * 0.35], 0.035, 0.03, 5, 0x7a8a48);
      rod(m, [bx * 0.35, 2.15, bz * 0.35], [bx * 0.45, 1.45, bz * 0.45], 0.03, 0.025, 5, 0x7a8a48);
      for (let k = 0; k < 4; k++) m.cyl(0.13 - k * 0.02, 0.14 - k * 0.02, 0.13, 7, 0x8aa04a, { p: [bx * 0.43, 2.0 - k * 0.14, bz * 0.43] });
      m.cone(0.07, 0.24, 6, 0x6a2a48, { p: [bx * 0.46, 1.32, bz * 0.46], r: [Math.PI, 0, 0] });
      break;
    }
    case 'bamboo': {
      // after Bambusa clumps: a tight base of thin culms fanning out into a fountain, the outer ones
      // leaning and arching most, leaf sprays hanging along their upper halves
      m.tint(true);
      for (let i = 0; i < (far ? 6 : 10); i++) {
        const az = i * 2.4, cx = Math.cos(az), cz = Math.sin(az);
        const rr = 0.1 + (i % 4) * 0.09, lean = 0.04 + (i % 4) * 0.075;
        const H = 8 + ((i * 7) % 5) * 0.6;
        const pts: V3[] = [[cx * rr, 0, cz * rr]];
        for (let k = 1; k <= 4; k++) {
          const a = lean * (1 + k * 0.65), p = pts[k - 1], seg = H / 4;
          pts.push([p[0] + cx * Math.sin(a) * seg, p[1] + Math.cos(a) * seg, p[2] + cz * Math.sin(a) * seg]);
        }
        for (let k = 0; k < 4; k++) rod(m, pts[k], pts[k + 1], 0.08 - k * 0.012, 0.068 - k * 0.012, 5, i % 3 ? 0xd8dca0 : 0xc8d48a);
        // leaf plumes off the upper nodes and the drooping tip: long fronds with saw-toothed edges,
        // so each reads as a spray of many leaves; they arch out along the culm's lean and hang
        const plumes = [[1, 0.9, 1.5], [2, 0.3, 1.7], [2, 0.8, 1.9], [3, 0.2, 2.0], [3, 0.6, 2.1], [3, 1, 2.3]] as const;
        // far away: fewer, bigger plumes keep the clump's mass at a third of the triangles
        for (const [k, f, L] of far ? ([[2, 0.6, 2.4], [3, 0.5, 2.6], [3, 1, 2.8]] as const) : plumes) {
          const a = pts[k], b = pts[k + 1];
          const q: V3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
          const fa = az + (f === 1 ? 0 : (k + f * 3) * 1.3), fx = Math.cos(fa), fz = Math.sin(fa);
          const rib: V3[] = [], w: number[] = [];
          for (let j = 0; j <= 7; j++) {
            const t = j / 7;
            rib.push([q[0] + fx * L * t, q[1] + L * (0.35 * t - 0.75 * t * t), q[2] + fz * L * t]);
            w.push(j === 0 || j === 7 ? 0 : (j % 2 ? 0.8 : 0.35) * (1 - t * 0.35));
          }
          // tilt each plume's plane so the clump has body from every side, not edge-on slivers
          const tilt = 0.5 + ((i * 3 + k * 5 + f * 7) % 4) * 0.25;
          m.add(blade(rib, w, [-fz * Math.cos(tilt), Math.sin(tilt), fx * Math.cos(tilt)]), (i + k) % 2 ? 0xffffff : 0xe8eedc);
        }
      }
      break;
    }
    case 'crop': {
      // a grain tuft (wheat or paddy, by the biome's tint): narrow blades arching out of the base,
      // and a few stalks carrying pale spindle-shaped ears
      m.tint(true);
      for (let i = 0; i < 9; i++) {
        const az = i * 2.4 + 0.3, dx = Math.cos(az), dz = Math.sin(az);
        const lean = 0.16 + (i % 3) * 0.13, L = 0.62 + (i % 4) * 0.1;
        const rib: V3[] = [0, 0.55, 1].map((t): V3 => {
          const a = lean * (1 + t), r = 0.04 + L * t * Math.sin(a);
          return [dx * r, L * t * Math.cos(a), dz * r];
        });
        m.add(blade(rib, [0.075, 0.065, 0], [-dz, 0, dx]), i % 2 ? 0xffffff : 0xe2e8d0);
      }
      for (let i = 0; i < 7; i++) {
        const az = i * 0.9 + 1, dx = Math.cos(az), dz = Math.sin(az), h = 0.82 + (i % 3) * 0.08;
        const tip: V3 = [dx * 0.12, h, dz * 0.12];
        m.add(blade([[dx * 0.03, 0, dz * 0.03], tip], [0.018, 0.012], [-dz, 0, dx]), 0xe8e8c8);
        m.add(new THREE.OctahedronGeometry(1, 0), 0xfff6d8, { p: [tip[0] + dx * 0.02, h + 0.09, tip[2] + dz * 0.02], r: [dz * 0.25, 0, -dx * 0.25], s: [0.026, 0.12, 0.026] });
      }
      break;
    }
  }
  return m.build();
}

/**
 * A leaf or blade: a strip along the midrib points `rib` (base to tip) with full width `w[i]` at each
 * point, spread across the horizontal direction `side`. With `fold`, the two halves drop below the
 * midrib by fold × half-width (a ridged leaf); without, it is one flat strip. Both faces are built,
 * since the vegetation materials are single-sided.
 */
function blade(rib: V3[], w: number[], side: V3, fold = 0): THREE.BufferGeometry {
  const s = new THREE.Vector3(...side).normalize();
  const C: THREE.Vector3[] = [], Lf: THREE.Vector3[] = [], Rt: THREE.Vector3[] = [];
  const t = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < rib.length; i++) {
    const c = new THREE.Vector3(...rib[i]);
    t.set(...rib[Math.min(i + 1, rib.length - 1)]).sub(n.set(...rib[Math.max(i - 1, 0)])).normalize();
    n.crossVectors(s, t).normalize();
    if (n.y < 0) n.negate();
    const h = w[i] / 2;
    C.push(c);
    Lf.push(c.clone().addScaledVector(s, -h).addScaledVector(n, -fold * h));
    Rt.push(c.clone().addScaledVector(s, h).addScaledVector(n, -fold * h));
  }
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
  for (let i = 0; i + 1 < rib.length; i++) {
    const open = w[i] > 0, close = w[i + 1] > 0;
    if (fold) {
      for (const E of [Lf, Rt]) {
        if (open) tri(C[i], E[i], E[i + 1]);
        if (close) tri(C[i], E[i + 1], C[i + 1]);
      }
    } else {
      if (open) tri(Lf[i], Rt[i], close ? Rt[i + 1] : C[i + 1]);
      if (close) tri(Lf[i], close ? Rt[i + 1] : C[i + 1], Lf[i + 1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** A needle tuft: an icosahedron with its corners pushed in and out, so the outline is ragged. */
function tuft(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  const bump = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!bump.has(key)) bump.set(key, 0.75 + (((seed * 7 + bump.size * 13) % 9) / 9) * 0.55);
    const k = bump.get(key)!;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  return g;
}

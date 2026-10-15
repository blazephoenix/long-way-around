// Seeded simplex noise (2D) and smooth gradient noise (1D).
import { mulberry32 } from './prng';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD2 = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);

export class Noise {
  private perm = new Uint8Array(512);
  private permMod8 = new Uint8Array(512);
  private g1 = new Float32Array(256);

  constructor(seed: number) {
    const r = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod8[i] = this.perm[i] & 7;
    }
    for (let i = 0; i < 256; i++) this.g1[i] = r() * 2 - 1;
  }

  /** 2D simplex noise in roughly [-1, 1]. */
  n2(xin: number, yin: number): number {
    const perm = this.perm;
    const pm = this.permMod8;
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    let i1: number, j1: number;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = pm[ii + perm[jj]] * 2;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD2[g] * x0 + GRAD2[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = pm[ii + i1 + perm[jj + j1]] * 2;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD2[g] * x1 + GRAD2[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = pm[ii + 1 + perm[jj + 1]] * 2;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD2[g] * x2 + GRAD2[g + 1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  /** fBm built on n2. Returns roughly [-1, 1]. */
  fbm(x: number, y: number, oct = 4, lac = 2, gain = 0.5): number {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += a * this.n2(x * f, y * f);
      norm += a;
      a *= gain;
      f *= lac;
    }
    return sum / norm;
  }

  /** Ridged fbm in [0,1]. */
  ridged(x: number, y: number, oct = 4): number {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      const n = 1 - Math.abs(this.n2(x * f, y * f));
      sum += a * n * n;
      norm += a;
      a *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  /** Smooth 1D gradient noise in roughly [-1,1], C1 continuous (quintic fade). */
  n1(x: number): number {
    const i = Math.floor(x);
    const f = x - i;
    const g0 = this.g1[this.perm[i & 255]];
    const g1 = this.g1[this.perm[(i + 1) & 255]];
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    const v0 = g0 * f;
    const v1 = g1 * (f - 1);
    return (v0 + (v1 - v0) * u) * 2;
  }

  /** Derivative of n1 w.r.t. x (analytic). */
  dn1(x: number): number {
    const i = Math.floor(x);
    const f = x - i;
    const g0 = this.g1[this.perm[i & 255]];
    const g1 = this.g1[this.perm[(i + 1) & 255]];
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    const du = 30 * f * f * (f - 1) * (f - 1);
    const v0 = g0 * f;
    const v1 = g1 * (f - 1);
    return (g0 + (g1 - g0) * u + (v1 - v0) * du) * 2;
  }
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

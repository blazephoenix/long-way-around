// Seeded randomness. Everything generated in the world flows from these helpers,
// so the same seed string always yields the same road, terrain, stops and subjects.

/** 32-bit string hash (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** splitmix32 finaliser: good avalanche for integer hashing. */
export function mix32(x: number): number {
  x |= 0;
  x = (x + 0x9e3779b9) | 0;
  let z = x;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** Hash any number of integers together. Used to derive sub-seeds: hash(seed, system, index). */
export function hashInts(...xs: number[]): number {
  let h = 0x2545f491;
  for (const x of xs) h = mix32(h ^ mix32(Math.floor(x) | 0));
  return h >>> 0;
}

/** Deterministic float in [0,1) from integers. */
export function hash01(...xs: number[]): number {
  return hashInts(...xs) / 4294967296;
}

/** mulberry32 generator. */
/**
 * The i-th entry of a pool, stepping through it in a scrambled but fixed order: consecutive i never
 * repeat until the whole pool has been used. offset varies the starting point.
 */
export function cycle<T>(pool: readonly T[], i: number, offset = 0): T {
  const n = pool.length;
  let step = 1;
  for (const c of [7, 5, 3, 2]) if (n % c !== 0 && c < n) { step = c; break; }
  return pool[(((offset + i * step) % n) + n) % n];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

/** Sub-system ids so each system's randomness is independent. */
export const SYS = {
  road: 1,
  biome: 2,
  terrain: 3,
  lake: 4,
  branch: 5,
  stop: 6,
  veg: 7,
  landmark: 8,
  subject: 9,
  weather: 10,
  life: 11,
  river: 12,
  radio: 13,
  india: 14,
  hitch: 15,
  name: 16,
} as const;

const ALPH = 'abcdefghjkmnpqrstuvwxyz23456789';
export function randomSeedString(): string {
  let s = '';
  const r = Math.random;
  for (let i = 0; i < 8; i++) s += ALPH[Math.floor(r() * ALPH.length)];
  return s;
}

// Water surface meshes as plain typed arrays (worker-safe: no Three.js). Every vertex carries the
// water depth under it (level − ground), which the water shader turns into shallow-to-deep colour
// bands, shoreline foam and wave damping. Triangles with all three corners on dry ground are dropped.

export interface WaterArrays {
  positions: Float32Array;
  depth: Float32Array;
  index: Uint32Array;
}

/** a corner this far above the water line still counts, so the surface tucks under the bank */
const DRY = 0.6;

function finish(pos: number[], depth: number[], tris: number[]): WaterArrays | null {
  const index: number[] = [];
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2];
    if (depth[a] < -DRY && depth[b] < -DRY && depth[c] < -DRY) continue;
    index.push(a, b, c);
  }
  if (!index.length) return null;
  return { positions: new Float32Array(pos), depth: new Float32Array(depth), index: new Uint32Array(index) };
}

/**
 * Square grid at `level` (sea tiles). ground(i, j) returns the ground height at grid vertex (i, j),
 * so callers that already sampled the terrain can pass their heights through.
 */
export function gridWater(x0: number, z0: number, size: number, segs: number, level: number, ground: (i: number, j: number) => number): WaterArrays | null {
  const V = segs + 1, step = size / segs;
  const pos: number[] = [], depth: number[] = [], tris: number[] = [];
  for (let j = 0; j < V; j++)
    for (let i = 0; i < V; i++) {
      pos.push(x0 + i * step, level, z0 + j * step);
      depth.push(level - ground(i, j));
    }
  for (let j = 0; j < segs; j++)
    for (let i = 0; i < segs; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      tris.push(a, c, b, b, c, d);
    }
  return finish(pos, depth, tris);
}

/** Disc at `level` (lakes): a centre vertex and rings out to radius r. */
export function discWater(cx: number, cz: number, r: number, level: number, ground: (x: number, z: number) => number, rings: number, segs: number): WaterArrays | null {
  const pos: number[] = [cx, level, cz], depth: number[] = [level - ground(cx, cz)], tris: number[] = [];
  for (let k = 1; k <= rings; k++) {
    const rr = (r * k) / rings;
    for (let s = 0; s < segs; s++) {
      // stagger alternate rings so the facets are triangles of similar size, not slivers
      const a = ((s + (k % 2) * 0.5) / segs) * Math.PI * 2;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      pos.push(x, level, z);
      depth.push(level - ground(x, z));
    }
  }
  const ring = (k: number, s: number) => (k === 0 ? 0 : 1 + (k - 1) * segs + (((s % segs) + segs) % segs));
  for (let s = 0; s < segs; s++) tris.push(0, ring(1, s + 1), ring(1, s));
  for (let k = 1; k < rings; k++) {
    // odd rings sit half a step ahead of even ones: pair each inner edge with the outer vertex between
    const shift = k % 2;
    for (let s = 0; s < segs; s++) {
      const a = ring(k, s), b = ring(k, s + 1), c = ring(k + 1, s + shift), d = ring(k + 1, s + shift - 1);
      tris.push(a, b, c, a, c, d);
    }
  }
  return finish(pos, depth, tris);
}

/**
 * Strip at `level` (rivers): rows of [xa, za, xb, zb] bank-to-bank segments in order along the
 * river, each split into `across` pieces.
 */
export function stripWater(rows: number[][], across: number, level: number, ground: (x: number, z: number) => number): WaterArrays | null {
  const pos: number[] = [], depth: number[] = [], tris: number[] = [];
  const W = across + 1;
  for (const [xa, za, xb, zb] of rows)
    for (let i = 0; i < W; i++) {
      const t = i / across;
      const x = xa + (xb - xa) * t, z = za + (zb - za) * t;
      pos.push(x, level, z);
      depth.push(level - ground(x, z));
    }
  for (let r = 0; r + 1 < rows.length; r++)
    for (let i = 0; i < across; i++) {
      const a = r * W + i, b = a + 1, c = a + W, d = c + 1;
      tris.push(a, b, c, b, d, c);
    }
  return finish(pos, depth, tris);
}

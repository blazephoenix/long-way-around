import { describe, it, expect } from 'vitest';
import { World, CHUNK } from '../src/world/world';
import { buildTile } from '../src/world/tilegen';
import { BIOMES } from '../data/biomes';
import { chunkSites, chunkStops } from '../src/world/sites';

function snapshot(w: World) {
  const out: number[] = [];
  for (let s = -500; s < 30000; s += 137) {
    const r = w.road(s);
    out.push(r.x, r.y, r.slope);
  }
  for (let i = 0; i < 200; i++) out.push(w.height(i * 31.7 - 3000, i * 97.3));
  return out;
}

describe('determinism', () => {
  it('same seed → identical road points and terrain', () => {
    const a = new World('lantern');
    const b = new World('lantern');
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it('different seed → different road', () => {
    expect(snapshot(new World('lantern'))).not.toEqual(snapshot(new World('monsoon')));
  });

  it('query order does not change results (chunks regenerate identically)', () => {
    const a = new World('chai');
    const b = new World('chai');
    // walk a forward, b backward
    const fa: number[] = [], fb: number[] = [];
    for (let c = 0; c < 40; c++) { const f = a.chunkFeatures(c); fa[c] = f.lakes.length * 1000 + (f.branch ? f.branch.pts.length : 0) + (f.river ? 7 : 0); }
    for (let c = 39; c >= 0; c--) { const f = b.chunkFeatures(c); fb[c] = f.lakes.length * 1000 + (f.branch ? f.branch.pts.length : 0) + (f.river ? 7 : 0); }
    expect(fa).toEqual(fb);
    expect(a.height(120, 3000)).toBe(b.height(120, 3000));
  });

  it('chunk contents (tile mesh + vegetation) are identical', () => {
    const a = buildTile(new World('kite'), { ix: 0, iz: 2, lod: 1, veg: 2, density: 1 });
    const b = buildTile(new World('kite'), { ix: 0, iz: 2, lod: 1, veg: 2, density: 1 });
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(a.vegTypes).toEqual(b.vegTypes);
    expect(a.vegData.map((d) => Array.from(d))).toEqual(b.vegData.map((d) => Array.from(d)));
  });

  it('biome sequence respects adjacency and lengths', () => {
    const w = new World('atlas');

    for (let k = 1; k < 60; k++) {
      const prev = w.biomeOfSeg(k - 1), cur = w.biomeOfSeg(k);
      expect(prev).not.toBe(cur);
      expect(BIOMES[prev].adjacency[cur]).toBeGreaterThan(0);
      const len = w.segStart(k + 1) - w.segStart(k);
      expect(len).toBeGreaterThanOrEqual(4000);
      expect(len).toBeLessThanOrEqual(10000);
    }
  });

  it('road stays drivable: bounded grade and curvature', () => {
    const w = new World('ghat');
    let maxGrade = 0, minR = Infinity;
    for (let s = 0; s < 60000; s += 5) {
      const r = w.road(s);
      maxGrade = Math.max(maxGrade, Math.abs(r.grade) * r.cosA);
      const r2 = w.road(s + 5);
      const dth = Math.abs(Math.atan(r2.slope) - Math.atan(r.slope));
      const ds = 5 / r.cosA;
      if (dth > 1e-6) minR = Math.min(minR, ds / dth);
    }
    expect(maxGrade).toBeLessThan(0.09);
    expect(minR).toBeGreaterThan(70);
    console.log('max grade', maxGrade.toFixed(3), 'min radius', minR.toFixed(0), 'm');
  });

  it('tile generation performance', () => {
    const w = new World('perf');
    const t0 = performance.now();
    buildTile(w, { ix: 0, iz: 1, lod: 0, veg: 2, density: 1 });
    const t1 = performance.now();
    console.log('lod0 tile with vegetation', (t1 - t0).toFixed(0), 'ms', 'chunk', CHUNK);
    expect(t1 - t0).toBeLessThan(3000);
  });

  it('stops and landmarks are identical regardless of query order', () => {
    const a = new World('dhaba'), b = new World('dhaba');
    const key = (w: World, c: number) => chunkSites(w, c).map((s) => `${s.id}@${s.x.toFixed(2)},${s.z.toFixed(2)}`).join('|');
    const fa: string[] = [], fb: string[] = [];
    for (let c = 0; c < 120; c++) fa[c] = key(a, c);
    for (let c = 119; c >= 0; c--) fb[c] = key(b, c);
    expect(fa).toEqual(fb);
  });

  it('gas stations every 4-7 km', () => {
    const w = new World('fuel');
    const gas: number[] = [];
    for (let c = 0; c < 600; c++) for (const s of chunkStops(w, c)) if (s.kind === 'gas') gas.push(s.s);
    const gaps = gas.slice(1).map((g, i) => g - gas[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(3900);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(7300);
  });
});

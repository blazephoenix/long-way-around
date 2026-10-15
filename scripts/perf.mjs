// Performance log: per biome, CPU time per frame (simulation vs render submission), draw calls,
// triangles, and the worst road-chunk build time. GPU time is not measurable here (software GL).
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rows = [];
for (const q of (process.env.QS ?? 'medium,low,high').split(',')) for (const b of (process.env.BS ?? (q === 'medium' ? 'forest,coast,desert,farm,tropical,city' : 'tropical,city')).split(',')) {
  if (process.env.V) console.log("start", q, b, new Date().toISOString());
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`http://localhost:4173/?seed=lantern&play&auto&hour=17&q=${q}`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate((b) => { const g = window.__game; g.stop(); g.spawnAt(g.findBiome(b) + 500); g.simulate(4, 20); }, b);
  for (let i = 0; i < 30; i++) { const n = await page.evaluate(() => { const g = window.__game; g.tick(1/30, false); return g.streamer.tilesPending; }); if (n === 0) break; await page.waitForTimeout(300); }
  if (process.env.V) console.log("tiles ready", new Date().toISOString());
  const r = await page.evaluate(() => {
    const g = window.__game;
    const sim = [], ren = [];
    for (let i = 0; i < 12; i++) {
      const a = performance.now(); g.tick(1/60, false); const b = performance.now();
      g.tick(1/60, true); const c = performance.now();
      sim.push(b - a); ren.push(c - b - (b - a));
    }
    // worst chunk build on the main thread
    let worst = 0, total = 0;
    const c0 = Math.floor(g.car.pos.z / 250);
    for (let c = c0 + 10; c < c0 + 16; c++) {
      const it = window.__chunkGen(g.world, c, g.streamer.extra);
      let tot = 0;
      for (;;) { const a = performance.now(); const r = it.next(); const d = performance.now() - a; worst = Math.max(worst, d); tot += d; if (r.done) break; }
      total = Math.max(total, tot);
    }
    worst = worst.toFixed(1) + ' ms slice, ' + total.toFixed(0) + ' ms total';
    const med = (x) => { x.sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
    g.tick(1/60, true);
    return { sim: med(sim).toFixed(2), render: med(ren).toFixed(2), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, chunk: worst, veg: [...g.scene.children].filter((o) => o.isInstancedMesh).reduce((a, o) => a + o.count, 0) };
  });
  rows.push(`${q.padEnd(6)} ${b.padEnd(9)} sim ${r.sim.padStart(5)} ms  render-submit ${r.render.padStart(6)} ms  draw calls ${String(r.calls).padStart(4)}  tris ${(r.tris / 1000).toFixed(0).padStart(5)}k  instances ${String(r.veg).padStart(6)}  worst chunk build ${r.chunk}`);
  console.log(rows[rows.length - 1]);
  await page.close();
}
fs.writeFileSync(out, '# 1920x1080, software GL (SwiftShader): CPU timings are meaningful, GPU time is not.\n' + rows.join('\n') + '\n');
await browser.close();

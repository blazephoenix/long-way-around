import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://localhost:4173/?seed=lantern&play&q=medium&hour=17', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.evaluate((b) => { const g = window.__game; g.stop(); g.spawnAt(g.findBiome(b) + 500); }, process.argv[2] ?? 'farm');
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const slices = await page.evaluate(() => {
  const g = window.__game; const out = [];
  const c0 = Math.floor(g.car.pos.z / 250);
  for (let c = c0 + 10; c < c0 + 16; c++) {
    const it = window.__chunkGen(g.world, c, g.streamer.extra);
    let i = 0;
    for (;;) { const a = performance.now(); const r = it.next(); const d = performance.now() - a; if (d > 20) out.push(`chunk ${c} slice ${i}: ${d.toFixed(0)} ms`); i++; if (r.done) break; }
  }
  return out;
});
const { profile } = await cdp.send('Profiler.stop');
console.log(slices.join('\n'));
// self time per function
const self = new Map();
const total = profile.samples.length;
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const counts = new Map();
for (const s of profile.samples) counts.set(s, (counts.get(s) ?? 0) + 1);
for (const [id, n] of counts) { const node = byId.get(id); const k = `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + n); }
console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${(100 * v / total).toFixed(1)}% ${k}`).join('\n'));
await browser.close();

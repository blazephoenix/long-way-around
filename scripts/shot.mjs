// Headless screenshots + FPS log. Usage: node scripts/shot.mjs <outdir> "<query>|<name>|<waitMs>|<js>" ...
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const logs = [];
for (const spec of process.argv.slice(3)) {
  const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 960), height: Number(process.env.H ?? 540) } });
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const [q, name, wait, js] = spec.split('|');
  await page.goto(base + '?' + q, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const sim = Number(wait || 0);
  const t0 = Date.now();
  if (js) await page.evaluate(js);
  if (sim > 0) await page.evaluate((s) => { const g = window.__game; g.stop(); g.simulate(s, 20); }, sim);
  // let worker tiles arrive, then render a few real frames and time them
  let pend = -1;
  for (let i = 0; i < 30; i++) { pend = await page.evaluate(() => { const g = window.__game; g.tick(1/60, false); return g.streamer.tilesPending; }); if (pend === 0) break; await page.waitForTimeout(300); }
  console.log(name, 'pending', pend);
  await page.waitForTimeout(800);
  const perf = await page.evaluate(() => { const g = window.__game; g.stop(); const ts = []; for (let i = 0; i < 6; i++) { const a = performance.now(); g.tick(1/60); g.renderer.getContext().finish(); ts.push(performance.now() - a); } ts.sort((a,b)=>a-b); return { cpuMs: ts[3].toFixed(1) }; });
  console.log(name, 'sim', ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(perf));
  const info = await page.evaluate(() => { const g = window.__game; return g ? { fps: g.fps.toFixed(1), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, kmh: g.car.kmh.toFixed(0), z: g.car.pos.z.toFixed(0), hour: g.hour.toFixed(2), biome: g.biome.id, tiles: g.streamer.readyTiles } : null; });
  const url = await page.evaluate(() => { const g = window.__game; g.tick(1/60, true); return g.renderer.domElement.toDataURL('image/png'); });
  fs.writeFileSync(`${out}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(name, JSON.stringify(info));
  await page.close();
}
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 30).join('\n'));
await browser.close();

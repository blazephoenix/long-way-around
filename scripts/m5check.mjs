import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const logs = [];
async function open(q) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto('http://localhost:4173/?' + q, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__game.stop());
  return page;
}
async function settle(page) { for (let i = 0; i < 30; i++) { const n = await page.evaluate(() => { const g = window.__game; g.tick(1/30, false); return g.streamer.tilesPending; }); if (n === 0) break; await page.waitForTimeout(300); } }
async function snap(page, name) { const u = await page.evaluate(() => { const g = window.__game; g.tick(1/60, true); return g.renderer.domElement.toDataURL('image/png'); }); fs.writeFileSync(`${out}/${name}.png`, Buffer.from(u.split(',')[1], 'base64')); }

// city traffic + pedestrians
let p = await open('seed=lantern&play&q=medium&hour=11&auto');
await p.evaluate(() => { const g = window.__game; g.spawnAt(g.findBiome('city') + 300); g.simulate(12, 20); });
await settle(p);
console.log('city', await p.evaluate(() => { const g = window.__game; return { vehicles: g.life.traffic.vehicles.map((v) => v.kind).join(','), peds: g.life.people['walkers'].size, staff: g.life.people.staff.size }; }));
await snap(p, 'city');
await p.close();

// farm traffic
p = await open('seed=lantern&play&q=medium&hour=9&auto');
await p.evaluate(() => { const g = window.__game; g.spawnAt(g.findBiome('farm') + 300); g.simulate(15, 20); });
await settle(p);
await snap(p, 'farm');
console.log('farm', await p.evaluate(() => window.__game.life.traffic.vehicles.map((v) => v.kind + ':' + v.speed.toFixed(0)).join(',')));
await p.close();

// gas station staff + hitchhiker flow
p = await open('seed=lantern&play&q=low&hour=10');
const hit = await p.evaluate(() => {
  const g = window.__game;
  const W = g.world;
  let c = 4; let found = null;
  for (; c < 3000 && !found; c++) {
    // replicate the spot rule by asking People
    g.spawnAt(c * 250 + 125);
    g.life.people['refresh'](g.car.pos);
    if (g.life.people.waiting) found = g.life.people.waiting;
  }
  if (!found) return 'no hitch found';
  const r = W.road(found.s - 6);
  g.car.place(r.x + r.nx * 1.85, r.z + r.nz * 1.85, Math.atan2(-r.tx, -r.tz));
  g.tick(1/30, false);
  return { name: found.hitcher.name, prompt: g.prompt };
});
console.log('hitch', JSON.stringify(hit));
await p.keyboard.press('KeyF');
await p.evaluate(() => window.__game.tick(1/30, false));
console.log('riding', await p.evaluate(() => { const g = window.__game; const r = g.life.people.riding; return r ? r.hitcher.name + ' ' + (r.rideM / 1000).toFixed(1) + 'km' : 'no'; }));
await p.evaluate(() => { const g = window.__game; g.car.odometer += g.life.people.riding.rideM + 10; for (let i = 0; i < 3; i++) g.tick(1/30, false); });
console.log('done', await p.evaluate(() => { const g = window.__game; return { done: g.life.people.riding.done, tip: g.player.d.marks.filter((m) => m.kind === 'tip').map((m) => m.label), prompt: g.prompt }; }));
await p.keyboard.press('KeyF');
await p.evaluate(() => window.__game.tick(1/30, false));
console.log('after drop', await p.evaluate(() => !!window.__game.life.people.riding));
await p.close();
console.log(logs.filter((l) => !l.includes('GPU stall') && !l.includes('WebGL')).slice(0, 20).join('\n'));
await browser.close();

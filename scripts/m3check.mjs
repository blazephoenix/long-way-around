import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:4173/?seed=lantern&play&q=low&hour=17', { waitUntil: 'load' });
await page.waitForTimeout(3000);
const r1 = await page.evaluate(async () => {
  const g = window.__game; g.stop();
  const { chunkStops } = { chunkStops: null };
  // find first gas station via world: scan chunks
  let site = null;
  for (let c = 0; c < 200 && !site; c++) { g.streamer.ensureChunks(c * 250); }
  return true;
});
// locate gas via sites module exposed on game.stops
const info = await page.evaluate(() => {
  const g = window.__game;
  let found = null;
  for (let z = 0; z < 40000 && !found; z += 250) { for (const s of g.stops.nearbySites(0, z)) if (s.kind === 'gas') { found = s; break; } }
  g.spawnAt(found.s - 30);
  // place car on the pad near the pumps
  const pts = g.stops.points.length;
  g.car.place(found.x + Math.sin(found.heading) * 0, found.z, found.heading + Math.PI / 2);
  g.car.fuel = 0.3;
  for (let i = 0; i < 10; i++) g.tick(1 / 30, false);
  return { s: found.s, id: found.id, x: found.x, z: found.z, pts, kind: found.kind, cur: g.stops.current && g.stops.current.id };
});
console.log('gas', JSON.stringify(info));
// exit car
await page.keyboard.press('KeyF');
await page.evaluate(() => window.__game.tick(1 / 30, false));
const st = await page.evaluate(() => { const g = window.__game; return { mode: g.mode, prompt: g.prompt, pts: g.stops.points.map((p) => p.kind + '@' + Math.hypot(p.x - g.walker.pos.x, p.z - g.walker.pos.z).toFixed(1)) }; });
console.log('after exit', JSON.stringify(st));
// teleport walker next to pump and interact
await page.evaluate(() => { const g = window.__game; const p = g.stops.points.find((q) => q.kind === 'pump'); g.walker.place(p.x + 0.5, p.z, g.walker.yaw); g.tick(1 / 30, false); });
console.log('prompt at pump', await page.evaluate(() => window.__game.prompt));
await page.keyboard.press('KeyF');
await page.evaluate(() => window.__game.tick(1 / 30, false));
await page.waitForTimeout(300);
const fillBtn = await page.$('#btn-fill');
console.log('fill button', !!fillBtn, fillBtn ? await fillBtn.textContent() : '');
if (fillBtn) await fillBtn.click();
console.log('after fill', await page.evaluate(() => { const g = window.__game; return { fuel: g.car.fuel.toFixed(2), money: g.player.money }; }));
await page.evaluate(() => { const g = window.__game; g.tick(1/60, true); });
await page.screenshot({ path: out + '/pump.png', timeout: 60000 });
await page.click('#panel-close');
// shop
await page.evaluate(() => { const g = window.__game; const p = g.stops.points.find((q) => q.kind === 'shop'); g.walker.place(p.x, p.z, g.walker.yaw); g.tick(1 / 30, false); g.onInteract(p); });
await page.waitForTimeout(300);
await page.click('#btn-film');
console.log('after film', await page.evaluate(() => { const g = window.__game; return { shots: g.player.shots, money: g.player.money }; }));
await page.evaluate(() => { const g = window.__game; g.tick(1/60, true); });
await page.screenshot({ path: out + '/shop.png', timeout: 60000 });
await page.click('#panel-close');
// atlas
await page.evaluate(() => { const g = window.__game; g.player.logDrive(0); g.player.logDrive(g.car.pos.z); window.__app.openAtlas(); });
await page.waitForTimeout(400);
await page.screenshot({ path: out + '/atlas.png', timeout: 60000 });
await page.click('#atlas-close');
// save + reload + continue
await page.evaluate(() => window.__game.save());
await page.waitForTimeout(500);
await page.goto('http://localhost:4173/?seed=other&q=low', { waitUntil: 'load' });
await page.waitForTimeout(2500);
const cont = await page.evaluate(() => !document.getElementById('btn-continue').disabled);
console.log('continue enabled', cont);
await page.click('#btn-continue');
await page.waitForTimeout(1500);
console.log('restored', await page.evaluate(() => { const g = window.__game; return { seed: g.world.seedStr, fuel: g.car.fuel.toFixed(2), money: g.player.money, shots: g.player.shots, mode: g.mode }; }));
console.log(logs.filter((l) => !l.includes('GPU stall') && !l.includes('WebGL')).slice(0, 20).join('\n'));
await browser.close();

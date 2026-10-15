import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:4173/?' + (process.argv[2] ?? 'seed=lantern&play&auto&q=low'), { waitUntil: 'load' });
await page.waitForTimeout(4000);
const r = await page.evaluate(() => {
  const g = window.__game; g.stop();
  const out = [];
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); g.tick(1/30); const t1 = performance.now(); g.renderer.getContext().finish(); out.push((performance.now() - t0).toFixed(0) + '/' + (t1-t0).toFixed(0)); }
  return { out, gl: g.renderer.getContext().getParameter(g.renderer.getContext().VERSION), tiles: g.streamer.readyTiles };
});
console.log(JSON.stringify(r));
await browser.close();

import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:4173/?seed=lantern&play&q=low&hour=9&auto', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.mouse.click(300, 200);
await page.waitForTimeout(500);
const res = await page.evaluate(async () => {
  const app = window.__app; const A = app.audio; A.start(); A.bind(app.game);
  await A.ctx.resume();
  const an = A.ctx.createAnalyser(); an.fftSize = 2048; A.master.connect(an);
  const rms = () => { const d = new Float32Array(2048); an.getFloatTimeDomainData(d); let s = 0, pk = 0; for (const v of d) { s += v * v; pk = Math.max(pk, Math.abs(v)); } return [Math.sqrt(s / d.length), pk]; };
  const out = {};
  window.__features.india = true;
  for (const sname of ['lofi', 'ambient', 'night', 'raga', 'static']) {
    A.radio.setStation(sname);
    let acc = 0, peak = 0, n = 0;
    for (let i = 0; i < 25; i++) { await new Promise((r) => setTimeout(r, 200)); const [r, p] = rms(); acc += r; peak = Math.max(peak, p); n++; }
    out[sname] = { rms: (acc / n).toFixed(3), peak: peak.toFixed(2) };
  }
  return { state: A.ctx.state, out, name: app.game.radioName };
});
console.log(JSON.stringify(res, null, 1));
console.log(logs.filter((l) => !l.includes('GPU stall') && !l.includes('WebGL')).slice(0, 20).join('\n'));
await browser.close();

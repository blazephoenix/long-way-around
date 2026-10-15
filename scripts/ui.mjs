// UI screenshot (DOM included). Stops the render loop first so the compositor can capture.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const [out, q, js, wait] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:4173/?' + q, { waitUntil: 'load' });
await page.waitForTimeout(Number(wait ?? 4000));
if (js) await page.evaluate(js);
await page.waitForTimeout(600);
await page.evaluate(() => { const g = window.__game; g.stop(); g.renderer.setAnimationLoop(null); });
await page.evaluate(() => new Promise((r) => { const g = window.__game; g.renderer.domElement.getContext('webgl2'); r(); }));
await page.waitForTimeout(300);
await page.screenshot({ path: out, timeout: 90000 });
console.log(logs.slice(0, 20).join('\n'));
await browser.close();

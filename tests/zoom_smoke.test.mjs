// Browser smoke test for ZOOM: boots the real page, starts it, drives a few
// inputs through the same override the touch layer uses, and checks the canvas
// actually drew something and nothing threw.
//
//     node tests/zoom_smoke.test.mjs
//
// Uses the preinstalled Chromium; skips politely if playwright is missing.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.ZOOM_SMOKE_PORT ?? 8322);
const BASE = `http://127.0.0.1:${PORT}`;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('playwright is not installed — skipping the ZOOM browser smoke test.');
  process.exit(0);
}

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? `  (${detail})` : ''}`); }
}

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '-d', join(ROOT, 'zoom')], { stdio: 'ignore' });
async function up() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
async function done(code) { server.kill('SIGTERM'); process.exit(code); }

console.log('ZOOM in a browser');
if (!(await up())) { console.log('  FAIL server did not start'); await done(1); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/index.html`);
await page.waitForFunction('window.__zoom');
check('title card is showing', await page.evaluate(`document.getElementById('title').classList.contains('on')`));
await page.click('#start');
check('start hides the title', !(await page.evaluate(`document.getElementById('title').classList.contains('on')`)));

const x0 = await page.evaluate('window.__zoom.g.p.x');
await page.evaluate(`window.__zoom.setInput(() => ({ mx: 1 }))`);
await page.waitForTimeout(700);
await page.evaluate(`window.__zoom.setInput(null)`);
const x1 = await page.evaluate('window.__zoom.g.p.x');
check('the dog runs when told to', x1 > x0 + 60, `${x0.toFixed(0)} -> ${x1.toFixed(0)}`);

const lit = await page.evaluate(`(() => {
  const c = document.getElementById('stage');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let bright = 0;
  for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 120) bright++;
  return bright;
})()`);
check('the canvas actually drew something', lit > 20, `bright samples: ${lit}`);

// stand in a few of the harder-to-render states and make sure nothing throws
await page.evaluate(`(() => {
  const g = window.__zoom.g;
  g.p.mouth = 'TEETH'; g.p.haul = 'STATIC';
  g.p.x = 5000; g.p.y = 588; g.flags.sealed = true; g.L.seal.on = true; g.frameRipped = true;
  g.notice = 100; g.chase.state = 'hunt'; g.chase.lid = 1; g.chase.E = { x: 5100, y: -290 };
  g.bubbles.push({ x: 5050, y: 560, r: 150, t: 5, max: 5 });
  g.windows.push({ x: 4950, y: 560, r: 165, t: 10 });
  g.teeth.push({ rect: { x: 5030, y: 586, w: 60, h: 14 }, face: 'top', t: 1, life: Infinity });
  g.aim = { t: 0.5, elev: 0.6, power: 0.7 };
})()`);
await page.waitForTimeout(700);
await page.evaluate(`window.__zoom.g.k = 1`);
await page.waitForTimeout(700);
check('chase, roll, static and windows render without errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
await done(failed ? 1 : 0);

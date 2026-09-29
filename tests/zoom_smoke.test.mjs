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

// ---- wing two boots too, and the wear key does something
{
  const p2 = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  p2.on('console', (m) => { if (m.type() === 'error') errs2.push(m.text()); });
  await p2.goto(`${BASE}/index.html?wing=2`);
  await p2.waitForFunction('window.__zoom');
  await p2.click('#start');
  check('?wing=2 boots the stomach', await p2.evaluate('window.__zoom.g.wing') === 2);
  await p2.evaluate(`(() => { const g = window.__zoom.g; g.p.mouth = 'BORED'; })()`);
  await p2.keyboard.down('KeyV');
  await p2.waitForTimeout(120);
  await p2.keyboard.up('KeyV');
  await p2.waitForTimeout(150);
  check('V wears the Law in your mouth', await p2.evaluate('window.__zoom.g.p.worn') === 'BORED');
  await p2.evaluate(`(() => {
    const g = window.__zoom.g;
    g.p.hearts = 2; g.p.worn = 'LOOKS';
    g.p.x = 3040; g.p.y = 100;
    g.L.maws[0].state = 'wind'; g.L.maws[0].t = 0.3;
    g.L.acid[3].on = true; g.L.acid[4].on = true; g.L.acid[4].y = -900; g.L.surge.on = true;
  })()`);
  await p2.waitForTimeout(900);
  await p2.evaluate(`window.__zoom.g.p.x = 5000; window.__zoom.g.p.y = -910; window.__zoom.g.p.inAcid = true; window.__zoom.g.p.acidT = 1`);
  await p2.waitForTimeout(500);
  check('acid, maws, glass, hearts and masks render without errors', errs2.length === 0, errs2.join(' | '));
  await p2.close();
}

// ---- wing three boots too, and its fixtures render
{
  const p3 = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs3 = [];
  p3.on('pageerror', (e) => errs3.push(e.message));
  p3.on('console', (m) => { if (m.type() === 'error') errs3.push(m.text()); });
  await p3.goto(`${BASE}/index.html?wing=3`);
  await p3.waitForFunction('window.__zoom');
  await p3.click('#start');
  check('?wing=3 boots the zoo', await p3.evaluate('window.__zoom.g.wing') === 3);
  await p3.evaluate(`(() => {
    const g = window.__zoom.g;
    g.p.worn = 'SMASH'; g.p.hearts = 2; g.p.x = 5400; g.p.y = 588;
    g.L.closing.on = true; g.L.closing.t = 6; g.L.cursor.active = true; g.L.cursor.state = 'aim'; g.L.cursor.tx = 5420; g.L.cursor.ty = 590; g.L.cursor.t = 0.4;
    g.L.shutters[0].state = 'closing'; g.L.shutters[0].p = 0.5; g.L.shutters[0].rect.h = 130; g.L.shutters[0].rect.on = true;
    g.decoy = { x: 5350, y: 585, r: 340, t: 10, ref: null };
    g.menus[0].berserk = 5;
  })()`);
  await p3.waitForTimeout(900);
  await p3.evaluate(`(() => { const g = window.__zoom.g; g.p.x = 2500; g.p.y = 580; })()`);
  await p3.waitForTimeout(500);
  check('docents, gates, placards, the cursor and the trampoline render without errors', errs3.length === 0, errs3.join(' | '));
  await p3.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
await done(failed ? 1 : 0);

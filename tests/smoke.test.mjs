// End-to-end smoke test: starts the real server, drives the real app in
// Chromium through every section, and fails on any page error.
//
//   npm run test:browser
//
// Uses PLAYWRIGHT_BROWSERS_PATH if set (e.g. /opt/pw-browsers).

import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

async function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), 'loopwright-'));
  const proc = spawn('python3', [join(ROOT, 'server.py'), '--host', '127.0.0.1', '--port', String(port), '--data-dir', dataDir], {
    env: { ...process.env, LOOPWRIGHT_QUIET: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return { base, proc, dataDir };
}

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(['ok', name, Date.now() - t]);
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push(['fail', name, Date.now() - t, err]);
    console.log(`  ✗ ${name}\n    ${String(err.stack || err).split('\n').slice(0, 6).join('\n    ')}`);
  }
}

const { base, proc, dataDir } = await startServer();
const browser = await chromium.launch();
const errors = [];

function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) errors.push(`${label} console: ${m.text()}`);
  });
}

async function newPage(viewport = { width: 1280, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  watch(page, `${viewport.width}px`);
  page.setDefaultTimeout(8000);
  return { ctx, page };
}

const go = async (page, hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(250);
};

console.log(`Loopwright smoke test against ${base}`);
const { ctx, page } = await newPage();
await page.goto(`${base}/`);
await page.waitForSelector('.hero');

await step('studio shows sample content and remembers a name', async () => {
  await page.fill('.hero input', 'Robin');
  await page.click('.hero button:has-text("Save")');
  await page.waitForSelector('.hero h1:has-text("Robin")');
  assert.ok(await page.isVisible('text=Pocket Whale for Mira'));
  assert.ok(await page.isVisible('.presence .dot.on'));
});

await step('plan: create a project and edit it', async () => {
  await go(page, '#/plan/projects');
  await page.click('button:has-text("New project")');
  await page.waitForSelector('input[aria-label="Project name"]');
  await page.fill('input[aria-label="Project name"]', 'Test Cowl');
  await page.fill('input[placeholder^="Me, a gift"]', 'Sam');
  await page.selectOption('select[aria-label="Status"]', 'active');
  await page.waitForTimeout(500);
  await go(page, '#/plan/projects');
  await page.waitForSelector('.proj-card:has-text("Test Cowl")');
});

await step('plan: stash add, filter and match a color', async () => {
  await go(page, '#/plan/stash');
  await page.click('button:has-text("Add yarn")');
  await page.fill('dialog input[placeholder="Maker or mill"]', 'Test Mill');
  await page.fill('dialog input[placeholder="e.g. Rust"]', 'Plum');
  await page.click('dialog button:has-text("Add to stash")');
  await page.waitForSelector('.card:has-text("Plum")');
  await page.fill('input[aria-label="Search stash"]', 'plum');
  assert.equal(await page.locator('.yarn-card').count(), 1);
  await page.click('button:has-text("Match a color")');
  await page.waitForSelector('dialog .list-row');
  await page.keyboard.press('Escape');
});

await step('plan: calculators produce answers', async () => {
  await go(page, '#/plan/calc');
  const even = page.locator('#even');
  await even.locator('input').first().fill('60');
  await even.locator('input').nth(1).fill('9');
  await page.waitForTimeout(100);
  assert.match(await even.locator('.well').innerText(), /\(69\)/);
  assert.match(await page.locator('#gauge .well').innerText(), /hook/i);
  assert.match(await page.locator('#pricing .well').innerText(), /Retail/);
  await go(page, '#/plan/shopping');
  await page.fill('input[aria-label="New item"]', 'Stitch markers');
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=Stitch markers');
});

await step('create: a new pattern checks counts as you type', async () => {
  await go(page, '#/create/patterns');
  await page.click('button:has-text("New pattern")');
  await page.waitForSelector('.rows-editor textarea');
  await page.fill('input[aria-label="Pattern title"]', 'Smoke Ball');
  await page.fill('.rows-editor textarea', 'Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)\nRnd 3: (sc, inc) x6 (19)');
  await page.waitForSelector('.check-line.has-error');
  assert.match(await page.locator('.check-line.has-error').innerText(), /Says 19 but the stitches make 18/);
  await page.fill('.rows-editor textarea', 'Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)\nRnd 3: (sc, inc) x6 (18)\nRnd 4: (sc 2, inc) x6 (24)');
  await page.waitForSelector('.chip:has-text("No count errors")');
});

await step('create: details, diagram and preview tabs', async () => {
  await page.click('.segmented button:has-text("Details")');
  await page.waitForSelector('text=Abbreviations');
  assert.ok(await page.isVisible('.doc-abbr dt:has-text("inc")'));
  await page.click('.segmented button:has-text("Diagram")');
  await page.waitForSelector('svg.diagram');
  assert.ok((await page.locator('svg.diagram path.sym').count()) > 40);
  await page.click('.segmented button:has-text("Preview")');
  await page.waitForSelector('.doc h1:has-text("Smoke Ball")');
});

await step('create: paste import splits parts and detects UK terms', async () => {
  await go(page, '#/create/patterns');
  await page.click('button:has-text("Paste a pattern")');
  await page.fill('dialog input[placeholder="Pattern name"]', 'UK Bear');
  await page.fill('dialog textarea', 'Head:\nRnd 1: 6 dc in MR (6)\nRnd 2: inc x6 (12)\nEars (make 2):\nRnd 1: 5 dc in MR (5)\nRnd 2: htr in each st around (5)');
  await page.click('dialog button:has-text("Import")');
  const parts = page.locator('.section-bar input[aria-label="Part name"]');
  await parts.first().waitFor();
  assert.equal(await parts.count(), 2);
  assert.equal(await parts.nth(1).inputValue(), 'Ears');
  assert.equal(await page.locator('.section-bar input[aria-label="How many to make"]').nth(1).inputValue(), '2');
  await page.waitForSelector('.chip:has-text("No count errors")');
});

await step('create: chart painting and C2C instructions', async () => {
  await go(page, '#/create/charts');
  await page.click('button:has-text("New chart")');
  await page.waitForSelector('.chart-stage canvas');
  const box = await page.locator('.chart-stage canvas').boundingBox();
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const before = await page.locator('.instr-row').count();
  assert.equal(before, 30);
  await page.selectOption('.chart-layout select >> nth=0', 'c2c');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.instr-row').count(), 59);
  await page.keyboard.press('Control+z');
});

await step('create: shape builder saves a pattern that checks out', async () => {
  await go(page, '#/create/shapes');
  await page.click('.segmented button:has-text("Egg")');
  await page.waitForTimeout(150);
  assert.match(await page.locator('.stats').innerText(), /Counts ✓/);
  await page.click('button:has-text("Save as pattern")');
  await page.waitForSelector('.chip:has-text("No count errors")');
});

await step('create: stitch dictionary and detail', async () => {
  await go(page, '#/create/stitches');
  await page.fill('input[aria-label="Search stitches"]', 'bobble');
  await page.click('a.card:has-text("Bobble")');
  await page.waitForSelector('ol.steps li');
});

await step('build: row and stitch tracking move through the pattern', async () => {
  await go(page, '#/build');
  await page.click('a.card:has-text("Pocket Whale for Mira")');
  await page.waitForSelector('.now-label');
  const first = await page.locator('.now-label').innerText();
  await page.click('button:has-text("Row done")');
  const second = await page.locator('.now-label').innerText();
  assert.notEqual(first, second);
  await page.click('.segmented button:has-text("Stitches")');
  await page.waitForSelector('.tapzone');
  await page.click('.tapzone');
  assert.match(await page.locator('.st-pos').innerText(), /^2 of/);
  await page.keyboard.press('ArrowLeft');
  assert.match(await page.locator('.st-pos').innerText(), /^1 of/);
  await page.click('button:has-text("Start timer")');
  await page.waitForSelector('button:has-text("Pause")');
  await page.click('button:has-text("Pause")');
});

await step('build: quick counter', async () => {
  await go(page, '#/build');
  await page.click('button:has-text("Open a counter")');
  await page.waitForSelector('.tapzone');
  await page.click('.tapzone');
  await page.click('.tapzone');
  assert.equal((await page.locator('.tapzone .st-name').innerText()).trim(), '2');
});

await step('build: follow a colorwork chart row by row', async () => {
  await go(page, '#/create/charts');
  await page.click('.pattern-card:has-text("Little heart")');
  await page.waitForSelector('.chart-stage canvas');
  await page.click('button:has-text("Work on it")');
  await page.waitForSelector('.now-label');
  assert.equal(await page.locator('.now-label').innerText(), 'Row 1');
  assert.equal(await page.locator('.seq .part').count(), 1);
  await page.click('button:has-text("Row done")');
  await page.click('button:has-text("Row done")');
  assert.equal(await page.locator('.now-label').innerText(), 'Row 3');
});

await step('plan: yarn from stash, photo, finish and deduct', async () => {
  await go(page, '#/plan/projects');
  await page.click('.proj-card:has-text("Test Cowl")');
  await page.waitForSelector('button:has-text("From stash")');
  await page.click('button:has-text("From stash")');
  await page.click('dialog .list-row:has-text("Rust")');
  await page.waitForSelector('.list-row:has-text("Hearthside Wool Worsted")');
  await page.fill('input[aria-label="Yards needed"]', '400');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.card:has-text("Photos") button:has-text("Add")')]);
  await chooser.setFiles({ name: 'wip.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.attach-grid .ph img');
  await page.waitForTimeout(500);
  await page.selectOption('select[aria-label="Status"]', 'done');
  await page.click('dialog button:has-text("Update stash")');
  await page.waitForSelector('.toast:has-text("Stash updated")');
  await go(page, '#/plan/stash');
  assert.match(await page.locator('.yarn-card:has-text("Rust")').filter({ hasText: 'Hearthside' }).innerText(), /4 sk/);
});

await step('plan: hooks and notions', async () => {
  await go(page, '#/plan/hooks');
  await page.click('button.hook-pill:has(b:text-is("9"))');
  await page.waitForSelector('.list-row:has-text("9 mm")');
  await page.click('button:has-text("Add")');
  await page.fill('dialog input[placeholder^="e.g. Safety"]', 'Blocking pins');
  await page.click('dialog button:has-text("Save")');
  await page.waitForSelector('.list-row:has-text("Blocking pins")');
});

await step('imagine: palette, granny, stripes, hats, ideas', async () => {
  await go(page, '#/imagine/palettes');
  const before = await page.locator('.palette-strip .hex').first().innerText();
  await page.click('button:has-text("Shuffle")');
  await page.waitForTimeout(100);
  const after = await page.locator('.palette-strip .hex').first().innerText();
  assert.notEqual(before, after);
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(300);
  await go(page, '#/imagine/granny');
  await page.waitForSelector('text=Yarn for the blanket');
  await go(page, '#/imagine/stripes');
  await page.waitForSelector('.chip:has-text("Pattern checks out")');
  await go(page, '#/imagine/hats');
  await page.waitForSelector('text=Every round checks out');
  await page.selectOption('select >> nth=0', 'Toddler');
  await page.waitForSelector('text=Every round checks out');
  await go(page, '#/imagine/ideas');
  await page.click('button:has-text("Another")');
});

let codeUrl = '';
await step('post: community post, like, comment, journal', async () => {
  await go(page, '#/post');
  await page.fill('textarea[aria-label="Post text"]', 'First granny square of the year! #granny #wip');
  await page.click('button:has-text("Post")');
  await page.waitForSelector('article.post:has-text("First granny square")');
  await page.click('article.post button:has-text("Like")');
  await page.waitForSelector('article.post .btn.liked');
  await page.click('article.post button:has-text("Comment")');
  await page.fill('input[aria-label="Comment"]', 'Gorgeous colors');
  await page.click('button:has-text("Send")');
  await page.waitForSelector('.comment:has-text("Gorgeous colors")');
  await page.click('.post-text .tag:has-text("#granny")');
  await page.waitForSelector('.chip.on:has-text("#granny")');
  await page.click('.segmented button:has-text("My journal")');
  await page.waitForSelector('article.post:has-text("First granny square")');
});

await step('share: server code, QR, share card, then open the code', async () => {
  await page.goto(`${base}/#/share`);
  await page.click('button.list-row:has-text("Smoke Ball")');
  await page.waitForSelector('.link-box input');
  codeUrl = await page.locator('.link-box input').inputValue();
  assert.match(codeUrl, /#\/s\/[A-HJ-NP-Z2-9]{8}$/);
  await page.waitForSelector('.qr-box svg');
  await page.waitForSelector('canvas.card-canvas');
});

await step('share: someone else opens the code and saves it', async () => {
  const other = await newPage({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  await other.page.goto(codeUrl);
  await other.page.waitForSelector('button:has-text("Save to my studio")');
  assert.ok(await other.page.isVisible('h1:has-text("Smoke Ball")'));
  await other.page.click('button:has-text("Save to my studio")');
  await other.page.waitForSelector('.rows-editor textarea');
  assert.match(await other.page.locator('.rows-editor textarea').inputValue(), /Rnd 4: \(sc 2, inc\) x6 \(24\)/);
  await other.ctx.close();
});

await step('share: self-contained link works with no server involved', async () => {
  await page.goto(`${base}/#/share`);
  await page.click('.segmented button:has-text("Charts")');
  await page.click('button.list-row:has-text("Little heart")');
  await page.waitForSelector('.link-box input');
  await page.click('label.toggle:has-text("Self-contained link")');
  await page.waitForFunction(() => /#\/import\/z/.test(document.querySelector('.link-box input')?.value || ''));
  const link = await page.locator('.link-box input').inputValue();
  const other = await newPage();
  await other.page.goto(link);
  await other.page.waitForSelector('button:has-text("Save to my studio")');
  await other.page.click('button:has-text("Save to my studio")');
  await other.page.waitForSelector('.chart-stage canvas');
  assert.equal(await other.page.locator('input[aria-label="Chart name"]').inputValue(), 'Little heart');
  await other.ctx.close();
});

await step('share: backup downloads and restores', async () => {
  await go(page, '#/share');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download backup")')]);
  const file = await dl.path();
  const data = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(data.kind, 'backup');
  assert.ok(data.stores.patterns.some((p) => p.title === 'Smoke Ball'));
  const fresh = await newPage();
  await fresh.page.goto(`${base}/#/share`);
  await fresh.page.waitForSelector('button:has-text("Restore")');
  const [chooser] = await Promise.all([fresh.page.waitForEvent('filechooser'), fresh.page.click('button:has-text("Restore")')]);
  await chooser.setFiles(file);
  await fresh.page.click('dialog button:has-text("Merge")');
  await fresh.page.waitForSelector('.toast:has-text("Restored")');
  await go(fresh.page, '#/create/patterns');
  await fresh.page.waitForSelector('.pattern-card:has-text("Smoke Ball")');
  await fresh.ctx.close();
});

await step('settings: dark theme and UK terms', async () => {
  await go(page, '#/settings');
  await page.click('.segmented button:has-text("Dark")');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.reload();
  await page.waitForSelector('.page-head');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.click('.segmented button:has-text("UK (dc, htr, tr)")');
  await go(page, '#/create/stitches');
  await page.waitForSelector('.abbr:has-text("htr")');
  await go(page, '#/settings');
  await page.click('.segmented button:has-text("US (sc, hdc, dc)")');
  await page.click('.segmented button:has-text("Match device")');
});

await step('phone layout: tab bar, no sideways scrolling on any page', async () => {
  const phone = await newPage({ width: 375, height: 812 }, { isMobile: true, hasTouch: true });
  await phone.page.goto(`${base}/`);
  await phone.page.waitForSelector('.tabbar');
  assert.ok(await phone.page.isVisible('.tabbar a:has-text("Imagine")'));
  const routes = ['#/', '#/plan/projects', '#/plan/stash', '#/plan/calc', '#/plan/hooks', '#/plan/shopping', '#/create/patterns', '#/create/charts', '#/create/shapes', '#/create/stitches',
    '#/post', '#/share', '#/build', '#/imagine/palettes', '#/imagine/granny', '#/imagine/stripes', '#/imagine/hats', '#/imagine/ideas', '#/settings'];
  const wide = [];
  for (const r of routes) {
    await go(phone.page, r);
    await phone.page.waitForTimeout(150);
    const over = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) wide.push(`${r} (+${over}px)`);
  }
  assert.deepEqual(wide, []);
  await phone.ctx.close();
});

await ctx.close();
await browser.close();
proc.kill();
rmSync(dataDir, { recursive: true, force: true });

const failed = results.filter((r) => r[0] === 'fail');
if (errors.length) console.log(`\nPage errors:\n  ${errors.join('\n  ')}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed${errors.length ? `, ${errors.length} page errors` : ''}`);
process.exit(failed.length || errors.length ? 1 : 0);

// Browser smoke test: boots the real game against the real server and plays a
// day. Catches the whole class of bugs the headless sim tests cannot — broken
// imports, canvas errors, dead buttons, a save API that 500s.
//
//     node tests/smoke.test.mjs
//
// Uses the preinstalled Chromium at PLAYWRIGHT_BROWSERS_PATH. Never run
// `playwright install` — the browser is already there.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT ?? 8137);
const BASE = `http://127.0.0.1:${PORT}`;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('playwright is not installed — skipping the browser smoke test.');
  console.log('install it with:  npm i -D playwright   (the browser binary is already present)');
  process.exit(0);
}

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
}

/* ---- server -------------------------------------------------------------- */

const savesDir = await mkdtemp(join(tmpdir(), 'ironfield-smoke-'));
const server = spawn('python3', [join(ROOT, 'server.py'), '--port', String(PORT),
                                 '--host', '127.0.0.1', '--saves-dir', savesDir],
                     { stdio: ['ignore', 'pipe', 'pipe'] });

async function waitForServer(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/saves`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function cleanup(code) {
  server.kill('SIGTERM');
  await rm(savesDir, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
}

console.log('Server');
const up = await waitForServer();
check('server responds on /api/saves', up);
if (!up) await cleanup(1);

/* ---- browser ------------------------------------------------------------- */

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },   // iPhone 14 Pro, portrait
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push(String(err)));

console.log('\nBoot');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.game?.scenes?.top, null, { timeout: 10000 });

check('title scene loaded', await page.evaluate(() => window.game.scenes.top.name === 'TitleScene'));
check('boot splash was dismissed',
      await page.evaluate(() => !document.getElementById('boot')
                             || document.getElementById('boot').classList.contains('hidden')));
check('canvas is sized to the viewport',
      await page.evaluate(() => window.game.view.w > 0 && window.game.view.h > 0));
check('portrait layout detected', await page.evaluate(() => window.game.view.portrait === true));

console.log('\nNew run');
await page.evaluate(() => window.game.newGame({ farmName: 'Smoke Test', seed: 1234 }));
await page.waitForFunction(() => window.game.scenes.top?.name === 'WorldScene', null, { timeout: 5000 });
check('world scene is active', true);
check('starting seeds granted',
      await page.evaluate(() => (window.game.state.farm.inventory['seed:turnip'] ?? 0) > 0));

console.log('\nWalking the world');
const walk = await page.evaluate(async () => {
  const scene = window.game.scenes.top;
  const start = { x: scene.player.x, y: scene.player.y };

  // Drive the player south-east for a second of simulated time.
  for (let i = 0; i < 60; i++) scene.update(1 / 60);
  const idle = { x: scene.player.x, y: scene.player.y };

  scene.joystick.axis = { x: 1, y: 0, mag: 1 };
  const axis = scene.joystick.axis;
  for (let i = 0; i < 60; i++) scene.player.update(1 / 60, axis, scene.map);
  const moved = { x: scene.player.x, y: scene.player.y };

  return {
    startedOnMap: scene.map.id,
    stillWhenIdle: Math.hypot(idle.x - start.x, idle.y - start.y) < 1,
    walkedRight: moved.x > idle.x + 20,
    facing: scene.player.facing,
    mapW: scene.map.w, mapH: scene.map.h,
  };
});
check('spawned on the overworld', walk.startedOnMap === 'overworld');
check('stands still with no input', walk.stillWhenIdle);
check('walks when the stick is pushed', walk.walkedRight);
check('faces the direction of travel', walk.facing === 2);
check('the world is larger than a screen', walk.mapW >= 40 && walk.mapH >= 60);

const townsfolk = await page.evaluate(async () => {
  const scene = window.game.scenes.top;
  const before = scene.npcs.map((n) => ({ id: n.id, x: n.x, y: n.y }));
  for (let i = 0; i < 600; i++) scene.npcs.forEach((n) => n.update(1 / 60, scene.map));
  const after = scene.npcs.map((n) => ({ x: n.x, y: n.y }));
  return {
    count: scene.npcs.length,
    finite: before.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    ids: before.map((n) => n.id),
    anyMoved: after.some((n, i) => Math.hypot(n.x - before[i].x, n.y - before[i].y) > 4),
    stillOnMap: after.every((n) => n.x > 0 && n.y > 0
                              && n.x < scene.map.w * 32 && n.y < scene.map.h * 32),
  };
});
check('all six townsfolk are in the world', townsfolk.count === 6, `got ${townsfolk.count}`);
check('they spawn at real coordinates', townsfolk.finite, JSON.stringify(townsfolk.ids));
check('they wander their patch', townsfolk.anyMoved);
check('they stay inside the map', townsfolk.stillOnMap);

const collide = await page.evaluate(async () => {
  const scene = window.game.scenes.top;
  // Walk hard into the treeline at the top of the map and confirm it holds.
  scene.player.setTile(30, 5);
  const axis = { x: 0, y: -1, mag: 1 };
  for (let i = 0; i < 180; i++) scene.player.update(1 / 60, axis, scene.map);
  return { tileY: scene.player.tileY, solidAbove: scene.map.solidAt(30, 2) };
});
check('trees block movement', collide.solidAbove && collide.tileY >= 3,
      `stopped at tile y=${collide.tileY}`);

const interact = await page.evaluate(async () => {
  const scene = window.game.scenes.top;
  const { FARM_ORIGIN } = await import('/js/world/worldMap.js');
  const { DIR } = await import('/js/world/entities.js');

  // Stand just above plot (3,3) — clear of the plots the later day test uses.
  scene.player.setTile(FARM_ORIGIN.x + 3, FARM_ORIGIN.y + 2);
  scene.player.facing = DIR.DOWN;
  const before = scene._findInteraction();
  before?.run();
  const afterTill = scene._findInteraction();

  const plot = window.game.state.farm.plots[3 * window.game.state.farm.width + 3];
  return { first: before?.label, second: afterTill?.label, tilled: plot.tilled };
});
check('walking up to raw ground offers Till', interact.first === 'Till');
check('tilling works from the world', interact.tilled === true);
check('the same button then offers to plant', interact.second === 'Turnip');

const doorway = await page.evaluate(async () => {
  const scene = window.game.scenes.top;
  const building = scene.map.buildings.find((b) => b.interior === 'seed');
  scene.player.setTile(building.doorX, building.doorY);
  const action = scene._findInteraction();
  action?.run();
  const inside = { map: scene.map.id, interior: scene.map.interior,
                   npcs: scene.map.npcs.length };

  // Step onto the doormat, which is how you leave.
  const exit = scene.map.doors.find((d) => d.to === 'overworld');
  scene.player.setTile(exit.x, exit.y);
  const out = scene._findInteraction();
  const outLabel = out?.label;
  out?.run();
  return { inside, outLabel, backOn: scene.map.id };
});
check('a shop door leads inside', doorway.inside.map === 'seed' && doorway.inside.interior);
check('the shopkeeper is behind the counter', doorway.inside.npcs === 1);
check('standing on the doormat offers to leave', doorway.outLabel === 'Leave');
check('leaving returns to the overworld', doorway.backOn === 'overworld');

console.log('\nA day on the farm');
const farmDay = await page.evaluate(async () => {
  const sim = await import('/js/farm/farmSim.js');
  const s = window.game.state;
  const before = { energy: s.meta.energy, day: s.meta.day, gold: s.meta.gold };

  const till = sim.till(0, 0);
  const plant = sim.plant(0, 0, 'turnip');
  const water = sim.water(0, 0);
  const plot = s.farm.plots[0];

  return {
    before,
    till: till.ok, plant: plant.ok, water: water.ok,
    cropId: plot.cropId, watered: plot.watered,
    energy: s.meta.energy,
  };
});
check('tilled a plot', farmDay.till);
check('planted a turnip', farmDay.plant && farmDay.cropId === 'turnip');
check('watered it', farmDay.water && farmDay.watered);
check('actions cost energy', farmDay.energy < farmDay.before.energy,
      `${farmDay.before.energy} -> ${farmDay.energy}`);

const slept = await page.evaluate(async () => {
  const sim = await import('/js/farm/farmSim.js');
  const s = window.game.state;
  const report = sim.sleep();
  return { day: s.meta.day, stage: s.farm.plots[0].stage, energy: s.meta.energy, report };
});
check('sleeping advanced the day', slept.day === farmDay.before.day + 1);
check('the crop grew a stage', slept.stage > 0, `stage ${slept.stage}`);
check('energy was restored overnight', slept.energy === 100, `energy ${slept.energy}`);

console.log('\nSave round-trip');
const saved = await page.evaluate(async () => {
  const res = await window.game.save('smoke');
  return res;
});
check('save reported success', saved.ok === true);
check('save reached the server', saved.remote === true);
check('save also cached locally', saved.local === true);

const onDisk = await fetch(`${BASE}/api/save/smoke`).then((r) => r.json());
check('server stored the farm name', onDisk?.meta?.farmName === 'Smoke Test');
check('server stored the advanced date', onDisk?.meta?.day === slept.day);

const reloaded = await page.evaluate(async () => {
  const saves = await import('/js/core/save.js');
  const loaded = await saves.load('smoke');
  return { day: loaded?.meta?.day, crop: loaded?.farm?.plots?.[0]?.cropId };
});
check('save loads back with the same date', reloaded.day === slept.day);
check('save preserves plot contents', reloaded.crop === 'turnip');

console.log('\nBattle');
const battle = await page.evaluate(async () => {
  const assault = await import('/js/battle/assault.js');
  const s = window.game.state;
  s.meta.gold = 20000;

  const started = assault.startAssault('m1');
  if (!started.ok) return { error: started.reason };

  assault.buyUnit('harvester');
  assault.buyUnit('tiller');
  const deployed = assault.playerSquadsForSim().length;

  const round = assault.resolveRoundInstantly();
  return {
    deployed,
    winner: round.outcome.winner,
    phase: round.phase,
    enemyCount: s.world.currentAssault?.enemySquads?.length ?? 0,
  };
});
check('assault started', !battle.error, battle.error);
check('squads bought and auto-deployed', battle.deployed >= 2, `${battle.deployed} deployed`);
check('the enemy fielded an army', battle.enemyCount > 0);
check('a round resolved to a winner', ['player', 'enemy', 'draw', 'timeout'].includes(battle.winner),
      `winner=${battle.winner}`);
check('the ladder advanced to a next phase',
      ['tech', 'victory', 'defeat'].includes(battle.phase), `phase=${battle.phase}`);

console.log('\nScene navigation');
const scenes = await page.evaluate(async () => {
  const { MapScene } = await import('/js/map/mapScene.js');
  window.game.state.world.currentAssault = null;   // don't auto-resume into deploy
  const out = [];

  window.game.scenes.push(new MapScene(window.game));
  out.push(window.game.scenes.top.name);
  window.game.scenes.pop();
  out.push(window.game.scenes.top.name);
  return out;
});
check('campaign map opens', scenes[0] === 'MapScene');
check('popping returns to the world', scenes[1] === 'WorldScene');

// Let a few frames render with all that state in place.
await page.waitForTimeout(600);

console.log('\nConsole');
check('no uncaught errors during the run', consoleErrors.length === 0,
      consoleErrors.slice(0, 5).join('\n      '));

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
await cleanup(failed ? 1 : 0);

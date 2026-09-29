// Wing three (the Zoo), headless. Mechanics one at a time, then a scripted bot
// plays the whole wing through real input with no teleporting.
//
//     node tests/zoom_zoo.test.mjs

import {
  newGame, step, DT, hold, tap, walkTo, creepTo, ripHere, solveThrow, doThrow, teleport,
  hopChain,
} from './zoom_bot.mjs';
import { applyToTarget } from '../zoom/js/world.js';

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? `  (${detail})` : ''}`); }
}
const at = (g) => `x=${g.p.x.toFixed(0)} y=${g.p.y.toFixed(0)} n=${g.notice.toFixed(0)} t=${g.t.toFixed(0)}s`;
const evCount = (g, type) => g.ev.filter((e) => e.type === type).length;

/** Wing three, landed, standing at (x,y); every docent asleep and nothing armed. */
function zoo(x, y, seed = 4) {
  const g = newGame(seed, { wing: 3 });
  teleport(g, x, y);
  hold(g, {}, 0.4);
  g.ev.length = 0;
  return g;
}
const bite = (g) => { step(g, { rip: true }); step(g, { rip: false }); };
const docentAt = (g, x, y, extra = {}) => {
  const m = { x, y, kind: 'docent', hp: 1, accepted: false, born: 0, speed: 66, wake: 400, sleep: false, text: 'HELLO', ...extra };
  g.menus.push(m);
  return m;
};

/* ================================================================== */
console.log('Wing three: arriving');
/* ================================================================== */
{
  const g = newGame(1, { wing: 3 });
  check('you are spat out above the ticket hall', g.p.y < g.L.spawn.y - 300);
  hold(g, {}, 2);
  check('...and land on the floor', g.p.grounded && g.p.y > 580, at(g));
  check('the zoo is staffed: sixteen docents, all asleep until you get close', g.menus.length === 16 && g.menus.filter((m) => m.sleep).length >= 12, `${g.menus.length}`);
  check('four ticket gates, four Scars, a cursor waiting', g.L.gates.length === 4 && g.L.scars.length === 4 && !g.L.cursor.active);
}

/* ================================================================== */
console.log('Docents and tickets');
/* ================================================================== */
{
  const g = zoo(300, 590);
  g.menus.forEach((m) => { m.sleep = true; m.wake = 300; });
  g.menus.length = 0;
  const d = docentAt(g, 800, 520, { sleep: true, wake: 300, speed: 66 });
  teleport(g, 600, 590); hold(g, {}, 0.5);
  check('a docent wakes when you come near', d.sleep === false);
  const d0 = Math.hypot(d.x - g.p.x, d.y - g.p.y);
  hold(g, {}, 1);
  check('...and floats toward you', Math.hypot(d.x - g.p.x, d.y - g.p.y) < d0 - 30, `${d0.toFixed(0)} -> ${Math.hypot(d.x - g.p.x, d.y - g.p.y).toFixed(0)}`);
  hold(g, {}, 6, () => g.menuMode);
  check('touch one and you are employed', !!g.menuMode && g.stats.leash === 1, at(g));
  const before = g.menus.length;
  hold(g, {}, 2);
  check('a second docent cannot employ you twice', g.stats.leash === 1);
}
{
  const g = zoo(480, 590);
  const gt = g.L.gates[0];
  check('the turnstile is a wall', gt.rect.on !== false);
  const m = docentAt(g, 520, 560);
  m.accepted = true; m.hp = 3; g.menuMode = m; g.stats.leash = 1;
  hold(g, {}, 0.3);
  check('an employed dog gets waved through', gt.open === true && gt.rect.on === false);
  g.menuMode = null; g.menus.length = 0;
  teleport(g, 300, 590);
  hold(g, {}, 3);
  check('...and the gate closes once you are unemployed', gt.open === false && gt.rect.on === true);
}
{
  const g = zoo(500, 590);
  g.menus.length = 0;
  const gt = g.L.gates[0];
  const n0 = g.notice;
  for (let i = 0; i < 5; i++) { bite(g); hold(g, {}, 0.05); }
  check('five bites is not enough for a turnstile', gt.broken === false && gt.hp === 1, `hp=${gt.hp}`);
  bite(g);
  check('six bites smash it', gt.broken === true && gt.rect.on === false && g.stats.smashed === 1);
  check('...and biting is noisy', g.notice > n0 + 12, `${n0} -> ${g.notice.toFixed(1)}`);
  check('the wall is gone: walk through', (() => { hold(g, { mx: 1 }, 1); return g.p.x > 560; })());
}
{
  // biting docents, stomping them, and wearing SMASHES MENUS
  const g = zoo(600, 590);
  g.menus.length = 0;
  const a = docentAt(g, 640, 560);
  bite(g);
  check('one bite ends a docent', !g.menus.includes(a) && g.stats.smashed === 1);
  const b = docentAt(g, 700, 540);
  teleport(g, 700, 490); g.p.vy = 200;
  hold(g, {}, 0.1);
  check('landing on one from above squashes it', !g.menus.includes(b) && g.stats.smashed === 2);
  g.p.worn = 'SMASH';
  const c = docentAt(g, 640, 580); teleport(g, 620, 590);
  hold(g, {}, 0.3);
  check('wear SMASHES MENUS and they shatter when they touch you', !g.menus.includes(c) && g.stats.leash === 0, `leash=${g.stats.leash}`);
  g.p.worn = 'OWNS';
  const d = docentAt(g, 640, 580);
  hold(g, {}, 3);
  check('wear OWNS THE ROOM and docents never employ you', g.stats.leash === 0 && g.menus.includes(d));
  check('...they just follow you around, like staff', Math.hypot(d.x - g.p.x, d.y - g.p.y) < 80, `${Math.hypot(d.x - g.p.x, d.y - g.p.y).toFixed(0)}`);
}
{
  // a worn SMASH walks through a turnstile
  const g = zoo(470, 590);
  g.menus.length = 0;
  g.p.worn = 'SMASH';
  hold(g, { mx: 1 }, 1);
  check('worn SMASHES MENUS goes through a turnstile like it is a Menu', g.L.gates[0].broken && g.p.x > 560, at(g));
}

/* ================================================================== */
console.log('SMASHES MENUS, thrown');
/* ================================================================== */
{
  const g = zoo(700, 590);
  g.menus.length = 0;
  const target = docentAt(g, 900, 520, { sleep: true, wake: 0 });
  const others = [docentAt(g, 1000, 500, { sleep: true, wake: 0 }), docentAt(g, 1100, 470, { sleep: true, wake: 0 })];
  applyToTarget(g, 'SMASH', { type: 'menu', ref: target, x: target.x, y: target.y }, 'throw');
  check('a thrown SMASHES MENUS makes the Menu berserk', target.berserk > 0);
  hold(g, {}, 5);
  check('it smashes the others', others.every((o) => !g.menus.includes(o)), `left ${g.menus.length}`);
  hold(g, {}, 8);
  check('...and then smashes itself. the show goes on', !g.menus.includes(target) && g.stats.smashed >= 3, `smashed ${g.stats.smashed}`);
  check('a berserk Menu never employs you', g.stats.leash === 0);
}
{
  // it also takes down placards and turnstiles
  const g = zoo(2000, 590);
  g.menus.length = 0;
  const m = docentAt(g, 2100, 470, { sleep: false });
  const pl = g.L.placards[0]; // (2140,420)
  applyToTarget(g, 'SMASH', { type: 'menu', ref: m, x: m.x, y: m.y }, 'throw');
  hold(g, {}, 4);
  check('berserk Menus find placards too', pl.dead === true);
}
{
  const g = zoo(1300, 590);
  g.menus.length = 0;
  const gt = g.L.gates[1];
  g.p.mouth = 'SMASH'; g.p.face = 1;
  const sol = solveThrow(g, (h) => h.type === 'ticketgate');
  check('SMASHES MENUS can be lobbed at a turnstile', !!sol);
  if (sol) { doThrow(g, sol); hold(g, {}, 1.5); }
  check('...and the turnstile is gone', gt.broken === true);
}
for (const [law, label, ok] of [
  ['LEAVES', 'LEAVES THE MEETING: the Menu has a meeting', (g, m) => !g.menus.includes(m)],
  ['BORED', 'GETS BORED: the docent drifts off', (g, m) => m.sleep === true && m.bored === true],
  ['TEETH', 'TEETH: bites a Menu to bits', (g, m) => !g.menus.includes(m)],
]) {
  const g = zoo(700, 590);
  g.menus.length = 0;
  const m = docentAt(g, 900, 520);
  applyToTarget(g, law, { type: 'menu', ref: m, x: m.x, y: m.y }, 'throw');
  check(label, ok(g, m));
}
for (const [law, label] of [['SMASH', 'SMASHES MENUS'], ['TEETH', 'TEETH'], ['LEAVES', 'LEAVES THE MEETING'], ['BORED', 'GETS BORED']]) {
  const g = zoo(2000, 590);
  const pl = g.L.placards[0];
  applyToTarget(g, law, { type: 'placard', ref: pl, x: pl.x, y: pl.y }, 'throw');
  check(`${label} on a placard silences it`, pl.dead || pl.gone > 0 || pl.bored > 0);
}
for (const law of ['LEAVES', 'WONT_CLOSE', 'TEETH']) {
  const g = zoo(1300, 590);
  const gt = g.L.gates[1];
  applyToTarget(g, law, { type: 'ticketgate', ref: gt, x: gt.rect.x, y: 500 }, 'jam');
  check(`${law} at a turnstile ${law === 'TEETH' ? 'chews it (half way)' : 'gets it out of the way'}`, law === 'TEETH' ? gt.hp === 3 : gt.broken);
}

/* ================================================================== */
console.log('Placards');
/* ================================================================== */
{
  const g = zoo(2100, 590);
  g.menus.length = 0;
  const pl = g.L.placards[0]; // (2140,500)
  pl.cool = 0;
  hold(g, {}, 0.2);
  check('a placard fires a tooltip at what it can see', g.shots.length === 1, `shots=${g.shots.length}`);
  const n0 = g.notice;
  hold(g, {}, 1.2);
  check('the tooltip hurts', g.notice > n0 + 5 || evCount(g, 'hurt') > 0, `n ${n0} -> ${g.notice.toFixed(1)}`);
}
{
  const g = zoo(2100, 590);
  g.menus.length = 0;
  g.p.hearts = 3;
  g.L.placards[0].cool = 0;
  hold(g, {}, 1.6);
  check('hearts eat tooltips', g.p.hearts === 2, `hearts=${g.p.hearts}`);
}
{
  const g = zoo(2100, 590);
  g.menus.length = 0;
  g.p.worn = 'SMASH';
  g.L.placards[0].cool = 0;
  hold(g, {}, 1.6);
  check('worn SMASHES MENUS shatters tooltips on contact', evCount(g, 'hurt') === 0 && g.shots.length === 0 && g.notice < 8);
}
{
  const g = zoo(2100, 590);
  g.menus.length = 0;
  g.p.worn = 'OWNS';
  g.L.placards[0].cool = 0;
  hold(g, {}, 1.2);
  check('the boss of the room is left alone by its own signs', g.shots.length === 0);
}
{
  const g = zoo(2100, 590);
  g.menus.length = 0;
  g.L.placards[0].cool = 99;
  teleport(g, 1990, 590);
  hold(g, {}, 0.1);
  bite(g); // out of reach: nothing
  check('a bite that cannot reach does nothing', g.L.placards[0].hp === 2);
  teleport(g, 2132, 556); g.p.vy = 0;
  bite(g); bite(g);
  check('two bites take a placard down', g.L.placards[0].dead === true);
}

/* ================================================================== */
console.log('The trampoline');
/* ================================================================== */
{
  const g = zoo(2380, 590);
  g.menus.length = 0;
  hold(g, { mx: 1 }, 0.7);
  check('walking over the trampoline is just walking', g.p.y > 580 && g.p.x > 2460, at(g));
  teleport(g, 2460, 590); hold(g, {}, 0.3);
  let top = 999;
  hold(g, (gg) => { top = Math.min(top, gg.p.y); return { mx: 1, jump: true }; }, 0.6);
  hold(g, (gg) => { top = Math.min(top, gg.p.y); return { mx: 1 }; }, 1.4);
  check('jump on it and you go much higher than a jump', top < 330, `apex y=${top.toFixed(0)}`);
  check('...high enough to land on the gallery', g.p.grounded && g.p.y < 345 && g.p.x > 2640, at(g));
}
{
  // the pit bottoms bounce you out, whatever you were doing
  const g = zoo(5100, 590);
  g.menus.length = 0; g.L.placards.forEach((p) => { p.dead = true; });
  teleport(g, 5200, 700); g.p.vy = 300;
  hold(g, { mx: 1 }, 1.4);
  check('fall into a pit in the finale and the floor throws you back out', g.p.x > 5285 && !g.digest, at(g));
}

/* ================================================================== */
console.log('OWNS THE ROOM: the boss of the space');
/* ================================================================== */
{
  const g = zoo(1500, 590);
  g.menus.length = 0;
  const a = docentAt(g, 1900, 520);
  applyToTarget(g, 'OWNS', { type: 'surface', ref: null, x: 1800, y: 590 }, 'throw');
  check('OWNS THE ROOM makes a decoy where it lands', !!g.decoy && Math.abs(g.decoy.x - 1800) < 1);
  hold(g, {}, 4);
  check('the docents go to the boss, not to you', Math.hypot(a.x - 1800, a.y - 590) < 120 && g.stats.leash === 0, `${Math.hypot(a.x - 1800, a.y - 590).toFixed(0)}`);
  hold(g, {}, 9);
  check('...for twelve seconds', g.decoy === null);
}
{
  // placards look at it instead
  const g = zoo(2200, 590);
  g.menus.length = 0;
  applyToTarget(g, 'OWNS', { type: 'surface', ref: null, x: 2150, y: 585 }, 'throw');
  g.L.placards[0].cool = 0;
  hold(g, {}, 0.1);
  check('placards fire at the boss', g.shots.length === 1 && g.shots[0].decoy === true);
}

/* ================================================================== */
console.log('Closing time');
/* ================================================================== */
{
  const g = zoo(4960, 590);
  g.menus.length = 0; g.L.placards.forEach((p) => { p.dead = true; });
  check('the zoo is open until you cross the line', !g.L.closing.on && !g.L.cursor.active);
  hold(g, { mx: 1 }, 0.4);
  check('cross it and the zoo is closing, and the cursor comes for you', g.L.closing.on && g.L.cursor.active);
  const s1 = g.L.shutters[0];
  check('nothing is shut yet', s1.state === 'open' && !s1.rect.on);
  teleport(g, 5100, 590); g.p.vx = 0;
  hold(g, {}, 5.3);
  check('the first shutter starts to come down at five seconds', s1.state === 'closing');
  hold(g, {}, 1.5);
  check('...and shuts, floor to ceiling', s1.state === 'closed' && s1.rect.h >= 259 && s1.rect.on);
}
{
  // shut in behind a shutter with nothing to smash it: removed
  const g = zoo(5100, 590);
  g.menus.length = 0; g.L.placards.forEach((p) => { p.dead = true; });
  g.L.closing.on = true; g.L.closing.t = 5.1; g.L.cursor.active = false;
  const s1 = g.L.shutters[0];
  hold(g, {}, 2);
  check('you cannot walk through a shut shutter', g.p.x < 5540);
  hold(g, {}, 4, () => g.digest);
  check('shut in with nothing to smash it and ZOOM removes you', !!g.digest);
  hold(g, {}, 4);
  check('...and the zoo opens again for another try', !g.L.closing.on && s1.state === 'open' && s1.rect.on === false);
}
{
  // a thrown SMASHES MENUS at CLOSED
  const g = zoo(5440, 590);
  g.menus.length = 0; g.L.placards.forEach((p) => { p.dead = true; });
  g.L.closing.on = true; g.L.closing.t = 6.5; g.L.cursor.active = false;
  g.L.shutters[0].state = 'closed'; g.L.shutters[0].p = 1; g.L.shutters[0].rect.h = 260; g.L.shutters[0].rect.on = true;
  g.p.mouth = 'SMASH'; g.p.face = 1;
  const sol = solveThrow(g, (h) => h.type === 'shutter');
  check('you can throw SMASHES MENUS at a CLOSED sign', !!sol);
  if (sol) { doThrow(g, sol); hold(g, {}, 1.5); }
  check('CLOSED is a Menu. it breaks, half-shut', g.L.shutters[0].state === 'broken' && g.L.shutters[0].rect.h === 190);
  hold(g, { mx: 1 }, 2);
  check('and a dog fits under the rest of it', g.p.x > 5580, at(g));
}
{
  // crushed by a falling shutter
  const g = zoo(5555, 590);
  g.menus.length = 0; g.L.placards.forEach((p) => { p.dead = true; });
  g.L.closing.on = true; g.L.closing.t = 4.99; g.L.cursor.active = false;
  const n0 = g.notice;
  hold(g, {}, 1.6);
  check('standing under a falling shutter shoves you out from under it', Math.abs(g.p.x - 5555) > 12 && g.notice > n0, at(g));
}

/* ================================================================== */
console.log('The cursor');
/* ================================================================== */
{
  const g = zoo(5100, 590);
  g.menus.length = 0; g.L.placards.forEach((p) => { p.dead = true; });
  g.L.closing.on = true; g.L.closing.t = 0; g.L.closing.triggerX = 99999;
  const C = g.L.cursor; C.active = true; C.cx = 5100; C.cy = 330; C.state = 'hover'; C.t = 2.1;
  hold(g, {}, 0.3);
  check('the cursor lines up a click', C.state === 'aim');
  hold(g, {}, 1.3, () => C.state === 'click');
  hold(g, {}, 0.05);
  check('stand still and you are selected', !!g.digest, `state=${C.state}`);
}
{
  const g = zoo(5100, 590);
  g.menus.length = 0; g.L.placards.forEach((p) => { p.dead = true; });
  g.L.closing.on = true; g.L.closing.triggerX = 99999;
  const C = g.L.cursor; C.active = true; C.cx = 5100; C.cy = 330; C.state = 'hover'; C.t = 2.1;
  hold(g, { mx: 1 }, 1.6);
  check('keep moving and the click lands on where you were', !g.digest);
}
{
  const g = zoo(5100, 590);
  g.menus.length = 0; g.L.placards.forEach((p) => { p.dead = true; });
  g.L.closing.on = true; g.L.closing.triggerX = 99999;
  g.p.hearts = 2;
  const C = g.L.cursor; C.active = true; C.cx = 5100; C.cy = 330; C.state = 'hover'; C.t = 2.1;
  hold(g, {}, 2);
  check('hearts survive being selected, once', !g.digest && g.p.hearts === 1, `hearts=${g.p.hearts}`);
}
{
  // hiding: the cursor cannot select what it cannot see
  const g = zoo(4915, 590);
  g.menus.length = 0; g.L.placards.forEach((p) => { p.dead = true; });
  g.L.closing.on = true; g.L.closing.triggerX = 99999;
  const C = g.L.cursor; C.active = true; C.cx = 4915; C.cy = 330; C.state = 'hover'; C.t = 2.1;
  hold(g, { hide: true }, 3);
  check('hide in the Scar and the click hits the floor', g.p.hiding && !g.digest);
}
{
  // OWNS: the cursor clicks the boss instead
  const g = zoo(5100, 590);
  g.menus.length = 0; g.L.placards.forEach((p) => { p.dead = true; });
  g.L.closing.on = true; g.L.closing.triggerX = 99999;
  applyToTarget(g, 'OWNS', { type: 'surface', ref: null, x: 5300, y: 590 }, 'throw');
  const C = g.L.cursor; C.active = true; C.cx = 5100; C.cy = 330; C.state = 'hover'; C.t = 2.1;
  hold(g, {}, 2.2);
  check('the cursor clicks the crowned pebble and is busy for three seconds', !g.digest && g.decoy === null && C.busy > 0, `busy=${C.busy.toFixed(1)}`);
}

/* ================================================================== */
console.log('Never stranded, and between wings');
/* ================================================================== */
{
  const g = newGame(4, { wing: 3 });
  g.menus.length = 0;
  for (const v of g.L.veins) if (v.law === 'SMASH') v.taken = true;
  teleport(g, 4900, 590);
  hold(g, {}, 0.3);
  check('lose every SMASHES MENUS and the ticket window grows another', g.L.veins.some((v) => v.id === 'ticket3' && !v.taken));
}
{
  const g = newGame(9, { wing: 3, carry: { mouth: 'SMASH', haul: 'BORED', worn: 'LOOKS', hearts: 1, stats: { holes: 6, leash: 0, digests: 1, smashed: 2, perfect: 3 } } });
  check('Laws and tallies come with you from Appetite', g.p.mouth === 'SMASH' && g.p.haul === 'BORED' && g.p.worn === 'LOOKS' && g.p.hearts === 1 && g.stats.holes === 6);
}
{
  const g = zoo(300, 590);
  g.p.mouth = 'SMASH';
  tap(g, 'wear');
  check('SMASHES MENUS is wearable', g.p.worn === 'SMASH');
  tap(g, 'wear'); g.p.mouth = 'OWNS'; g.p.haul = null;
  tap(g, 'wear');
  check('OWNS THE ROOM is wearable', g.p.worn === 'OWNS');
}

/* ================================================================== */
console.log('The whole wing, landing to exit, no teleporting');
/* ================================================================== */
{
  const g = newGame(4, { wing: 3 });
  const P = () => at(g);
  hold(g, {}, 2);
  check('land in the ticket hall', g.p.grounded, P());

  // A dog that bites what floats at it and walks on. Menus that get close are bitten first.
  const nearMenu = () => g.menus.find((m) => !m.accepted && !m.sleep && Math.hypot(m.x - g.p.x, m.y - g.p.y) < 62);
  const walkFight = (x, max = 25) => {
    let t = 0;
    while (Math.abs(g.p.x - x) > 8 && t < max && !g.digest) {
      if (nearMenu()) { bite(g); t += 2 * DT; continue; }
      walkTo(g, x, { tol: 8, max: 0.2 }); t += 0.2;
    }
  };

  // Room 1
  walkFight(470);
  for (let i = 0; i < 9 && !g.L.gates[0].broken; i++) { bite(g); hold(g, {}, 0.1); }
  check('bite through the first turnstile', g.L.gates[0].broken, P());
  walkFight(1045);
  ripHere(g);
  check('rip SMASHES MENUS from the ticket window', g.p.mouth === 'SMASH', `${g.p.mouth}`);
  tap(g, 'wear');
  check('wear it', g.p.worn === 'SMASH');
  walkTo(g, 1470, { tol: 12 });
  check('walk through the second turnstile like it was never there', g.L.gates[1].broken && g.p.x > 1440, P());
  check('nobody employed us on the way', g.stats.leash === 0 && !g.digest);

  // Room 2: over the car, past the payphone, up the trampoline, into the cage
  walkTo(g, 2380, { tol: 14, max: 30 });
  check('cross Specimen Row over the station wagon', g.p.x > 2350 && g.p.grounded, P());
  creepTo(g, 2450);
  hold(g, { mx: 1, jump: true }, 0.5);
  hold(g, { mx: 1 }, 1.6);
  check('jump on the trampoline: up to the gallery', g.p.grounded && g.p.y < 345 && g.p.x > 2640, P());
  hold(g, {}, 0.3);
  walkTo(g, 3030, { tol: 20 });
  check('the cage door goes when you walk into it', g.L.gates[2].broken, P());
  creepTo(g, 3060);
  ripHere(g);
  check('rip OWNS THE ROOM from the coin', g.p.mouth === 'OWNS', `${g.p.mouth}`);
  // the only way out of the cage is the way in; then drop off the gallery's left end
  walkTo(g, 2900, { tol: 14 });
  hold(g, { mx: -1 }, 3, (gg) => gg.p.x < 2650);
  hold(g, { mx: -1 }, 2, (gg) => gg.p.grounded && gg.p.y > 580);
  walkTo(g, 3800, { tol: 20, max: 30 });
  check('drop off the gallery and out of Specimen Row', g.p.x > 3700 && !g.digest, P());

  // Room 3: six docents and a gift shop
  walkTo(g, 4700, { tol: 20, max: 30 });
  check('cross the gift shop; every docent that touches us shatters', g.p.x > 4650 && g.stats.leash === 0, P());
  check('...that is a lot of Menus', g.stats.smashed >= 5, `smashed ${g.stats.smashed}`);
  walkTo(g, 4830, { tol: 14 });
  check('the exit gate goes too', g.L.gates[3].broken, P());
  creepTo(g, 4915);
  hold(g, { hide: true }, 1);
  check('Scar 4 (the Ticket Stub) is the last stop before closing time', g.p.hiding && Math.abs(g.spawn.x - 4915) < 2);
  // cool off first: at Stare the floor grows teeth ahead of you, and closing time is no place for that
  hold(g, { hide: true }, 20, () => g.notice < 30);
  check('hide until ZOOM is bored before the gauntlet', g.notice < 30, `n=${g.notice.toFixed(0)}`);
  hold(g, { hide: false }, 0.2);

  // Room 4: closing time
  g.flags.dummy = 1;
  hold(g, (gg) => ({ mx: 1 }), 0.6);
  check('the zoo is closing', g.L.closing.on && g.L.cursor.active);
  let stuck = 0; let jumpHold = false; let t = 0;
  g.ev.length = 0;
  while (g.p.x < 6620 && t < 30 && !g.digest && !g.end) {
    const inp = { mx: 1 };
    if (g.p.grounded && Math.abs(g.p.vx) < 15) stuck++; else if (g.p.grounded) stuck = 0;
    if (stuck > 4) { jumpHold = true; stuck = 0; }
    // hop pits before falling in
    const pit = (g.p.x > 5108 && g.p.x < 5140) || (g.p.x > 6068 && g.p.x < 6100);
    if (pit && g.p.grounded) jumpHold = true;
    // dodge the click: it lands where you were a moment ago
    const C = g.L.cursor;
    if ((C.state === 'aim' || C.state === 'click') && Math.abs(g.p.x - C.tx) < 90 && Math.abs(g.p.y - C.ty) < 90) inp.mx = g.p.x < C.tx ? -1 : 1;
    if (jumpHold) { inp.jump = true; if (!g.p.grounded && g.p.vy > 0) jumpHold = false; }
    step(g, inp); t += DT;
    if (process.env.ZOO_DEBUG) {
      if (Math.round(t * 60) % 15 === 0) console.log('   ', t.toFixed(2), g.p.x.toFixed(0), g.p.y.toFixed(0), g.p.grounded, g.L.cursor.state, g.L.cursor.tx.toFixed(0), jumpHold);
      for (const e of g.ev) if (['hurt', 'click', 'digest', 'heart'].includes(e.type)) console.log('   ', t.toFixed(2), e.type, 'worn', g.p.worn, 'mouth', g.p.mouth, 'shots', g.shots.length, JSON.stringify(g.shots.map((s) => [s.x | 0, s.y | 0])), 'menus', g.menus.filter((m) => Math.hypot(m.x - g.p.x, m.y - g.p.y) < 80).length);
    }
    g.ev.length = 0;
  }
  check('outrun the shutters and the cursor', !!g.end || g.p.x >= 6580, P());
  check('nobody was swallowed', g.stats.digests === 0, `digests=${g.stats.digests}`);
  hold(g, { mx: 1 }, 2, () => g.end);
  check('out through the exit: the Zoo is done', !!g.end && g.end.wing === 3, P());
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

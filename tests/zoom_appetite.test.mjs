// Wing two (Appetite), headless. Mechanics one at a time, then a scripted bot
// plays the whole wing through real input with no teleporting.
//
//     node tests/zoom_appetite.test.mjs

import {
  newGame, step, DT, hold, tap, goTo, walkTo, creepTo, ripHere, solveThrow, doThrow, teleport,
  hopTo, hopChain, climbSafely, fork,
} from './zoom_bot.mjs';
import { tierOf } from '../zoom/js/core.js';
import { mawRect } from '../zoom/js/appetite.js';
import { applyToTarget } from '../zoom/js/world.js';

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? `  (${detail})` : ''}`); }
}
const at = (g) => `x=${g.p.x.toFixed(0)} y=${g.p.y.toFixed(0)} n=${g.notice.toFixed(0)} t=${g.t.toFixed(0)}s`;

/** Wing two, landed, standing at (x,y) with the clocks quiet. */
function wing2(x, y, seed = 5) {
  const g = newGame(seed, { wing: 2 });
  teleport(g, x, y);
  hold(g, {}, 0.4);
  g.ev.length = 0;
  return g;
}
const evCount = (g, type) => g.ev.filter((e) => e.type === type).length;

/* ================================================================== */
console.log('Regression: gripping a wall and getting to the top');
/* ================================================================== */
{
  // Wing one's tastebud wall, climbed with no sideways input at all.
  const g = newGame(1);
  goTo(g, 540); hold(g, { mx: 1, jump: true }, 0.15); hold(g, { mx: 1 }, 1.2, () => g.p.grounded && g.p.x > 620);
  creepTo(g, 1108.5);
  let maxv = 0;
  hold(g, (gg) => { maxv = Math.max(maxv, Math.hypot(gg.p.vx, gg.p.vy)); return { my: -1, grip: true }; }, 8, () => g.p.grounded && g.p.y < 275);
  hold(g, {}, 1.5);
  check('mantle onto the ledge lands you on top of the wall, not across the map', g.p.grounded && g.p.x > 1120 && g.p.x < 1300, at(g));
  check('nothing ever moves faster than a running dog while mantling', maxv < 700, `max ${maxv.toFixed(0)} px/s`);
}
{
  // Wing one's breathing wall, from the top knuckle, with no sideways input at all
  const g = newGame(1);
  g.L.gate.jammed = true; g.L.door.on = false; g.flags.bWoke = true; g.flags.crestMenu = true;
  teleport(g, 2530, -40); hold(g, {}, 0.5);
  let t = 0; let maxv = 0;
  while (t < 40 && !(g.p.grounded && g.p.y < -255)) {
    step(g, { my: -1, grip: true }); t += DT; maxv = Math.max(maxv, Math.hypot(g.p.vx, g.p.vy));
  }
  hold(g, {}, 1.5);
  check('the breath wall mantles onto the crest and stops', g.p.grounded && g.p.x > 2540 && g.p.x < 2680 && g.p.y < -255, at(g));
  check('...at climbing speed', maxv < 700, `max ${maxv.toFixed(0)}`);
}
{
  // Wing two's fold
  const g = newGame(1, { wing: 2 });
  hold(g, {}, 2);
  creepTo(g, 509.5);
  hold(g, { grip: true, my: -1 }, 10, () => g.p.grounded && g.p.y < 375);
  hold(g, {}, 1.5);
  check('the first fold mantles onto its ledge', g.p.grounded && g.p.x > 520 && g.p.x < 700 && g.p.y < 375, at(g));
}

/* ================================================================== */
console.log('Wing two: the clock');
/* ================================================================== */
{
  const g = newGame(2, { wing: 2 });
  hold(g, {}, 3);
  check('you land on the shore after the swallow', g.p.grounded && g.p.y > 880, at(g));
  check('the lake sleeps until you leave the shore', g.L.acid[0].y === 1000 && !g.L.acid[0].on);
  goTo(g, 300);
  const y0 = g.L.acid[0].y;
  hold(g, {}, 4);
  check('walk off and the lake starts to rise', g.L.acid[0].on && g.L.acid[0].y < y0 - 60, `${y0} -> ${g.L.acid[0].y.toFixed(0)}`);
}
{
  // no hearts: a couple of seconds in acid and you are digested
  const g = wing2(2000, 90);
  g.p.mouth = 'TEETH'; g.p.haul = 'STATIC';
  g.spawn = { x: 2435, y: 120 };
  teleport(g, 2000, 170); // in the gully
  hold(g, {}, 3, (gg) => gg.digest);
  check('in the gully without hearts, ZOOM swallows you inside two seconds', !!g.digest, `acidT=${g.p.acidT.toFixed(2)}`);
  hold(g, {}, 4);
  check('spat out at the last Scar', !g.digest && Math.abs(g.p.x - 2435) < 12, at(g));
  check('minus your heaviest Law (TEETH weighs more than STATIC)', g.p.mouth === 'STATIC' && g.p.haul === null, `${g.p.mouth}/${g.p.haul}`);
}

/* ================================================================== */
console.log('Wearing a Law');
/* ================================================================== */
{
  const g = wing2(300, 890);
  tap(g, 'wear');
  check('nothing wearable in your mouth: nothing happens', !g.p.worn && evCount(g, 'wearFail') === 1);
  g.p.mouth = 'TEETH'; g.p.ev = null;
  tap(g, 'wear');
  check('TEETH is not wearable', g.p.mouth === 'TEETH' && !g.p.worn);
  g.p.mouth = 'BORED'; g.p.haul = 'STATIC';
  tap(g, 'wear');
  check('V wears the Law in your mouth', g.p.worn === 'BORED');
  check('...and the haul slides forward into your mouth', g.p.mouth === 'STATIC' && g.p.haul === null);
  tap(g, 'wear');
  check('V again takes it off, back into the mouth slot if it is free', g.p.worn === null && g.p.haul === 'BORED' && g.p.mouth === 'STATIC');
}
{
  const g = wing2(300, 890);
  g.p.mouth = 'HEARTS';
  tap(g, 'wear');
  check('THREE HEARTS goes on as three hearts', g.p.hearts === 3 && g.p.mouth === null && g.p.worn === null);
  g.p.mouth = 'HEARTS';
  tap(g, 'wear');
  check('you cannot wear a second set', g.p.hearts === 3 && g.p.mouth === 'HEARTS');
  g.p.mouth = 'LOOKS';
  tap(g, 'wear');
  check('hearts and a mask are worn at the same time', g.p.hearts === 3 && g.p.worn === 'LOOKS');
}
{
  const g = wing2(2000, 90);
  g.p.hearts = 3;
  teleport(g, 2000, 170);
  hold(g, {}, 1.3);
  check('the first sip of acid pops a heart instead of hurting', g.p.hearts === 2 && !g.digest, `hearts=${g.p.hearts}`);
  check('...and kicks you upward out of the acid', g.p.y < 170);
  g.p.hearts = 1; teleport(g, 2000, 170);
  hold(g, {}, 1.6);
  check('the last heart pops and is gone', g.p.hearts === 0);
}
{
  const g = wing2(300, 890);
  g.p.hearts = 2; g.p.worn = 'BORED'; g.p.mouth = 'TEETH'; g.p.haul = null;
  g.spawn = { x: 300, y: 890 };
  g.digest = { t: 3 };
  hold(g, {}, 0.3);
  check('being swallowed takes the heaviest Law you own, worn or not', g.p.hearts === 0 && g.p.worn === 'BORED' && g.p.mouth === 'TEETH', `${g.p.hearts}/${g.p.worn}/${g.p.mouth}`);
}
{
  // LEAVES THE MEETING worn: V to leave
  const g = wing2(3000, 110);
  g.spawn = { x: 2435, y: 120 };
  g.p.worn = 'LEAVES';
  const n0 = g.notice;
  tap(g, 'wear');
  check('wear LEAVES THE MEETING, then V: you leave', Math.abs(g.p.x - 2435) < 6 && g.p.worn === null, at(g));
  check('...and it costs a little Notice', g.notice > n0);
}
{
  // GETS BORED worn: Notice drains, acid rises slower, you slouch
  const a = wing2(60, 890); const b = wing2(60, 890);
  b.p.worn = 'BORED';
  a.notice = 40; b.notice = 40;
  hold(a, { mx: 1 }, 1.3); hold(b, { mx: 1 }, 1.3);
  check('a bored dog is slower', b.p.x - 60 < a.p.x - 60 - 12, `${(a.p.x - 60).toFixed(0)} vs ${(b.p.x - 60).toFixed(0)}`);
  check('...and Notice drains even while moving', b.notice < a.notice - 1, `${a.notice.toFixed(1)} vs ${b.notice.toFixed(1)}`);
  hold(a, {}, 4); hold(b, {}, 4);
  check('...and the lake rises at half the pace', 1000 - b.L.acid[0].y < (1000 - a.L.acid[0].y) * 0.7, `${(1000 - a.L.acid[0].y).toFixed(0)} vs ${(1000 - b.L.acid[0].y).toFixed(0)}`);
}

/* ================================================================== */
console.log('Glass, and the mask that sees it');
/* ================================================================== */
{
  const g = wing2(2680, 120);
  const G1 = g.L.glass[0];
  check('glass platforms do not exist for the naked eye', G1.on === false);
  g.p.worn = 'LOOKS';
  hold(g, {}, 0.2);
  check('wear LOOKS THROUGH YOU and the ones near you turn solid', G1.on === true && g.L.glass[3].on === false, `near=${G1.on} far=${g.L.glass[3].on}`);
  g.p.worn = null;
  hold(g, {}, 0.6);
  check('take it off and they are gone again', G1.on === false);
  // thrown window
  g.p.mouth = 'LOOKS';
  teleport(g, 2690, 120); hold(g, {}, 0.3);
  const sol = solveThrow(g, (h) => h.type === 'surface' || h.type === 'acid');
  if (sol) doThrow(g, sol);
  hold(g, {}, 0.8);
  check('a thrown LOOKS THROUGH YOU opens a window that reveals glass for ~10 seconds', g.windows.length === 1 && g.L.glass.some((s) => s.on), `windows=${g.windows.length}`);
  hold(g, {}, 11);
  check('...and then it closes', g.L.glass.every((s) => s.on === false));
}

/* ================================================================== */
console.log('Mouths that eat what you carry');
/* ================================================================== */
{
  const g = wing2(3020, 100);
  const m = g.L.maws.find((x) => x.id === 'm1');
  const r = mawRect(m);
  teleport(g, r.x + r.w / 2, r.y + r.h - 12);
  g.p.worn = 'LOOKS'; g.p.mouth = 'TEETH'; g.p.haul = 'STATIC';
  m.state = 'rest'; m.t = 99;
  const n0 = g.notice;
  hold(g, {}, 2, () => g.pickups.length > 0);
  check('a maw snaps at what stands under it, then eats the Law in your mouth', g.pickups.some((p) => p.law === 'TEETH') && g.p.mouth === 'STATIC', `${g.p.mouth}/${g.p.haul}`);
  check('...and it hurts Notice', g.notice > n0 + 8);
}
{
  const g = wing2(3020, 100);
  const m = g.L.maws.find((x) => x.id === 'm1');
  const r = mawRect(m);
  teleport(g, r.x + r.w / 2, r.y + r.h - 12);
  g.p.worn = 'LOOKS'; g.p.hearts = 3; g.p.mouth = 'TEETH';
  m.state = 'rest'; m.t = 99;
  hold(g, {}, 2, () => g.p.hearts < 3);
  check('hearts absorb a bite, and you keep your Law', g.p.hearts === 2 && g.p.mouth === 'TEETH');
}
{
  const g = wing2(3020, 100);
  const m = g.L.maws.find((x) => x.id === 'm1');
  const r = mawRect(m);
  // watch the telegraph
  teleport(g, r.x - 120, 100); hold(g, {}, 0.3);
  m.state = 'rest'; m.t = 99;
  hold(g, {}, 0.3);
  check('a maw winds up for most of a second before it snaps', m.state === 'wind');
  hold(g, {}, 0.8);
  check('...and you can see it coming and stay clear', g.notice < 5);
}
for (const [law, expect, label] of [
  ['BORED', (m) => m.bored === true, 'GETS BORED: it yawns and forgets'],
  ['LEAVES', (m) => m.gone > 20, 'LEAVES THE MEETING: it has somewhere to be'],
  ['WONT_CLOSE', (m) => m.harmless === true, 'WON\'T CLOSE: it is a door now'],
  ['TEETH', (m) => m.gone > 5, 'TEETH: it bites itself'],
]) {
  const g = wing2(3020, 100);
  const m = g.L.maws.find((x) => x.id === 'm1');
  applyToTarget(g, law, { type: 'maw', ref: m, x: m.x, y: m.y }, 'jam');
  check(label, expect(m));
  hold(g, {}, 4);
  check(`...and it stays quiet (${law})`, m.state === 'rest' || m.gone > 0);
}
// and a real throw from the gallery's knuckle
{
  const g = wing2(4380, -70);
  const m = g.L.maws.find((x) => x.id === 'g1');
  g.p.mouth = 'BORED'; g.p.face = -1;
  const sol = solveThrow(g, (h) => h.type === 'maw');
  check('you can lob a Law at a gallery maw from the wall', !!sol);
  if (sol) { doThrow(g, sol); hold(g, {}, 1); check('...and it takes', m.bored === true); }
}

/* ================================================================== */
console.log('Crumbling ledges');
/* ================================================================== */
{
  const g = wing2(1540, 100);
  g.p.x = 1540; g.p.y = 140;
  hold(g, {}, 0.3);
  const c = g.L.crumbles[0];
  check('you can stand on a crumbling ledge for a moment', c.state === 'idle' && g.p.grounded);
  hold(g, {}, 0.8);
  check('...then it lets go', c.state === 'gone' && c.rect.on === false);
  teleport(g, 1540, 100);
  hold(g, {}, 4.5);
  check('...and grows back', c.state === 'idle' && c.rect.on === true);
}
{
  const g = wing2(1500, 100);
  const c = g.L.crumbles[0];
  teleport(g, 1420, 205); hold(g, {}, 0.3); // on the ledge before it
  g.p.mouth = 'HEARTS'; g.p.face = 1;
  const sol = solveThrow(g, (h) => h.type === 'crumble');
  check('THREE HEARTS can be thrown onto a crumbling ledge', !!sol);
  if (sol) { doThrow(g, sol); hold(g, {}, 0.8); }
  check('...and it holds from then on', c.perm === true);
  teleport(g, 1540, 130); hold(g, {}, 2);
  check('standing on it forever does nothing', c.rect.on === true && g.p.grounded);
}

/* ================================================================== */
console.log('GETS BORED, at the acid itself');
/* ================================================================== */
{
  const g = wing2(1790, 80);
  g.p.mouth = 'BORED'; g.p.face = 1;
  const pool = g.L.acid[1];
  hold(g, {}, 0.2);
  const sol = solveThrow(g, (h) => h.type === 'acid');
  check('the surface of the acid is a target', !!sol);
  if (sol) { doThrow(g, sol); hold(g, {}, 1.4); }
  check('bored acid ebbs', pool.bored > 10, `bored=${pool.bored.toFixed(1)}`);
  hold(g, {}, 2.5);
  check('the gully drains to its floor', pool.y > 175, `y=${pool.y.toFixed(0)}`);
  teleport(g, 2000, 170); hold(g, {}, 2);
  check('...and you can walk across it dry', !g.digest && g.p.acidT === 0);
  teleport(g, 1790, 80); hold(g, {}, 16);
  check('then it comes back', pool.y < 145, `y=${pool.y.toFixed(0)}`);
}
{
  const g = wing2(1200, 210);
  g.L.acid[0].on = true; g.L.acid[0].y = 500;
  g.p.mouth = 'BORED';
  g.L.acid[0].bored = 14;
  hold(g, {}, 4);
  check('a bored lake goes down instead of up', g.L.acid[0].y > 500, `${g.L.acid[0].y.toFixed(0)}`);
}

/* ================================================================== */
console.log('Hiding makes the stomach relax');
/* ================================================================== */
{
  const g = wing2(2435, 120);
  g.L.acid[0].on = true; g.L.acid[0].y = 400;
  hold(g, { hide: true }, 0.4);
  check('Scar 1 hides you', g.p.hiding);
  const y0 = g.L.acid[0].y;
  hold(g, { hide: true }, 3);
  check('the acid ebbs while you hide', g.L.acid[0].y > y0 + 40, `${y0} -> ${g.L.acid[0].y.toFixed(0)}`);
  // flood a Scar
  hold(g, { hide: false }, 0.2);
  g.L.acid[1].y = 100; // gully high enough to cover nothing at scar 1 ... move a lake over it instead
  const g2 = wing2(4635, -910);
  g2.L.acid[3].y = -930; g2.L.acid[3].x0 = 4500; g2.L.acid[3].x1 = 4700; g2.L.acid[3].on = true;
  hold(g2, { hide: true }, 0.4);
  check('a Scar the acid has covered will not hide you', !g2.p.hiding);
}

/* ================================================================== */
console.log('The exit sphincter');
/* ================================================================== */
for (const law of ['LEAVES', 'WONT_CLOSE']) {
  const g = wing2(6930, -1360);
  g.p.mouth = law; g.p.face = 1;
  check('the exit is a wall until opened', g.L.sphincter.rect.on !== false);
  hold(g, {}, 0.2);
  tap(g, 'thr');
  check(`jam ${law} into it and it opens`, g.L.sphincter.open === true && g.L.sphincter.rect.on === false);
  hold(g, { mx: 1 }, 2, () => g.end);
  check('walk through and the wing is over', !!g.end && g.end.wing === 2);
}

/* ================================================================== */
console.log('The stomach clenches');
/* ================================================================== */
{
  const g = wing2(5620, -910);
  const nave = g.L.acid[4];
  g.p.face = 1;
  check('the nave is dry to begin with', nave.y === -780 && !nave.on);
  step(g, { rip: true }); // rip meeting1
  ripHere(g);
  check('ripping the sign arms the surge', g.L.surge.armed && g.L.surge.pending > 0);
  check('...and tells you so with Notice', g.notice >= 70);
  hold(g, {}, 3);
  check('two and a half seconds later the nave starts to fill', nave.on && g.L.surge.on);
  const y0 = nave.y; hold(g, {}, 1);
  check('fast', y0 - nave.y > 30, `${(y0 - nave.y).toFixed(0)} px/s`);
  // swallowed: it resets, and re-arms when you head back for the balconies
  g.digest = { t: 3 }; g.spawn = { x: 4635, y: -910 };
  hold(g, {}, 0.3);
  check('being swallowed puts the acid back', !g.L.surge.on && nave.y === -780, `y=${nave.y}`);
  teleport(g, 5700, -910); hold(g, {}, 0.3);
  check('...but it starts again when you come back for the balconies', g.L.surge.pending > 0 || g.L.surge.on);
}


/* ================================================================== */
console.log('Never stranded');
/* ================================================================== */
{
  // the only way over the chasm is LOOKS THROUGH YOU; if it is gone, ZOOM grows another window
  const g = wing2(2600, 120);
  g.L.veins.find((v) => v.id === 'tasting').taken = true;
  hold(g, {}, 0.3);
  check('lose LOOKS before the chasm and a new window appears', g.L.veins.some((v) => v.id === 'tasting3' && !v.taken));
  creepTo(g, 2590);
  ripHere(g);
  check('...and you can rip it', g.p.mouth === 'LOOKS');
}
{
  const g = wing2(5300, -910);
  for (const v of g.L.veins) if (v.law === 'LEAVES') v.taken = true;
  hold(g, {}, 0.3);
  check('lose every LEAVES THE MEETING and another sign turns up', g.L.veins.some((v) => v.id === 'meeting3' && !v.taken));
}
{
  const g = wing2(5300, -910);
  g.p.haul = 'WONT_CLOSE';
  for (const v of g.L.veins) if (v.law === 'LEAVES') v.taken = true;
  hold(g, {}, 0.3);
  check('WON\'T CLOSE from wing one opens the exit too, so no sign is needed', !g.L.veins.some((v) => v.id === 'meeting3'));
}

/* ================================================================== */
console.log('Between wings');
/* ================================================================== */
{
  const g = newGame(9, { wing: 2, carry: { mouth: 'TEETH', haul: 'STATIC', worn: 'LOOKS', hearts: 2, stats: { holes: 3, leash: 1, digests: 2, smashed: 1, perfect: 2 } } });
  check('Laws you were carrying come with you', g.p.mouth === 'TEETH' && g.p.haul === 'STATIC' && g.p.worn === 'LOOKS' && g.p.hearts === 2);
  check('...and so do the tallies that will pick your ending', g.stats.holes === 3 && g.stats.leash === 1 && g.stats.digests === 2);
  check('you arrive from above', g.p.y < g.L.spawn.y - 300);
}

/* ================================================================== */
console.log('The whole wing, landing to exit, no teleporting');
/* ================================================================== */
{
  const g = newGame(5, { wing: 2 });
  const P = () => at(g);
  hold(g, {}, 2);
  check('land on the shore', g.p.grounded, P());

  // Room 1: the fold, the ledges, the valve
  creepTo(g, 509.5);
  hold(g, { grip: true, my: -1 }, 12, () => g.p.grounded && g.p.y < 375);
  check('climb the first fold', g.p.grounded && g.p.y < 375, P());
  const hops = [
    [{ x0: 580, x1: 960 }, { x0: 1020, x1: 1200, top: 300 }],
    [{ x0: 1020, x1: 1200 }, { x0: 1260, x1: 1420, top: 220 }],
    [{ x0: 1260, x1: 1420 }, { x0: 1480, x1: 1600, top: 150 }],
    [{ x0: 1480, x1: 1600 }, { x0: 1660, x1: 1860, top: 90 }],
  ];
  walkTo(g, 600, { tol: 12 });
  let ok = !!hopChain(g, [hops[0][0], ...hops.map((h) => h[1])]);
  check('hop the ledges up to the valve', ok && g.p.x > 1660, P());
  check('the rising lake has not caught us', !g.digest && g.stats.digests === 0);
  creepTo(g, 1790);
  ripHere(g);
  check('rip THREE HEARTS from the valve', g.p.mouth === 'HEARTS');
  tap(g, 'wear');
  check('wear it', g.p.hearts === 3 && g.p.mouth === null);
  hold(g, { mx: 1 }, 1.2, (gg) => gg.p.x > 1900);
  let t = 0;
  while (t < 10 && !(g.p.grounded && g.p.x > 2320 && g.p.y < 125)) { step(g, { mx: 1, jump: g.p.x > 2250 }); t += DT; }
  check('wade the gully, spending hearts', g.p.hearts < 3 && g.p.hearts >= 1 && !g.digest && g.stats.digests === 0, `hearts=${g.p.hearts} ${P()}`);
  creepTo(g, 2435);
  hold(g, { hide: true }, 1);
  check('Scar 1 (Rennet Pocket)', g.p.hiding && Math.abs(g.spawn.x - 2435) < 2);
  hold(g, { hide: false }, 0.2);

  // Room 2: the tasting room
  creepTo(g, 2652);
  ripHere(g);
  check('rip LOOKS THROUGH YOU from the tasting window', g.p.mouth === 'LOOKS');
  tap(g, 'wear');
  check('wear it as a mask', g.p.worn === 'LOOKS');
  const plats = [{ x0: 2300, x1: 2700, top: 130 }, { x0: 2780, x1: 2860, top: 150 }, { x0: 2940, x1: 3020, top: 110 }, { x0: 3100, x1: 3180, top: 150 }, { x0: 3260, x1: 3340, top: 90 }, { x0: 3420, x1: 3500, top: 130 }, { x0: 3580, x1: 3660, top: 90 }, { x0: 3740, x1: 3820, top: 130 }, { x0: 3860, x1: 4400, top: 130 }];
  ok = !!hopChain(g, plats, { waits: [0, 30, 60, 90, 120, 150, 180] });
  check('cross the chasm on platforms only the mask can see', ok && g.p.x > 3860 && !g.digest, P());
  creepTo(g, 3905);
  ripHere(g);
  check('rip GETS BORED at the far shore', g.p.mouth === 'BORED');
  creepTo(g, 4025);
  hold(g, { hide: true }, 1);
  check('Scar 2 (Gastric Pocket)', g.p.hiding && Math.abs(g.spawn.x - 4025) < 2);
  hold(g, { hide: false }, 0.2);

  // Room 3: the maw gallery
  creepTo(g, 4389.3);
  climbSafely(g, -405);
  ripHere(g, { grip: true });
  check('climb past the maws and rip a second GETS BORED off the wall', g.p.mouth === 'BORED' && g.p.haul === 'BORED', `${g.p.mouth}/${g.p.haul}`);
  climbSafely(g, -918);
  hold(g, { my: -1, grip: true }, 1, (gg) => gg.p.grounded && gg.p.y < -895);
  hold(g, {}, 0.3);
  check('mantle onto the cathedral floor', g.p.grounded && g.p.y < -895 && g.p.x > 4440 && g.p.x < 4700, P());
  creepTo(g, 4635);
  hold(g, { hide: true }, 1);
  check('Scar 3 (Old Ulcer)', g.p.hiding && Math.abs(g.spawn.x - 4635) < 2);
  hold(g, { hide: false }, 0.2);

  // Room 4: the cathedral
  walkTo(g, 5040, { tol: 10 }); creepTo(g, 5060);
  ripHere(g);
  check('rip a spare LEAVES THE MEETING off the first sign', g.p.mouth === 'LEAVES');
  walkTo(g, 5600, { tol: 10 }); creepTo(g, 5620);
  ripHere(g);
  check('rip the second sign: the stomach clenches', g.L.surge.armed && g.p.mouth === 'LEAVES');
  const chain = [{ x0: 5500, x1: 5760, top: -900 }, { x0: 5760, x1: 5860, top: -965 }, { x0: 5920, x1: 6020, top: -1030 }, { x0: 6080, x1: 6180, top: -1095 }, { x0: 6240, x1: 6340, top: -1160 }, { x0: 6400, x1: 6500, top: -1225 }, { x0: 6560, x1: 6660, top: -1290 }, { x0: 6720, x1: 6960, top: -1350 }];
  ok = !!hopChain(g, chain, { waits: [0, 30, 60, 90, 120, 150, 180] });
  check('climb the balconies ahead of the acid', ok && g.p.y < -1340 && !g.digest, P());
  check('the nave really was filling behind us', g.L.acid[4].y < -800 && g.L.surge.on, `y=${g.L.acid[4].y.toFixed(0)}`);
  creepTo(g, 6930);
  tap(g, 'thr');
  check('jam LEAVES THE MEETING into the exit: the door leaves', g.L.sphincter.open);
  hold(g, { mx: 1 }, 4, () => g.end);
  check('out through the sphincter: Appetite is done', !!g.end && g.end.wing === 2, P());
  check('nobody was swallowed', g.stats.digests === 0);
  check('four Holes made in the wing (valve, window, two mouths...)', g.stats.holes >= 6, `holes=${g.stats.holes}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

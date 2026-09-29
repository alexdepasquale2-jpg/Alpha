// Headless playthrough of the ZOOM Contact slice. A scripted bot plays the
// real sim through real inputs -- no teleporting -- and the test asserts that
// every beat of the design actually happens.
//
//     node tests/zoom.test.mjs

import {
  newGame, step, DT, hold, tap, goTo, walkTo, creepTo, ripHere, solveThrow, doThrow, teleport,
} from './zoom_bot.mjs';
import { tierOf, losClear } from '../zoom/js/core.js';
import { angDiff } from '../zoom/js/geom.js';

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? `  (${detail})` : ''}`); }
}
const at = (g) => `x=${g.p.x.toFixed(0)} y=${g.p.y.toFixed(0)} n=${g.notice.toFixed(0)} t=${g.t.toFixed(0)}s`;
const events = (g, type) => g.ev.filter((e) => e.type === type).length;

/** Step and keep a running tally of events (the sim clears nothing itself). */
function makeGame(seed = 3) {
  const g = newGame(seed);
  g.tally = {};
  const s = g.ev.push.bind(g.ev);
  g.ev.push = (...a) => { for (const e of a) g.tally[e.type] = (g.tally[e.type] || 0) + 1; return s(...a); };
  return g;
}


/* ================================================================== */
/* stages: each plays one beat of the slice through real input         */
/* ================================================================== */

/** Spawn -> rip WON'T CLOSE from the door -> jam it into the gate. */
function stageA(g) {
  goTo(g, 540); hold(g, { mx: 1, jump: true }, 0.15);
  hold(g, { mx: 1 }, 1.2, () => g.p.grounded && g.p.x > 620);
  check('jump the gap onto the tongue', g.p.x > 620 && g.p.grounded, at(g));

  goTo(g, 1106);
  hold(g, { mx: 1, my: -1, grip: true }, 8, () => g.p.grounded && g.p.y < 275);
  check('climb the tastebud wall and mantle onto the ledge', g.p.grounded && g.p.y < 275 && g.p.x > 1180, at(g));
  check('Notice is still Asleep after a pure climb', tierOf(g.notice) === 0, `n=${g.notice}`);

  goTo(g, 1626, { tol: 4 });
  const beforeRip = g.notice;
  check('the clenched door is a wall', g.L.door.on !== false);
  ripHere(g);
  check('ripped WON\'T CLOSE into the mouth', g.p.mouth === 'WONT_CLOSE');
  check('the door yawns open', g.L.door.on === false);
  check('a clean rip costs 14 Notice', Math.abs(g.notice - beforeRip - 14) < 1, `cost ${(g.notice - beforeRip).toFixed(1)}`);
  check('ripping made a Hole (stat)', g.stats.holes === 1);
  check('the warden wakes and the mites swarm', g.L.warden.state === 'patrol' && g.L.mites.filter((m) => m.alive && m.x < 2200).length === 3);

  let tries = 0;
  while (!g.L.gate.jammed && tries++ < 12) { walkTo(g, 2056, { tol: 5 }); hold(g, {}, 0.1); tap(g, 'thr'); }
  check('JAM WON\'T CLOSE into the gate', g.L.gate.jammed && g.p.mouth === null, `tries=${tries}`);
  check('the gate is now permanently open', g.L.gate.rect.on === false);
  check('the Law is consumed, not returned', g.p.mouth === null && g.p.haul === null && g.pickups.length === 0);
}

/** Off the ledge, into the pocket, up the breathing wall to the crest. */
function stageClimb(g) {
  walkTo(g, 2380, { tol: 10 });
  hold(g, { mx: 1 }, 2, (gg) => gg.p.x > 2405);
  hold(g, {}, 1.2);
  check('drop off the ledge into the pocket', g.p.y > 380, at(g));
  check('mites are waiting in the pocket', g.L.mites.filter((m) => m.x > 2400 && m.x < 2500).length === 2);
  goTo(g, 2529, { tol: 2, max: 12 });

  let t = 0;
  while (t < 90 && !(g.p.y < -255 && g.p.grounded)) {
    const inp = { my: -1, grip: true };
    if (g.p.y < -235) inp.mx = 1;
    else if (g.p.x > 2560) { goTo(g, 2528, { tol: 3 }); continue; }
    else if (g.p.x > 2531) inp.mx = -1;
    else if (g.p.x < 2526) inp.mx = 1;
    else inp.mx = 0;
    if ((g.p.grounded || g.p.vy < 0) && !g.p.grip && g.breathEx && g.p.x < 2531) inp.jump = true;
    step(g, inp); t += DT;
  }
  check('climb the breathing wall to the crest', g.p.grounded && g.p.y < -255, `${at(g)} climb ${t.toFixed(1)}s`);
  check('the climb takes a few breaths, not a minute', t < 45, `${t.toFixed(1)}s`);
}

/** Crest: TEETH on the side ledge, smash the Menu, jump the gap, slide down, hide in Scar 2. */
function stageCrest(g) {
  goTo(g, 2588, { tol: 3 }); hold(g, { mx: 1, jump: true }, 0.36); hold(g, {}, 0.6);
  goTo(g, 2652, { tol: 3 }); hold(g, { mx: 1, jump: true }, 0.3); hold(g, { mx: 0 }, 0.8);
  goTo(g, 2712, { tol: 4 });
  const before = g.notice;
  ripHere(g);
  check('optional side-ledge: rip TEETH', g.p.mouth === 'TEETH');
  check('TEETH costs 18 Notice when ripped clean', Math.abs(g.notice - before - 18) < 1.5 || g.sag > 0, `cost ${(g.notice - before).toFixed(1)}`);

  check('a Menu drifts in with a bridge that says USEFUL', g.menus.length === 1 && g.L.plank.on === true);
  hold(g, { mx: 1 }, 6, (gg) => {
    const m = gg.menus[0];
    return !m || Math.hypot(m.x - gg.p.x, m.y - gg.p.y) < 66 || gg.p.x > 3200;
  });
  if (g.menus[0]) tap(g, 'rip');
  check('bite the Menu: smashed, not accepted', g.stats.smashed === 1 && g.stats.leash === 0 && !g.menuMode, `smashed=${g.stats.smashed} leash=${g.stats.leash}`);
  check('smashing the Menu takes its fake bridge with it', g.L.plank.on === false);
  walkTo(g, 3272, { tol: 3 });
  hold(g, { mx: 1, jump: true }, 0.3); hold(g, { mx: 1 }, 0.5);
  check('jump the gap onto the rib\'s far side', g.p.x > 3335, at(g));
  hold(g, { mx: 1 }, 0.6, (gg) => gg.p.x > 3405);
  hold(g, { mx: -1, grip: true }, 1, (gg) => gg.p.grip);
  hold(g, { mx: -1, grip: true }, 8, (gg) => !gg.p.grip || gg.p.grounded);
  check('slide down the rib\'s outer face to the ledge', g.p.grounded && Math.abs(g.p.y - 290) < 4, at(g));
  goTo(g, 3455, { tol: 5 });
  hold(g, { hide: true }, 1);
  check('Scar 2 under the rib', g.p.hiding && Math.abs(g.spawn.x - 3455) < 2);
  hold(g, { hide: false }, 0.2);
}

/** Into the hall, sneak between the panes, climb to the frame, rip it. */
function stageHall(g) {
  hold(g, { mx: 1 }, 3, (gg) => gg.p.x > 3560 && gg.p.y > 560);
  hold(g, { mx: 1 }, 2, (gg) => gg.p.x > 3720);
  check('the hall seals behind you', g.L.seal.on === true);
  check('four zones: three curtains, three panes', g.L.curtains.length === 3 && g.L.panes.length === 3);

  const panesSee = (gg) => gg.L.panes.some((pn) => {
    if (pn.blind > 0 || pn.ignore > 0) return false;
    const a = Math.atan2(gg.p.y - pn.y, gg.p.x - pn.x);
    return Math.abs(angDiff(a, pn.ang)) < pn.half + 0.12 && Math.hypot(gg.p.x - pn.x, gg.p.y - pn.y) < pn.range
      && losClear(gg, pn.x, pn.y, gg.p.x, gg.p.y);
  });
  let t = 0; let hopStuck = 0; let jumping = false;
  while (g.p.x < 4640 && t < 90) {
    const inp = { mx: 1 };
    if (g.p.grounded && Math.abs(g.p.vx) < 15) hopStuck++; else if (g.p.grounded) hopStuck = 0;
    if (hopStuck > 4) { jumping = true; hopStuck = 0; }
    if (jumping) { inp.jump = true; if (!g.p.grounded && g.p.vy > 0) jumping = false; }
    if (panesSee(g) && g.p.grounded) { inp.mx = 0; delete inp.jump; jumping = false; }
    step(g, inp); t += DT;
  }
  check('sneak across zones 1-2 by moving only when the panes look away', g.p.x >= 4630, at(g));
  check('...without waking the eye', g.chase.state === 'idle', g.chase.state);
  check('...and Notice stayed under Stare', g.notice < 55, `n=${g.notice.toFixed(0)}`);

  creepTo(g, 4689);
  hold(g, { jump: true, grip: true }, 0.3);
  hold(g, { my: -1, grip: true }, 5, (gg) => Math.abs(gg.p.y - 440) < 8);
  check('climb the pillar face to the hanging pane', g.p.grip && Math.abs(g.p.y - 440) < 12, at(g));
  ripHere(g, { grip: true });
  check('ripped LOOKS THROUGH YOU', g.p.mouth === 'LOOKS' && g.p.haul === 'TEETH', `${g.p.mouth}/${g.p.haul}`);
  check('the third theft maxes Notice and the eye opens', g.notice >= 99 && g.chase.state === 'opening');
  check('the panes are blinded: ZOOM looks itself now', g.L.panes.every((p) => p.blind > 100));
  check('the eye takes 2 seconds to open before it can see you', g.chase.lid < 0.2);
}

/** Run for zone 4, read the teeth with LOOKS, open the hollow one with TEETH, hide, wait it out. */
function stageChase(g) {
  let pinnedMax = 0;
  hold(g, { grip: false }, 0.05);
  let t2 = 0; let stuck = 0; let jumpHold = false;
  while (g.p.x < 5545 && t2 < 20 && !g.digest) {
    const inp = { mx: 1 };
    if (g.p.grounded && Math.abs(g.p.vx) < 15) stuck++; else if (g.p.grounded) stuck = 0;
    if (stuck > 4) { jumpHold = true; stuck = 0; }
    if (jumpHold) { inp.jump = true; if (!g.p.grounded && g.p.vy > 0) jumpHold = false; }
    step(g, inp); t2 += DT;
    pinnedMax = Math.max(pinnedMax, g.chase.pin);
  }
  check('escape the frame pillar and run through the curtains to zone 4', g.p.x >= 5540 && !g.digest, `${at(g)} pin=${pinnedMax.toFixed(2)}`);
  check('the curtains broke its sight (not pinned yet)', g.stats.digests === 0);
  check('the eye is looking now', g.chase.state === 'hunt', g.chase.state);

  // LOOKS THROUGH YOU first: a window that shows which tooth is hollow
  const lookSol = solveThrow(g, (h) => h.type === 'surface' || h.type === 'molar');
  g.p.mouth = 'LOOKS';
  doThrow(g, lookSol);
  hold(g, {}, 0.6);
  check('LOOKS THROUGH YOU opens a window that shows the hollow tooth', g.windows.length > 0);
  if (g.p.mouth !== 'TEETH') tap(g, 'swap');
  const teethSol = solveThrow(g, (h) => h.type === 'molar' && h.ref.hollow);
  check('...and TEETH can be lobbed onto the hollow one', !!teethSol);
  if (teethSol) { doThrow(g, teethSol); hold(g, {}, 0.6); }
  check('the hollow molar cracks open Scar 3', g.L.molars[2].cracked === true && g.L.scars[2].open === true);

  walkTo(g, g.L.scars[2].spawn.x - 20, { tol: 12, max: 10 });
  creepTo(g, g.L.scars[2].spawn.x);
  hold(g, { hide: true }, 1);
  check('crawl into Scar 3', g.p.hiding && !g.digest, at(g));
  hold(g, { hide: true }, 14, () => g.end);
  check('hide until ZOOM gets bored: the chase ends', g.chase.state === 'done' || g.end, g.chase.state);
  hold(g, { hide: true }, 6, () => g.end);
  check('slice complete: you crawl out into black', !!g.end);
}

/* ================================================================== */
console.log('Room A: Mouth of Static');
/* ================================================================== */
{
  const g = makeGame();
  stageA(g);
}
/* ================================================================== */
console.log('Scar 1: hiding makes ZOOM bored');
/* ================================================================== */
{
  const g = makeGame();
  teleport(g, 1700, 270); g.L.door.on = false; g.L.veins[0].taken = true;
  g.L.warden.state = 'patrol'; g.L.warden.x = 1900; g.L.warden.dir = -1;
  g.notice = 40;
  // run at the warden so it goes alert
  hold(g, { mx: 1 }, 1.5, () => g.L.warden.state === 'alert');
  check('a noisy dog next to the warden gets sniffed out', g.L.warden.state === 'alert');
  // duck into the socket
  hold(g, { mx: -1 }, 2, (gg) => gg.p.x < 1830);
  goTo(g, 1815, { tol: 6 });
  hold(g, { mx: 0, hide: true }, 0.5);
  check('hold Down inside Scar 1 to hide', g.p.hiding);
  const n0 = g.notice;
  hold(g, { hide: true }, 4);
  check('hiding drops Notice fast', g.notice < n0 - 20, `${n0.toFixed(0)} -> ${g.notice.toFixed(0)}`);
  check('the warden gives up and goes back to patrol', g.L.warden.state === 'patrol');
  hold(g, { hide: true }, 6);
  check('long enough in the dark and the room goes slack (rips get cheaper)', g.sag > 0, `sag=${g.sag}`);
  check('the Scar is the new checkpoint', Math.abs(g.spawn.x - 1815) < 2);
  hold(g, { hide: false }, 0.2);
  check('let go and you are visible again', !g.p.hiding);
}


/* ================================================================== */
console.log('Room B: First Rib');
/* ================================================================== */
{
  const g = makeGame();
  g.L.gate.jammed = true; g.L.gate.rect.on = false; g.L.door.on = false; g.L.veins[0].taken = true;
  teleport(g, 2300, 270);
  stageClimb(g);
  stageCrest(g);
}
/* ================================================================== */
console.log('Menus: the useful trap');
/* ================================================================== */
{
  const g = makeGame();
  g.L.gate.jammed = true; g.L.door.on = false; g.flags.bWoke = true;
  teleport(g, 2900, -270); hold(g, {}, 0.3);
  // walk into it and get employed
  hold(g, { mx: 1 }, 20, (gg) => gg.menuMode);
  check('walking into a Menu accepts it', !!g.menuMode && g.stats.leash === 1);
  check('accepted Menu raises the Notice floor to Twitch', g.notice >= 30 && g.floor === 30);
  const rateStart = g.notice;
  hold(g, {}, 3);
  check('being useful keeps ticking Notice up', g.notice > rateStart + 4);
  // vein rip is blocked until you quit
  teleport(g, 2715, -410);
  hold(g, {}, 0.3);
  step(g, { rip: true }); step(g, { rip: false });
  check('with a Menu on you, E bites the Menu instead of ripping', !g.rip);
  step(g, { rip: true }); step(g, { rip: false });
  step(g, { rip: true }); step(g, { rip: false });
  check('three bites quit the job', !g.menuMode && g.floor === 0 && g.stats.smashed === 1, `mode=${!!g.menuMode}`);
}

/* ================================================================== */
console.log('Laws: what they do to what');
/* ================================================================== */
{
  // TEETH on a surface leaves teeth that bite the next thing that touches them
  const g = makeGame();
  teleport(g, 300, 590); hold(g, {}, 0.3);
  g.p.mouth = 'TEETH';
  const sol = solveThrow(g, (h) => h.type === 'surface');
  doThrow(g, sol);
  hold(g, {}, 1.5);
  check('a thrown Law lands and writes itself', g.teeth.length === 1 && g.p.mouth === null, `teeth=${g.teeth.length}`);
  const tp = g.teeth[0].rect;
  teleport(g, tp.x + tp.w / 2, tp.y - 12);
  const n0 = g.notice;
  hold(g, {}, 0.5);
  check('TEETH bite whoever stands on them', g.notice > n0 && events(g, 'hurt') + (g.tally.hurt || 0) > 0, `n ${n0} -> ${g.notice}`);
}
{
  // WON'T CLOSE thrown at nothing is a miss and falls on the floor
  const g = makeGame();
  teleport(g, 300, 590); hold(g, {}, 0.3);
  g.p.mouth = 'WONT_CLOSE';
  const sol = solveThrow(g, (h) => h.type === 'surface');
  doThrow(g, sol);
  hold(g, {}, 2);
  check('a Law with nothing to write on is a miss you can pick up again', g.pickups.length === 1 && g.pickups[0].law === 'WONT_CLOSE');
  const pk = g.pickups[0];
  teleport(g, pk.x, pk.y);
  hold(g, {}, 0.6);
  tap(g, 'rip');
  check('E picks it back up', g.p.mouth === 'WONT_CLOSE' && g.pickups.length === 0);
}
{
  // three rips, two hands
  const g = makeGame();
  g.p.mouth = 'TEETH'; g.p.haul = 'STATIC';
  teleport(g, 1626, 270); hold(g, {}, 0.3);
  ripHere(g);
  check('a third Law drops the mouth Law and swaps the haul in', g.p.mouth === 'WONT_CLOSE' && g.p.haul === 'STATIC' && g.pickups.some((p) => p.law === 'TEETH'), `${g.p.mouth}/${g.p.haul}`);
  tap(g, 'swap');
  check('Q swaps mouth and haul', g.p.mouth === 'STATIC' && g.p.haul === 'WONT_CLOSE');
}
{
  // STATIC: a bubble nothing sees into, and Notice drains inside it
  const g = makeGame();
  teleport(g, 300, 590); hold(g, {}, 0.3);
  g.notice = 80; g.p.mouth = 'STATIC';
  const sol = solveThrow(g, (h) => h.type === 'surface');
  doThrow(g, sol);
  hold(g, {}, 1);
  check('STATIC thrown makes a bubble', g.bubbles.length === 1);
  const b = g.bubbles[0];
  teleport(g, b.x, b.y);
  const n0 = g.notice;
  hold(g, {}, 2);
  check('Notice drains inside the bubble', g.notice < n0 - 8, `${n0.toFixed(0)} -> ${g.notice.toFixed(0)}`);
}
{
  // WON'T CLOSE on the hollow molar opens Scar 3; TEETH on a decoy molar wastes itself
  const g = makeGame();
  g.p.mouth = 'TEETH'; g.p.haul = 'WONT_CLOSE';
  teleport(g, 5520, 590); hold(g, {}, 0.3);
  const decoy = g.L.molars[0];
  check('Scar 3 starts sealed', g.L.scars[2].needsOpen && !g.L.scars[2].open);
  teleport(g, 5600, 534); hold(g, {}, 0.3);
  g.p.face = -1;
  tap(g, 'thr'); // jam toward the molar at left
  check('TEETH into the wrong molar chews it, nothing more', decoy.chewed || g.L.molars.some((m) => m.chewed), 'no molar chewed');
  check('...and the Scar is still sealed', !g.L.scars[2].open);
}


/* ================================================================== */
console.log('Room C: the Window Hall, and the chase');
/* ================================================================== */
{
  const g = makeGame(11);
  g.L.gate.jammed = true; g.L.gate.rect.on = false; g.L.door.on = false; g.L.veins[0].taken = true; g.L.veins[1].taken = true;
  g.flags.crestMenu = true; g.flags.bWoke = true;
  g.p.mouth = 'TEETH';
  teleport(g, 3520, 590); g.spawn = { ...g.L.hallSpawn }; hold(g, {}, 0.3);
  stageHall(g);
  stageChase(g);
  check('one Hole in this half: the eye', g.stats.holes === 1, `holes=${g.stats.holes}`);
}
/* ================================================================== */
console.log('The eye and being swallowed');
/* ================================================================== */
{
  const g = makeGame(5);
  g.L.gate.jammed = true; g.L.door.on = false; g.flags.sealed = true; g.L.seal.on = true; g.flags.crestMenu = true; g.flags.bWoke = true;
  g.p.mouth = 'TEETH'; g.p.haul = 'LOOKS';
  teleport(g, 4200, 590); hold(g, {}, 0.3);
  g.frameRipped = true;
  g.notice = 100;
  g.chase.state = 'opening'; g.chase.t = 0;
  g.spawn = { ...g.L.hallSpawn };
  // stand in the open
  hold(g, {}, 10, (gg) => gg.digest);
  check('stand still under the eye and you get pinned in about 4 seconds', !!g.digest, `pin=${g.chase.pin.toFixed(2)} t=${g.chase.t.toFixed(1)}`);
  hold(g, {}, 4);
  check('swallowed: spat out at the hall door', !g.digest && g.p.x < 3700 && g.p.x > 3600, at(g));
  check('...minus your heaviest Law (LOOKS THROUGH YOU)', g.p.mouth !== 'LOOKS' && g.p.haul !== 'LOOKS' && (g.p.mouth === 'TEETH' || g.p.haul === 'TEETH'), `${g.p.mouth}/${g.p.haul}`);
  check('...and the eye looks again from the start', g.chase.state === 'opening' && g.stats.digests === 1);
}
{
  // an offering: throw a Law far away and ZOOM chases the shiny
  const g = makeGame(5);
  g.L.gate.jammed = true; g.L.door.on = false; g.flags.sealed = true; g.L.seal.on = true; g.flags.crestMenu = true; g.flags.bWoke = true;
  g.p.mouth = 'TEETH'; g.frameRipped = true;
  teleport(g, 3700, 590); hold(g, {}, 0.3);
  g.notice = 100; g.chase.state = 'hunt'; g.chase.t = 3; g.chase.lid = 1; g.chase.E = { x: 3800, y: -290 }; g.chase.ang = Math.PI / 2;
  // hide behind the first curtain first so it cannot see us, then throw something far
  const sol = solveThrow(g, (h, x, y) => h.type === 'surface' && Math.hypot(x - g.p.x, y - g.p.y) > 200);
  check('there is a far throw from here', !!sol);
  if (sol) doThrow(g, sol);
  hold(g, {}, 1.5);
  check('a Law thrown far away in a chase becomes an offering', !!g.chase.offer || g.tally.offer > 0, `offer=${JSON.stringify(g.chase.offer)}`);
}
{
  // gravity rolls and footprints
  const g = makeGame(5);
  g.L.gate.jammed = true; g.L.door.on = false; g.flags.sealed = true; g.L.seal.on = true; g.flags.crestMenu = true; g.flags.bWoke = true;
  g.frameRipped = true;
  teleport(g, 3700, 590); hold(g, {}, 0.3);
  g.notice = 100; g.chase.state = 'hunt'; g.chase.t = 4.8; g.chase.lid = 1; g.chase.E = { x: 5450, y: -290 }; g.chase.ang = 0.1;
  // stay hidden from the eye behind the first curtain while running back and forth
  hold(g, (gg) => ({ mx: Math.sin(gg.t * 3) }), 4);
  check('footprints sprout teeth a second after you leave them', g.tally.footTeeth > 0, `sprouted=${g.tally.footTeeth || 0}`);
  g.chase.t = 25.5; g.chase.pin = 0;
  hold(g, (gg) => ({ mx: Math.sin(gg.t * 3) }), 6);
  check('the organ rolls: gravity turns 90 degrees', g.k === 1 && g.tally.roll >= 1, `k=${g.k}`);
  g.p.grip = false;
  hold(g, {}, 1.5);
  check('...and you fall toward the new floor', g.p.x > 3950, at(g));
}


/* ================================================================== */
console.log('The whole wing, spawn to Scar 3, no teleporting');
/* ================================================================== */
{
  const g = makeGame(21);
  stageA(g);
  stageClimb(g);
  stageCrest(g);
  stageHall(g);
  stageChase(g);
  check('three Holes made in the wing (door, mouth, eye)', g.stats.holes === 3, `holes=${g.stats.holes}`);
  check('nobody got swallowed on the way', g.stats.digests === 0);
  check('the run fits in the 20-minute slice budget (game time)', g.t < 20 * 60, `${(g.t / 60).toFixed(1)} min`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

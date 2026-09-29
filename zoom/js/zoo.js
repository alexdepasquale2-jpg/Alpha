// Wing three: the Zoo. ZOOM's collection of things it took from Earth, curated.
//
//   Room 1  The Ticket Hall     x -400..1440   turnstiles, a ticket window, docents
//   Room 2  Specimen Row        x 1440..3800   a car, a payphone, a trampoline, a locked cage
//   Room 3  The Gift Shop       x 3800..4816   six docents and one exit gate
//   Room 4  Closing Time        x 4816..6800   shutters coming down, a cursor that clicks you
//
// The twist is that ZOOM's interface leaks into the world. Menus are things you can meet:
//   docents (floating Menus) offer you a job; touch one and you are employed
//   ticket gates open for the employed, or for anyone who bites, smashes or leaves through them
//   placards fire tooltips at you
//   SMASHES MENUS is a weapon: thrown, the Menu it touches goes berserk and starts smashing the others
//   OWNS THE ROOM makes a thing the boss of the space: everything turns to look at it instead of you

import { clamp, dist, overlap } from './geom.js';
import { tierOf, emit, say, boxOf, addNotice, hurt, losClear } from './core.js';
import { beginDigest, smashMenu } from './sim.js';
import { popHeart } from './appetite.js';

/* ------------------------------------------------------------------ */
/* level                                                               */
/* ------------------------------------------------------------------ */

const FLOOR = 600;
const TOP = 340; // underside of the corridor ceilings

export function buildZoo() {
  const S = [];
  const add = (x, y, w, h, kind = 'solid', extra = {}) => {
    const r = { x, y, w, h, kind, ...extra };
    S.push(r);
    return r;
  };
  const gates = [];
  const gate = (id, x, y, h, text = 'TICKETS') => {
    const r = add(x, y, 36, h, 'solid', { ref: 'ticketgate', tag: 'ticketgate' });
    gates.push({ id, rect: r, hp: 6, open: false, openT: 0, broken: false, text });
    return r;
  };
  const springs = [];
  // a spring's collider sits flush in the floor under it, so walking onto it is not a step
  // `auto` springs (the pit bottoms) always bounce you; the trampoline only launches you when you jump on it
  const spring = (x, y, w, auto = false) => springs.push(add(x, y, w, 12, 'solid', { ref: 'spring', tag: 'spring', auto }));

  /* ---- Room 1: the Ticket Hall ---- */
  add(-400, FLOOR, 5540, 200, 'solid', { tag: 'floor' });            // main floor, up to the first pit
  add(420, 100, 1020, TOP - 100, 'solid', { tag: 'ceiling' });       // corridor over the turnstiles
  gate('g1', 520, TOP, FLOOR - TOP);
  add(1080, 510, 90, 90, 'solid', { tag: 'kiosk' });                 // the ticket window
  gate('g2', 1400, TOP, FLOOR - TOP);

  /* ---- Room 2: Specimen Row ---- */
  add(1700, 530, 110, 70, 'solid', { tag: 'car' });                  // a station wagon, hood
  add(1810, 470, 140, 130, 'solid', { tag: 'car' });                 //   cabin
  add(1950, 530, 100, 70, 'solid', { tag: 'car' });                  //   trunk
  spring(2440, FLOOR, 100);                                          // the trampoline: jump on it
  add(2640, 350, 540, 36, 'solid', { tag: 'gallery' });              // the gallery above it
  add(2960, 190, 180, 50, 'solid', { tag: 'cage' });                 // the cage: roof...
  add(3120, 240, 20, 110, 'solid', { tag: 'cage' });                 //   ...back wall
  gate('g3', 2960, 240, 110, 'CAGE');                                //   ...door

  /* ---- Room 3: the Gift Shop ---- */
  add(3800, -100, 1016, 350, 'solid', { tag: 'ceiling' });
  add(3920, 500, 120, 24, 'solid', { tag: 'shelf' });
  add(4100, 430, 120, 24, 'solid', { tag: 'shelf' });
  add(4280, 500, 120, 24, 'solid', { tag: 'shelf' });
  add(4460, 430, 120, 24, 'solid', { tag: 'shelf' });
  add(4680, 510, 90, 90, 'solid', { tag: 'kiosk' });                 // a second ticket window
  gate('g4', 4780, 250, FLOOR - 250, 'EXIT');

  /* ---- Room 4: Closing Time ---- */
  add(4816, -100, 1900, TOP + 100, 'solid', { tag: 'ceiling' });
  // a gap in the floor with a trampoline in the bottom, so falling in is a bounce, not a death
  add(5140, 800, 140, 80, 'solid', { tag: 'pit' }); spring(5140, 800, 140, true);
  add(5280, FLOOR, 820, 200, 'solid', { tag: 'floor' });
  add(6100, 800, 140, 80, 'solid', { tag: 'pit' }); spring(6100, 800, 140, true);
  add(6240, FLOOR, 560, 200, 'solid', { tag: 'floor' });
  const shutters = [
    { id: 's1', x: 5540, closeAt: 5, state: 'open', p: 0, rect: add(5540, TOP, 30, 0, 'solid', { ref: 'shutter', tag: 'shutter', on: false }) },
    { id: 's2', x: 5900, closeAt: 8.5, state: 'open', p: 0, rect: add(5900, TOP, 30, 0, 'solid', { ref: 'shutter', tag: 'shutter', on: false }) },
    { id: 's3', x: 6320, closeAt: 13, state: 'open', p: 0, rect: add(6320, TOP, 30, 0, 'solid', { ref: 'shutter', tag: 'shutter', on: false }) },
  ];

  const doc = (x, y, speed, wake, text = 'WELCOME!') => ({ x, y, speed, wake, text });
  const menuSpawns = [
    doc(350, 500, 62, 380), doc(900, 500, 66, 420), doc(1250, 470, 66, 420),
    doc(1900, 380, 70, 420), doc(2350, 470, 66, 420), doc(3000, 300, 66, 380),
    doc(3900, 400, 62, 420, 'HAVE A TICKET'), doc(4050, 330, 70, 420, 'ARE YOU LOST?'), doc(4200, 480, 62, 420, 'SPECIAL OFFER'),
    doc(4350, 320, 74, 420, 'ASK ME'), doc(4500, 460, 66, 420, 'HELLO!'), doc(4650, 330, 78, 420, 'SURVEY (1/9)'),
    doc(5450, 470, 60, 300, 'EXIT SURVEY'), doc(5750, 500, 60, 300), doc(6000, 470, 60, 300, 'ONE MOMENT'), doc(6400, 480, 60, 300, 'GOODBYE!'),
  ];

  const plc = (x, y, text) => ({ x, y, hp: 2, cool: 1 + (x % 7) / 7, dead: false, gone: 0, bored: 0, text });
  const placards = [
    plc(2140, 500, 'DID YOU KNOW?'), plc(2820, 260, 'TIP'), plc(3400, 510, 'HELP'),
    plc(5060, 380, 'LOADING...'), plc(5680, 380, 'WARNING: DOG'), plc(6180, 380, 'HAVE YOU TRIED BEING USEFUL?'), plc(6450, 380, 'PRESS F'),
  ];

  const scars = [
    { id: 'lostfound', zone: { x: 700, y: 562, w: 70, h: 38 }, spawn: { x: 735, y: 590 }, stash: null, noHide: false, visited: false },
    { id: 'vending', zone: { x: 3300, y: 562, w: 70, h: 38 }, spawn: { x: 3335, y: 590 }, stash: null, noHide: false, visited: false },
    { id: 'shelf', zone: { x: 4200, y: 562, w: 70, h: 38 }, spawn: { x: 4235, y: 590 }, stash: null, noHide: false, visited: false },
    { id: 'stub', zone: { x: 4880, y: 562, w: 70, h: 38 }, spawn: { x: 4915, y: 590 }, stash: null, noHide: false, visited: false },
  ];

  const veins = [
    { id: 'ticket', law: 'SMASH', x: 1074, y: 570, taken: false },
    { id: 'coin', law: 'OWNS', x: 3062, y: 322, taken: false },
    { id: 'ticket2', law: 'SMASH', x: 4674, y: 570, taken: false },
  ];

  const away = { x: -90000, y: -90000, w: 1, h: 1 };
  return {
    wing: 3,
    solids: S, curtains: [], scars, veins, panes: [], mites: [], molars: [],
    door: { ...away, on: false },
    gate: { rect: { ...away, on: false }, ...away, t: 0, jammed: true, teeth: false, mouthOpen: false },
    seal: { ...away, on: false }, plank: { ...away, on: false }, sleeper: { ...away },
    warden: { ...away, dir: 1, state: 'sleep', t: 0, x0: 0, x1: 0, stun: 0, harmless: false, lose: 0 },
    hall: { x0: 1e9, x1: 1e9 + 1, y0: 0, y1: 0 },
    spawn: { x: 120, y: 590 },
    hallSpawn: { x: 120, y: 590 },
    staticSpot: { x: 0, y: 0 },
    eyeHome: { x: 0, y: 0 },
    bounds: { x0: -700, x1: 7100, y0: -900, y1: 1400 },
    acid: [], maws: [], crumbles: [], glass: [],
    sphincter: { rect: { ...away }, open: true },
    exitZone: { x: 6580, y: TOP, w: 200, h: FLOOR - TOP },
    surge: { armed: false, pending: 0, on: false },
    gates, springs, shutters, placards, menuSpawns,
    closing: { on: false, t: 0, triggerX: 5000, lock: 0 },
    cursor: { active: false, x: 5000, y: 0, cx: 5000, cy: 0, state: 'hover', t: 0, tx: 0, ty: 0, busy: 0, hit: false },
    corridor: { top: TOP, floor: FLOOR },
  };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const gateCenter = (gt) => ({ x: gt.rect.x + gt.rect.w / 2, y: gt.rect.y + gt.rect.h / 2 });

/** Nearest point of a rect to (x,y), and how far it is. */
function rectDist(r, x, y) {
  const nx = clamp(x, r.x, r.x + r.w);
  const ny = clamp(y, r.y, r.y + r.h);
  return Math.hypot(x - nx, y - ny);
}

export function hasLaw(g, id) {
  const p = g.p;
  return p.mouth === id || p.haul === id || p.worn === id || g.pickups.some((k) => k.law === id) || g.proj.some((k) => k.law === id);
}

export function breakGate(g, gt, why = 'smash') {
  if (gt.broken) return;
  gt.broken = true;
  gt.rect.on = false;
  g.stats.smashed++;
  const c = gateCenter(gt);
  emit(g, 'gateBreak', { x: c.x, y: c.y, why });
}

export function destroyPlacard(g, pl) {
  if (pl.dead) return;
  pl.dead = true;
  g.stats.smashed++;
  emit(g, 'smash', { x: pl.x, y: pl.y });
}

/** E near a gate or placard bites it. Returns true if it bit something. */
export function zooBite(g) {
  const p = g.p;
  let best = null; let bd = 62;
  for (const gt of g.L.gates) {
    if (gt.broken) continue;
    const d = rectDist(gt.rect, p.x, p.y);
    if (d < bd) { bd = d; best = { gt }; }
  }
  for (const pl of g.L.placards) {
    if (pl.dead) continue;
    const d = dist(pl.x, pl.y, p.x, p.y) - 14;
    if (d < bd) { bd = d; best = { pl }; }
  }
  if (!best) return false;
  addNotice(g, 3);
  if (best.gt) {
    best.gt.hp--;
    emit(g, 'gateBite', { x: best.gt.rect.x, y: p.y, hp: best.gt.hp });
    if (best.gt.hp <= 0) breakGate(g, best.gt, 'bite');
  } else {
    best.pl.hp--;
    emit(g, 'bite', { x: best.pl.x, y: best.pl.y });
    if (best.pl.hp <= 0) destroyPlacard(g, best.pl);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* update                                                              */
/* ------------------------------------------------------------------ */

function updateGates(g, dt) {
  const p = g.p;
  for (const gt of g.L.gates) {
    if (gt.broken) { gt.rect.on = false; continue; }
    const c = gateCenter(gt);
    if (!g.flags.gateHint && rectDist(gt.rect, p.x, p.y) < 110) {
      g.flags.gateHint = true;
      say(g, 'TICKET REQUIRED. there are teeth marks on it already.', 4);
    }
    // the employed walk through: a Menu on your back is a ticket
    if (g.menuMode && rectDist(gt.rect, p.x, p.y) < 90) gt.openT = 2.5;
    gt.openT = Math.max(0, gt.openT - dt);
    gt.open = gt.openT > 0;
    if (gt.open) gt.rect.on = false;
    else if (!overlap(boxOf(p), gt.rect)) gt.rect.on = true;
    // SMASHES MENUS worn: you go through it
    if (p.worn === 'SMASH' && rectDist(gt.rect, p.x, p.y) < 16) {
      breakGate(g, gt, 'walk');
      say(g, 'it was a Menu. it was always a Menu.');
    }
  }
}

function updateSprings(g, dt) {
  const p = g.p;
  g.flags.boing = Math.max(0, (g.flags.boing || 0) - dt);
  if (g.flags.boing > 0 || p.hiding || g.digest) return;
  const feet = p.y + p.h / 2;
  for (const s of g.L.springs) {
    if (!(p.x + 8 > s.x && p.x - 8 < s.x + s.w)) continue;
    // pit bottoms bounce whatever falls in; the trampoline wants a jump (you leave the pad going up)
    const onIt = s.auto ? Math.abs(feet - s.y) < 5 && p.vy >= 0 : Math.abs(feet - s.y) < 16 && p.vy <= -300 && p.jumping;
    if (onIt) {
      p.vy = -1080; p.jumping = false; p.grip = false; p.gripLock = 0.15;
      g.flags.boing = 0.25;
      emit(g, 'boing', { x: p.x, y: s.y });
      return;
    }
  }
}

function updatePlacards(g, dt) {
  const p = g.p;
  const tier = tierOf(g.notice);
  const D = g.decoy;
  for (const pl of g.L.placards) {
    if (pl.dead) continue;
    pl.gone = Math.max(0, pl.gone - dt);
    pl.bored = Math.max(0, pl.bored - dt);
    if (pl.gone > 0 || pl.bored > 0) continue;
    pl.cool -= dt;
    if (pl.cool > 0) continue;
    // who is it looking at? the boss of the room, if there is one
    let tx = p.x; let ty = p.y;
    let ignoresPlayer = p.hiding || p.worn === 'OWNS';
    if (D && dist(pl.x, pl.y, D.x, D.y) < D.r) { tx = D.x; ty = D.y; ignoresPlayer = false; }
    const d = dist(pl.x, pl.y, tx, ty);
    if (ignoresPlayer || d > 580 || d < 30) continue;
    if (!losClear(g, pl.x, pl.y, tx, ty)) continue;
    pl.cool = (2.4 + (pl.x % 5) * 0.1) * (tier >= 2 ? 0.75 : 1);
    const sp = 220;
    g.shots.push({ x: pl.x, y: pl.y + 8, vx: ((tx - pl.x) / d) * sp, vy: ((ty - pl.y) / d) * sp, life: 3, text: pl.text, decoy: !!(D && tx === D.x) });
    emit(g, 'tooltip', { x: pl.x, y: pl.y });
  }
  for (let i = g.shots.length - 1; i >= 0; i--) {
    const s = g.shots[i];
    s.life -= dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    let dead = s.life <= 0;
    if (!dead && g.L.solids.some((sd) => sd.on !== false && s.x > sd.x && s.x < sd.x + sd.w && s.y > sd.y && s.y < sd.y + sd.h)) dead = true;
    if (!dead && D && dist(s.x, s.y, D.x, D.y) < 14) { dead = true; emit(g, 'shotHit', { x: s.x, y: s.y }); }
    if (!dead && !p.hiding && dist(s.x, s.y, p.x, p.y) < 15) {
      dead = true;
      if (p.worn === 'SMASH') { emit(g, 'smash', { x: s.x, y: s.y }); }
      else if (p.inv <= 0) {
        if (p.hearts > 0) popHeart(g, 'tooltip');
        else hurt(g, s.x - s.vx, s.y - s.vy, 10, 0.3);
      }
    }
    if (dead) g.shots.splice(i, 1);
  }
}

function updateDecoy(g, dt) {
  const D = g.decoy;
  if (!D) return;
  if (D.ref && g.menus.includes(D.ref)) { D.x = D.ref.x; D.y = D.ref.y; }
  D.t -= dt;
  if (D.t <= 0) g.decoy = null;
}

/* ---- closing time ---- */

function updateClosing(g, dt) {
  const L = g.L;
  const C = L.closing;
  const p = g.p;
  if (!C.on && !C.done && p.x > C.triggerX && !g.digest) {
    C.on = true; C.t = 0; C.lock = 0;
    L.cursor.active = true;
    L.cursor.cx = p.x; L.cursor.cy = p.y - 260; L.cursor.state = 'hover'; L.cursor.t = -1; L.cursor.busy = 0;
    say(g, 'THE ZOO IS NOW CLOSING.', 3.5);
    emit(g, 'closing');
  }
  if (!C.on) return;
  C.t += dt;
  const H = FLOOR - TOP;
  let blockedAhead = false;
  for (const s of L.shutters) {
    if (s.state === 'open' && C.t >= s.closeAt) { s.state = 'closing'; emit(g, 'shutter', { x: s.x }); }
    if (s.state === 'closing') {
      s.p = Math.min(1, s.p + dt / 1.4);
      s.rect.h = s.p * H;
      s.rect.on = s.rect.h > 2;
      if (s.p >= 1) s.state = 'closed';
      if (s.rect.on && overlap(boxOf(p), s.rect)) {
        p.x = p.x < s.x + s.rect.w / 2 ? s.x - p.w / 2 - 1 : s.x + s.rect.w + p.w / 2 + 1;
        hurt(g, s.x + s.rect.w / 2, p.y, 8, 0.35);
      }
    }
    if (s.state === 'broken') { s.rect.h = 190; s.rect.on = true; }
    if ((s.state === 'closed' || s.state === 'closing') && p.x < s.x) blockedAhead = true;
  }
  // shut in? ZOOM removes you
  if (blockedAhead && L.shutters.some((s) => s.state === 'closed' && p.x < s.x)) {
    C.lock += dt;
    const limit = hasLaw(g, 'SMASH') ? 10 : 3;
    if (C.lock > limit && !g.digest) { say(g, 'closed. you are being removed.'); beginDigest(g); }
  } else C.lock = 0;
}

export function smashShutter(g, s) {
  if (s.state === 'broken') return false;
  s.state = 'broken'; s.p = 1;
  s.rect.h = 190; s.rect.on = true;
  g.stats.smashed++;
  emit(g, 'gateBreak', { x: s.x, y: TOP + 100, why: 'shutter' });
  say(g, 'CLOSED. it says CLOSED. it is a Menu.');
  return true;
}

/* ---- the cursor ---- */

function updateCursor(g, dt) {
  const C = g.L.cursor;
  const p = g.p;
  if (!C.active) return;
  const tier = tierOf(g.notice);
  const D = g.decoy;
  const target = D ? D : p;
  C.t += dt;
  C.busy = Math.max(0, C.busy - dt);
  if (C.busy > 0) return;
  if (C.state === 'hover') {
    const goalX = target.x; const goalY = target.y - 240;
    C.cx += clamp(goalX - C.cx, -170 * dt, 170 * dt);
    C.cy += clamp(goalY - C.cy, -220 * dt, 220 * dt);
    if (C.t >= 2.2 * (tier >= 2 ? 0.8 : 1) && !p.hiding) { C.state = 'aim'; C.t = 0; C.tx = target.x; C.ty = target.y; emit(g, 'clickWind'); }
    else if (C.t >= 2.2 && p.hiding) C.t = 1.5;
  } else if (C.state === 'aim') {
    if (C.t < 0.55) { C.tx = target.x; C.ty = target.y; }
    C.cx += clamp(C.tx - C.cx, -260 * dt, 260 * dt);
    C.cy += clamp(C.ty - 200 - C.cy, -260 * dt, 260 * dt);
    if (C.t >= 1.15) { C.state = 'click'; C.t = 0; C.hit = false; }
  } else if (C.state === 'click') {
    C.cx = C.tx; C.cy = C.ty;
    if (!C.hit) {
      C.hit = true;
      emit(g, 'click', { x: C.tx, y: C.ty });
      if (D && dist(C.tx, C.ty, D.x, D.y) < 80) {
        g.decoy = null;
        C.busy = 3;
        say(g, 'it clicked the wrong thing. the cursor is busy.');
        C.state = 'stuck'; C.t = 0;
        return;
      }
      if (!p.hiding && dist(C.tx, C.ty, p.x, p.y) < 66 && !g.digest) {
        if (p.hearts > 0) popHeart(g, 'click');
        else { say(g, 'SELECTED.'); beginDigest(g); }
      }
    }
    if (C.t >= 0.15) { C.state = 'stuck'; C.t = 0; }
  } else if (C.state === 'stuck') {
    if (C.t >= 1.1) { C.state = 'hover'; C.t = 0; }
  }
}

/* ---- safety, exit ---- */

function updateSafety(g) {
  const p = g.p;
  if (p.x > 4800 && !g.flags.ticket3 && !hasLaw(g, 'SMASH') && !g.L.veins.some((v) => !v.taken && v.law === 'SMASH' && v.x > 4700)) {
    g.flags.ticket3 = true;
    g.L.veins.push({ id: 'ticket3', law: 'SMASH', x: 4850, y: 540, taken: false, cost: 10 });
    say(g, 'another ticket window. it likes a customer.');
    emit(g, 'menuSpawn', { x: 4850, y: 540 });
  }
}

export function updateZoo(g, dt) {
  updateSafety(g);
  updateGates(g, dt);
  updateSprings(g, dt);
  updatePlacards(g, dt);
  updateDecoy(g, dt);
  updateClosing(g, dt);
  updateCursor(g, dt);
  const L = g.L;
  if (overlap(boxOf(g.p), L.exitZone) && !g.end && !g.digest) {
    g.end = { t: 0, wing: 3 };
    emit(g, 'end');
  }
}

export function resetZooAfterDigest(g) {
  const L = g.L;
  L.closing.on = false; L.closing.t = 0; L.closing.lock = 0;
  L.cursor.active = false; L.cursor.busy = 0; L.cursor.state = 'hover';
  for (const s of L.shutters) {
    if (s.state === 'broken') continue;
    s.state = 'open'; s.p = 0; s.rect.h = 0; s.rect.on = false;
  }
  g.shots.length = 0;
  g.decoy = null;
}

/* ------------------------------------------------------------------ */
/* Laws vs. this wing's things                                         */
/* ------------------------------------------------------------------ */

export function zooTargets(g, x, y, r, law, add) {
  for (const gt of g.L.gates) {
    if (gt.broken) continue;
    if (rectDist(gt.rect, x, y) < r) add('ticketgate', gt, gt.rect.x + gt.rect.w / 2, clamp(y, gt.rect.y, gt.rect.y + gt.rect.h));
  }
  for (const pl of g.L.placards) {
    if (!pl.dead && dist(x, y, pl.x, pl.y) < r + 20) add('placard', pl, pl.x, pl.y);
  }
  for (const s of g.L.shutters) {
    if (s.state === 'closed' || s.state === 'closing') {
      if (rectDist(s.rect, x, y) < r) add('shutter', s, s.x + s.rect.w / 2, y);
    }
  }
}

const pass = (law) => (law === 'LOOKS' || law === 'STATIC' ? undefined : false);

export function applyZoo(g, law, t) {
  const ref = t.ref;
  const write = () => emit(g, 'write', { law, x: t.x, y: t.y });
  // the boss of the room: it goes wherever it lands
  if (law === 'OWNS') {
    g.decoy = { x: t.x, y: t.y, r: 340, t: 12, ref: t.type === 'menu' ? ref : null };
    write();
    emit(g, 'decoy', { x: t.x, y: t.y });
    say(g, 'everything turns to look at it.');
    return true;
  }
  switch (t.type) {
    case 'menu':
      if (law === 'SMASH') {
        ref.berserk = 8; ref.sleep = false; ref.accepted = false;
        write(); emit(g, 'berserk', { x: ref.x, y: ref.y });
        say(g, 'it hates other menus now.');
        return true;
      }
      if (law === 'LEAVES') { g.menus.splice(g.menus.indexOf(ref), 1); if (ref.accepted) { g.menuMode = null; g.floor = 0; } write(); say(g, 'the Menu has a meeting.'); return true; }
      if (law === 'BORED') { ref.sleep = true; ref.wake = 0; ref.bored = true; write(); say(g, 'it drifts off, unfulfilled.'); return true; }
      if (law === 'WONT_CLOSE') { ref.text = '(open forever)'; write(); return true; }
      return undefined;
    case 'placard':
      if (law === 'SMASH' || law === 'TEETH') { destroyPlacard(g, ref); write(); return true; }
      if (law === 'LEAVES') { ref.gone = 25; write(); say(g, 'the placard has somewhere to be.'); return true; }
      if (law === 'BORED') { ref.bored = 20; write(); say(g, 'the tooltip runs out of tips.'); return true; }
      return pass(law);
    case 'ticketgate':
      if (law === 'SMASH' || law === 'LEAVES' || law === 'WONT_CLOSE') { breakGate(g, ref, law); write(); return true; }
      if (law === 'TEETH') { ref.hp -= 3; write(); if (ref.hp <= 0) breakGate(g, ref, 'teeth'); return true; }
      return pass(law);
    case 'shutter':
      if (law === 'SMASH') { smashShutter(g, ref); write(); return true; }
      if (law === 'LEAVES' || law === 'WONT_CLOSE') { smashShutter(g, ref); write(); return true; }
      return pass(law);
    default:
      return undefined;
  }
}

/** Berserk Menus hunt every other Menu-shaped thing they can see. Called from the Menu update. */
export function berserkTarget(g, m) {
  let best = null; let bd = 520;
  for (const o of g.menus) {
    if (o === m || o.berserk > 0) continue;
    const d = dist(m.x, m.y, o.x, o.y);
    if (d < bd) { bd = d; best = { kind: 'menu', ref: o, x: o.x, y: o.y }; }
  }
  for (const pl of g.L.placards) {
    if (pl.dead) continue;
    const d = dist(m.x, m.y, pl.x, pl.y);
    if (d < bd) { bd = d; best = { kind: 'placard', ref: pl, x: pl.x, y: pl.y }; }
  }
  for (const gt of g.L.gates) {
    if (gt.broken) continue;
    const c = gateCenter(gt);
    const d = dist(m.x, m.y, c.x, c.y);
    if (d < bd) { bd = d; best = { kind: 'gate', ref: gt, x: c.x, y: clamp(m.y, gt.rect.y, gt.rect.y + gt.rect.h) }; }
  }
  return best;
}

export function smashTarget(g, tg) {
  if (tg.kind === 'menu') smashMenu(g, tg.ref);
  else if (tg.kind === 'placard') destroyPlacard(g, tg.ref);
  else if (tg.kind === 'gate') breakGate(g, tg.ref, 'berserk');
}


/** Ripping specific veins has side effects on the wing. */
export function onZooRip(g, v) {
  if (v.id === 'ticket' || v.id === 'ticket2' || v.id === 'ticket3') {
    // the ticket window notices its own ticket is gone
    for (const m of g.menus) if (m.sleep && dist(m.x, m.y, v.x, v.y) < 650) m.sleep = false;
    say(g, 'A TICKET WAS ISSUED. TO NO ONE. (V)', 4);
  }
  if (v.id === 'coin') say(g, 'a coin. it owns the room now. (V)', 4);
}

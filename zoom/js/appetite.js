// Wing two: Appetite. A stomach the size of a city.
//
//   Room 1  The Rugae        x -300..2700   climb the folds; an acid lake rises behind you
//   Room 2  The Tasting Room x 2700..4400   a chasm of glass platforms you can only see through a mask
//   Room 3  Maw Gallery      x 4240..4960   a wall climb past mouths that eat what you carry
//   Room 4  The Gut Cathedral x 4460..7200  the stomach contracts; climb out before it fills
//
// The twist is WEARING a Law (V). A worn Law is a passive rule on the dog itself:
//   THREE HEARTS  three sips of acid or bites are absorbed, then it's gone
//   LOOKS THROUGH YOU  a see-through bubble around you: glass platforms become solid,
//                 hidden things show, and ZOOM can see through it too (Notice drips)
//   GETS BORED    Notice drains, the acid rises half as fast, you slouch (slower)
//   LEAVES THE MEETING  press wear again to leave: back to your last Scar, Law spent
//
// Acid is the clock. It rises faster the more ZOOM notices you; hiding in a Scar
// (when ZOOM is bored) makes it ebb.

import { clamp, dist, overlap } from './geom.js';
import { NOTICE, tierOf, emit, say, boxOf, toWorld, addNotice, hurt } from './core.js';
import { beginDigest } from './sim.js';
import { dropPickup } from './world.js';

/* ------------------------------------------------------------------ */
/* level                                                               */
/* ------------------------------------------------------------------ */

export function buildAppetite() {
  const S = [];
  const add = (x, y, w, h, kind = 'solid', extra = {}) => {
    const r = { x, y, w, h, kind, ...extra };
    S.push(r);
    return r;
  };
  const crumbles = [];
  const crumble = (x, y, w, h = 24) => {
    const r = add(x, y, w, h, 'solid', { ref: 'crumble', tag: 'crumble' });
    crumbles.push({ rect: r, state: 'idle', t: 0, perm: false });
    return r;
  };
  const glass = [];
  const pane = (x, y, w, h = 20) => {
    const r = add(x, y, w, h, 'solid', { ref: 'glass', tag: 'glass', on: false, until: 0 });
    glass.push(r);
    return r;
  };

  /* ---- Room 1: the Rugae ---- */
  add(-300, 900, 820, 200, 'solid', { tag: 'shore' });              // where the swallow lands you
  add(520, 380, 60, 520, 'grip', { tag: 'fold' });                 // first fold: climbable
  add(580, 380, 380, 50, 'solid', { tag: 'ledge' });
  add(1020, 300, 180, 40, 'solid', { tag: 'ledge' });
  add(1260, 220, 160, 40, 'solid', { tag: 'ledge' });
  crumble(1480, 150, 120);
  add(1660, 90, 200, 40, 'solid', { tag: 'valve' });               // the valve ledge
  add(1860, 180, 440, 80, 'solid', { tag: 'poolfloor' });          // wade...
  crumble(1930, 100, 60, 20);                                       // ...or hop the stones
  crumble(2050, 100, 60, 20);
  crumble(2170, 100, 60, 20);
  add(2300, 130, 400, 60, 'solid', { tag: 'ledge' });              // far shore, Scar 1

  /* ---- Room 2: the Tasting Room ---- */
  add(2700, 700, 1160, 100, 'solid', { tag: 'pit' });               // bottom of the acid
  pane(2780, 150, 80); pane(2940, 110, 80); pane(3100, 150, 80); pane(3260, 90, 80);
  pane(3420, 130, 80); pane(3580, 90, 80); pane(3740, 130, 80);
  add(3860, 130, 540, 60, 'solid', { tag: 'ledge' });              // far shore, Scar 2

  /* ---- Room 3: the Maw Gallery ---- */
  add(4240, -900, 20, 940, 'solid', { tag: 'pole' });              // the maws hang on this
  add(4400, -900, 60, 1030, 'grip', { tag: 'gullet' });            // the wall you climb
  for (const y of [-60, -280, -500, -720]) add(4360, y, 40, 14, 'solid', { tag: 'knuckle', oneway: true });

  /* ---- Room 4: the Gut Cathedral ---- */
  add(4460, -900, 2440, 60, 'solid', { tag: 'nave' });
  add(5760, -965, 100, 24, 'solid', { tag: 'balcony' });
  crumble(5920, -1030, 100);
  add(6080, -1095, 100, 24, 'solid', { tag: 'balcony' });
  crumble(6240, -1160, 100);
  add(6400, -1225, 100, 24, 'solid', { tag: 'balcony' });
  add(6560, -1290, 100, 24, 'solid', { tag: 'balcony' });
  add(6720, -1350, 520, 40, 'solid', { tag: 'exitledge' });
  const sphincterRect = add(6960, -1560, 60, 210, 'solid', { ref: 'sphincter', tag: 'sphincter' });

  const zone = (id, x0, x1, home, base, top, rise, extra = {}) => ({
    id, x0, x1, y: home, home, base, top, rise, on: false, bored: 0, fixed: false, bottom: base + 400, ...extra,
  });
  const acid = [
    zone('lake', -400, 1860, 1000, 1000, 100, 24),
    zone('gully', 1860, 2300, 140, 180, 140, 0, { fixed: true, on: true, bottom: 260 }),
    zone('pit', 2700, 3860, 260, 700, 260, 0, { fixed: true, on: true, bottom: 800 }),
    zone('shaft', 4200, 4480, 300, 300, -1400, 20),
    zone('nave', 4460, 7000, -780, -780, -1500, 0, { bottom: -700, surgeRate: 40 }),
  ];

  const maw = (id, x, y, dx, dy, reach, period, phase) => ({
    id, x, y, dx, dy, reach, period, phase, state: 'rest', t: phase, bored: false, gone: 0, open: false,
  });
  const maws = [
    maw('m1', 3020, 20, 0, 1, 120, 3.0, 0.4),
    maw('m2', 3380, -20, 0, 1, 120, 3.0, 1.9),
    maw('g1', 4260, -150, 1, 0, 130, 2.8, 0.2),
    maw('g2', 4260, -400, 1, 0, 130, 2.8, 1.2),
    maw('g3', 4260, -650, 1, 0, 130, 2.8, 2.2),
    maw('c1', 6130, -1200, 0, 1, 100, 2.6, 0.5),
    maw('c2', 6450, -1330, 0, 1, 110, 2.6, 1.7),
  ];

  const scars = [
    { id: 'rennet', zone: { x: 2400, y: 92, w: 70, h: 38 }, spawn: { x: 2435, y: 120 }, stash: null, noHide: false, visited: false },
    { id: 'gastric', zone: { x: 3990, y: 92, w: 70, h: 38 }, spawn: { x: 4025, y: 120 }, stash: null, noHide: false, visited: false },
    { id: 'ulcer', zone: { x: 4600, y: -938, w: 70, h: 38 }, spawn: { x: 4635, y: -910 }, stash: null, noHide: false, visited: false },
    { id: 'hollow', zone: { x: 6110, y: -1133, w: 60, h: 38 }, spawn: { x: 6140, y: -1105 }, stash: null, noHide: false, visited: false },
  ];

  const veins = [
    { id: 'valve1', law: 'HEARTS', x: 1790, y: 62, taken: false },
    { id: 'tasting', law: 'LOOKS', x: 2655, y: 100, taken: false, cost: 22 },
    { id: 'yawn1', law: 'BORED', x: 3905, y: 100, taken: false },
    { id: 'yawn2', law: 'BORED', x: 4392, y: -420, taken: false },
    { id: 'meeting2', law: 'LEAVES', x: 5060, y: -940, taken: false, cost: 10 },
    { id: 'meeting1', law: 'LEAVES', x: 5620, y: -940, taken: false },
  ];

  // Everything Contact-specific exists but is inert, so the shared systems need no special cases.
  const away = { x: -90000, y: -90000, w: 1, h: 1 };
  return {
    wing: 2,
    solids: S, curtains: [], scars, veins, panes: [], mites: [], molars: [],
    door: { ...away, on: false },
    gate: { rect: { ...away, on: false }, ...away, t: 0, jammed: true, teeth: false, mouthOpen: false },
    seal: { ...away, on: false }, plank: { ...away, on: false }, sleeper: { ...away },
    warden: { ...away, dir: 1, state: 'sleep', t: 0, x0: 0, x1: 0, stun: 0, harmless: false, lose: 0 },
    hall: { x0: 1e9, x1: 1e9 + 1, y0: 0, y1: 0 },
    spawn: { x: 100, y: 600 },
    hallSpawn: { x: 100, y: 600 },
    staticSpot: { x: 0, y: 0 },
    eyeHome: { x: 0, y: 0 },
    bounds: { x0: -600, x1: 7400, y0: -1900, y1: 1500 },
    acid, maws, crumbles, glass,
    sphincter: { rect: sphincterRect, open: false },
    exitZone: { x: 7020, y: -1560, w: 200, h: 210 },
    surge: { armed: false, pending: 0, on: false },
  };
}

/* ------------------------------------------------------------------ */
/* acid                                                                */
/* ------------------------------------------------------------------ */

export function acidAt(g, x, y) {
  for (const z of g.L.acid) {
    if (x >= z.x0 && x <= z.x1 && y > z.y + 2 && y < z.bottom) return z;
  }
  return null;
}

export function zoneCovers(z, r) {
  return r.x + r.w > z.x0 && r.x < z.x1 && r.y + r.h > z.y + 2 && r.y < z.bottom;
}

function updateZones(g, dt) {
  const p = g.p;
  const tier = tierOf(g.notice);
  const S = g.L.surge;
  for (const z of g.L.acid) {
    // the rising lakes wake when you walk into their room
    if (!z.on && !z.fixed) {
      if (z.id === 'lake' && p.x > 200) z.on = true;
      if (z.id === 'shaft' && p.x > 4150 && p.x < 4500) z.on = true;
      if (z.id === 'nave' && S.on) z.on = true;
    }
    if (z.bored > 0) z.bored -= dt;

    if (z.fixed) {
      // pools stay put; bored ones drain, then slowly refill
      const target = z.bored > 0 ? z.base : z.home;
      const speed = z.bored > 0 ? 45 : 25;
      z.y += clamp(target - z.y, -speed * dt, speed * dt);
      continue;
    }
    let rate = z.on ? z.rise : 0;
    if (z.id === 'nave' && S.on) rate = z.surgeRate;
    else rate *= 1 + 0.2 * tier;
    if (p.worn === 'BORED') rate *= 0.5;
    if (z.bored > 0) rate = -45;
    else if (p.hiding && g.notice < NOTICE.stare) rate = -30; // ZOOM is bored: the whole stomach relaxes
    z.y = clamp(z.y - rate * dt, z.top, z.base);
  }
  // scars drown
  for (const s of g.L.scars) s.flooded = g.L.acid.some((z) => zoneCovers(z, s.zone));
}

function updateSurge(g, dt) {
  const S = g.L.surge;
  const p = g.p;
  if (S.armed && !S.on && S.pending <= 0 && p.x > 5650 && !g.digest) {
    S.pending = 2.5;
    say(g, 'the stomach clenches.');
    emit(g, 'surgeWarn');
  }
  if (S.pending > 0) {
    S.pending -= dt;
    if (S.pending <= 0) {
      S.on = true;
      g.notice = Math.max(g.notice, 70);
      emit(g, 'surge');
    }
  }
}

function updateDigestion(g, dt) {
  const p = g.p;
  const z = acidAt(g, p.x, p.y);
  p.inAcid = !!z;
  if (!z || g.digest) {
    p.acidT = Math.max(0, (p.acidT || 0) - dt * 2);
    return;
  }
  p.acidT = (p.acidT || 0) + dt;
  if (p.hearts > 0) {
    if (p.acidT >= 1.2) popHeart(g, 'acid');
  } else if (p.acidT >= 1.6) {
    beginDigest(g);
  }
}

export function popHeart(g, why) {
  const p = g.p;
  p.hearts--;
  p.acidT = 0;
  p.inv = Math.max(p.inv, 0.6);
  const [ux, uy] = toWorld(g, 0, -1);
  p.vx = ux * 330; p.vy = uy * 330;
  p.grip = false; p.gripLock = 0.2;
  addNotice(g, 6);
  emit(g, 'heart', { why, left: p.hearts });
  if (p.hearts <= 0) {
    emit(g, 'heartsGone');
    say(g, 'the last heart pops. it was a good heart.');
  }
}

/* ------------------------------------------------------------------ */
/* glass, crumbles, maws                                               */
/* ------------------------------------------------------------------ */

function updateGlass(g) {
  const p = g.p;
  for (const s of g.L.glass) {
    const cx = s.x + s.w / 2; const cy = s.y + s.h / 2;
    let seen = false;
    for (const w of g.windows) if (dist(cx, cy, w.x, w.y) < w.r + s.w / 2) seen = true;
    if (p.worn === 'LOOKS' && dist(cx, cy, p.x, p.y) < 128 + s.w / 2) seen = true;
    if (seen) s.until = g.t + 0.3;
    const on = g.t < s.until;
    if (!on && s.on !== false) emit(g, 'glassOff', { x: cx, y: cy });
    if (on && s.on === false) emit(g, 'glassOn', { x: cx, y: cy });
    s.on = on;
  }
}

function updateCrumbles(g, dt) {
  const p = g.p;
  for (const c of g.L.crumbles) {
    const s = c.rect;
    if (c.perm) { s.on = true; c.state = 'idle'; continue; }
    if (c.state === 'idle') {
      const feet = boxOf(p); feet.y += 3;
      if (overlap(feet, s) && p.grounded) c.t += dt; else c.t = Math.max(0, c.t - dt * 0.6);
      if (c.t > 0.55) {
        c.state = 'gone'; c.t = 0; s.on = false;
        emit(g, 'crumble', { x: s.x + s.w / 2, y: s.y });
      }
    } else {
      c.t += dt;
      if (c.t > 4 && !overlap(boxOf(p), s)) { c.state = 'idle'; c.t = 0; s.on = true; }
    }
  }
}

function mawRect(m) {
  if (m.dy > 0) return { x: m.x - 35, y: m.y, w: 70, h: m.reach };
  if (m.dy < 0) return { x: m.x - 35, y: m.y - m.reach, w: 70, h: m.reach };
  if (m.dx > 0) return { x: m.x, y: m.y - 35, w: m.reach, h: 70 };
  return { x: m.x - m.reach, y: m.y - 35, w: m.reach, h: 70 };
}
export { mawRect };

function updateMaws(g, dt) {
  const p = g.p;
  const tier = tierOf(g.notice);
  for (const m of g.L.maws) {
    if (m.gone > 0) { m.gone -= dt; m.state = 'rest'; m.open = false; continue; }
    if (m.bored || m.harmless) { m.state = 'rest'; m.open = !!m.harmless; continue; }
    const period = m.period * (tier >= 2 ? 0.75 : 1) * (g.L.surge.on ? 0.65 : 1);
    m.t += dt;
    if (m.state === 'rest' && m.t >= period) { m.state = 'wind'; m.t = 0; emit(g, 'mawWind', { x: m.x, y: m.y }); }
    else if (m.state === 'wind' && m.t >= 0.7) {
      m.state = 'snap'; m.t = 0;
      emit(g, 'mawSnap', { x: m.x, y: m.y });
      const r = mawRect(m);
      if (!p.hiding && p.inv <= 0 && overlap(boxOf(p), r)) {
        if (p.hearts > 0) popHeart(g, 'maw');
        else if (hurt(g, m.x, m.y, 15, 0.45) && p.mouth) {
          dropPickup(g, p.mouth, p.x, p.y);
          p.mouth = p.haul; p.haul = null;
          say(g, 'it ate your Law and spat it out. rude.');
        }
      }
    } else if (m.state === 'snap' && m.t >= 0.15) { m.state = 'recover'; m.t = 0; }
    else if (m.state === 'recover' && m.t >= 0.6) { m.state = 'rest'; m.t = 0; }
    m.open = m.state === 'wind' || m.state === 'snap';
  }
}

/* ------------------------------------------------------------------ */
/* update                                                              */
/* ------------------------------------------------------------------ */

function hasLaw(g, id) {
  const p = g.p;
  return p.mouth === id || p.haul === id || p.worn === id || g.pickups.some((k) => k.law === id) || g.proj.some((k) => k.law === id);
}

/**
 * Never strand the player. If the Law a room needs has been thrown into the acid, worn out,
 * or swallowed, and no vein for it is left, ZOOM grows another sign. (It is not being kind;
 * it just likes to watch.)
 */
const NEEDS = [
  { id: 'tasting3', laws: ['LOOKS'], x0: 2300, x1: 2790, at: [2590, 100], open: (g) => !g.flags.crossed && !g.windows.length, line: 'another window, wide open. it likes watching.' },
  { id: 'meeting3', laws: ['LEAVES', 'WONT_CLOSE'], x0: 4500, x1: 6900, at: [5420, -940], open: (g) => !g.L.sphincter.open, line: 'another sign for the meeting.' },
];

function updateSafety(g) {
  const p = g.p;
  if (p.x > 3860) g.flags.crossed = true;
  for (const n of NEEDS) {
    if (g.flags[n.id] || p.x < n.x0 || p.x > n.x1 || !n.open(g)) continue;
    const have = n.laws.some((l) => hasLaw(g, l));
    const veinLeft = g.L.veins.some((v) => !v.taken && n.laws.includes(v.law) && v.x >= n.x0 - 100 && v.x <= n.x1);
    if (have || veinLeft) continue;
    g.flags[n.id] = true;
    g.L.veins.push({ id: n.id, law: n.laws[0], x: n.at[0], y: n.at[1], taken: false, cost: 10 });
    say(g, n.line);
    emit(g, 'menuSpawn', { x: n.at[0], y: n.at[1] });
  }
}

export function updateAppetite(g, dt) {
  updateSafety(g);
  updateZones(g, dt);
  updateSurge(g, dt);
  updateGlass(g);
  updateCrumbles(g, dt);
  updateMaws(g, dt);
  updateDigestion(g, dt);
  // out through the sphincter
  const L = g.L;
  if (L.sphincter.open && overlap(boxOf(g.p), L.exitZone) && !g.end && !g.digest) {
    g.end = { t: 0, wing: 2 };
    emit(g, 'end');
  }
}

export function resetAppetiteAfterDigest(g) {
  const p = g.p;
  p.acidT = 0;
  p.inAcid = false;
  const S = g.L.surge;
  S.on = false; S.pending = 0;
  for (const z of g.L.acid) {
    if (z.fixed) continue;
    if (z.id === 'nave') { z.y = z.base; z.on = false; continue; }
    // put the water back under wherever ZOOM just spat you out
    if (g.spawn.x >= z.x0 && g.spawn.x <= z.x1) z.y = Math.max(z.y, Math.min(z.base, g.spawn.y + 220));
  }
}

/* ------------------------------------------------------------------ */
/* Laws vs. this wing's things                                         */
/* ------------------------------------------------------------------ */

export function appetiteTargets(g, x, y, r, law, add) {
  for (const m of g.L.maws) {
    if (m.gone > 0) continue;
    const mr = { x: m.x - 26, y: m.y - 26, w: 52, h: 52 };
    if (x > mr.x - r && x < mr.x + mr.w + r && y > mr.y - r && y < mr.y + mr.h + r) add('maw', m, m.x, m.y);
  }
  for (const c of g.L.crumbles) {
    const s = c.rect;
    if (s.on === false) continue;
    if (x > s.x - r && x < s.x + s.w + r && y > s.y - r && y < s.y + s.h + r) add('crumble', c, s.x + s.w / 2, s.y + s.h / 2);
  }
  const sp = g.L.sphincter.rect;
  if (!g.L.sphincter.open && x > sp.x - r && x < sp.x + sp.w + r && y > sp.y - r && y < sp.y + sp.h + r) add('sphincter', g.L.sphincter, sp.x + sp.w / 2, y);
  // the surface of the acid is a target (it is a mouth, it can be bored)
  for (const z of g.L.acid) {
    if (x >= z.x0 && x <= z.x1 && y > z.y - Math.max(4, r) && y < z.bottom) add('acid', z, x, z.y);
  }
}

// LOOKS and STATIC write themselves anywhere (a window, a bubble); leave those to the shared code.
const pass = (law) => (law === 'LOOKS' || law === 'STATIC' ? undefined : false);

/** Returns true/false when handled, undefined if this wing has no opinion. */
export function applyAppetite(g, law, t) {
  const ref = t.ref;
  const write = () => emit(g, 'write', { law, x: t.x, y: t.y });
  switch (t.type) {
    case 'acid':
      if (law === 'BORED') {
        ref.bored = 14; write();
        say(g, 'the acid loses interest. it ebbs.');
        return true;
      }
      return pass(law);
    case 'maw':
      if (law === 'BORED') { ref.bored = true; write(); say(g, 'the mouth yawns and forgets to close.'); return true; }
      if (law === 'LEAVES') { ref.gone = 25; write(); say(g, 'the mouth has a meeting.'); return true; }
      if (law === 'WONT_CLOSE') { ref.harmless = true; ref.open = true; write(); say(g, 'it stays open. it is a door now.'); return true; }
      if (law === 'TEETH') { ref.gone = 8; write(); say(g, 'it bites itself. it is embarrassed.'); return true; }
      if (law === 'HEARTS') { write(); say(g, 'it grows three hearts. why would you do that.'); return true; }
      return pass(law);
    case 'crumble':
      if (law === 'HEARTS') { ref.perm = true; ref.rect.on = true; write(); say(g, 'it will hold. it has hearts now.'); return true; }
      if (law === 'BORED') { ref.state = 'idle'; ref.t = 0; write(); return true; }
      return pass(law);
    case 'sphincter':
      if (law === 'LEAVES' || law === 'WONT_CLOSE') {
        ref.open = true; ref.rect.on = false; write();
        emit(g, 'sphincterOpen');
        say(g, law === 'LEAVES' ? 'the door has left the meeting.' : 'it cannot close. go.');
        return true;
      }
      return pass(law);
    default:
      return undefined;
  }
}

/** Ripping specific veins has side effects on the wing. */
export function onAppetiteRip(g, v) {
  if (v.id === 'valve1') say(g, 'a heart valve stops. wear it. (V)', 4);
  if (v.id === 'tasting') say(g, 'a window closes somewhere. put it on. (V)', 4);
  if (v.id === 'meeting1') {
    g.L.surge.armed = true;
    g.L.surge.pending = 2.5;
    g.notice = Math.max(g.notice, 70);
    say(g, 'the stomach clenches.');
    emit(g, 'surgeWarn');
  }
}

/** Wear key while wearing LEAVES THE MEETING: leave. */
export function eject(g) {
  const p = g.p;
  p.worn = null;
  p.grip = false; p.hiding = false;
  p.x = g.spawn.x; p.y = g.spawn.y; p.vx = 0; p.vy = 0; p.inv = 1.5;
  p.acidT = 0;
  addNotice(g, 8);
  emit(g, 'eject');
  say(g, 'you have left the meeting.');
}


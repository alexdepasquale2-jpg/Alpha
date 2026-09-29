// The simulation. Pure JS, no DOM: the browser drives it from main.js and the
// headless test drives it from tests/zoom.test.mjs.

import { clamp, sign, dist, overlap, pointIn, rng } from './geom.js';
import { LAWS } from './laws.js';
import { buildLevel } from './level.js';
import { buildAppetite, eject, resetAppetiteAfterDigest, onAppetiteRip } from './appetite.js';
import { buildZoo, zooBite, resetZooAfterDigest, onZooRip } from './zoo.js';
import {
  DT, GV, TV, NOTICE, tierOf, emit, say, boxOf, blockedAt, toWorld, toScreen,
  lawsCarried, heaviestLaw, inBubble, inHall, addNotice,
} from './core.js';
import { updateWorld, startChase, resetChase, targetsAt, applyToTarget } from './world.js';

export { DT, tierOf, TIER_NAMES } from './core.js';

/**
 * opts.wing  1 = Contact, 2 = Appetite, 3 = the Zoo
 * opts.carry {mouth, haul, worn, stats} from the wing before
 */
export function newGame(seed = 7, opts = {}) {
  const wing = opts.wing || 1;
  const L = wing === 3 ? buildZoo() : wing === 2 ? buildAppetite() : buildLevel();
  const g = {
    t: 0, phase: 'play', wing, L, k: 0, rand: rng(seed),
    p: {
      x: L.spawn.x, y: L.spawn.y, vx: 0, vy: 0, w: 20, h: 20, face: 1,
      grounded: false, coyote: 0, jbuf: 0, jumping: false,
      grip: false, gripDir: [0, 0], gripLock: 0, gripKind: null,
      hiding: false, scar: null, mouth: null, haul: null, worn: null, hearts: 0, acidT: 0, inAcid: false,
      stun: 0, inv: 0, sprint: 0, loud: false, moving: false, anim: 0,
    },
    spawn: { ...L.spawn },
    notice: 0, floor: 0, peak: 0, sag: 0, hideT: 0, comfort: 0,
    prev: {}, rip: null, aim: null,
    proj: [], teeth: [], bubbles: [], windows: [], foot: [], pickups: [], menus: [], drops: [], shots: [], decoy: null,
    menuMode: null, chase: resetChase(L),
    stats: { holes: 0, leash: 0, digests: 0, smashed: 0, perfect: 0 },
    ev: [], line: null, lineT: 0, digest: null, end: null,
    frameRipped: false, breathEx: true, flags: {},
  };
  if (opts.carry) {
    const c = opts.carry;
    g.p.mouth = c.mouth || null; g.p.haul = c.haul || null; g.p.worn = c.worn || null;
    g.p.hearts = c.hearts || 0;
    if (c.stats) g.stats = { ...c.stats };
  }
  if (wing === 3) {
    // spat out at the ticket hall, from a height
    g.p.y = L.spawn.y - 420;
    g.spawn = { x: L.spawn.x, y: L.spawn.y - 10 };
    g.line = 'NOW ENTERING: EARTH (COLLECTED).'; g.lineT = 4;
    for (const d of L.menuSpawns) {
      g.menus.push({ x: d.x, y: d.y, kind: 'docent', hp: 1, accepted: false, born: 0, speed: d.speed, wake: d.wake, sleep: true, text: d.text });
    }
  }
  if (wing === 2) {
    // the swallow: you arrive from above
    g.p.y = L.spawn.y - 420;
    g.spawn = { x: L.spawn.x, y: L.spawn.y - 10 };
    g.line = 'you were swallowed. it was inevitable.'; g.lineT = 4;
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* step                                                                */
/* ------------------------------------------------------------------ */

const EMPTY_INPUT = { mx: 0, my: 0, jump: false, grip: false, rip: false, thr: false, hide: false, swap: false, wear: false, bark: false };

export function step(g, inp = EMPTY_INPUT, dt = DT) {
  inp = { ...EMPTY_INPUT, ...inp };
  const prev = g.prev;
  const e = {
    jump: inp.jump && !prev.jump, rip: inp.rip && !prev.rip, ripUp: !inp.rip && prev.rip,
    thr: inp.thr && !prev.thr, thrUp: !inp.thr && prev.thr, swap: inp.swap && !prev.swap, wear: inp.wear && !prev.wear, bark: inp.bark && !prev.bark,
  };
  g.prev = inp;
  if (g.phase === 'title') return;
  g.t += dt;
  g.lineT = Math.max(0, g.lineT - dt);
  if (g.lineT === 0) g.line = null;

  if (g.end) { g.end.t += dt; return; }
  if (g.digest) { updateDigest(g, dt); updateWorld(g, dt); return; }

  g.breathEx = g.t % 3.8 < 2.5;
  updatePlayer(g, inp, e, dt);
  updateHide(g, inp, e, dt);
  updateRip(g, inp, e, dt);
  updateThrow(g, inp, e, dt);
  updatePickup(g, inp, e);
  if (e.wear) toggleWear(g);
  if (e.bark) emit(g, 'bark');
  updateWorld(g, dt);
  updateNotice(g, dt);
  checkEnd(g, dt);
}

/* ------------------------------------------------------------------ */
/* player                                                              */
/* ------------------------------------------------------------------ */

function approach(v, target, amt) {
  return v < target ? Math.min(target, v + amt) : Math.max(target, v - amt);
}

function scarAt(g) {
  for (const s of g.L.scars) if (pointIn(s.zone, g.p.x, g.p.y)) return s;
  return null;
}

function scarUsable(s) {
  if (!s || s.noHide || s.flooded) return false;
  if (s.needsOpen && !s.open) return false;
  return true;
}

/** Nearest surface we could cling to: returns {solid, dir:[wx,wy]} or null. */
function findGrip(g, p) {
  const G = GV[g.k];
  const b = boxOf(p);
  let best = null;
  let bestD = 99;
  for (const s of g.L.solids) {
    if (s.on === false) continue;
    const grippy = s.kind === 'grip' || s.kind === 'slick' || (s.kind === 'breath' && g.breathEx);
    if (!grippy) continue;
    const gapL = b.x - (s.x + s.w);
    const gapR = s.x - (b.x + b.w);
    const gapU = b.y - (s.y + s.h);
    const gapD = s.y - (b.y + b.h);
    const overY = b.y < s.y + s.h - 1 && b.y + b.h > s.y + 1;
    const overX = b.x < s.x + s.w - 1 && b.x + b.w > s.x + 1;
    const cands = [];
    if (overY && gapL >= -1 && gapL <= 6) cands.push([gapL, [-1, 0]]);
    if (overY && gapR >= -1 && gapR <= 6) cands.push([gapR, [1, 0]]);
    if (overX && gapU >= -1 && gapU <= 6) cands.push([gapU, [0, -1]]);
    if (overX && gapD >= -1 && gapD <= 6) cands.push([gapD, [0, 1]]);
    for (const [d, dir] of cands) {
      if (dir[0] === G[0] && dir[1] === G[1]) continue; // floors are for walking
      if (d < bestD) { bestD = d; best = { solid: s, dir }; }
    }
  }
  return best;
}

function moveBody(g, p, dx, dy) {
  if (dx) {
    p.x += dx;
    for (const s of g.L.solids) {
      if (s.on === false || s.oneway) continue;
      if (overlap(boxOf(p), s)) {
        p.x = dx > 0 ? s.x - p.w / 2 : s.x + s.w + p.w / 2;
        p.vx = 0;
      }
    }
  }
  if (dy) {
    const prevFeet = p.y + p.h / 2;
    p.y += dy;
    for (const s of g.L.solids) {
      if (s.on === false) continue;
      if (s.oneway && !(g.k === 0 && dy > 0 && prevFeet <= s.y + 0.5)) continue;
      if (overlap(boxOf(p), s)) {
        p.y = dy > 0 ? s.y - p.h / 2 : s.y + s.h + p.h / 2;
        p.vy = 0;
      }
    }
  }
}

export function respawn(g, keepNotice = true) {
  const p = g.p;
  p.x = g.spawn.x; p.y = g.spawn.y; p.vx = 0; p.vy = 0;
  p.grip = false; p.hiding = false; p.stun = 0; p.inv = 1.5;
  g.rip = null; g.aim = null;
  g.k = 0;
  if (!keepNotice) g.notice = Math.min(g.notice, 40);
}

function updatePlayer(g, inp, e, dt) {
  const p = g.p;
  const T = TV[g.k];
  const G = GV[g.k];
  p.inv = Math.max(0, p.inv - dt);
  p.stun = Math.max(0, p.stun - dt);
  p.gripLock = Math.max(0, p.gripLock - dt);

  const locked = p.hiding || !!g.rip;
  const control = !locked && p.stun === 0;
  const mx = control ? inp.mx : 0;
  const my = control ? inp.my : 0;

  p.grounded = blockedAt(g, p, G[0] * 2, G[1] * 2);
  p.coyote = p.grounded ? 0.12 : Math.max(0, p.coyote - dt);
  p.jbuf = e.jump && control ? 0.11 : Math.max(0, p.jbuf - dt);
  if (p.grounded) p.jumping = false;

  // --- grip ---
  const wasGrip = p.grip;
  const prevDir = p.gripDir;
  let gr = null;
  // a rip pins you to the wall you were on, even if the Shift finger slips
  const canHold = !p.hiding && p.stun === 0 && p.gripLock === 0;
  if (canHold && (inp.grip || (g.rip && wasGrip))) gr = findGrip(g, p);
  if (gr) {
    const sd = toScreen(g, gr.dir[0], gr.dir[1]); // screen-space direction of the wall
    const away = (Math.abs(sd[0]) > 0.5 && mx * sd[0] < -0.6) || (Math.abs(sd[1]) > 0.5 && my * sd[1] < -0.6);
    if (away) gr = null;
  }
  if (gr) {
    p.grip = true; p.gripDir = gr.dir; p.gripKind = gr.solid.kind;
  } else {
    if (wasGrip && control && my < -0.3 && inp.grip) {
      // ran out of wall going up: mantle over the lip
      const [ux, uy] = toWorld(g, 0, -1);
      p.vx = ux * 330 + prevDir[0] * 130;
      p.vy = uy * 330 + prevDir[1] * 130;
      p.gripLock = 0.22;
      p.mantle = { t: 0.5, dir: prevDir };
      emit(g, 'mantle');
    }
    p.grip = false;
  }

  let vt = p.vx * T[0] + p.vy * T[1];
  let vn = p.vx * G[0] + p.vy * G[1];
  const lean = [0, 0];

  if (p.grip) {
    const sd = toScreen(g, p.gripDir[0], p.gripDir[1]);
    let sx = mx * 125;
    let sy = my * 125;
    if (Math.abs(sd[0]) > 0.5) sx = 0; else sy = 0;
    if (p.gripKind === 'slick') sy = Math.abs(sd[0]) > 0.5 ? Math.max(sy, 0) * 0.4 + 210 : sy;
    const [wx, wy] = toWorld(g, sx, sy);
    p.vx = wx + p.gripDir[0] * 40;
    p.vy = wy + p.gripDir[1] * 40;
    p.sprint = 0;
    if (p.jbuf > 0) {
      // kick off the wall
      const [ux, uy] = toWorld(g, 0, -1);
      p.vx = ux * 500 - p.gripDir[0] * 180;
      p.vy = uy * 500 - p.gripDir[1] * 180;
      p.grip = false; p.gripLock = 0.18; p.jbuf = 0; p.jumping = true;
      emit(g, 'jump');
    }
  } else {
    // --- run ---
    const load = (p.mouth ? 0.93 : 1) * (p.haul ? 0.82 : 1) * (g.menuMode ? 0.85 : 1) * (p.worn === 'BORED' ? 0.92 : 1) * (p.inAcid ? 0.62 : 1);
    if (p.grounded && Math.abs(mx) > 0.3) p.sprint = Math.min(1, p.sprint + dt / 2);
    else p.sprint = Math.max(0, p.sprint - dt * 2.5);
    if (control) {
      const top = (230 + p.sprint * 80) * load;
      const tgt = mx * top;
      const a = Math.abs(mx) < 0.05 ? (p.grounded ? 2600 : 250) : (p.grounded ? 2000 : 1100);
      vt = approach(vt, tgt, a * dt);
    } else if (!p.stun) {
      vt = approach(vt, 0, 3000 * dt);
    }
    vn = Math.min(vn + 1800 * dt, 850);
    if (p.jbuf > 0 && p.coyote > 0 && control) {
      vn = p.inAcid ? -470 : -610; p.jbuf = 0; p.coyote = 0; p.jumping = true;
      emit(g, 'jump');
    }
    if (p.jumping && !inp.jump && vn < -200) { vn = -200; p.jumping = false; }
    p.vx = T[0] * vt + G[0] * vn;
    p.vy = T[1] * vt + G[1] * vn;
    if (p.mantle && p.mantle.t > 0) {
      // keep leaning into the wall we just climbed until we are over its lip.
      // This is a displacement only: never write it into the velocity, or it
      // compounds every frame and flings the dog across the map.
      p.mantle.t -= dt;
      lean[0] = p.mantle.dir[0] * 150;
      lean[1] = p.mantle.dir[1] * 150;
      if (p.grounded) p.mantle = null;
    }
    // the ocean inhaling (chase)
    if (g.chase.wind > 0 && !p.hiding) {
      const c = g.chase;
      const dx = c.E.x - p.x; const dy = c.E.y - p.y; const d = Math.hypot(dx, dy) || 1;
      p.vx += (dx / d) * 640 * dt;
      p.vy += (dy / d) * 640 * dt;
    }
  }

  if (p.hiding) { p.vx = 0; p.vy = 0; }
  // nothing the dog does should ever exceed this; a bug that tries gets clamped
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 1100) { p.vx *= 1100 / sp; p.vy *= 1100 / sp; }
  moveBody(g, p, (p.vx + lean[0]) * dt, (p.vy + lean[1]) * dt);

  const sv = toScreen(g, p.vx, p.vy);
  if (control && Math.abs(mx) > 0.1) p.face = sign(mx);
  p.moving = Math.hypot(p.vx, p.vy) > 45 && !p.hiding;
  p.anim += dt * (0.5 + Math.abs(sv[0]) / 120);

  if (p.x < g.L.bounds.x0 || p.x > g.L.bounds.x1 || p.y > g.L.bounds.y1 || p.y < g.L.bounds.y0) {
    respawn(g);
    emit(g, 'fall');
  }

  // footprints for the chase
  if (g.chase.state === 'hunt' && g.chase.t > 5 && p.grounded && !p.grip) {
    const last = g.foot[g.foot.length - 1];
    if (!last || dist(last.x, last.y, p.x, p.y) > 55) {
      g.foot.push({ x: p.x, y: p.y, age: 0, up: [-G[0], -G[1]], sprouted: false });
      if (g.foot.length > 3) g.foot.shift();
    }
  }
}

/* ------------------------------------------------------------------ */
/* hiding in a Scar                                                    */
/* ------------------------------------------------------------------ */

function updateHide(g, inp, e, dt) {
  const p = g.p;
  const s = scarAt(g);
  const can = scarUsable(s) && p.grounded && Math.hypot(p.vx, p.vy) < 70 && !g.rip && p.stun === 0;
  if (inp.hide && can) {
    if (!p.hiding) {
      p.hiding = true; p.scar = s; g.hideT = 0;
      if (!s.visited) { s.visited = true; emit(g, 'scarFirst', { id: s.id }); }
      g.spawn = { ...s.spawn };
      emit(g, 'hide');
    }
    g.hideT += dt;
    // Q while hidden swaps the mouth Law with the Scar's stash
    if (e.swap) {
      const tmp = p.mouth; p.mouth = s.stash; s.stash = tmp;
      emit(g, 'stash');
    }
    // the room goes slack once ZOOM is properly bored
    if (g.notice < NOTICE.twitch && g.hideT > 2 && g.sag < 12) {
      if (g.sag === 0) say(g, 'nothing here. nothing here.');
      g.sag = 12;
    }
  } else if (p.hiding) {
    p.hiding = false; p.scar = null;
    emit(g, 'unhide');
  }
  if (!p.hiding && e.swap && !g.aim) swapSlots(g);
  g.sag = Math.max(0, g.sag - dt);
}

/** V: put the Law in your mouth on (or take it off). LEAVES THE MEETING worn + V = leave. */
function toggleWear(g) {
  const p = g.p;
  if (p.hiding || g.rip || g.aim || p.stun > 0) return;
  const wearable = p.mouth && LAWS[p.mouth].wearable ? 'mouth' : p.haul && LAWS[p.haul].wearable ? 'haul' : null;
  // THREE HEARTS grows in and has its own place on you; it never comes off
  const hearts = wearable && p[wearable] === 'HEARTS';
  if (hearts) {
    if (p.hearts > 0) { say(g, 'you already have hearts. greedy.'); emit(g, 'wearFail'); return; }
    p[wearable] = null;
    if (wearable === 'mouth') { p.mouth = p.haul; p.haul = null; }
    p.hearts = 3;
    emit(g, 'wear', { law: 'HEARTS' });
    return;
  }
  if (p.worn) {
    if (p.worn === 'LEAVES') { eject(g); return; }
    const id = p.worn;
    p.worn = null;
    if (!p.mouth) p.mouth = id;
    else if (!p.haul) p.haul = id;
    else g.pickups.push({ law: id, x: p.x, y: p.y, born: g.t });
    emit(g, 'unwear', { law: id });
    return;
  }
  if (!wearable) { emit(g, 'wearFail'); return; }
  const id = p[wearable];
  p[wearable] = null;
  if (wearable === 'mouth') { p.mouth = p.haul; p.haul = null; }
  p.worn = id;
  emit(g, 'wear', { law: id });
}

function swapSlots(g) {
  const p = g.p;
  const tmp = p.mouth; p.mouth = p.haul; p.haul = tmp;
  emit(g, 'swap');
}

/* ------------------------------------------------------------------ */
/* ripping                                                             */
/* ------------------------------------------------------------------ */

const TEAR_CENTER = -Math.PI / 2;

function nearVein(g) {
  let best = null;
  let bd = 46;
  for (const v of g.L.veins) {
    if (v.taken) continue;
    const d = dist(v.x, v.y, g.p.x, g.p.y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function updateRip(g, inp, e, dt) {
  const p = g.p;
  p.loud = false;
  let r = g.rip;
  if (!r) {
    if (e.rip && !p.hiding && p.stun === 0) {
      const v = nearVein(g);
      // while a Menu owns you (or is in your face) E bites the Menu, not the wall
      if (v && !g.menuMode && !menuNear(g)) {
        g.rip = r = { vein: v, phase: 'plant', t: 0, mark: 0 };
        emit(g, 'plant', { vein: v.id });
      }
    }
    return;
  }
  const law = LAWS[r.vein.law];
  r.t += dt;
  if (r.phase === 'plant') {
    if (!inp.rip) { g.rip = null; emit(g, 'ripCancel'); return; }
    if (r.t >= law.plant) { r.phase = 'tear'; r.t = 0; r.mark = 0; emit(g, 'tearStart'); }
    return;
  }
  // tear: a marker sweeps a ring; let go when it crosses the sweet spot
  p.loud = true;
  r.mark = (r.t * law.wobble) % (Math.PI * 2);
  let off = Math.abs(((r.mark - (TEAR_CENTER + Math.PI * 2)) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  r.off = off;
  if (e.ripUp || !inp.rip) {
    finishRip(g, r, off <= law.sweet / 2);
  } else if (r.t > 2.2) {
    finishRip(g, r, false);
  }
}

function menuNear(g) {
  return g.menus.some((m) => dist(m.x, m.y, g.p.x, g.p.y) < 70);
}

function giveLaw(g, id, x, y) {
  const p = g.p;
  if (!p.mouth) p.mouth = id;
  else if (!p.haul) { p.haul = p.mouth; p.mouth = id; }
  else {
    g.pickups.push({ law: p.mouth, x: x ?? p.x, y: y ?? p.y, born: g.t });
    p.mouth = id;
  }
}

function finishRip(g, r, perfect) {
  const v = r.vein;
  const law = LAWS[v.law];
  g.rip = null;
  v.taken = true;
  g.stats.holes++;
  if (perfect) g.stats.perfect++;
  let cost = (v.cost ?? law.notice) * (perfect ? 1 : 1.6);
  if (g.sag > 0) cost *= 0.5;
  giveLaw(g, v.law, v.x, v.y);
  emit(g, 'rip', { law: v.law, perfect, x: v.x, y: v.y });
  if (v.id === 'door') {
    g.L.door.on = false;
    g.L.warden.state = 'patrol';
    for (const m of g.L.mites) if (m.x < 2200) m.alive = true;
    emit(g, 'doorOpen');
    say(g, 'SOMETHING CAME OFF.');
  } else if (v.id === 'sleeper') {
    say(g, 'a mouth stops snoring.');
  } else if (v.id === 'frame') {
    g.frameRipped = true;
    g.L.panes.forEach((pn) => { pn.blind = 999; });
    g.notice = Math.max(g.notice, 92);
    startChase(g);
    say(g, 'I LOOKED.', 3);
  }
  if (g.wing === 2) onAppetiteRip(g, v);
  if (g.wing === 3) onZooRip(g, v);
  if (v.id !== 'frame') addNotice(g, cost);
  g.comfort = 0;
}

/* ------------------------------------------------------------------ */
/* pickups, bites, smashing menus                                      */
/* ------------------------------------------------------------------ */

function updatePickup(g, inp, e) {
  const p = g.p;
  if (!e.rip || g.rip || p.hiding) return;
  // E bites a Menu first
  const mm = g.menuMode && g.menus.includes(g.menuMode) ? g.menuMode : g.menus.find((m) => dist(m.x, m.y, p.x, p.y) < 70);
  if (mm) { biteMenu(g, mm); return; }
  if (nearVein(g)) return; // updateRip handles it
  if (g.wing === 3 && zooBite(g)) return;
  for (let i = 0; i < g.pickups.length; i++) {
    const pk = g.pickups[i];
    if (g.t - pk.born < 0.4) continue;
    if (dist(pk.x, pk.y, p.x, p.y) < 42) {
      g.pickups.splice(i, 1);
      if (p.mouth && p.haul) g.pickups.push({ law: p.mouth, x: p.x, y: p.y, born: g.t });
      giveLaw(g, pk.law, pk.x, pk.y);
      if (p.mouth === pk.law) { /* mouth already set */ }
      emit(g, 'pickup', { law: pk.law });
      return;
    }
  }
}

export function biteMenu(g, m) {
  m.hp--;
  emit(g, 'bite', { x: m.x, y: m.y });
  if (m.hp <= 0) smashMenu(g, m);
}

export function smashMenu(g, m) {
  const i = g.menus.indexOf(m);
  if (i >= 0) g.menus.splice(i, 1);
  if (m.accepted) {
    g.menuMode = null;
    g.floor = 0;
    say(g, 'you are unemployed. good.');
  }
  if (g.L.plank.on) g.L.plank.on = false;
  g.stats.smashed++;
  emit(g, 'smash', { x: m.x, y: m.y });
}

export function acceptMenu(g, m) {
  if (g.menuMode) return;
  m.accepted = true;
  m.hp = 3;
  g.menuMode = m;
  g.stats.leash++;
  g.floor = 30;
  g.notice = Math.max(g.notice, 30);
  say(g, 'HELPFUL!  objective assigned.');
  emit(g, 'accept');
}

/* ------------------------------------------------------------------ */
/* throwing and jamming                                                */
/* ------------------------------------------------------------------ */

const LAUNCH = { min: 260, max: 640 };

export function launchVelocity(g, power, elev) {
  const v = LAUNCH.min + (LAUNCH.max - LAUNCH.min) * power;
  return toWorld(g, g.p.face * Math.cos(elev) * v, -Math.sin(elev) * v);
}

function updateThrow(g, inp, e, dt) {
  const p = g.p;
  if (!g.aim) {
    if (e.thr && p.mouth && !p.hiding && p.stun === 0 && !g.rip) g.aim = { t: 0, elev: 0.6 };
    return;
  }
  const a = g.aim;
  a.t += dt;
  a.elev = clamp(a.elev - inp.my * 1.3 * dt, -0.15, 1.35);
  a.power = Math.min(1, 0.2 + a.t * 1.1);
  if (!p.mouth || p.stun > 0) { g.aim = null; return; }
  if (e.thrUp || !inp.thr) {
    const id = p.mouth;
    g.aim = null;
    // a tap at contact range jams; anything longer is a throw
    if (a.t < 0.2) {
      const tgt = targetsAt(g, p.x + toWorld(g, p.face, 0)[0] * 26, p.y + toWorld(g, p.face, 0)[1] * 26, 40, id);
      if (tgt) {
        p.mouth = p.haul; p.haul = null;
        emit(g, 'jam', { law: id, x: tgt.x, y: tgt.y });
        applyToTarget(g, id, tgt, 'jam');
        return;
      }
    }
    const power = a.t < 0.2 ? 0.3 : a.power;
    const [vx, vy] = launchVelocity(g, power, a.elev);
    g.proj.push({ law: id, x: p.x, y: p.y, vx: vx + p.vx * 0.3, vy: vy + p.vy * 0.3, age: 0 });
    p.mouth = p.haul; p.haul = null;
    emit(g, 'throw', { law: id });
  }
}

/* ------------------------------------------------------------------ */
/* notice                                                              */
/* ------------------------------------------------------------------ */

function updateNotice(g, dt) {
  const p = g.p;
  const c = g.chase;
  if (c.state === 'opening' || c.state === 'hunt') {
    // chase.js owns Notice while the eye is open
    if (g.menuMode) g.notice = Math.max(g.notice, 30);
    g.peak = Math.max(g.peak, g.notice);
    return;
  }
  let rate = 0;
  if (p.hiding) rate = -8;
  else if (inBubble(g, p.x, p.y)) rate = -6;
  else if (g.menuMode) rate = g.notice < 70 ? 2.4 : 0; // being useful never lets you cool off
  else if (!p.moving && !g.rip) rate = -1.6;
  if (p.moving && !p.hiding) rate += 0.15 * lawsCarried(g);
  if (p.worn === 'LOOKS' && !p.hiding) rate += 0.6;   // ZOOM can see through it too
  if (p.worn === 'BORED' && !p.hiding && !g.menuMode) rate -= 2.5;
  if (p.worn === 'SMASH' && !p.hiding) rate += 0.4;    // violence is loud
  if (p.worn === 'OWNS' && !p.hiding) rate += 0.8;     // so is management
  g.notice = clamp(g.notice + rate * dt, g.floor, inHall(g) ? NOTICE.max : 92);
  g.peak = Math.max(g.peak, g.notice);
}

/* ------------------------------------------------------------------ */
/* digestion + ending                                                  */
/* ------------------------------------------------------------------ */

export function beginDigest(g) {
  if (g.digest) return;
  g.digest = { t: 0 };
  g.rip = null; g.aim = null;
  g.p.hiding = false;
  g.stats.digests++;
  emit(g, 'digest');
  say(g, 'SWALLOWED.', 3);
}

function updateDigest(g, dt) {
  g.digest.t += dt;
  g.t += dt;
  g.lineT = Math.max(0, g.lineT - dt);
  if (g.digest.t > 2.8) {
    const slot = heaviestLaw(g);
    if (slot) { g.p[slot] = null; }
    if (slot === 'hearts') g.p.hearts = 0;
    if (slot && !g.p.mouth && g.p.haul) { g.p.mouth = g.p.haul; g.p.haul = null; }
    g.digest = null;
    const p = g.p;
    if (g.chase.state !== 'idle') {
      // ZOOM spits you out at the door of the hall and looks again
      g.spawn = { ...g.L.hallSpawn };
      respawn(g);
      g.notice = 100;
      g.foot.length = 0;
      g.bubbles.length = 0;
      resetChaseAfterDigest(g);
    } else {
      respawn(g);
      g.notice = Math.min(g.notice, 45);
    }
    if (g.wing === 2) resetAppetiteAfterDigest(g);
    if (g.wing === 3) resetZooAfterDigest(g);
    p.inv = 2;
    emit(g, 'spit');
  }
}

function resetChaseAfterDigest(g) {
  const c = g.chase;
  c.state = 'opening'; c.t = 0; c.pin = 0; c.lid = 0; c.wind = 0; c.rollWarn = 0; c.offer = null;
  c.E = { ...g.L.eyeHome };
  c.fired = {};
}

function checkEnd(g, dt) {
  const p = g.p;
  if (!g.frameRipped || !p.hiding || !p.scar || p.scar.id !== 'molar') { g.flags.molarT = 0; return; }
  g.flags.molarT = (g.flags.molarT || 0) + dt;
  if (g.notice < NOTICE.stare && g.flags.molarT > 3) {
    g.end = { t: 0 };
    emit(g, 'end');
  }
}


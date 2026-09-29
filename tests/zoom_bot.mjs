// Scripted-input helpers for driving the ZOOM sim headlessly. Everything here
// goes through step() with plain input objects, the same path the browser uses.
import { newGame, step, DT, launchVelocity } from '../zoom/js/sim.js';
import { targetsAt } from '../zoom/js/world.js';
import { GV } from '../zoom/js/core.js';
import { pointIn, rng } from '../zoom/js/geom.js';

export { newGame, step, DT };

/** Hold `inp` for `secs`, or until `until(g)` is true. Returns elapsed seconds. */
export function hold(g, inp, secs, until) {
  let t = 0;
  while (t < secs) {
    step(g, typeof inp === 'function' ? inp(g) : inp, DT);
    t += DT;
    if (until && until(g)) break;
  }
  return t;
}

export function tap(g, key, extra = {}) {
  step(g, { [key]: true, ...extra }, DT);
  step(g, { ...extra }, DT);
}

export function goTo(g, x, { tol = 6, max = 10, extra = {} } = {}) {
  return hold(g, { mx: Math.sign(x - g.p.x), ...extra }, max, () => Math.abs(g.p.x - x) < tol);
}

export function teleport(g, x, y) {
  g.p.x = x; g.p.y = y; g.p.vx = 0; g.p.vy = 0;
}

/** Walk to x, hopping (with the jump key held through the arc) whenever something blocks the way. */
export function walkTo(g, x, { tol = 8, max = 20, extra = {} } = {}) {
  let stuck = 0;
  let jumping = false;
  return hold(g, (gg) => {
    const inp = { mx: Math.sign(x - gg.p.x), ...extra };
    if (gg.p.grounded && Math.abs(gg.p.vx) < 15) stuck++; else if (gg.p.grounded) stuck = 0;
    if (stuck > 4) { jumping = true; stuck = 0; }
    if (gg.p.grounded && !jumping) inp.jump = false;
    if (jumping) {
      inp.jump = true;
      if (!gg.p.grounded && gg.p.vy > 0) jumping = false; // falling now: let go
    }
    return inp;
  }, max, () => Math.abs(g.p.x - x) < tol);
}

/** Ease to x at creeping speed and stop dead (for lining up against a face). */
export function creepTo(g, x, { max = 10 } = {}) {
  hold(g, (gg) => ({ mx: Math.max(-1, Math.min(1, (x - gg.p.x) / 30)) }), max, (gg) => Math.abs(gg.p.x - x) < 1.2 && Math.abs(gg.p.vx) < 30);
  hold(g, {}, 0.15);
}

/** Hold rip through the plant, then release when the marker is in the sweet spot. */
export function ripHere(g, extra = {}) {
  let n = 0;
  step(g, { rip: true, ...extra }, DT);
  while (g.rip && g.rip.phase === 'plant' && n++ < 400) step(g, { rip: true, ...extra }, DT);
  while (g.rip && n++ < 900) {
    if (g.rip.off !== undefined && g.rip.off < 0.12) { step(g, { rip: false, ...extra }, DT); break; }
    step(g, { rip: true, ...extra }, DT);
  }
  return !g.rip;
}

/** Find a hold time and aim that lobs the Law onto `pred(target)`, by replaying the sim's projectile maths. */
function approxCandidates(g, pred) {
  const out = [];
  const G = GV[g.k];
  for (let T = 0.25; T <= 0.85; T += 0.05) {
    const power = Math.min(1, 0.2 + T * 1.1);
    for (let e = 0.6 - 1.3 * T; e <= 0.6 + 1.3 * T; e += 0.03) {
      const elev = Math.min(1.35, Math.max(-0.15, e));
      let [vx, vy] = launchVelocity(g, power, elev);
      vx += g.p.vx * 0.3; vy += g.p.vy * 0.3;
      let x = g.p.x, y = g.p.y, age = 0, hit = null;
      for (let f = 0; f < 240 && !hit; f++) {
        age += DT; vx += G[0] * 1500 * DT; vy += G[1] * 1500 * DT;
        for (let s = 0; s < 4; s++) {
          x += vx * DT / 4; y += vy * DT / 4;
          const tg = age > 0.05 ? targetsAt(g, x, y, 8, g.p.mouth) : null;
          if (tg) { hit = tg; break; }
          if (g.L.solids.some((sd) => sd.on !== false && pointIn(sd, x, y))) { hit = { type: 'surface' }; break; }
        }
      }
      if (hit && pred(hit, x, y)) out.push({ T, elev });
    }
  }
  return out;
}

/**
 * Find a hold time and aim whose throw lands on something `pred(target, x, y)` accepts.
 * Candidates come from a quick model of the arc, then each is confirmed by really throwing
 * it on a copy of the game, so what the bot plans is what the sim does.
 */
export function solveThrow(g, pred) {
  for (const cand of approxCandidates(g, pred)) {
    const f = fork(g);
    let landed = null;
    f.onLand = (pr, tgt) => { landed = { tgt, x: pr.x, y: pr.y }; };
    doThrow(f, cand);
    for (let i = 0; i < 260 && !landed; i++) step(f, {}, DT);
    if (landed && pred(landed.tgt, landed.x, landed.y)) return cand;
  }
  return null;
}

/** Perform a throw with the solved hold time and aim, through real input. */
export function doThrow(g, sol) {
  step(g, { thr: true }, DT);
  const need = (sol.elev - 0.6) / 1.3; // seconds of holding W (elev grows) or S
  let t = 0;
  while (t < sol.T - 1.5 * DT) {
    const my = Math.abs(need) > t ? -Math.sign(need) : 0;
    step(g, { thr: true, my }, DT);
    t += DT;
  }
  step(g, { thr: false }, DT);
}

/* ------------------------------------------------------------------ */
/* search: try things on a copy of the game before doing them for real  */
/* ------------------------------------------------------------------ */

/** A copy of the game you can play forward and throw away. */
export function fork(g) {
  const { rand, ev, tally, onLand, ...rest } = g; // functions can't be cloned
  const c = structuredClone(rest);
  c.rand = rng(1);
  c.rand.set(rand.get());
  c.ev = [];
  return c;
}

const bad = (gg) => gg.ev.some((e) => e.type === 'hurt' || e.type === 'heart' || e.type === 'digest' || e.type === 'fall');

/** Stand still for `frames` (optionally gripping) and report whether anything hurt us. */
export function safeToWait(g, frames, inp = {}) {
  const f = fork(g);
  f.ev.length = 0;
  for (let i = 0; i < frames; i++) { step(f, inp, DT); if (bad(f)) return false; }
  return true;
}

function runHop(f, c, dir, settle) {
  // walk to the run-up point
  const startX = c.launchX - dir * c.runUp;
  let n = 0;
  for (; n < 240 && Math.abs(f.p.x - startX) > 3; n++) step(f, { mx: Math.sign(startX - f.p.x) * (Math.abs(f.p.x - startX) < 14 ? 0.35 : 1) }, DT);
  for (let i = 0; i < c.wait; i++) step(f, {}, DT);
  // run at the launch point and jump
  for (n = 0; n < 200 && (f.p.x - c.launchX) * dir < 0; n++) step(f, { mx: dir }, DT);
  let air = 0;
  for (let i = 0; i < 140; i++) {
    const jump = i < c.hold;
    const mx = i < c.release ? dir : 0;
    step(f, { mx, jump }, DT);
    air++;
    if (i > 4 && f.p.grounded) break;
  }
  for (let i = 0; i < settle; i++) step(f, {}, DT);
}

function* hopCandidates(g, from, target, opts = {}) {
  const dir = target.x0 + target.x1 > from.x0 + from.x1 ? 1 : -1;
  const edge = dir > 0 ? from.x1 : from.x0;
  const runUps = opts.runUps ?? [0, 30, 80];
  const holds = opts.holds ?? [8, 12, 16, 20, 24];
  const releases = opts.releases ?? [8, 14, 22, 99];
  const waits = opts.waits ?? [0];
  const offsets = opts.offsets ?? [4, 12, 20, 30, 42, 56, 72, 90];
  const settle = opts.settle ?? 24;
  for (const wait of waits) {
    for (const off of offsets) {
      for (const runUp of runUps) {
        for (const hold of holds) {
          for (const release of releases) {
            const c = { launchX: edge - dir * off, runUp, hold, release, wait, dir };
            const f = fork(g);
            f.ev.length = 0;
            runHop(f, c, dir, settle);
            const feet = f.p.y + f.p.h / 2;
            if (!bad(f) && f.p.grounded && f.p.x >= target.x0 + 2 && f.p.x <= target.x1 - 2 && Math.abs(feet - target.top) < 3) yield c;
          }
        }
      }
    }
  }
}

/**
 * Hop from the platform you are on ({x0,x1}) to `target` ({x0,x1,top}).
 * Searches launch points, run-ups and jump lengths on forks; plays the first
 * that lands cleanly. Returns the candidate or null.
 */
export function hopTo(g, from, target, opts = {}) {
  for (const c of hopCandidates(g, from, target, opts)) {
    runHop(g, c, c.dir, 0);
    return c;
  }
  return null;
}

/**
 * Plan a whole run of hops ahead on copies of the game, backing up when a landing
 * leaves no clean next hop (a crumbling ledge you cannot wait on, a maw that will snap
 * as you arrive), then play the plan for real. plats[0] is where you stand.
 */
export function hopChain(g, plats, opts = {}) {
  const plan = (gg, i) => {
    if (i >= plats.length - 1) return [];
    for (const c of hopCandidates(gg, plats[i], plats[i + 1], opts)) {
      const f = fork(gg);
      f.ev.length = 0;
      runHop(f, c, c.dir, 0);
      const rest = plan(f, i + 1);
      if (rest) return [c, ...rest];
    }
    return null;
  };
  const cs = plan(g, 0);
  if (!cs) return null;
  for (const c of cs) runHop(g, c, c.dir, 0);
  return cs;
}

/** Climb toward `y` in short safe bursts, waiting whenever a burst would end somewhere hazardous. */
export function climbSafely(g, y, { mx = 0, max = 60 * 90, burstMax = 90, settle = 50 } = {}) {
  let spent = 0;
  while (spent < max && g.p.y > y) {
    let done = false;
    const need = Math.max(4, Math.ceil((g.p.y - y) / (125 / 60)));
    for (const d of [burstMax, 60, 40, 25, 15, 8].map((v) => Math.min(v, need))) {
      const f = fork(g);
      f.ev.length = 0;
      let ok = true;
      for (let i = 0; i < d && ok; i++) { step(f, { my: -1, grip: true, mx }, DT); if (bad(f)) ok = false; }
      for (let i = 0; i < settle && ok; i++) { step(f, { grip: true, mx }, DT); if (bad(f)) ok = false; }
      if (ok) {
        for (let i = 0; i < d; i++) { step(g, { my: -1, grip: true, mx }, DT); }
        spent += d;
        done = true;
        break;
      }
    }
    if (!done) { for (let i = 0; i < 8; i++) step(g, { grip: true, mx }, DT); spent += 8; }
    if (g.p.grounded && g.p.y <= y + 12) break;
  }
  return spent;
}

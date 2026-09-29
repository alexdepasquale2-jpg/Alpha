// Scripted-input helpers for driving the ZOOM sim headlessly. Everything here
// goes through step() with plain input objects, the same path the browser uses.
import { newGame, step, DT, launchVelocity } from '../zoom/js/sim.js';
import { targetsAt } from '../zoom/js/world.js';
import { GV } from '../zoom/js/core.js';
import { pointIn } from '../zoom/js/geom.js';

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
  hold(g, (gg) => ({ mx: Math.max(-0.3, Math.min(0.3, (x - gg.p.x) / 25)) }), max, (gg) => Math.abs(gg.p.x - x) < 1.2 && Math.abs(gg.p.vx) < 30);
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
export function solveThrow(g, pred) {
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
      if (hit && pred(hit, x, y)) return { T, elev };
    }
  }
  return null;
}

/** Perform a throw with the solved hold time and aim, through real input. */
export function doThrow(g, sol) {
  step(g, { thr: true }, DT);
  const need = (sol.elev - 0.6) / 1.3; // seconds of holding W (elev grows) or S
  let t = 0;
  while (t < sol.T) {
    const my = Math.abs(need) > t ? -Math.sign(need) : 0;
    step(g, { thr: true, my }, DT);
    t += DT;
  }
  step(g, { thr: false }, DT);
}

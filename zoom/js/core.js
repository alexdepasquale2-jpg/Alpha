// Shared helpers for the sim. No state of its own.

import { overlap, segRect, segCircle, dist } from './geom.js';
import { LAWS } from './laws.js';

export const DT = 1 / 60;
// World direction of "screen down" (gravity) and "screen right" for each of the
// four gravity orientations. Rolling the organ just changes g.k.
export const GV = [[0, 1], [1, 0], [0, -1], [-1, 0]];
export const TV = [[1, 0], [0, -1], [-1, 0], [0, 1]];

export const NOTICE = { twitch: 25, stare: 55, max: 100 };
export const tierOf = (n) => (n < NOTICE.twitch ? 0 : n < NOTICE.stare ? 1 : n < NOTICE.max ? 2 : 3);
export const TIER_NAMES = ['asleep', 'twitch', 'stare', 'notice'];

export const emit = (g, type, data = {}) => g.ev.push({ type, ...data });

/** Radio-alien flavor line. Never carries information the world doesn't. */
export function say(g, text, dur = 3.4) {
  g.line = text;
  g.lineT = dur;
}

export const boxOf = (p) => ({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h });

export function hitSolid(g, b, filter) {
  for (const s of g.L.solids) {
    if (s.on === false) continue;
    if (filter && !filter(s)) continue;
    if (overlap(b, s)) return s;
  }
  return null;
}

export function blockedAt(g, p, ox, oy) {
  const b = boxOf(p);
  b.x += ox;
  b.y += oy;
  const feet = p.y + p.h / 2;
  // one-way ledges only hold you up if you are above them and heading down
  return !!hitSolid(g, b, (s) => !s.oneway || (g.k === 0 && oy > 0 && feet <= s.y + 1));
}

export function toWorld(g, sx, sy) {
  const T = TV[g.k];
  const G = GV[g.k];
  return [T[0] * sx + G[0] * sy, T[1] * sx + G[1] * sy];
}

export function toScreen(g, wx, wy) {
  const T = TV[g.k];
  const G = GV[g.k];
  return [wx * T[0] + wy * T[1], wx * G[0] + wy * G[1]];
}

export function lawsCarried(g) {
  return (g.p.mouth ? 1 : 0) + (g.p.haul ? 1 : 0) + (g.p.worn ? 1 : 0) + (g.p.hearts > 0 ? 1 : 0);
}

export function heaviestLaw(g) {
  let best = null;
  let bw = -1;
  for (const slot of ['mouth', 'haul', 'worn']) {
    const id = g.p[slot];
    if (id && LAWS[id].weight > bw) { bw = LAWS[id].weight; best = slot; }
  }
  if (g.p.hearts > 0 && LAWS.HEARTS.weight > bw) best = 'hearts';
  return best;
}

export function inBubble(g, x, y) {
  for (const b of g.bubbles) if (dist(x, y, b.x, b.y) < b.r) return b;
  return null;
}

/** Can a gaze from (x1,y1) reach (x2,y2)? Mass, curtains and static all block it. */
export function losClear(g, x1, y1, x2, y2) {
  for (const s of g.L.solids) {
    if (s.on === false) continue;
    if (segRect(x1, y1, x2, y2, s) !== null) return false;
  }
  for (const c of g.L.curtains) if (segRect(x1, y1, x2, y2, c) !== null) return false;
  for (const b of g.bubbles) if (segCircle(x1, y1, x2, y2, b.x, b.y, b.r * 0.8)) return false;
  return true;
}

export function inHall(g, x = g.p.x) {
  return x > g.L.hall.x0;
}

/** Notice goes up. Outside the hall it stalls at Stare: the eye only opens in Room C. */
export function addNotice(g, v) {
  if (v <= 0) return;
  const cap = inHall(g) ? NOTICE.max : 92;
  g.notice = Math.min(cap, g.notice + v);
  if (g.notice > g.peak) g.peak = g.notice;
  g.comfort = 0;
}

/** Knock the player away from a source, optionally raising Notice. */
export function hurt(g, fx, fy, notice = 0, stun = 0.4) {
  const p = g.p;
  if (p.inv > 0 || p.hiding || g.digest) return false;
  let dx = p.x - fx;
  let dy = p.y - fy;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  const [ux, uy] = toWorld(g, 0, -1);
  p.vx = dx * 300 + ux * 240;
  p.vy = dy * 300 + uy * 240;
  p.stun = stun;
  p.inv = 1.0;
  p.grip = false;
  p.gripLock = 0.3;
  if (g.rip) g.rip = null;
  addNotice(g, notice);
  emit(g, 'hurt');
  return true;
}

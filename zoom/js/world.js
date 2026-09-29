// Everything in the world that is not the dog: the gate, the warden, mites,
// panes, Menus, projectiles, teeth, static, and ZOOM's eye.

import { clamp, sign, dist, overlap, pointIn, circleRect, angDiff } from './geom.js';
import {
  GV, tierOf, emit, say, boxOf, toWorld, toScreen, lawsCarried, inBubble,
  addNotice, hurt, losClear, NOTICE,
} from './core.js';
import { beginDigest, smashMenu, acceptMenu } from './sim.js';
import { updateAppetite, appetiteTargets, applyAppetite } from './appetite.js';

/* ------------------------------------------------------------------ */
/* chase state                                                         */
/* ------------------------------------------------------------------ */

export function resetChase(L) {
  return { state: 'idle', t: 0, pin: 0, ang: Math.PI / 2, lid: 0, E: { ...L.eyeHome }, seen: false, wind: 0, rollWarn: 0, offer: null, fired: {} };
}

export function startChase(g) {
  const c = g.chase;
  if (c.state === 'opening' || c.state === 'hunt') return;
  Object.assign(c, resetChase(g.L), { state: 'opening' });
  g.notice = NOTICE.max;
  emit(g, 'chaseStart');
}

/* ------------------------------------------------------------------ */
/* targets and Laws                                                    */
/* ------------------------------------------------------------------ */

const wardenBox = (w) => ({ x: w.x - w.w / 2, y: w.y - w.h / 2, w: w.w, h: w.h });

/** Whatever a Law thrown/jammed at (x,y) within r could land on. */
export function targetsAt(g, x, y, r, law) {
  const out = [];
  const add = (type, ref, tx, ty) => out.push({ type, ref, x: tx, y: ty, d: dist(x, y, tx, ty) });
  const G = g.L.gate;
  if (circleRect(x, y, r, G.rect)) add('gate', G, G.x + G.w / 2, y);
  const w = g.L.warden;
  if (circleRect(x, y, r, wardenBox(w))) add('warden', w, w.x, w.y);
  for (const m of g.L.mites) if (m.alive && dist(x, y, m.x, m.y) < r + 8) add('mite', m, m.x, m.y);
  for (const mn of g.menus) if (dist(x, y, mn.x, mn.y) < r + 18) add('menu', mn, mn.x, mn.y);
  if (!g.frameRipped || g.chase.state === 'idle') {
    for (const pn of g.L.panes) if (dist(x, y, pn.x, pn.y) < r + 22) add('pane', pn, pn.x, pn.y);
  }
  for (const m of g.L.molars) if (!m.cracked && !m.chewed && circleRect(x, y, r, m.rect)) add('molar', m, m.rect.x + m.rect.w / 2, m.rect.y + m.rect.h / 2);
  if (law === 'WONT_CLOSE') for (const s of g.L.scars) if (circleRect(x, y, r, s.zone)) add('scar', s, x, y);
  if (g.wing === 2) appetiteTargets(g, x, y, r, law, add);
  if (!out.length) return null;
  out.sort((a, b) => a.d - b.d);
  return out[0];
}

function surfaceFace(s, x, y) {
  const d = [
    [Math.abs(y - s.y), 'top'], [Math.abs(y - (s.y + s.h)), 'bottom'],
    [Math.abs(x - s.x), 'left'], [Math.abs(x - (s.x + s.w)), 'right'],
  ];
  d.sort((a, b) => a[0] - b[0]);
  return d[0][1];
}

export function addTeethPatch(g, s, x, y, life = Infinity, width = 64) {
  const face = surfaceFace(s, x, y);
  let r;
  if (face === 'top') r = { x: clamp(x - width / 2, s.x, s.x + s.w - Math.min(width, s.w)), y: s.y - 14, w: Math.min(width, s.w), h: 14 };
  else if (face === 'bottom') r = { x: clamp(x - width / 2, s.x, s.x + s.w - Math.min(width, s.w)), y: s.y + s.h, w: Math.min(width, s.w), h: 14 };
  else if (face === 'left') r = { x: s.x - 14, y: clamp(y - width / 2, s.y, s.y + s.h - Math.min(width, s.h)), w: 14, h: Math.min(width, s.h) };
  else r = { x: s.x + s.w, y: clamp(y - width / 2, s.y, s.y + s.h - Math.min(width, s.h)), w: 14, h: Math.min(width, s.h) };
  g.teeth.push({ rect: r, face, t: 0, life });
  emit(g, 'teethGrow', { x: r.x + r.w / 2, y: r.y + r.h / 2 });
}

function crackMolar(g, m, how) {
  if (m.hollow) {
    m.cracked = true; m.known = true; m.rect.on = false;
    const sc = g.L.scars[2];
    sc.open = true;
    emit(g, 'crack', { x: m.rect.x + m.rect.w / 2, y: m.rect.y });
    say(g, how === 'eye' ? 'the ocean breaks its own house.' : 'the tooth was hollow. of course it was.');
  } else {
    m.chewed = true;
    emit(g, 'chew', { x: m.rect.x + m.rect.w / 2, y: m.rect.y });
    say(g, 'wrong tooth. it chews itself, embarrassed.');
  }
}

export function dropPickup(g, law, x, y) {
  const G = GV[g.k];
  let px = x, py = y;
  for (let i = 0; i < 100; i++) {
    const nx = px + G[0] * 4, ny = py + G[1] * 4;
    if (g.L.solids.some((s) => s.on !== false && pointIn(s, nx, ny))) break;
    px = nx; py = ny;
  }
  g.pickups.push({ law, x: px - G[0] * 8, y: py - G[1] * 8, born: g.t });
}

/** Write a Law onto a target. Returns false if nothing accepted it (a miss). */
export function applyToTarget(g, law, t, how) {
  const ref = t.ref;
  if (g.wing === 2) {
    const handled = applyAppetite(g, law, t);
    if (handled !== undefined) return handled;
  }
  const write = () => emit(g, 'write', { law, x: t.x, y: t.y });
  switch (law) {
    case 'WONT_CLOSE':
      if (t.type === 'gate') {
        ref.jammed = true; ref.rect.on = false; write();
        say(g, "it stays open. it doesn't know how not to.");
        return true;
      }
      if (t.type === 'warden' || t.type === 'mite') {
        ref.harmless = true; write();
        say(g, 'the jaw hangs open. drool.');
        return true;
      }
      if (t.type === 'molar') { crackMolar(g, ref, 'law'); write(); return true; }
      if (t.type === 'scar') { ref.noHide = true; write(); say(g, "it can't close around you now."); return true; }
      return false;
    case 'TEETH':
      if (t.type === 'gate') { ref.teeth = true; write(); say(g, 'a hallway that bites and never shuts.'); return true; }
      if (t.type === 'molar') { crackMolar(g, ref, 'law'); write(); return true; }
      if (t.type === 'warden') { ref.stun = 3; write(); return true; }
      if (t.type === 'mite') { ref.alive = false; write(); emit(g, 'squish', { x: ref.x, y: ref.y }); return true; }
      if (t.type === 'menu') { smashMenu(g, ref); return true; }
      if (t.type === 'pane') { ref.blind = 14; write(); say(g, 'the window is bitten shut.'); return true; }
      if (t.type === 'surface') { addTeethPatch(g, ref, t.x, t.y); write(); return true; }
      return false;
    case 'LOOKS':
      if (t.type === 'pane') { ref.ignore = 12; write(); say(g, 'it looks through you. you are glass.'); return true; }
      g.windows.push({ x: t.x, y: t.y, r: 165, t: 10 });
      write();
      return true;
    case 'STATIC':
      g.bubbles.push({ x: t.x, y: t.y, r: 150, t: 5, max: 5 });
      write();
      return true;
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* update                                                              */
/* ------------------------------------------------------------------ */

export function spawnMenu(g, x, y, kind = 'objective') {
  const m = { x, y, kind, hp: 1, accepted: false, born: g.t };
  g.menus.push(m);
  emit(g, 'menuSpawn', { x, y });
  return m;
}

export function updateWorld(g, dt) {
  if (!g.flags.bWoke && g.p.x > 2400) {
    g.flags.bWoke = true;
    for (const m of g.L.mites) if (m.x > 2400 && m.x < 3300) m.alive = true;
  }
  updateGate(g, dt);
  updateSeal(g);
  updateWarden(g, dt);
  updateMites(g, dt);
  updatePanes(g, dt);
  updateMenus(g, dt);
  updateProj(g, dt);
  updateTeeth(g, dt);
  updateFields(g, dt);
  updatePlank(g, dt);
  updateAmbient(g, dt);
  updateChase(g, dt);
  if (g.wing === 2) updateAppetite(g, dt);
}

function updateGate(g, dt) {
  const G = g.L.gate;
  const p = g.p;
  if (G.jammed) {
    G.open = true;
  } else {
    G.t += dt;
    const openLen = tierOf(g.notice) >= 1 ? 0.5 : 0.75;
    G.open = G.t % 3.3 < openLen;
    const was = G.rect.on !== false;
    G.rect.on = !G.open;
    if (G.rect.on && !was) {
      emit(g, 'gateClose');
      if (overlap(boxOf(p), G.rect) && !g.digest) {
        p.x = p.x < G.x + G.w / 2 ? G.x - p.w / 2 - 1 : G.x + G.w + p.w / 2 + 1;
        hurt(g, G.x + G.w / 2, p.y, 12, 0.4);
      }
    }
  }
  if (G.teeth && G.open && overlap(boxOf(p), { x: G.x - 4, y: G.y, w: G.w + 8, h: G.h })) {
    hurt(g, G.x + G.w / 2, p.y, 18, 0.45);
  }
  if (G.teeth && G.open) {
    for (const m of g.L.mites) if (m.alive && m.x > G.x - 10 && m.x < G.x + G.w + 10) m.alive = false;
  }
}

function updateSeal(g) {
  const s = g.L.seal;
  if (!g.flags.sealed && g.p.x > g.L.hall.x0 + 100 && g.k === 0) {
    g.flags.sealed = true;
    s.on = true;
    emit(g, 'seal');
  }
}

function updateWarden(g, dt) {
  const w = g.L.warden;
  const p = g.p;
  if (w.state === 'sleep') return;
  if (w.stun > 0) { w.stun -= dt; return; }
  const range = tierOf(g.notice) >= 2 ? 280 : 190;
  const near = Math.abs(p.x - w.x) < range && Math.abs(p.y - w.y) < 80;
  const noisy = Math.hypot(p.vx, p.vy) > 90 || p.grip || p.loud;
  if (w.state === 'patrol') {
    w.x += w.dir * 55 * dt;
    if (w.x < w.x0) { w.x = w.x0; w.dir = 1; }
    if (w.x > w.x1) { w.x = w.x1; w.dir = -1; }
    if (near && noisy && !p.hiding && !w.harmless) { w.state = 'alert'; w.lose = 0; emit(g, 'wardenAlert'); }
  } else if (w.state === 'alert') {
    if (p.hiding || !near) { w.lose += dt; if (w.lose > 2.5) { w.state = 'patrol'; w.lose = 0; } } else w.lose = 0;
    if (!p.hiding) {
      const dir = sign(p.x - w.x);
      w.dir = dir || w.dir;
      w.x = clamp(w.x + dir * 150 * dt, w.x0, w.x1);
    }
    if (!p.hiding && !w.harmless && overlap(boxOf(p), wardenBox(w))) {
      hurt(g, w.x, w.y, 25, 0.5);
      w.state = 'recover'; w.lose = 1.3;
    }
  } else if (w.state === 'recover') {
    w.lose -= dt;
    if (w.lose <= 0) w.state = 'alert';
  }
}

function updateMites(g, dt) {
  const p = g.p;
  const stare = tierOf(g.notice) >= 2;
  const sv = toScreen(g, p.vx, p.vy);
  for (const m of g.L.mites) {
    if (!m.alive) continue;
    m.cool = Math.max(0, (m.cool || 0) - dt);
    m.t += dt;
    const near = Math.abs(p.x - m.x) < 180 && Math.abs(p.y - m.y) < 60 && !p.hiding && !m.harmless;
    let dir = m.dir;
    let speed = 38;
    if (near) { dir = sign(p.x - m.x) || dir; speed = stare ? 155 : 115; }
    else {
      if (m.x <= m.x0) dir = 1;
      if (m.x >= m.x1) dir = -1;
    }
    if (m.harmless) speed = 25;
    m.dir = dir;
    m.x = clamp(m.x + dir * speed * dt, m.x0, m.x1);
    // stomp
    const dx = Math.abs(p.x - m.x);
    const dy = p.y - m.y;
    if (dx < 16 && dy < -4 && dy > -22 && sv[1] > 60 && g.k === 0) {
      m.alive = false;
      const [ux, uy] = toWorld(g, 0, -1);
      p.vx += ux * 320; p.vy += uy * 320;
      emit(g, 'squish', { x: m.x, y: m.y });
      continue;
    }
    if (!m.harmless && m.cool === 0 && dx < 15 && Math.abs(dy) < 15 && !p.hiding) {
      if (hurt(g, m.x, m.y, 6, 0.3)) m.cool = 1.4;
    }
  }
}

function updatePanes(g, dt) {
  const p = g.p;
  const active = g.chase.state === 'idle' || g.chase.state === 'done';
  for (const pn of g.L.panes) {
    pn.blind = Math.max(0, pn.blind - dt);
    pn.ignore = Math.max(0, pn.ignore - dt);
    pn.ang = pn.base + Math.sin(g.t * pn.speed + pn.phase) * pn.sweep;
    let seen = false;
    if (active && p.x > g.L.hall.x0 - 40 && pn.blind <= 0 && pn.ignore <= 0 && !p.hiding && !inBubble(g, p.x, p.y)) {
      const dx = p.x - pn.x;
      const dy = p.y - pn.y;
      const d = Math.hypot(dx, dy);
      if (d < pn.range && Math.abs(angDiff(Math.atan2(dy, dx), pn.ang)) < pn.half && (p.moving || p.loud) && losClear(g, pn.x, pn.y, p.x, p.y)) seen = true;
    }
    pn.seen = seen ? pn.seen + dt : Math.max(0, pn.seen - dt * 2);
    pn.on = seen;
    if (seen) { addNotice(g, 30 * dt); g.comfort = 0; }
  }
}

function updateMenus(g, dt) {
  const p = g.p;
  const tier = tierOf(g.notice);
  // comfort breeds Menus
  if (!g.menus.length && !g.menuMode && tier === 0 && !p.hiding && !g.rip && p.x < g.L.hall.x0 - 40) g.comfort += dt;
  else if (g.comfort > 0 && (tier > 0 || p.hiding)) g.comfort = Math.max(0, g.comfort - dt * 2);
  if (g.comfort > 30) {
    const [fx, fy] = toWorld(g, p.face * 380, -50);
    spawnMenu(g, p.x + fx, p.y + fy);
    g.comfort = 0;
  }
  // the scripted one on the rib's crest
  if (g.wing === 1 && !g.flags.crestMenu && p.x > 2620 && p.x < 3260 && p.y < -240) {
    g.flags.crestMenu = true;
    const m = spawnMenu(g, 3170, -340, 'arrow');
    m.text = 'THIS WAY (USEFUL)';
    g.L.plank.on = true;
    emit(g, 'plank');
  }
  for (const m of g.menus.slice()) {
    if (m.accepted) {
      const [ox, oy] = toWorld(g, 30, -58);
      m.x += (p.x + ox - m.x) * Math.min(1, dt * 7);
      m.y += (p.y + oy - m.y) * Math.min(1, dt * 7);
      continue;
    }
    const dx = p.x - m.x;
    const dy = p.y - 26 - m.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 700 && !p.hiding) { m.x += (dx / d) * 46 * dt; m.y += (dy / d) * 46 * dt; }
    if (d < 28 && !p.hiding && !g.digest) acceptMenu(g, m);
  }
}

function launchLand(g, pr, tgt) {
  if (g.onLand) g.onLand(pr, tgt); // test hook: lets a bot ask where a throw would end up
  const c = g.chase;
  const far = dist(pr.x, pr.y, g.p.x, g.p.y) > 170;
  if (c.state === 'hunt' && tgt.type === 'surface' && pr.law !== 'STATIC' && far) {
    c.offer = { x: pr.x, y: pr.y, t: 6 };
    emit(g, 'offer', { x: pr.x, y: pr.y, law: pr.law });
    say(g, 'ooh. shiny.');
    return;
  }
  const ok = applyToTarget(g, pr.law, tgt, 'throw');
  if (!ok) {
    dropPickup(g, pr.law, pr.px, pr.py);
    emit(g, 'miss', { x: pr.x, y: pr.y });
  }
}

function updateProj(g, dt) {
  const G = GV[g.k];
  for (let i = g.proj.length - 1; i >= 0; i--) {
    const pr = g.proj[i];
    pr.age += dt;
    pr.vx += G[0] * 1500 * dt;
    pr.vy += G[1] * 1500 * dt;
    let done = false;
    for (let s = 0; s < 4 && !done; s++) {
      pr.px = pr.x; pr.py = pr.y;
      pr.x += (pr.vx * dt) / 4;
      pr.y += (pr.vy * dt) / 4;
      const tgt = pr.age > 0.05 ? targetsAt(g, pr.x, pr.y, 8, pr.law) : null;
      if (tgt) { launchLand(g, pr, tgt); done = true; break; }
      const solid = g.L.solids.find((sd) => sd.on !== false && pointIn(sd, pr.x, pr.y));
      if (solid && pr.age > 0.03) {
        launchLand(g, pr, { type: 'surface', ref: solid, x: pr.x, y: pr.y });
        done = true;
      }
    }
    if (done || pr.age > 4) { g.proj.splice(i, 1); continue; }
    if (pr.x < g.L.bounds.x0 || pr.x > g.L.bounds.x1 || pr.y > g.L.bounds.y1 || pr.y < g.L.bounds.y0) g.proj.splice(i, 1);
  }
}

function bitePlayer(g, cx, cy, notice) {
  if (hurt(g, cx, cy, notice, 0.35) && g.chase.state === 'hunt') g.chase.pin += 0.7;
}

function updateTeeth(g, dt) {
  const p = g.p;
  for (let i = g.teeth.length - 1; i >= 0; i--) {
    const th = g.teeth[i];
    th.t += dt;
    if (th.life !== Infinity) { th.life -= dt; if (th.life <= 0) { g.teeth.splice(i, 1); continue; } }
    if (th.t < 0.6) continue;
    const r = { x: th.rect.x - 2, y: th.rect.y - 2, w: th.rect.w + 4, h: th.rect.h + 4 };
    if (overlap(boxOf(p), r) && !p.hiding) bitePlayer(g, th.rect.x + th.rect.w / 2, th.rect.y + th.rect.h / 2, tierOf(g.notice) < 3 ? 10 : 0);
    for (const m of g.L.mites) if (m.alive && overlap({ x: m.x - 7, y: m.y - 5, w: 14, h: 10 }, r)) { m.alive = false; emit(g, 'squish', { x: m.x, y: m.y }); }
    const w = g.L.warden;
    if (w.state !== 'sleep' && w.stun <= 0 && overlap(wardenBox(w), r)) { w.stun = 3; emit(g, 'wardenStun'); }
  }
  // footprints sprout after a beat
  for (const f of g.foot) {
    f.age += dt;
    if (!f.sprouted && f.age > 1) {
      f.sprouted = true;
      const u = f.up;
      const sx = f.x - u[0] * 10; const sy = f.y - u[1] * 10; // surface point under the paw
      const horiz = Math.abs(u[1]) > 0.5;
      const rect = horiz
        ? { x: sx - 22, y: u[1] < 0 ? sy - 14 : sy, w: 44, h: 14 }
        : { x: u[0] < 0 ? sx - 14 : sx, y: sy - 22, w: 14, h: 44 };
      g.teeth.push({ rect, face: 'foot', t: 0.3, life: 3.5 });
      emit(g, 'footTeeth', { x: sx, y: sy });
    }
  }
}

function updateFields(g, dt) {
  for (let i = g.bubbles.length - 1; i >= 0; i--) { g.bubbles[i].t -= dt; if (g.bubbles[i].t <= 0) g.bubbles.splice(i, 1); }
  for (let i = g.windows.length - 1; i >= 0; i--) { g.windows[i].t -= dt; if (g.windows[i].t <= 0) g.windows.splice(i, 1); }
  for (const w of g.windows) {
    for (const m of g.L.molars) {
      const cx = m.rect.x + m.rect.w / 2; const cy = m.rect.y + m.rect.h / 2;
      if (m.hollow && dist(cx, cy, w.x, w.y) < w.r) m.known = true;
    }
  }
}

function updatePlank(g, dt) {
  const pl = g.L.plank;
  if (pl.on === false) { g.flags.plankT = 0; return; }
  const feet = boxOf(g.p);
  feet.y += 2;
  if (overlap(feet, pl)) {
    g.flags.plankT = (g.flags.plankT || 0) + dt;
    if (g.flags.plankT > 0.2) {
      pl.on = false;
      emit(g, 'crumble', { x: pl.x + pl.w / 2, y: pl.y });
      addNotice(g, 25);
      say(g, 'HELPFUL!');
    }
  }
}

/** Stare: the buildings start to bud teeth ahead of you. */
function updateAmbient(g, dt) {
  const p = g.p;
  if (tierOf(g.notice) < 2 || g.chase.state !== 'idle' || p.hiding || p.x > g.L.hall.x0 || g.k !== 0) return;
  g.flags.bud = (g.flags.bud || 0) - dt;
  if (g.flags.bud > 0) return;
  g.flags.bud = 4.5;
  const bx = p.x + p.face * (170 + g.rand() * 110);
  for (let y = p.y - 60; y < p.y + 140; y += 6) {
    const s = g.L.solids.find((sd) => sd.on !== false && pointIn(sd, bx, y));
    if (s) { if (s.ref !== 'gate' && s.ref !== 'door') addTeethPatch(g, s, bx, y, 4, 46); break; }
  }
}

/* ------------------------------------------------------------------ */
/* the eye                                                             */
/* ------------------------------------------------------------------ */

function once(c, key, at, fn) {
  if (c.t >= at && !c.fired[key]) { c.fired[key] = true; fn(); }
}

function hasLaw(g, id) {
  return g.p.mouth === id || g.p.haul === id || g.pickups.some((pk) => pk.law === id) || g.proj.some((pr) => pr.law === id);
}

function canOpenMolar(g) {
  return hasLaw(g, 'TEETH') || hasLaw(g, 'WONT_CLOSE');
}

/** Never let a thrown-away Law strand the player outside Scar 3. */
function updateHouse(g, dt) {
  const m = g.L.molars.find((mo) => mo.hollow);
  if (!g.frameRipped || !m || m.cracked) return;
  const late = g.chase.state === 'done';
  if (late && !canOpenMolar(g)) {
    g.flags.houseT = (g.flags.houseT || 0) + dt;
    if (g.flags.houseT > 6) crackMolar(g, m, 'eye');
  } else g.flags.houseT = 0;
}

function updateChase(g, dt) {
  const c = g.chase;
  const p = g.p;
  updateHouse(g, dt);
  if (c.state === 'idle') return;
  if (c.state === 'done') { c.lid = Math.max(0, c.lid - dt * 0.35); return; }

  c.t += dt;
  const target = c.offer ? c.offer : p;
  const tAng = Math.atan2(target.y - c.E.y, target.x - c.E.x);
  const pAng = Math.atan2(p.y - c.E.y, p.x - c.E.x);
  const w = (0.55 + 0.22 * lawsCarried(g) + Math.min(0.4, c.t / 90)) * dt;
  c.ang += clamp(angDiff(tAng, c.ang), -w, w);
  c.E.x = clamp(c.E.x + clamp(p.x - c.E.x, -1, 1) * 70 * dt, 4000, 5500);

  if (c.state === 'opening') {
    g.notice = NOTICE.max;
    c.lid = Math.min(1, c.t / 2.4);
    if (c.t >= 2.4) { c.state = 'hunt'; c.t = 0; emit(g, 'eyeOpen'); }
    return;
  }

  // ---- the timeline ----
  const F = c.fired;
  if (c.t >= 26 && !F.warn1) { F.warn1 = true; c.rollWarn = 4; emit(g, 'creak'); }
  once(c, 'roll1', 30, () => { g.k = 1; c.rollWarn = 0; emit(g, 'roll'); say(g, 'the room turns to look at you.'); });
  once(c, 'inhale', 50, () => { c.wind = 6; emit(g, 'inhale'); say(g, 'the gate you left open is inhaling.'); });
  once(c, 'static', 70, () => {
    const s = g.L.staticSpot;
    if (!g.pickups.some((pk) => pk.law === 'STATIC')) g.pickups.push({ law: 'STATIC', x: s.x, y: s.y, born: g.t });
    emit(g, 'staticGlow', { x: s.x, y: s.y });
  });
  if (c.t >= 92 && !F.warn2) { F.warn2 = true; c.rollWarn = 4; emit(g, 'creak'); }
  once(c, 'roll2', 96, () => { g.k = 0; c.rollWarn = 0; emit(g, 'roll'); });
  // The eye's sweep breaks the hollow tooth for you if you have nothing left that could.
  once(c, 'crack', canOpenMolar(g) ? 150 : 110, () => {
    const m = g.L.molars.find((mo) => mo.hollow);
    if (m && !m.cracked) { crackMolar(g, m, 'eye'); }
  });
  if (c.rollWarn > 0) c.rollWarn -= dt;
  if (c.wind > 0) c.wind -= dt;
  if (c.offer) { c.offer.t -= dt; if (c.offer.t <= 0) c.offer = null; }

  // ---- gaze ----
  const cover = losClear(g, c.E.x, c.E.y, p.x, p.y);
  const inCone = Math.abs(angDiff(pAng, c.ang)) < 0.12;
  const seen = !c.offer && !p.hiding && !inBubble(g, p.x, p.y) && cover && inCone && c.lid > 0.9;
  c.seen = seen;
  c.pin = seen ? c.pin + dt : Math.max(0, c.pin - dt * 2);
  if (c.pin >= 1.7 && !g.digest) { beginDigest(g); return; }

  if (seen) g.notice = NOTICE.max;
  else {
    let rate = -3;
    if (p.hiding) rate = -8;
    else if (inBubble(g, p.x, p.y)) rate = -6;
    else if (c.offer) rate = -12;
    g.notice = Math.max(g.floor, g.notice + rate * dt);
  }
  if (g.notice < NOTICE.stare && !seen && c.pin < 0.05 && c.t > 6) endChase(g);
}

function endChase(g) {
  const c = g.chase;
  c.state = 'done';
  c.wind = 0; c.offer = null; c.rollWarn = 0;
  g.k = 0;
  g.foot.length = 0;
  g.flags.chaseDone = true;
  emit(g, 'chaseEnd');
  say(g, 'the eye lids over. it forgot what it was doing.', 4);
}

// Browser shell: canvas, loop, camera, effects, sound, title and end cards.

import { newGame, step, DT, tierOf } from './sim.js';
import { LAWS } from './laws.js';
import { toScreen, toWorld } from './core.js';
import { draw } from './render.js';
import { Sound } from './audio.js';
import { createInput } from './input.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const titleEl = document.getElementById('title');
const endEl = document.getElementById('endcard');
const input = createInput();
const audio = new Sound();

const startWing = new URLSearchParams(location.search).get('wing') === '2' ? 2 : 1;
let g = newGame(undefined, { wing: startWing });
const cam = { x: g.p.x, y: g.p.y - 40, zoom: 1.5, rot: 0 };
const fx = { parts: [], shake: 0, sway: 0, dogAng: 0, dogFace: 1, debug: new URLSearchParams(location.search).has('debug') };
const view = { w: 0, h: 0 };
let started = false;
let override = null; // tests can inject inputs

/* ---------------- sizing ---------------- */

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  canvas.width = Math.round(view.w * dpr);
  canvas.height = Math.round(view.h * dpr);
  canvas.style.width = `${view.w}px`;
  canvas.style.height = `${view.h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

/* ---------------- effects ---------------- */

function burst(x, y, color, n = 14, speed = 160, life = 0.6, size = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + Math.random() * 0.5), max: life, color, size: size * (0.6 + Math.random()) });
  }
}

function popup(x, y, text, color = '#fff', size = 14) {
  fx.parts.push({ x, y, vx: 0, vy: -40, life: 0.9, max: 0.9, color, size, text });
}

const BARKS = ['ARF!', 'YAP!', 'BARK!', 'GRR!', '!!!'];

function vibrate(ms) { try { navigator.vibrate?.(ms); } catch { /* not supported */ } }

function handle(e) {
  audio.play(e.type, e);
  switch (e.type) {
    case 'rip':
      fx.shake = Math.max(fx.shake, e.perfect ? 9 : 16);
      burst(e.x, e.y, LAWS[e.law].color, 26, 240, 0.8, 4);
      popup(e.x, e.y - 36, e.perfect ? 'CLEAN' : 'RAGGED', e.perfect ? '#b8ffd8' : '#ff9a9a', 12);
      vibrate(e.perfect ? 40 : 80);
      break;
    case 'plant': vibrate(15); break;
    case 'hurt': fx.shake = Math.max(fx.shake, 11); vibrate(35); break;
    case 'bark': popup(g.p.x, g.p.y - 26, BARKS[(Math.random() * BARKS.length) | 0], '#ffe3a8', 15); break;
    case 'write': burst(e.x, e.y, LAWS[e.law]?.color || '#fff', 22, 200, 0.7, 3.5); fx.shake = Math.max(fx.shake, 4); break;
    case 'jam': burst(e.x, e.y, LAWS[e.law].color, 12, 120, 0.4, 3); break;
    case 'smash': fx.shake = Math.max(fx.shake, 12); burst(e.x, e.y, '#eaf4ff', 24, 260, 0.7, 4); popup(e.x, e.y - 14, 'UNSUBSCRIBED', '#fff', 11); break;
    case 'bite': burst(e.x, e.y, '#eaf4ff', 6, 120, 0.3, 3); fx.shake = Math.max(fx.shake, 4); break;
    case 'squish': burst(e.x, e.y, '#c8d86a', 10, 120, 0.4, 3); break;
    case 'crumble': burst(e.x, e.y, '#eaf4ff', 16, 120, 0.9, 4); fx.shake = 6; break;
    case 'roll': fx.shake = 22; break;
    case 'creak': fx.shake = 5; break;
    case 'crack': fx.shake = 14; burst(e.x, e.y, '#efe2c8', 20, 200, 0.7, 4); break;
    case 'chew': burst(e.x, e.y, '#efe2c8', 10, 100, 0.5, 3); break;
    case 'gateClose': fx.shake = Math.max(fx.shake, 2); break;
    case 'doorOpen': fx.shake = 14; break;
    case 'chaseStart': fx.shake = 18; break;
    case 'eyeOpen': fx.shake = 12; break;
    case 'inhale': fx.shake = 6; break;
    case 'digest': fx.shake = 16; vibrate(200); break;
    case 'end': showEnd(); break;
    case 'wear': burst(g.p.x, g.p.y - 6, LAWS[e.law].color, 18, 150, 0.6, 3); popup(g.p.x, g.p.y - 30, LAWS[e.law].name, LAWS[e.law].color, 10); break;
    case 'heart': fx.shake = Math.max(fx.shake, 12); burst(g.p.x, g.p.y - 10, '#ff5d7a', 16, 200, 0.6, 4); popup(g.p.x, g.p.y - 30, e.left > 0 ? 'POP' : 'LAST ONE', '#ff9ab0', 12); vibrate(60); break;
    case 'eject': burst(g.p.x, g.p.y, '#ffb45e', 30, 260, 0.8, 4); fx.shake = 8; break;
    case 'mawSnap': if (Math.hypot(e.x - g.p.x, e.y - g.p.y) < 400) fx.shake = Math.max(fx.shake, 6); break;
    case 'surge': fx.shake = 24; break;
    case 'surgeWarn': fx.shake = 8; break;
    case 'sphincterOpen': fx.shake = 14; break;
    case 'glassOn': burst(e.x, e.y, '#a8ecff', 3, 40, 0.4, 2); break;
    case 'menuSpawn': burst(e.x, e.y, '#2f7dff', 10, 90, 0.5, 3); break;
    case 'plank': burst(3310, -262, '#2f7dff', 12, 90, 0.6, 3); break;
    case 'teethGrow': case 'footTeeth': burst(e.x, e.y, '#efe2c8', 6, 90, 0.3, 2.5); break;
    default: break;
  }
}

function showEnd() {
  const held = [g.p.worn, g.p.mouth, g.p.haul].filter(Boolean).map((id) => LAWS[id].name);
  if (g.p.hearts > 0) held.push(`${g.p.hearts} HEARTS`);
  const w2 = g.wing === 2;
  document.getElementById('end-title').textContent = w2 ? 'APPETITE' : 'CONTACT';
  document.getElementById('end-sub').textContent = w2 ? 'WING TWO, SURVIVED' : 'WING ONE, SURVIVED';
  document.getElementById('end-tag').innerHTML = w2
    ? 'The sphincter forgets what it was for.<br>The stomach is still hungry. Just not for you.'
    : 'You crawl out of the tooth into black.<br>The ocean mutters your footsteps.';
  document.getElementById('next').textContent = w2 ? 'WING THREE: THE ZOO' : 'CONTINUE: APPETITE';
  document.getElementById('next').disabled = w2;
  document.getElementById('next').style.opacity = w2 ? '0.35' : '1';
  document.getElementById('end-note').textContent = w2 ? 'The Zoo is not built yet. The rest is in docs/ZOOM.md.' : '';
  document.getElementById('end-laws').textContent = held.length ? held.join('  +  ') : 'nothing. you crawl out with your teeth.';
  document.getElementById('end-holes').textContent = g.stats.holes;
  document.getElementById('end-perfect').textContent = g.stats.perfect;
  document.getElementById('end-smashed').textContent = g.stats.smashed;
  document.getElementById('end-leash').textContent = g.stats.leash;
  document.getElementById('end-digests').textContent = g.stats.digests;
  document.getElementById('end-time').textContent = fmt(g.t);
  setTimeout(() => endEl.classList.add('on'), 2600);
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/* ---------------- camera ---------------- */

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateCamera(dt) {
  const p = g.p;
  const rotT = g.k * (Math.PI / 2);
  cam.rot = angleLerp(cam.rot, rotT, Math.min(1, dt * 3.2));
  const [lx, ly] = toWorld(g, p.face * 70, -34);
  const tx = p.x + lx; const ty = p.y + ly;
  const inHall = p.x > g.L.hall.x0;
  let zt = g.wing === 2 ? 1.3 : 1.5;
  if (p.grip) zt = 1.12;                                   // pull back: small on a moving rib
  if (g.aim) zt = 1.3;
  if (g.chase.state === 'hunt' || g.chase.state === 'opening') zt = 1.05;
  else if (inHall) zt = 1.3;
  if (p.hiding) zt = 2.1;
  cam.zoom += (zt - cam.zoom) * Math.min(1, dt * 2.2);
  const k = Math.min(1, dt * (p.hiding ? 3 : 5));
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;

  const tier = tierOf(g.notice);
  fx.sway = tier >= 1 ? Math.sin(g.t * 0.7) * 0.009 * tier + (g.chase.rollWarn > 0 ? Math.sin(g.t * 30) * 0.004 : 0) : 0;
  fx.shake = Math.max(0, fx.shake - dt * 30);
  if (tier >= 2 && Math.random() < 0.02) fx.shake = Math.max(fx.shake, 3);

  // dog orientation
  let ang = 0; let face = p.face;
  if (p.grip) {
    const sd = toScreen(g, p.gripDir[0], p.gripDir[1]);
    ang = Math.atan2(-sd[0], sd[1]);
    if (Math.abs(sd[0]) > 0.5) face = sd[0] > 0 ? 1 : -1;
  }
  fx.dogAng = angleLerp(fx.dogAng, ang, Math.min(1, dt * 14));
  fx.dogFace = face;
}

function updateParts(dt) {
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const q = fx.parts[i];
    q.life -= dt;
    if (q.life <= 0) { fx.parts.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (!q.text) { q.vy += 260 * dt; q.vx *= 0.98; }
  }
  if (fx.parts.length > 600) fx.parts.splice(0, fx.parts.length - 600);
}

/* ---------------- start / restart ---------------- */

function begin() {
  if (started) return;
  started = true;
  audio.start();
  titleEl.classList.remove('on');
  g.phase = 'play';
}

function launch(wing, carry) {
  g = newGame(Math.floor(Math.random() * 1e6), { wing, carry });
  cam.x = g.p.x; cam.y = g.p.y - 40; cam.rot = 0; cam.zoom = 1.5;
  fx.parts.length = 0;
  endEl.classList.remove('on');
  g.phase = 'play';
  started = true;
  window.__zoom.g = g;
}

function restart() { launch(g.wing); }

function nextWing() {
  if (g.wing !== 1 || !g.end) return;
  const p = g.p;
  launch(2, { mouth: p.mouth, haul: p.haul, worn: p.worn, hearts: p.hearts, stats: g.stats });
}

input.onFirst = (e) => {
  if (!started) { begin(); return; }
  audio.start();
  if (e.code === 'KeyR') restart();
  if (e.code === 'Backquote') fx.debug = !fx.debug;
};
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyR' && started) restart();
  if (e.code === 'Backquote') fx.debug = !fx.debug;
  if (e.code === 'KeyH') titleEl.classList.toggle('on');
});
document.getElementById('start')?.addEventListener('click', begin);
document.getElementById('again')?.addEventListener('click', restart);
document.getElementById('next')?.addEventListener('click', nextWing);
document.getElementById('start2')?.addEventListener('click', () => { if (!started) { launch(2); titleEl.classList.remove('on'); audio.start(); } });
document.getElementById('touch')?.addEventListener('pointerdown', () => { if (!started) begin(); });

/* ---------------- loop ---------------- */

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (document.hidden) return;
  dt = Math.min(dt, 0.1);
  acc += dt;
  while (acc >= DT) {
    const inp = override ? override(g) : input.read();
    if (input.touchActive && !override) inp.hide = inp.hide || false;
    step(g, inp, DT);
    for (const e of g.ev) handle(e);
    g.ev.length = 0;
    updateParts(DT);
    acc -= DT;
    audio.setMood(tierOf(g.notice), g.p.hiding, DT, g.notice);
  }
  updateCamera(dt);
  draw(ctx, g, cam, fx, view);
}
requestAnimationFrame(frame);

window.__zoom = {
  g,
  cam,
  fx,
  setInput(fn) { override = fn; },
  begin,
  restart,
  launch,
  nextWing,
};

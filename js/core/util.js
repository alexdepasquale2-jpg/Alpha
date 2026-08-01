/* ============================================================================
 * util.js — tiny helpers shared by every module.
 * Everything hangs off the single global namespace `CM` so the game runs from
 * a plain file:// open (no bundler, no ES-module CORS issues).
 * ========================================================================== */
window.CM = window.CM || {};

CM.util = (function () {
  'use strict';

  /* ------------------------------------------------------------- math -- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp  = (a, b, t) => a + (b - a) * t;
  const inv   = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const rand  = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const choice  = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance  = (p) => Math.random() < p;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIO  = (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  /* Deterministic RNG (mulberry32) — used for city/skyline generation so the
     backdrop looks identical every session. */
  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --------------------------------------------------------- formatting */
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac', 'ad', 'ae'];
  function fmt(n, dp) {
    if (n === undefined || n === null || isNaN(n)) return '0';
    const neg = n < 0; n = Math.abs(n);
    if (n < 1000) {
      const d = dp !== undefined ? dp : (n < 10 && n % 1 !== 0 ? 1 : 0);
      return (neg ? '-' : '') + (+n.toFixed(d)).toString();
    }
    let i = 0;
    while (n >= 1000 && i < SUFFIX.length - 1) { n /= 1000; i++; }
    return (neg ? '-' : '') + (+n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0)) + SUFFIX[i];
  }
  /** "1h 04m" style duration for offline reports and cooldowns. */
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600);
    const m = Math.floor(sec % 3600 / 60), s = sec % 60;
    const p = (v) => String(v).padStart(2, '0');
    if (d) return d + 'd ' + p(h) + 'h';
    if (h) return h + 'h ' + p(m) + 'm';
    if (m) return m + 'm ' + p(s) + 's';
    return s + 's';
  }
  /** Zero-padded odometer digits for the REWARDS counter on the title screen. */
  function odometer(n, len) {
    return String(Math.floor(Math.abs(n))).padStart(len, '0').slice(-len);
  }

  /* ------------------------------------------------------------ arrays  */
  const sum = (arr, f) => arr.reduce((a, v) => a + (f ? f(v) : v), 0);
  const byId = (arr, id) => arr.find((o) => o && o.id === id);
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* --------------------------------------------------------- event bus  */
  function Bus() {
    const map = new Map();
    return {
      on(ev, fn) { (map.get(ev) || map.set(ev, []).get(ev)).push(fn); return () => this.off(ev, fn); },
      off(ev, fn) { const l = map.get(ev); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
      emit(ev, data) { const l = map.get(ev); if (l) l.slice().forEach((fn) => fn(data)); }
    };
  }

  /* ------------------------------------------------------------- ids    */
  let _uid = Math.floor(Math.random() * 1e6);
  const uid = (p) => (p || 'id') + '_' + (++_uid).toString(36) + Date.now().toString(36).slice(-4);

  /* --------------------------------------------------------- canvas fx  */
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  /** Rounded rectangle path (Path2D-free so it works on older canvas impls). */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  /** Flat-top hexagon path centred on (cx,cy). */
  function hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a) * 0.62; // squashed = fake iso
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  /** Draw `fn` twice: once as a blurred glow, once crisp on top. */
  function glow(ctx, color, blur, fn) {
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = blur;
    fn(ctx); fn(ctx);
    ctx.restore();
    fn(ctx);
  }
  /** #rrggbb -> rgba() with alpha. */
  function rgba(hex, a) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  /** Blend two hex colours, t=0 -> a, t=1 -> b. */
  function mix(a, b, t) {
    const p = (h) => { h = h.replace('#', ''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const A = p(a), B = p(b);
    const c = A.map((v, i) => Math.round(lerp(v, B[i], t)));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function shade(hex, amt) { return mix(hex, amt > 0 ? '#ffffff' : '#000000', Math.abs(amt)); }

  return {
    clamp, lerp, inv, rand, randInt, choice, chance, easeOut, easeIO, seeded,
    fmt, fmtTime, odometer, sum, byId, shuffle, Bus, uid,
    makeCanvas, roundRect, hexPath, glow, rgba, mix, shade
  };
})();

/* Global event bus — scenes/managers talk through this instead of each other. */
CM.bus = CM.util.Bus();

/* ============================================================================
 * rain.js — layered rain particle system + puddle splashes + lightning.
 * One instance is owned by main.js and drawn on top of every scene, so the
 * downpour is continuous no matter which screen you're on.
 * ========================================================================== */
CM.Rain = (function () {
  'use strict';
  const U = CM.util;

  function Rain(opts) {
    opts = opts || {};
    this.w = 1; this.h = 1;
    this.density = opts.density === undefined ? 1 : opts.density;
    this.wind = opts.wind === undefined ? -0.28 : opts.wind;   // negative = leans left
    this.drops = [];
    this.splashes = [];
    this.flash = 0;         // lightning brightness 0..1
    this.nextBolt = U.rand(6, 16);
    this.groundY = null;    // if set, drops splash at this y instead of the bottom
  }

  Rain.prototype.resize = function (w, h) {
    this.w = w; this.h = h;
    const target = Math.round(U.clamp(w * h / 5200, 90, 460) * this.density);
    this.drops.length = 0;
    for (let i = 0; i < target; i++) this.drops.push(this._make(true));
  };

  Rain.prototype._make = function (spread) {
    // three depth layers: far drops are short, dim and slow.
    const layer = Math.random() < .45 ? 0 : Math.random() < .7 ? 1 : 2;
    const speed = [420, 700, 1050][layer];
    return {
      x: Math.random() * (this.w + 200) - 100,
      y: spread ? Math.random() * this.h : -20 - Math.random() * 120,
      len: [7, 13, 22][layer] * (0.7 + Math.random() * .6),
      spd: speed * (0.85 + Math.random() * .3),
      a: [0.16, 0.3, 0.5][layer] * (0.7 + Math.random() * .6),
      w: [0.8, 1.1, 1.6][layer],
      layer: layer
    };
  };

  Rain.prototype.update = function (dt) {
    const gy = this.groundY === null ? this.h : this.groundY;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.y += d.spd * dt;
      d.x += d.spd * dt * this.wind;
      if (d.y > gy + 6) {
        // near-layer drops leave a splash ring on the pavement
        if (d.layer === 2 && this.splashes.length < 90 && Math.random() < .5) {
          this.splashes.push({ x: d.x, y: gy + Math.random() * 6, r: 0, life: 1 });
        }
        Object.assign(d, this._make(false));
      }
      if (d.x < -120) d.x += this.w + 200;
      if (d.x > this.w + 120) d.x -= this.w + 200;
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.life -= dt * 2.6; s.r += dt * 44;
      if (s.life <= 0) this.splashes.splice(i, 1);
    }
    // occasional distant lightning
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) { this.flash = 1; this.nextBolt = U.rand(9, 26); }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
  };

  Rain.prototype.render = function (ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      ctx.strokeStyle = 'rgba(170,210,255,' + d.a + ')';
      ctx.lineWidth = d.w;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len * this.wind, d.y + d.len);
      ctx.stroke();
    }
    for (let i = 0; i < this.splashes.length; i++) {
      const s = this.splashes[i];
      ctx.strokeStyle = 'rgba(150,200,255,' + (s.life * .30) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * .34, 0, 0, 7); ctx.stroke();
    }
    ctx.restore();
  };

  /** Full-screen lightning wash — drawn after everything else. */
  Rain.prototype.renderFlash = function (ctx) {
    if (this.flash <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(120,160,255,' + (this.flash * this.flash * .16) + ')';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  };

  return Rain;
})();

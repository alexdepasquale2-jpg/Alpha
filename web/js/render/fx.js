// Battle effects: tracers, explosions, floating numbers, screen shake.
// Purely cosmetic — the simulation never reads any of this, so dropping frames
// or skipping effects can never change a battle's outcome.

import { COLORS } from '../ui/theme.js';
import { cosmetic } from '../core/rng.js';

export class FxLayer {
  constructor() {
    this.tracers = [];
    this.blasts = [];
    this.numbers = [];
    this.shake = 0;
  }

  clear() {
    this.tracers.length = 0;
    this.blasts.length = 0;
    this.numbers.length = 0;
    this.shake = 0;
  }

  /** Drain a batch of sim events into cosmetic effects. */
  ingest(events, toScreen) {
    for (const e of events) {
      if (e.type === 'shot') {
        const a = toScreen(e.x0, e.y0);
        const b = toScreen(e.x1, e.y1);
        this.tracers.push({
          x0: a.x, y0: a.y - 8, x1: b.x, y1: b.y - 8,
          life: 0.13, max: 0.13,
          color: e.side === 'player' ? COLORS.green : COLORS.enemy,
          wide: (e.splash ?? 0) > 0,
        });
      } else if (e.type === 'death') {
        const p = toScreen(e.x, e.y);
        this.blasts.push({ x: p.x, y: p.y - 8, r: 4, max: 22, life: 0.35, maxLife: 0.35, color: '#e8a05a' });
        for (let i = 0; i < 4; i++) {
          this.numbers.push({
            x: p.x + cosmetic.range(-6, 6), y: p.y - 10,
            vy: cosmetic.range(-40, -16), vx: cosmetic.range(-14, 14),
            life: 0.5, maxLife: 0.5, text: '', size: cosmetic.range(2, 4),
            color: e.side === 'player' ? COLORS.green : COLORS.enemy,
          });
        }
        this.shake = Math.min(6, this.shake + 0.7);
      } else if (e.type === 'blast') {
        const p = toScreen(e.x, e.y);
        this.blasts.push({
          x: p.x, y: p.y - 6, r: 6, max: 18 + e.radius * 26,
          life: 0.45, maxLife: 0.45, color: '#ffca7a',
        });
        this.shake = Math.min(9, this.shake + 2.2);
      }
    }
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      if ((this.tracers[i].life -= dt) <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.life -= dt;
      b.r = b.max * (1 - b.life / b.maxLife);
      if (b.life <= 0) this.blasts.splice(i, 1);
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.vy += 90 * dt;
      if (n.life <= 0) this.numbers.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 18);
  }

  /** Apply the current shake offset. Pair with ctx.restore(). */
  applyShake(ctx) {
    ctx.save();
    if (this.shake > 0.1) {
      ctx.translate(cosmetic.range(-this.shake, this.shake),
                    cosmetic.range(-this.shake, this.shake));
    }
  }

  render(ctx) {
    ctx.lineCap = 'round';
    for (const t of this.tracers) {
      ctx.globalAlpha = t.life / t.max;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = t.wide ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x1, t.y1);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.blasts) {
      ctx.globalAlpha = Math.max(0, b.life / b.maxLife) * 0.7;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const n of this.numbers) {
      ctx.globalAlpha = Math.max(0, n.life / n.maxLife);
      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

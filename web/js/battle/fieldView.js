// Shared geometry and background for the battlefield, so the deploy screen and
// the battle screen agree pixel-for-pixel on where cell (3, 7) is.

import { FIELD_W, FIELD_H, DEPLOY_ROWS } from './simulation.js';
import { COLORS, text, fillRound, strokeRound } from '../ui/theme.js';

export class FieldView {
  constructor() {
    this.x = 0; this.y = 0; this.cell = 40; this.w = 0; this.h = 0;
  }

  /**
   * Fit the 6x10 field into a rect, preserving aspect.
   *
   * The field is 0.6 wide-to-tall and a phone is nearer 0.46, so we are almost
   * always width-limited and there is vertical slack left over. `align` decides
   * where that slack goes: 'center' for the deploy screen, where the rect is
   * already snug, and 'top' for the battle screen, which puts the slack in one
   * band underneath that it can fill with a readout.
   */
  layout(rect, align = 'center') {
    this.cell = Math.floor(Math.min(rect.w / FIELD_W, rect.h / FIELD_H));
    this.w = this.cell * FIELD_W;
    this.h = this.cell * FIELD_H;
    this.x = rect.x + (rect.w - this.w) / 2;
    this.y = align === 'top' ? rect.y : rect.y + (rect.h - this.h) / 2;
    return this;
  }

  /** Bottom edge in screen px — where a caller can start stacking things. */
  get bottom() {
    return this.y + this.h;
  }

  /** Field coords (in cells, fractional) -> screen px. */
  toScreen(fx, fy) {
    return { x: this.x + fx * this.cell, y: this.y + fy * this.cell };
  }

  /** Screen px -> integer cell, or null if outside the field. */
  toCell(sx, sy) {
    const cx = Math.floor((sx - this.x) / this.cell);
    const cy = Math.floor((sy - this.y) / this.cell);
    if (cx < 0 || cy < 0 || cx >= FIELD_W || cy >= FIELD_H) return null;
    return { x: cx, y: cy };
  }

  cellRect(cx, cy) {
    return { x: this.x + cx * this.cell, y: this.y + cy * this.cell, w: this.cell, h: this.cell };
  }

  contains(sx, sy) {
    return sx >= this.x && sx <= this.x + this.w && sy >= this.y && sy <= this.y + this.h;
  }

  /** Ground, the no-man's-land band, and both deployment zones. */
  renderBackground(ctx, { biomeColor = COLORS.green, showZones = true } = {}) {
    const grad = ctx.createLinearGradient(0, this.y, 0, this.y + this.h);
    grad.addColorStop(0, '#2a1d18');     // enemy end, scorched
    grad.addColorStop(0.5, '#1d2417');
    grad.addColorStop(1, '#233020');     // your end, green
    ctx.fillStyle = grad;
    ctx.fillRect(this.x, this.y, this.w, this.h);

    if (showZones) {
      ctx.fillStyle = 'rgba(196,100,58,.10)';
      ctx.fillRect(this.x, this.y, this.w, this.cell * DEPLOY_ROWS);
      ctx.fillStyle = 'rgba(127,191,90,.12)';
      ctx.fillRect(this.x, this.y + this.h - this.cell * DEPLOY_ROWS, this.w, this.cell * DEPLOY_ROWS);
    }

    // Grid.
    ctx.strokeStyle = 'rgba(232,226,207,.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= FIELD_W; i++) {
      ctx.moveTo(this.x + i * this.cell, this.y);
      ctx.lineTo(this.x + i * this.cell, this.y + this.h);
    }
    for (let i = 0; i <= FIELD_H; i++) {
      ctx.moveTo(this.x, this.y + i * this.cell);
      ctx.lineTo(this.x + this.w, this.y + i * this.cell);
    }
    ctx.stroke();

    // Midline.
    const mid = this.y + this.h / 2;
    ctx.strokeStyle = 'rgba(232,226,207,.16)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x, mid);
    ctx.lineTo(this.x + this.w, mid);
    ctx.stroke();
    ctx.setLineDash([]);

    strokeRound(ctx, this.x - 2, this.y - 2, this.w + 4, this.h + 4, 6, biomeColor, 2);
  }

  /** Highlight a deployment cell. */
  renderCellHint(ctx, cx, cy, { color = COLORS.green, label = '' } = {}) {
    const r = this.cellRect(cx, cy);
    fillRound(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 6, 'rgba(127,191,90,.14)');
    strokeRound(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 6, color, 2);
    if (label) {
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2, {
        size: 10, color, align: 'center', weight: 700,
      });
    }
  }
}

export { FIELD_W, FIELD_H, DEPLOY_ROWS };

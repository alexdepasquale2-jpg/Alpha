// Canvas widgets with hit testing. Retained-mode: a scene builds its buttons in
// enter()/layout() and asks them whether a tap landed.

import { COLORS, panel, text, fillRound, strokeRound } from './theme.js';

export const MIN_TOUCH = 46;   // px floor for anything tappable

export class Button {
  constructor({ x = 0, y = 0, w = 120, h = MIN_TOUCH, label = '', icon = '',
                kind = 'normal', onTap = null, id = '' } = {}) {
    Object.assign(this, { x, y, w, h, label, icon, kind, onTap, id });
    this.enabled = true;
    this.visible = true;
    this.badge = '';
    this._pressedFor = 0;
  }

  setRect(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = Math.max(h, MIN_TOUCH);
    return this;
  }

  contains(px, py) {
    return this.visible && px >= this.x && px <= this.x + this.w
        && py >= this.y && py <= this.y + this.h;
  }

  /** Returns true if this button consumed the point. */
  tryTap(point) {
    if (!point || !this.enabled || !this.visible) return false;
    if (!this.contains(point.x, point.y)) return false;
    this._pressedFor = 0.12;
    this.onTap?.(this);
    return true;
  }

  update(dt) {
    if (this._pressedFor > 0) this._pressedFor = Math.max(0, this._pressedFor - dt);
  }

  render(ctx) {
    if (!this.visible) return;
    const pressed = this._pressedFor > 0;
    const y = this.y + (pressed ? 1 : 0);

    const palette = {
      normal: { fill: '#2c3a24', edge: COLORS.panelEdge, ink: COLORS.ink },
      primary: { fill: COLORS.greenDeep, edge: COLORS.green, ink: '#f2f7ea' },
      danger: { fill: '#5a2c1e', edge: COLORS.rust, ink: '#f7e6e0' },
      ghost: { fill: 'rgba(24,33,20,.72)', edge: COLORS.panelEdge, ink: COLORS.inkDim },
      gold: { fill: '#4a3d1c', edge: COLORS.gold, ink: COLORS.gold },
    }[this.kind] ?? { fill: '#2c3a24', edge: COLORS.panelEdge, ink: COLORS.ink };

    ctx.globalAlpha = this.enabled ? 1 : 0.42;
    fillRound(ctx, this.x, y, this.w, this.h, 12, pressed ? '#384a2d' : palette.fill);
    strokeRound(ctx, this.x, y, this.w, this.h, 12, palette.edge, 2);

    const label = this.icon ? `${this.icon} ${this.label}`.trim() : this.label;
    text(ctx, label, this.x + this.w / 2, y + this.h / 2, {
      size: this.h > 52 ? 16 : 14,
      color: palette.ink,
      align: 'center',
      maxWidth: this.w - 16,
    });

    if (this.badge) {
      const bw = Math.max(20, ctx.measureText(this.badge).width + 10);
      fillRound(ctx, this.x + this.w - bw + 6, y - 8, bw, 20, 10, COLORS.rust);
      text(ctx, this.badge, this.x + this.w - bw / 2 + 6, y + 2, {
        size: 11, color: '#fff', align: 'center',
      });
    }
    ctx.globalAlpha = 1;
  }
}

/** A vertical list with momentum-free drag scrolling. */
export class ScrollList {
  constructor({ x = 0, y = 0, w = 100, h = 100, rowHeight = 56, gap = 6 } = {}) {
    Object.assign(this, { x, y, w, h, rowHeight, gap });
    this.scroll = 0;
    this.items = [];
    this._dragOrigin = null;
  }

  setRect(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; return this; }

  setItems(items) {
    this.items = items;
    this.scroll = Math.min(this.scroll, this.maxScroll);
    return this;
  }

  get contentHeight() {
    return this.items.length * (this.rowHeight + this.gap) - this.gap;
  }

  get maxScroll() {
    return Math.max(0, this.contentHeight - this.h);
  }

  contains(px, py) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }

  /** Feed raw input; returns the item tapped, or null. */
  handleInput(input) {
    const wheel = input.wheel;
    if (wheel && this.contains(input.pointer.x, input.pointer.y)) {
      this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + wheel * 0.5));
    }

    if (input.drag && this.contains(input.drag.startX, input.drag.startY)) {
      if (!this._dragOrigin) this._dragOrigin = this.scroll;
      this.scroll = Math.max(0, Math.min(this.maxScroll, this._dragOrigin - input.drag.dy));
      return null;
    }
    if (!input.pointer.down) this._dragOrigin = null;

    const tap = input.tap;
    if (tap && this.contains(tap.x, tap.y)) {
      const local = tap.y - this.y + this.scroll;
      const index = Math.floor(local / (this.rowHeight + this.gap));
      if (index >= 0 && index < this.items.length) {
        input.tap = null;               // consume
        return this.items[index];
      }
    }
    return null;
  }

  /** @param {(ctx, item, x, y, w, h, index)=>void} drawRow */
  render(ctx, drawRow) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.x, this.y, this.w, this.h);
    ctx.clip();

    const step = this.rowHeight + this.gap;
    const first = Math.max(0, Math.floor(this.scroll / step));
    const last = Math.min(this.items.length, Math.ceil((this.scroll + this.h) / step) + 1);
    for (let i = first; i < last; i++) {
      const ry = this.y + i * step - this.scroll;
      drawRow(ctx, this.items[i], this.x, ry, this.w, this.rowHeight, i);
    }
    ctx.restore();

    // Scroll indicator, only when there's something to scroll.
    if (this.maxScroll > 1) {
      const trackH = this.h;
      const thumbH = Math.max(28, trackH * (this.h / this.contentHeight));
      const t = this.scroll / this.maxScroll;
      fillRound(ctx, this.x + this.w - 4, this.y + t * (trackH - thumbH), 3, thumbH, 2,
                'rgba(232,226,207,.28)');
    }
  }
}

/** Modal-ish confirm/info card drawn at the bottom of the screen. */
export class Card {
  constructor() {
    this.visible = false;
    this.title = '';
    this.body = '';
    this.buttons = [];
  }

  show({ title = '', body = '', buttons = [] }) {
    this.title = title;
    this.body = body;
    this.buttons = buttons.map((b) => new Button(b));
    this.visible = true;
  }

  hide() { this.visible = false; }

  layout(view) {
    const pad = 16;
    const w = Math.min(view.w - pad * 2, 460);
    const h = 200;
    this.x = (view.w - w) / 2;
    this.y = view.h - h - view.safeBottom - pad;
    this.w = w;
    this.h = h;
    const n = Math.max(1, this.buttons.length);
    const bw = (w - pad * 2 - (n - 1) * 8) / n;
    this.buttons.forEach((b, i) => {
      b.setRect(this.x + pad + i * (bw + 8), this.y + h - pad - 50, bw, 50);
    });
  }

  handleInput(input, view) {
    if (!this.visible) return false;
    this.layout(view);
    const tap = input.tap;
    if (!tap) return false;
    for (const b of this.buttons) {
      if (b.tryTap(tap)) { input.tap = null; return true; }
    }
    // Swallow taps behind the card so the scene underneath stays inert.
    if (tap.y >= this.y) { input.tap = null; return true; }
    return false;
  }

  render(ctx, view) {
    if (!this.visible) return;
    this.layout(view);
    ctx.fillStyle = 'rgba(6,10,5,.55)';
    ctx.fillRect(0, 0, view.w, view.h);
    panel(ctx, this.x, this.y, this.w, this.h);
    text(ctx, this.title, this.x + 16, this.y + 28, { size: 17, color: COLORS.gold });
    const words = String(this.body).split('\n');
    words.forEach((line, i) => {
      text(ctx, line, this.x + 16, this.y + 60 + i * 20, { size: 14, color: COLORS.ink, weight: 500 });
    });
    for (const b of this.buttons) b.render(ctx);
  }
}

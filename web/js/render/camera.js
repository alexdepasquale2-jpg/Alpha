// Pan/zoom camera over a world-space rectangle, clamped so you can never lose
// the board off-screen. Drag to pan; pinch and wheel to zoom.

export class Camera {
  constructor() {
    this.x = 0;          // world coords at the centre of the viewport
    this.y = 0;
    this.zoom = 1;
    this.minZoom = 0.5;
    this.maxZoom = 2.5;
    this.bounds = { x: 0, y: 0, w: 0, h: 0 };
    this.viewport = { x: 0, y: 0, w: 0, h: 0 };
    this._panOrigin = null;
  }

  setViewport(x, y, w, h) {
    this.viewport = { x, y, w, h };
    return this;
  }

  setBounds(x, y, w, h) {
    this.bounds = { x, y, w, h };
    return this;
  }

  /** Zoom that exactly fits the bounds inside the viewport. */
  fitZoom(padding = 0) {
    const { w: bw, h: bh } = this.bounds;
    if (!bw || !bh) return 1;
    return Math.min(
      (this.viewport.w - padding * 2) / bw,
      (this.viewport.h - padding * 2) / bh,
    );
  }

  /** Frame the whole board and centre it. */
  fit(padding = 12, { allowZoomIn = true } = {}) {
    const z = this.fitZoom(padding);
    this.minZoom = Math.min(z, 1);
    this.zoom = allowZoomIn ? z : Math.min(z, 1);
    this.x = this.bounds.x + this.bounds.w / 2;
    this.y = this.bounds.y + this.bounds.h / 2;
    this.clamp();
    return this;
  }

  /**
   * Fill the viewport's width and anchor to the top of the bounds.
   *
   * The right choice for a board that is wider than it is tall on screen and
   * grows downward over time — the farm grid gains rows as you take land, so
   * centring it would leave the top half empty early and scroll oddly later.
   */
  fitWidth(padding = 12) {
    const { w: bw } = this.bounds;
    if (!bw) return this;
    const z = (this.viewport.w - padding * 2) / bw;
    this.minZoom = Math.min(z * 0.6, 1);
    this.maxZoom = Math.max(z * 2.5, 2.5);
    this.zoom = z;
    this.x = this.bounds.x + this.bounds.w / 2;
    this.y = this.bounds.y + this.viewport.h / 2 / this.zoom;
    this.clamp();
    return this;
  }

  worldToScreen(wx, wy) {
    return {
      x: this.viewport.x + this.viewport.w / 2 + (wx - this.x) * this.zoom,
      y: this.viewport.y + this.viewport.h / 2 + (wy - this.y) * this.zoom,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: this.x + (sx - this.viewport.x - this.viewport.w / 2) / this.zoom,
      y: this.y + (sy - this.viewport.y - this.viewport.h / 2) / this.zoom,
    };
  }

  containsScreen(sx, sy) {
    const v = this.viewport;
    return sx >= v.x && sx <= v.x + v.w && sy >= v.y && sy <= v.y + v.h;
  }

  /** Keep the board centred when it's smaller than the viewport, in view when bigger. */
  clamp() {
    const halfW = this.viewport.w / 2 / this.zoom;
    const halfH = this.viewport.h / 2 / this.zoom;
    const b = this.bounds;

    if (b.w * this.zoom <= this.viewport.w) this.x = b.x + b.w / 2;
    else this.x = Math.max(b.x + halfW, Math.min(b.x + b.w - halfW, this.x));

    if (b.h * this.zoom <= this.viewport.h) this.y = b.y + b.h / 2;
    else this.y = Math.max(b.y + halfH, Math.min(b.y + b.h - halfH, this.y));
  }

  zoomBy(factor, anchorScreen = null) {
    const before = anchorScreen ? this.screenToWorld(anchorScreen.x, anchorScreen.y) : null;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    if (before) {
      const after = this.screenToWorld(anchorScreen.x, anchorScreen.y);
      this.x += before.x - after.x;
      this.y += before.y - after.y;
    }
    this.clamp();
  }

  /**
   * Consume drag/wheel from Input. Returns true if the camera moved, which the
   * caller uses to suppress the tap that would otherwise follow a drag.
   */
  handleInput(input) {
    let moved = false;

    const wheel = input.wheel;
    if (wheel && this.containsScreen(input.pointer.x, input.pointer.y)) {
      this.zoomBy(wheel > 0 ? 0.92 : 1.08, { x: input.pointer.x, y: input.pointer.y });
      input.wheel = 0;
      moved = true;
    }

    if (input.drag && this.containsScreen(input.drag.startX, input.drag.startY)) {
      if (!this._panOrigin) this._panOrigin = { x: this.x, y: this.y };
      this.x = this._panOrigin.x - input.drag.dx / this.zoom;
      this.y = this._panOrigin.y - input.drag.dy / this.zoom;
      this.clamp();
      moved = true;
    }
    if (!input.pointer.down) this._panOrigin = null;

    return moved;
  }

  /** Set up a clipped, transformed context. Pair with restore(). */
  apply(ctx) {
    ctx.save();
    const v = this.viewport;
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    ctx.translate(v.x + v.w / 2, v.y + v.h / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  restore(ctx) {
    ctx.restore();
  }
}

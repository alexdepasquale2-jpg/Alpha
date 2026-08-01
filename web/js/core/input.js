// Pointer Events -> tap / drag / long-press, in CSS pixels relative to the
// canvas. One listener set for the whole game; the active scene asks what
// happened rather than wiring its own handlers.

const TAP_MAX_MS = 320;
const TAP_SLOP_PX = 12;      // finger wobble that still counts as a tap
const LONG_PRESS_MS = 480;
const DRAG_START_PX = 8;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.pointer = { x: 0, y: 0, down: false };

    // Consumed by the scene each frame, then cleared.
    this.tap = null;          // {x, y}
    this.longPress = null;    // {x, y}
    this.dragStart = null;    // {x, y}
    this.dragEnd = null;      // {x, y, startX, startY}
    this.drag = null;         // {x, y, startX, startY, dx, dy} while dragging
    this.wheel = 0;

    this._downAt = 0;
    this._downX = 0;
    this._downY = 0;
    this._dragging = false;
    this._longPressTimer = 0;
    this._longPressFired = false;
    this._activeId = null;

    this._bind();
  }

  _bind() {
    const c = this.canvas;
    const opts = { passive: false };
    c.addEventListener('pointerdown', (e) => this._onDown(e), opts);
    c.addEventListener('pointermove', (e) => this._onMove(e), opts);
    c.addEventListener('pointerup', (e) => this._onUp(e), opts);
    c.addEventListener('pointercancel', (e) => this._onCancel(e), opts);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += e.deltaY; }, opts);
    // Long-press on mobile otherwise raises the text-selection / context menu.
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _onDown(e) {
    // Single-pointer game: ignore extra fingers rather than fighting over state.
    if (this._activeId !== null) return;
    e.preventDefault();
    this._activeId = e.pointerId;
    this.canvas.setPointerCapture?.(e.pointerId);

    const p = this._pos(e);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.down = true;
    this._downAt = performance.now();
    this._downX = p.x;
    this._downY = p.y;
    this._dragging = false;
    this._longPressFired = false;

    clearTimeout(this._longPressTimer);
    this._longPressTimer = setTimeout(() => {
      if (this.pointer.down && !this._dragging) {
        this._longPressFired = true;
        this.longPress = { x: this.pointer.x, y: this.pointer.y };
        navigator.vibrate?.(12);
      }
    }, LONG_PRESS_MS);
  }

  _onMove(e) {
    if (this._activeId !== null && e.pointerId !== this._activeId) return;
    e.preventDefault();
    const p = this._pos(e);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    if (!this.pointer.down) return;

    const dx = p.x - this._downX;
    const dy = p.y - this._downY;
    if (!this._dragging && Math.hypot(dx, dy) > DRAG_START_PX) {
      this._dragging = true;
      clearTimeout(this._longPressTimer);
      this.dragStart = { x: this._downX, y: this._downY };
    }
    if (this._dragging) {
      this.drag = { x: p.x, y: p.y, startX: this._downX, startY: this._downY, dx, dy };
    }
  }

  _onUp(e) {
    if (this._activeId !== null && e.pointerId !== this._activeId) return;
    e.preventDefault();
    clearTimeout(this._longPressTimer);
    const p = this._pos(e);
    const held = performance.now() - this._downAt;
    const moved = Math.hypot(p.x - this._downX, p.y - this._downY);

    if (this._dragging) {
      this.dragEnd = { x: p.x, y: p.y, startX: this._downX, startY: this._downY };
    } else if (!this._longPressFired && held <= TAP_MAX_MS && moved <= TAP_SLOP_PX) {
      this.tap = { x: p.x, y: p.y };
    }

    this.pointer.down = false;
    this.drag = null;
    this._dragging = false;
    this._activeId = null;
    this.canvas.releasePointerCapture?.(e.pointerId);
  }

  _onCancel(e) {
    clearTimeout(this._longPressTimer);
    this.pointer.down = false;
    this.drag = null;
    this._dragging = false;
    this._activeId = null;
    this.canvas.releasePointerCapture?.(e.pointerId);
  }

  /** Take the pending tap, if any, clearing it so only one consumer sees it. */
  takeTap() {
    const t = this.tap;
    this.tap = null;
    return t;
  }

  takeLongPress() {
    const t = this.longPress;
    this.longPress = null;
    return t;
  }

  takeDragStart() {
    const t = this.dragStart;
    this.dragStart = null;
    return t;
  }

  takeDragEnd() {
    const t = this.dragEnd;
    this.dragEnd = null;
    return t;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Called at frame end: anything a scene ignored is discarded, not queued. */
  endFrame() {
    this.tap = null;
    this.longPress = null;
    this.dragStart = null;
    this.dragEnd = null;
    this.wheel = 0;
  }
}

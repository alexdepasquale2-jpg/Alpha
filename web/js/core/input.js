// Pointer Events -> taps, drags, long-presses, and raw multi-touch.
//
// The world scene needs a thumbstick and an action button held at the same
// time, so this tracks every active pointer rather than a single primary one.
// A scene can *claim* a pointer at press time (via the claim handler); claimed
// pointers are excluded from tap/drag/long-press so a thumb resting on the
// stick never registers as a tap on the world behind it.

const TAP_MAX_MS = 320;
const TAP_SLOP_PX = 12;
const LONG_PRESS_MS = 480;
const DRAG_START_PX = 8;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;

    /** @type {Map<number, {id,x,y,startX,startY,downAt,claim,moved}>} */
    this.pointers = new Map();

    // Single-pointer gestures, consumed by scenes each frame.
    this.pointer = { x: 0, y: 0, down: false };
    this.tap = null;
    this.longPress = null;
    this.dragStart = null;
    this.dragEnd = null;
    this.drag = null;
    this.wheel = 0;

    // Keyboard, for desktop play.
    this.keys = new Set();
    this.actionPressed = false;

    this._primaryId = null;
    this._longPressTimer = 0;
    this._longPressFired = false;
    this._dragging = false;

    /**
     * Set by the active scene: given a fresh pointer, return a string tag to
     * take ownership of it, or null to leave it to the gesture recogniser.
     * @type {null | ((p:{id:number,x:number,y:number}) => string|null)}
     */
    this.claimHandler = null;

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
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === ' ' || e.key.toLowerCase() === 'e' || e.key === 'Enter') {
        this.actionPressed = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _onDown(e) {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this._pos(e);

    const record = {
      id: e.pointerId,
      x: p.x, y: p.y,
      startX: p.x, startY: p.y,
      downAt: performance.now(),
      claim: null,
      moved: false,
    };
    record.claim = this.claimHandler?.(record) ?? null;
    this.pointers.set(e.pointerId, record);

    if (record.claim) return;   // owned by a widget; no gesture recognition

    // First unclaimed pointer becomes the gesture primary.
    if (this._primaryId !== null) return;
    this._primaryId = e.pointerId;
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.down = true;
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
    const record = this.pointers.get(e.pointerId);
    if (!record) return;
    e.preventDefault();
    const p = this._pos(e);
    record.x = p.x;
    record.y = p.y;
    if (Math.hypot(p.x - record.startX, p.y - record.startY) > DRAG_START_PX) record.moved = true;

    if (e.pointerId !== this._primaryId) return;
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    if (!this.pointer.down) return;

    const dx = p.x - record.startX;
    const dy = p.y - record.startY;
    if (!this._dragging && Math.hypot(dx, dy) > DRAG_START_PX) {
      this._dragging = true;
      clearTimeout(this._longPressTimer);
      this.dragStart = { x: record.startX, y: record.startY };
    }
    if (this._dragging) {
      this.drag = { x: p.x, y: p.y, startX: record.startX, startY: record.startY, dx, dy };
    }
  }

  _onUp(e) {
    const record = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.canvas.releasePointerCapture?.(e.pointerId);
    if (!record) return;
    e.preventDefault();

    if (e.pointerId !== this._primaryId) return;

    clearTimeout(this._longPressTimer);
    const p = this._pos(e);
    const held = performance.now() - record.downAt;
    const moved = Math.hypot(p.x - record.startX, p.y - record.startY);

    if (this._dragging) {
      this.dragEnd = { x: p.x, y: p.y, startX: record.startX, startY: record.startY };
    } else if (!this._longPressFired && held <= TAP_MAX_MS && moved <= TAP_SLOP_PX) {
      this.tap = { x: p.x, y: p.y };
    }

    this.pointer.down = false;
    this.drag = null;
    this._dragging = false;
    this._primaryId = null;
  }

  _onCancel(e) {
    this.pointers.delete(e.pointerId);
    this.canvas.releasePointerCapture?.(e.pointerId);
    if (e.pointerId !== this._primaryId) return;
    clearTimeout(this._longPressTimer);
    this.pointer.down = false;
    this.drag = null;
    this._dragging = false;
    this._primaryId = null;
  }

  /* ---- multi-touch queries ---------------------------------------------- */

  /** Every pointer a widget has taken ownership of under this tag. */
  claimed(tag) {
    const out = [];
    for (const p of this.pointers.values()) if (p.claim === tag) out.push(p);
    return out;
  }

  firstClaimed(tag) {
    for (const p of this.pointers.values()) if (p.claim === tag) return p;
    return null;
  }

  /* ---- keyboard ---------------------------------------------------------- */

  /** Movement axis from WASD / arrows, normalised. */
  keyAxis() {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len, mag: 1 } : { x: 0, y: 0, mag: 0 };
  }

  takeActionKey() {
    const pressed = this.actionPressed;
    this.actionPressed = false;
    return pressed;
  }

  /* ---- gesture consumption ---------------------------------------------- */

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

  /** Anything a scene ignored this frame is discarded, not queued. */
  endFrame() {
    this.tap = null;
    this.longPress = null;
    this.dragStart = null;
    this.dragEnd = null;
    this.wheel = 0;
    this.actionPressed = false;
  }
}

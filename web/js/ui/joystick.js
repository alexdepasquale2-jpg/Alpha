// Virtual thumbstick and contextual action button.
//
// The stick is floating: it materialises wherever the thumb lands in the left
// half of the screen rather than sitting in a fixed spot, which is far more
// forgiving than aiming for a painted circle you cannot see under your hand.

import { COLORS, text, fillRound, strokeRound } from './theme.js';

const STICK_RADIUS = 58;      // travel distance for full tilt
const KNOB_RADIUS = 26;
const DEAD_ZONE = 0.14;

export class Joystick {
  constructor() {
    this.active = false;
    this.origin = { x: 0, y: 0 };
    this.knob = { x: 0, y: 0 };
    this.axis = { x: 0, y: 0, mag: 0 };
    this.zone = { x: 0, y: 0, w: 0, h: 0 };
    this.fade = 0;
  }

  /** The region of the screen that summons the stick. */
  layout(view, excludeBottom = 0) {
    this.zone = {
      x: 0,
      y: view.safeTop + 60,
      w: view.w * 0.55,
      h: view.h - view.safeTop - 60 - excludeBottom,
    };
  }

  contains(x, y) {
    const z = this.zone;
    return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  }

  /** Read the claimed pointer and turn it into a normalised axis. */
  update(input, dt) {
    const pointer = input.firstClaimed('stick');

    if (pointer) {
      if (!this.active) {
        this.active = true;
        this.origin = { x: pointer.startX, y: pointer.startY };
      }
      const dx = pointer.x - this.origin.x;
      const dy = pointer.y - this.origin.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, STICK_RADIUS);
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;

      this.knob = { x: this.origin.x + nx * clamped, y: this.origin.y + ny * clamped };
      const mag = clamped / STICK_RADIUS;
      this.axis = mag < DEAD_ZONE
        ? { x: 0, y: 0, mag: 0 }
        // Rescale past the dead zone so the first responsive step isn't a jump.
        : { x: nx, y: ny, mag: (mag - DEAD_ZONE) / (1 - DEAD_ZONE) };
      this.fade = 1;
    } else {
      this.active = false;
      this.axis = { x: 0, y: 0, mag: 0 };
      this.fade = Math.max(0, this.fade - dt * 4);
    }

    // Keyboard wins when it is being used, so desktop play needs no stick.
    const keys = input.keyAxis();
    if (keys.mag > 0) this.axis = keys;

    return this.axis;
  }

  render(ctx) {
    if (this.fade <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = this.fade * 0.75;

    ctx.strokeStyle = 'rgba(232,226,207,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.origin.x, this.origin.y, STICK_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(20,28,16,.5)';
    ctx.beginPath();
    ctx.arc(this.origin.x, this.origin.y, STICK_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(127,191,90,.75)';
    ctx.beginPath();
    ctx.arc(this.knob.x, this.knob.y, KNOB_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,226,207,.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * The single contextual button. Its label changes with whatever the player is
 * standing next to, which is what lets the whole game be played without menus.
 */
export class ActionButton {
  constructor() {
    this.x = 0; this.y = 0; this.r = 46;
    this.label = '';
    this.icon = '';
    this.enabled = false;
    this.pressed = 0;
  }

  layout(view) {
    this.r = view.short ? 40 : 46;
    this.x = view.w - view.safeRight - this.r - 24;
    this.y = view.h - view.safeBottom - this.r - 96;
  }

  contains(x, y) {
    return Math.hypot(x - this.x, y - this.y) <= this.r + 10;
  }

  set(icon, label) {
    this.icon = icon;
    this.label = label;
    this.enabled = !!label;
  }

  clear() {
    this.icon = '';
    this.label = '';
    this.enabled = false;
  }

  /** True on the frame the button is released (or the action key is hit). */
  update(input, dt) {
    if (this.pressed > 0) this.pressed = Math.max(0, this.pressed - dt);

    let fired = false;
    if (input.takeActionKey() && this.enabled) fired = true;

    const held = input.firstClaimed('action');
    if (held) {
      this.pressed = 0.15;
      if (!this._wasHeld) this._wasHeld = true;
    } else if (this._wasHeld) {
      this._wasHeld = false;
      if (this.enabled) fired = true;
    }
    return fired;
  }

  render(ctx) {
    if (!this.enabled) return;
    const bump = this.pressed > 0 ? 2 : 0;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.arc(this.x, this.y + 4, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#46612f';
    ctx.beginPath();
    ctx.arc(this.x, this.y + bump, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 3;
    ctx.stroke();

    text(ctx, this.icon, this.x, this.y + bump - 6, { size: 22, align: 'center' });
    text(ctx, this.label, this.x, this.y + bump + 16, {
      size: 11, color: '#f2f7ea', align: 'center', weight: 700, maxWidth: this.r * 1.8,
    });
    ctx.restore();
  }
}

/** Small pill above the player naming what they are standing next to. */
export function drawInteractHint(ctx, x, y, label) {
  ctx.font = '600 11px ui-rounded, system-ui, sans-serif';
  const w = ctx.measureText(label).width + 18;
  fillRound(ctx, x - w / 2, y - 12, w, 22, 11, 'rgba(18,24,15,.9)');
  strokeRound(ctx, x - w / 2, y - 12, w, 22, 11, COLORS.panelEdge, 1);
  text(ctx, label, x, y - 1, { size: 11, color: COLORS.gold, align: 'center' });
}

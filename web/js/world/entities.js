// The player avatar and the townsfolk who walk around. Both are drawn
// procedurally in four facings with a two-frame walk cycle.

import { TILE } from './tiles.js';
import { NPCS } from '../data/npcs.js';
import { Rng } from '../core/rng.js';

export const DIR = { DOWN: 0, LEFT: 1, RIGHT: 2, UP: 3 };

const BODY_W = 18;      // collision box, narrower than a tile so doorways feel generous
const BODY_H = 14;      // feet-only box: the head can overlap the tile above

class Actor {
  constructor(x, y) {
    this.x = x * TILE + TILE / 2;   // world pixels, centre of the feet
    this.y = y * TILE + TILE / 2;
    this.facing = DIR.DOWN;
    this.moving = false;
    this.animT = 0;
    this.speed = 132;               // px/sec
  }

  get tileX() { return Math.floor(this.x / TILE); }
  get tileY() { return Math.floor(this.y / TILE); }

  setTile(tx, ty) {
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE / 2;
  }

  /** The tile the actor is facing — what an interaction targets. */
  facingTile() {
    const dx = this.facing === DIR.LEFT ? -1 : this.facing === DIR.RIGHT ? 1 : 0;
    const dy = this.facing === DIR.UP ? -1 : this.facing === DIR.DOWN ? 1 : 0;
    return { x: this.tileX + dx, y: this.tileY + dy };
  }

  /**
   * Move with axis-separated collision so sliding along a wall works instead
   * of sticking. Returns true if the actor actually moved.
   */
  moveBy(dx, dy, map) {
    let moved = false;
    if (dx !== 0) {
      const nx = this.x + dx;
      if (!this._blocked(nx, this.y, map)) { this.x = nx; moved = true; }
    }
    if (dy !== 0) {
      const ny = this.y + dy;
      if (!this._blocked(this.x, ny, map)) { this.y = ny; moved = true; }
    }
    return moved;
  }

  _blocked(x, y, map) {
    const half = BODY_W / 2;
    const top = y - BODY_H / 2;
    const bottom = y + BODY_H / 2;
    for (const [px, py] of [[x - half, top], [x + half, top],
                            [x - half, bottom], [x + half, bottom]]) {
      if (map.solidAt(Math.floor(px / TILE), Math.floor(py / TILE))) return true;
    }
    return false;
  }

  faceFrom(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx < 0 ? DIR.LEFT : DIR.RIGHT;
    else if (dy !== 0) this.facing = dy < 0 ? DIR.UP : DIR.DOWN;
  }
}

export class Player extends Actor {
  constructor(x, y) {
    super(x, y);
    this.name = 'You';
  }

  update(dt, axis, map) {
    const mag = axis.mag ?? 0;
    if (mag > 0) {
      const step = this.speed * mag * dt;
      const moved = this.moveBy(axis.x * step, axis.y * step, map);
      this.faceFrom(axis.x, axis.y);
      this.moving = moved;
    } else {
      this.moving = false;
    }
    this.animT = this.moving ? this.animT + dt * 8 : 0;
  }

  render(ctx) {
    drawPerson(ctx, this.x, this.y, this.facing, this.animT, {
      shirt: '#5d8f4a', trousers: '#3c4a55', hair: '#6b4a2c', skin: '#d8a982',
      hat: '#c8a24e',
    });
  }
}

export class Npc extends Actor {
  /**
   * @param {string} id npc id from data/npcs.js
   * @param {object} opts
   *   home     tile the NPC returns to
   *   roam     {x, y, w, h} tile rect they wander inside; omit to stand still
   */
  constructor(id, x, y, { roam = null, seed = 1 } = {}) {
    super(x, y);
    this.id = id;
    this.def = NPCS[id];
    this.roam = roam;
    this.home = { x, y };
    this.speed = 52;
    this.rng = new Rng(seed ^ (x * 7919) ^ (y * 104729));
    this.target = null;
    this.waitFor = this.rng.range(0.5, 3);
  }

  update(dt, map) {
    if (!this.roam) { this.moving = false; this.animT = 0; return; }

    if (this.waitFor > 0) {
      this.waitFor -= dt;
      this.moving = false;
      this.animT = 0;
      return;
    }

    if (!this.target) {
      // Pick a spot inside the roam rect and amble over.
      const tx = this.roam.x + this.rng.int(0, this.roam.w - 1);
      const ty = this.roam.y + this.rng.int(0, this.roam.h - 1);
      if (map.solidAt(tx, ty)) { this.waitFor = 0.4; return; }
      this.target = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 3) {
      this.target = null;
      this.waitFor = this.rng.range(1.5, 6);
      this.moving = false;
      return;
    }

    const step = this.speed * dt;
    const moved = this.moveBy((dx / dist) * step, (dy / dist) * step, map);
    this.faceFrom(dx, dy);
    this.moving = moved;
    this.animT += dt * 6;

    // Walked into something: give up on this waypoint rather than grinding.
    if (!moved) { this.target = null; this.waitFor = this.rng.range(0.5, 2); }
  }

  render(ctx) {
    const def = this.def ?? {};
    drawPerson(ctx, this.x, this.y, this.facing, this.animT, {
      shirt: def.color ?? '#8a7f6a',
      trousers: '#3b3a34',
      hair: '#3a2a1c',
      skin: '#d8a982',
    });
  }
}

/* ---- shared person renderer ---------------------------------------------- */

/**
 * A small four-facing figure. `t` drives a two-frame leg swing; passing 0
 * holds the idle pose.
 */
export function drawPerson(ctx, x, y, facing, t, colors) {
  const { shirt, trousers, hair, skin, hat } = colors;
  const swing = Math.sin(t) * 3;
  const bob = Math.abs(Math.sin(t)) * 1.2;

  ctx.save();
  ctx.translate(x, y);

  // Ground shadow keeps the figure anchored to the tile.
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const top = -30 - bob;

  // Legs.
  ctx.fillStyle = trousers;
  if (facing === DIR.LEFT || facing === DIR.RIGHT) {
    ctx.fillRect(-4, top + 20, 5, 11 + swing * 0.4);
    ctx.fillRect(1, top + 20, 5, 11 - swing * 0.4);
  } else {
    ctx.fillRect(-6, top + 20, 5, 11 + swing * 0.5);
    ctx.fillRect(2, top + 20, 5, 11 - swing * 0.5);
  }

  // Torso.
  ctx.fillStyle = shirt;
  ctx.fillRect(-7, top + 10, 14, 12);
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.fillRect(-7, top + 19, 14, 3);

  // Arms.
  ctx.fillStyle = skin;
  if (facing === DIR.LEFT) {
    ctx.fillRect(-9, top + 12, 3, 8);
  } else if (facing === DIR.RIGHT) {
    ctx.fillRect(6, top + 12, 3, 8);
  } else {
    ctx.fillRect(-10, top + 12, 3, 8);
    ctx.fillRect(7, top + 12, 3, 8);
  }

  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, top + 5, 7, 0, Math.PI * 2);
  ctx.fill();

  // Hair, shaped by facing so the figure reads as turning.
  ctx.fillStyle = hair;
  if (facing === DIR.UP) {
    ctx.beginPath();
    ctx.arc(0, top + 5, 7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, top + 2, 7, Math.PI, Math.PI * 2);
    ctx.fill();
    if (facing === DIR.LEFT) ctx.fillRect(-7, top + 2, 4, 5);
    if (facing === DIR.RIGHT) ctx.fillRect(3, top + 2, 4, 5);
  }

  // Eyes, only when not facing away.
  if (facing !== DIR.UP) {
    ctx.fillStyle = '#2a2018';
    if (facing === DIR.LEFT) ctx.fillRect(-5, top + 5, 2, 2);
    else if (facing === DIR.RIGHT) ctx.fillRect(3, top + 5, 2, 2);
    else { ctx.fillRect(-4, top + 5, 2, 2); ctx.fillRect(2, top + 5, 2, 2); }
  }

  if (hat) {
    ctx.fillStyle = hat;
    ctx.beginPath();
    ctx.ellipse(0, top + 1, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-5, top - 5, 10, 6);
  }

  ctx.restore();
}

export { TILE };

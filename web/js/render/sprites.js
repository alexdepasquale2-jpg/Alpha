// Procedural sprites. No image assets anywhere in this project: every mech,
// crop and critter is drawn from primitives here. Keeps the repo text-only and
// lets a unit's silhouette be derived from its role rather than hand-authored.

import { COLORS } from '../ui/theme.js';

/**
 * Chassis families. A unit's frame is what you read at a glance in a battle —
 * treads are slow and tough, hoppers are fast, turrets never move.
 */
export const FRAMES = ['biped', 'tread', 'quad', 'hopper', 'air', 'turret', 'swarm', 'titan'];

/** unitId -> silhouette recipe. Unknown ids fall back to a plain biped. */
export const UNIT_ART = {
  tiller:        { frame: 'swarm',  accent: '#9ad46f', weapon: 'blade' },
  scarecrow:     { frame: 'biped',  accent: '#cfc07a', weapon: 'flak' },
  plowhorse:     { frame: 'hopper', accent: '#c98f4f', weapon: 'ram' },
  harvester:     { frame: 'biped',  accent: '#8fae63', weapon: 'blade' },
  thresher:      { frame: 'tread',  accent: '#b58a4a', weapon: 'spray' },
  sprinkler:     { frame: 'tread',  accent: '#6fa8c4', weapon: 'mortar' },
  cropduster:    { frame: 'air',    accent: '#c9b3e6', weapon: 'spray' },
  beekeeper:     { frame: 'quad',   accent: '#e0c15a', weapon: 'beam' },
  root_anchor:   { frame: 'turret', accent: '#7fa06a', weapon: 'flak' },
  barn_guardian: { frame: 'tread',  accent: '#96a08c', weapon: 'blade', shield: true },
  seed_mortar:   { frame: 'quad',   accent: '#a98b5e', weapon: 'mortar' },
  windmill_array:{ frame: 'turret', accent: '#8fb6cf', weapon: 'aura' },
  silo_cannon:   { frame: 'tread',  accent: '#b0a48c', weapon: 'cannon' },
  combine_titan: { frame: 'titan',  accent: '#d8b45a', weapon: 'cannon' },
};

function artFor(key) {
  return UNIT_ART[key] ?? { frame: FRAMES.includes(key) ? key : 'biped', accent: COLORS.ink };
}

/* ---- mechs -------------------------------------------------------------- */

/**
 * Draw a unit. `size` is roughly its height in px; the sprite is centred on
 * (x, y) horizontally and stands *on* y (feet at y).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} unitId
 * @param {object} opts
 *   team      'ally' | 'enemy'   tint of the body plating
 *   facing    -1 up / +1 down    which way the barrel points
 *   hp        0..1               drives battle damage decals
 *   count     >1 draws a stacked silhouette to imply a squad
 */
export function drawMech(ctx, unitId, x, y, size, opts = {}) {
  const {
    team = 'ally', facing = -1, hp = 1, count = 1, flash = 0, shielded = false,
  } = opts;
  const art = artFor(unitId);
  const body = team === 'enemy' ? '#7a3a28' : '#3f5a30';
  const plate = team === 'enemy' ? '#a04f34' : '#5d7f45';
  const accent = art.accent;

  ctx.save();
  ctx.translate(x, y);

  // Squad depth: two faint copies behind the leader.
  if (count > 1) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    const offsets = count > 4 ? [[-size * 0.32, -size * 0.1], [size * 0.32, -size * 0.16]]
                              : [[size * 0.28, -size * 0.12]];
    for (const [ox, oy] of offsets) {
      ctx.save();
      ctx.translate(ox, oy);
      drawFrame(ctx, art, size * 0.86, body, plate, accent, facing, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  drawFrame(ctx, art, size, body, plate, accent, facing, hp);

  if (shielded || art.shield) {
    ctx.strokeStyle = `rgba(111,183,216,${0.35 + 0.25 * Math.sin(performance.now() / 300)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.45, size * 0.62, size * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffd9a0';
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.45, size * 0.5, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/** Flat single-colour version, for menus and the title screen. */
export function drawMechSilhouette(ctx, unitId, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  drawFrame(ctx, artFor(unitId), size, color, color, color, -1, 1);
  ctx.restore();
}

function drawFrame(ctx, art, s, body, plate, accent, facing, hp) {
  const damaged = hp < 0.5;
  ctx.lineJoin = 'round';

  switch (art.frame) {
    case 'tread': {
      ctx.fillStyle = '#2a2a22';
      rr(ctx, -s * 0.52, -s * 0.3, s * 1.04, s * 0.3, s * 0.1);
      ctx.fillStyle = body;
      rr(ctx, -s * 0.42, -s * 0.72, s * 0.84, s * 0.46, s * 0.08);
      ctx.fillStyle = plate;
      rr(ctx, -s * 0.3, -s * 0.86, s * 0.6, s * 0.2, s * 0.06);
      drawWeapon(ctx, art.weapon, 0, -s * 0.8, s, accent, facing);
      // Tread slats.
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      for (let i = -3; i <= 3; i++) ctx.fillRect(i * s * 0.14 - s * 0.02, -s * 0.28, s * 0.04, s * 0.26);
      break;
    }
    case 'quad': {
      ctx.strokeStyle = '#2a2a22';
      ctx.lineWidth = Math.max(2, s * 0.07);
      for (const dx of [-0.36, -0.14, 0.14, 0.36]) {
        ctx.beginPath();
        ctx.moveTo(dx * s, -s * 0.4);
        ctx.lineTo(dx * s * 1.35, 0);
        ctx.stroke();
      }
      ctx.fillStyle = body;
      rr(ctx, -s * 0.4, -s * 0.66, s * 0.8, s * 0.32, s * 0.14);
      ctx.fillStyle = plate;
      rr(ctx, -s * 0.2, -s * 0.8, s * 0.4, s * 0.2, s * 0.08);
      drawWeapon(ctx, art.weapon, 0, -s * 0.76, s, accent, facing);
      break;
    }
    case 'hopper': {
      ctx.strokeStyle = '#2a2a22';
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, 0); ctx.lineTo(-s * 0.3, -s * 0.3); ctx.lineTo(-s * 0.1, -s * 0.5);
      ctx.moveTo(s * 0.2, 0); ctx.lineTo(s * 0.3, -s * 0.3); ctx.lineTo(s * 0.1, -s * 0.5);
      ctx.stroke();
      ctx.fillStyle = body;
      rr(ctx, -s * 0.3, -s * 0.78, s * 0.6, s * 0.34, s * 0.16);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, -s * 0.6, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      drawWeapon(ctx, art.weapon, 0, -s * 0.72, s * 0.8, accent, facing);
      break;
    }
    case 'air': {
      const hover = Math.sin(performance.now() / 260) * s * 0.05;
      ctx.save();
      ctx.translate(0, -s * 0.5 + hover);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.62, s * 0.3, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.3);
      ctx.lineTo(s * 0.42, s * 0.16);
      ctx.lineTo(0, s * 0.04);
      ctx.lineTo(-s * 0.42, s * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, -s * 0.08, s * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'turret': {
      ctx.fillStyle = '#2a2a22';
      rr(ctx, -s * 0.46, -s * 0.18, s * 0.92, s * 0.18, s * 0.06);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-s * 0.34, -s * 0.18);
      ctx.lineTo(-s * 0.24, -s * 0.62);
      ctx.lineTo(s * 0.24, -s * 0.62);
      ctx.lineTo(s * 0.34, -s * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = plate;
      rr(ctx, -s * 0.22, -s * 0.78, s * 0.44, s * 0.2, s * 0.08);
      drawWeapon(ctx, art.weapon, 0, -s * 0.74, s, accent, facing);
      break;
    }
    case 'swarm': {
      // Small, wide-stanced, cheap-looking.
      ctx.strokeStyle = '#2a2a22';
      ctx.lineWidth = Math.max(2, s * 0.09);
      ctx.beginPath();
      ctx.moveTo(-s * 0.26, 0); ctx.lineTo(-s * 0.12, -s * 0.34);
      ctx.moveTo(s * 0.26, 0); ctx.lineTo(s * 0.12, -s * 0.34);
      ctx.stroke();
      ctx.fillStyle = body;
      rr(ctx, -s * 0.26, -s * 0.64, s * 0.52, s * 0.32, s * 0.1);
      ctx.fillStyle = accent;
      rr(ctx, -s * 0.1, -s * 0.58, s * 0.2, s * 0.08, s * 0.03);
      drawWeapon(ctx, art.weapon, 0, -s * 0.6, s * 0.7, accent, facing);
      break;
    }
    case 'titan': {
      ctx.fillStyle = '#22221c';
      rr(ctx, -s * 0.6, -s * 0.34, s * 1.2, s * 0.34, s * 0.1);
      ctx.fillStyle = body;
      rr(ctx, -s * 0.5, -s * 0.9, s * 1.0, s * 0.58, s * 0.1);
      ctx.fillStyle = plate;
      rr(ctx, -s * 0.34, -s * 1.06, s * 0.68, s * 0.22, s * 0.08);
      ctx.fillStyle = accent;
      rr(ctx, -s * 0.4, -s * 0.74, s * 0.8, s * 0.08, s * 0.04);
      drawWeapon(ctx, art.weapon, -s * 0.24, -s * 0.98, s * 1.1, accent, facing);
      drawWeapon(ctx, art.weapon, s * 0.24, -s * 0.98, s * 1.1, accent, facing);
      break;
    }
    default: { // biped
      ctx.strokeStyle = '#2a2a22';
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(-s * 0.16, 0); ctx.lineTo(-s * 0.2, -s * 0.24); ctx.lineTo(-s * 0.1, -s * 0.44);
      ctx.moveTo(s * 0.16, 0); ctx.lineTo(s * 0.2, -s * 0.24); ctx.lineTo(s * 0.1, -s * 0.44);
      ctx.stroke();
      ctx.fillStyle = body;
      rr(ctx, -s * 0.28, -s * 0.82, s * 0.56, s * 0.42, s * 0.1);
      ctx.fillStyle = plate;
      rr(ctx, -s * 0.18, -s * 0.94, s * 0.36, s * 0.18, s * 0.07);
      drawWeapon(ctx, art.weapon, 0, -s * 0.74, s, accent, facing);
      break;
    }
  }

  if (damaged) {
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.6);
    ctx.lineTo(s * 0.05, -s * 0.42);
    ctx.lineTo(-s * 0.05, -s * 0.3);
    ctx.stroke();
  }
}

function drawWeapon(ctx, kind, x, y, s, accent, facing) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = accent;
  const f = facing < 0 ? -1 : 1;
  switch (kind) {
    case 'cannon':
      rr(ctx, -s * 0.05, f < 0 ? -s * 0.42 : 0, s * 0.1, s * 0.42, s * 0.03);
      break;
    case 'mortar':
      ctx.save();
      ctx.rotate(f * -0.5);
      rr(ctx, -s * 0.06, -s * 0.3, s * 0.12, s * 0.3, s * 0.04);
      ctx.restore();
      break;
    case 'flak':
      rr(ctx, -s * 0.14, f * s * 0.12 - s * 0.06, s * 0.1, s * 0.24, s * 0.03);
      rr(ctx, s * 0.04, f * s * 0.12 - s * 0.06, s * 0.1, s * 0.24, s * 0.03);
      break;
    case 'blade':
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, 0);
      ctx.lineTo(-s * 0.34, f * s * 0.26);
      ctx.lineTo(-s * 0.16, f * s * 0.08);
      ctx.closePath();
      ctx.fill();
      break;
    case 'spray':
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-s * 0.18, f * s * 0.3);
      ctx.lineTo(s * 0.18, f * s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'beam':
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'aura':
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    case 'ram':
      rr(ctx, -s * 0.08, f * s * 0.08, s * 0.16, s * 0.16, s * 0.04);
      break;
    default:
      rr(ctx, -s * 0.04, f < 0 ? -s * 0.3 : 0, s * 0.08, s * 0.3, s * 0.03);
  }
  ctx.restore();
}

/* ---- crops -------------------------------------------------------------- */

/**
 * A crop at a growth stage. `art` is the crop's shape family; `hue` its colour.
 * Stage 0 is a seeded mound, the last stage is harvestable.
 */
export function drawCrop(ctx, art, x, y, size, stage, stages, color, withered = false) {
  const t = stages > 1 ? Math.min(1, stage / (stages - 1)) : 1;
  const h = size * (0.22 + 0.68 * t);
  const green = withered ? '#6a5c3d' : '#4f7a35';
  const fruit = withered ? '#7a6a48' : color;

  ctx.save();
  ctx.translate(x, y);

  if (t < 0.25) {
    // Sprout: two seed leaves.
    ctx.strokeStyle = green;
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, -h);
    ctx.stroke();
    ctx.fillStyle = green;
    ctx.beginPath();
    ctx.ellipse(-size * 0.1, -h, size * 0.1, size * 0.05, -0.5, 0, Math.PI * 2);
    ctx.ellipse(size * 0.1, -h, size * 0.1, size * 0.05, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Stalk and foliage for every family.
  ctx.strokeStyle = green;
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -h);
  ctx.stroke();

  ctx.fillStyle = green;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * size * 0.16, -h * 0.55, size * 0.16, size * 0.07, side * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const ripe = t > 0.82;
  if (ripe || t > 0.6) {
    ctx.globalAlpha = ripe ? 1 : 0.55;
    ctx.fillStyle = fruit;
    switch (art) {
      case 'root':
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.12, size * 0.2, size * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'grain':
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(0, -h + i * size * 0.11, size * 0.07, size * 0.05, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'vine':
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(side * size * 0.2, -h * 0.5, size * 0.11, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'bloom':
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.ellipse(Math.cos(a) * size * 0.11, -h + Math.sin(a) * size * 0.11,
                      size * 0.08, size * 0.08, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        break;
      default: // 'fruit'
        ctx.beginPath();
        ctx.arc(0, -h + size * 0.08, size * 0.15, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (withered) {
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 0.2, -h * 0.4);
    ctx.lineTo(size * 0.2, -h * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---- misc --------------------------------------------------------------- */

export function drawHeart(ctx, x, y, size, filled, color = '#d8607a') {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  const s = size / 2;
  ctx.moveTo(0, s * 0.5);
  ctx.bezierCurveTo(-s * 1.4, -s * 0.5, -s * 0.4, -s * 1.4, 0, -s * 0.4);
  ctx.bezierCurveTo(s * 0.4, -s * 1.4, s * 1.4, -s * 0.5, 0, s * 0.5);
  ctx.closePath();
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.strokeStyle = 'rgba(216,96,122,.5)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.restore();
}

export function drawAnimal(ctx, kind, x, y, size, color = '#e8e2cf') {
  ctx.save();
  ctx.translate(x, y);
  const bob = Math.sin(performance.now() / 500 + x) * size * 0.03;
  ctx.fillStyle = color;
  if (kind === 'chicken') {
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.3 + bob, size * 0.26, size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size * 0.2, -size * 0.48 + bob, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c4643a';
    ctx.beginPath();
    ctx.moveTo(size * 0.3, -size * 0.48 + bob);
    ctx.lineTo(size * 0.44, -size * 0.44 + bob);
    ctx.lineTo(size * 0.3, -size * 0.4 + bob);
    ctx.fill();
  } else { // cow / sheep body plan
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.42 + bob, size * 0.38, size * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size * 0.36, -size * 0.56 + bob, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, size * 0.07);
    for (const dx of [-0.22, 0.16]) {
      ctx.beginPath();
      ctx.moveTo(dx * size, -size * 0.22);
      ctx.lineTo(dx * size, 0);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Rounded-rect fill helper used throughout this module. */
function rr(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

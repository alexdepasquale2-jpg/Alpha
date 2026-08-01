// Tile definitions and terrain rendering.
//
// Every tile is drawn procedurally — a base fill plus deterministic detail
// derived from a hash of its coordinates, so grass tufts and stone flecks stay
// put instead of shimmering as the camera moves.

import { seasonName } from '../core/state.js';

export const TILE = 32;

export const T = {
  VOID: 0,
  GRASS: 1,
  MEADOW: 2,      // longer, wilder grass outside the fences
  PATH: 3,
  DIRT: 4,
  SOIL: 5,        // tilled but dry
  SOIL_WET: 6,
  WATER: 7,
  SHALLOW: 8,
  WOOD: 9,        // interior floorboards
  STONE: 10,      // interior flagstones
  RUG: 11,
  WALL: 12,
  FENCE: 13,
  TREE: 14,
  ROCK: 15,
  FLOWERS: 16,
  COUNTER: 17,
  HAY: 18,
  PLANKS: 19,     // porch / jetty decking
  GRAVEL: 20,
};

/**
 * solid  blocks movement
 * tall   drawn with a raised silhouette so the player can walk behind it
 */
export const TILE_DEF = {
  [T.VOID]:     { base: '#0a0d07', solid: true },
  [T.GRASS]:    { base: '#3d6b33', detail: 'tuft' },
  [T.MEADOW]:   { base: '#456f36', detail: 'blades' },
  [T.PATH]:     { base: '#7a6a4c', detail: 'grit' },
  [T.DIRT]:     { base: '#5b432c', detail: 'grit' },
  [T.SOIL]:     { base: '#4a3521', detail: 'furrow' },
  [T.SOIL_WET]: { base: '#31241a', detail: 'furrow' },
  [T.WATER]:    { base: '#3f6f95', detail: 'ripple', solid: true },
  [T.SHALLOW]:  { base: '#5d8fac', detail: 'ripple' },
  [T.WOOD]:     { base: '#8a6a44', detail: 'boards' },
  [T.STONE]:    { base: '#6e7069', detail: 'flag' },
  [T.RUG]:      { base: '#8c4a42', detail: 'weave' },
  [T.WALL]:     { base: '#4a4038', solid: true, tall: true },
  [T.FENCE]:    { base: '#6b563a', solid: true, detail: 'fence' },
  [T.TREE]:     { base: '#2c4a26', solid: true, tall: true, detail: 'tree' },
  [T.ROCK]:     { base: '#575550', solid: true, detail: 'rock' },
  [T.FLOWERS]:  { base: '#436f36', detail: 'flowers' },
  [T.COUNTER]:  { base: '#a5713c', solid: true, detail: 'boards' },
  [T.HAY]:      { base: '#b39a58', detail: 'grit' },
  [T.PLANKS]:   { base: '#b08a52', detail: 'boards' },
  [T.GRAVEL]:   { base: '#6a6558', detail: 'grit' },
};

export function isSolid(tile) {
  return !!TILE_DEF[tile]?.solid;
}

/** Season tints the outdoor greens and the trees. */
const SEASON_GRASS = {
  Sprout:  { grass: '#3d6b33', meadow: '#456f36', tree: '#2c4a26' },
  Swelter: { grass: '#4c7233', meadow: '#587a34', tree: '#2f5127' },
  Harvest: { grass: '#5d6a2e', meadow: '#6b6b2f', tree: '#4a4522' },
  Frost:   { grass: '#5c6a5e', meadow: '#69756a', tree: '#3d4a42' },
};

let tint = SEASON_GRASS.Sprout;

/** Called when the calendar moves; recolours the outdoors. */
export function refreshSeasonTint(season) {
  tint = SEASON_GRASS[seasonName(season)] ?? SEASON_GRASS.Sprout;
}

function baseColor(tile) {
  if (tile === T.GRASS) return tint.grass;
  if (tile === T.MEADOW) return tint.meadow;
  if (tile === T.TREE) return tint.tree;
  return TILE_DEF[tile]?.base ?? '#000';
}

/** Stable per-tile pseudo-random in [0,1). Same tile, same value, forever. */
export function tileHash(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Draw one tile at world pixel (px, py).
 *
 * `time` only drives water; everything else is static so the ground doesn't
 * crawl when the camera pans.
 */
export function drawTile(ctx, tile, tx, ty, px, py, time = 0) {
  const def = TILE_DEF[tile];
  if (!def || tile === T.VOID) return;

  ctx.fillStyle = baseColor(tile);
  ctx.fillRect(px, py, TILE, TILE);

  const r1 = tileHash(tx, ty, 1);
  const r2 = tileHash(tx, ty, 2);
  const r3 = tileHash(tx, ty, 3);

  switch (def.detail) {
    case 'tuft':
      // A couple of darker blades, placed by hash so they never move.
      ctx.fillStyle = 'rgba(0,0,0,.14)';
      ctx.fillRect(px + r1 * 24, py + r2 * 24, 3, 5);
      if (r3 > 0.55) ctx.fillRect(px + r3 * 26, py + r1 * 26, 2, 4);
      break;

    case 'blades':
      ctx.strokeStyle = 'rgba(0,0,0,.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const bx = px + tileHash(tx, ty, 10 + i) * 28 + 2;
        const by = py + tileHash(tx, ty, 20 + i) * 22 + 6;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 2, by - 7);
      }
      ctx.stroke();
      break;

    case 'grit':
      ctx.fillStyle = 'rgba(0,0,0,.13)';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + tileHash(tx, ty, 30 + i) * 29,
                     py + tileHash(tx, ty, 40 + i) * 29, 2, 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(px + r1 * 28, py + r2 * 28, 2, 2);
      break;

    case 'furrow':
      ctx.strokeStyle = 'rgba(0,0,0,.26)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        ctx.moveTo(px + 3, py + (TILE / 4) * i);
        ctx.lineTo(px + TILE - 3, py + (TILE / 4) * i);
      }
      ctx.stroke();
      break;

    case 'ripple': {
      // The only animated terrain, and it's cheap: two sine-shifted lines.
      ctx.strokeStyle = 'rgba(255,255,255,.16)';
      ctx.lineWidth = 1;
      const wob = Math.sin(time * 1.6 + (tx + ty) * 0.8) * 3;
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 10 + wob);
      ctx.lineTo(px + 14, py + 10 + wob);
      ctx.moveTo(px + 18, py + 22 - wob);
      ctx.lineTo(px + 28, py + 22 - wob);
      ctx.stroke();
      break;
    }

    case 'boards':
      ctx.strokeStyle = 'rgba(0,0,0,.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py + 10.5); ctx.lineTo(px + TILE, py + 10.5);
      ctx.moveTo(px, py + 21.5); ctx.lineTo(px + TILE, py + 21.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.fillRect(px, py, TILE, 2);
      break;

    case 'flag':
      ctx.strokeStyle = 'rgba(0,0,0,.24)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.fillRect(px + 3, py + 3, TILE - 6, 3);
      break;

    case 'weave':
      ctx.strokeStyle = 'rgba(0,0,0,.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < TILE; i += 6) {
        ctx.moveTo(px + i, py);
        ctx.lineTo(px + i, py + TILE);
      }
      ctx.stroke();
      break;

    case 'flowers':
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.fillRect(px + r1 * 24, py + r2 * 24, 3, 5);
      for (let i = 0; i < 3; i++) {
        const fx = px + tileHash(tx, ty, 50 + i) * 26 + 3;
        const fy = py + tileHash(tx, ty, 60 + i) * 26 + 3;
        ctx.fillStyle = ['#d8b45a', '#d87a9c', '#e8e2cf'][i];
        ctx.beginPath();
        ctx.arc(fx, fy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    default:
      break;
  }
}

/**
 * Tiles with height are drawn in a second pass, after entities that stand in
 * front of them, so the player can pass behind a tree trunk.
 */
export function drawTallTile(ctx, tile, tx, ty, px, py) {
  const r1 = tileHash(tx, ty, 7);
  const r2 = tileHash(tx, ty, 8);

  if (tile === T.TREE) {
    // Trunk sits on the tile; canopy overhangs upward.
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(px + TILE / 2 - 4, py + 10, 8, TILE - 12);

    const cx = px + TILE / 2;
    const cy = py + 2 - r1 * 6;
    const r = 17 + r2 * 5;
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy + 5, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = baseColor(T.TREE);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.09)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.4, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (tile === T.ROCK) {
    ctx.fillStyle = '#4a4844';
    ctx.beginPath();
    ctx.ellipse(px + TILE / 2, py + TILE * 0.7, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6e6a63';
    ctx.beginPath();
    ctx.ellipse(px + TILE / 2 - 2, py + TILE * 0.55, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (tile === T.FENCE) {
    ctx.fillStyle = '#7a6244';
    ctx.fillRect(px + 3, py + 6, 4, TILE - 10);
    ctx.fillRect(px + TILE - 7, py + 6, 4, TILE - 10);
    ctx.fillStyle = '#8d7150';
    ctx.fillRect(px, py + 11, TILE, 4);
    ctx.fillRect(px, py + 21, TILE, 4);
    return;
  }
}

/** Interior/exterior walls, drawn with a facade so rooms read as enclosed. */
export function drawWall(ctx, px, py, style = 'plank') {
  const palette = {
    plank: { face: '#3a2c1e', top: '#5a4630', line: 'rgba(0,0,0,.45)' },
    stone: { face: '#38352f', top: '#525049', line: 'rgba(0,0,0,.45)' },
  }[style] ?? { face: '#3a2c1e', top: '#5a4630', line: 'rgba(0,0,0,.45)' };

  ctx.fillStyle = palette.face;
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = palette.top;
  ctx.fillRect(px, py, TILE, 8);
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py + 8.5);
  ctx.lineTo(px + TILE, py + 8.5);
  ctx.moveTo(px + TILE - 0.5, py);
  ctx.lineTo(px + TILE - 0.5, py + TILE);
  ctx.stroke();
}

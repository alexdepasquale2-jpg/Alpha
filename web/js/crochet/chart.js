// Colorwork charts: a grid of palette indices, row-major, top row first.
// Crochet counts rows from the bottom, so Row 1 is the last grid row.
//
// Writes row-by-row instructions for tapestry / graphgan work and diagonal
// instructions for corner-to-corner (C2C), plus the numbers you need to plan
// yarn and bobbins.

import { kmeans, quantise } from './color.js';
import { colorLetter } from './generators.js';

export const MODES = [
  ['tapestry', 'Tapestry, flat rows'],
  ['round', 'Tapestry, in the round'],
  ['c2c', 'Corner to corner (C2C)'],
];

export function blankChart(w = 30, h = 30, palette = ['#f4efe6', '#b7410e']) {
  return { w, h, palette, cells: new Array(w * h).fill(0) };
}

export function resizeChart(chart, w, h, anchor = 'bottom-left') {
  const cells = new Array(w * h).fill(0);
  const dy = anchor.startsWith('bottom') ? chart.h - h : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sy = y + dy;
      if (sy >= 0 && sy < chart.h && x < chart.w) cells[y * w + x] = chart.cells[sy * chart.w + x];
    }
  }
  return { ...chart, w, h, cells };
}

const at = (chart, x, y) => chart.cells[y * chart.w + x];

function runs(list) {
  const out = [];
  for (const c of list) {
    const last = out[out.length - 1];
    if (last && last.color === c) last.n++;
    else out.push({ color: c, n: 1 });
  }
  return out;
}

export function runText(rs, letters = null) {
  return rs.map((r) => `${r.n} ${letters ? letters[r.color] : colorLetter(r.color)}`).join(', ');
}

/**
 * Tapestry rows. Right-handed crocheters work RS rows right to left; working
 * flat, alternate rows come back the other way. In the round every row runs
 * the same way.
 */
export function tapestryRows(chart, { mode = 'tapestry', handed = 'right' } = {}) {
  const rows = [];
  for (let r = 1; r <= chart.h; r++) {
    const y = chart.h - r;
    const line = [];
    for (let x = 0; x < chart.w; x++) line.push(at(chart, x, y));
    const rs = mode === 'round' || r % 2 === 1;
    const rightToLeft = handed === 'right' ? rs : !rs;
    const order = rightToLeft ? line.slice().reverse() : line;
    const rr = runs(order);
    rows.push({
      row: r,
      side: mode === 'round' ? null : rs ? 'RS' : 'WS',
      dir: rightToLeft ? '←' : '→',
      runs: rr,
      changes: rr.length - 1,
      colors: new Set(order).size,
    });
  }
  return rows;
}

/**
 * C2C diagonals. `start` is the corner the first tile goes in. Odd rows run
 * away from the bottom edge, even rows back toward it. Each row notes whether
 * each end is still growing (inc) or shrinking (dec).
 */
export function c2cRows(chart, { start = 'bottom-right' } = {}) {
  const { w: W, h: H } = chart;
  const fromRight = start.endsWith('right');
  const rows = [];
  for (let d = 0; d <= W + H - 2; d++) {
    const vMin = Math.max(0, d - (W - 1));
    const vMax = Math.min(d, H - 1);
    const tiles = [];
    for (let v = vMin; v <= vMax; v++) {
      const u = d - v;
      const x = fromRight ? W - 1 - u : u;
      const y = H - 1 - v;
      tiles.push(at(chart, x, y));
    }
    const up = d % 2 === 0;
    const order = up ? tiles : tiles.reverse();
    const rr = runs(order);
    rows.push({
      row: d + 1,
      dir: up ? (fromRight ? '↖' : '↗') : fromRight ? '↘' : '↙',
      tiles: order.length,
      bottom: d <= W - 1 ? 'inc' : 'dec',
      side: d <= H - 1 ? 'inc' : 'dec',
      runs: rr,
      changes: rr.length - 1,
    });
  }
  return rows;
}

/** Cells per color and yardage per color. */
export function colorStats(chart, { mode = 'tapestry', yardsPerCell = 0.07 } = {}) {
  const counts = chart.palette.map(() => 0);
  for (const c of chart.cells) counts[c] = (counts[c] || 0) + 1;
  // Tapestry carries the unused colors inside each stitch: roughly a third
  // more yarn per color that is present in a row.
  const carry = mode === 'c2c' ? 1 : 1.3;
  return chart.palette.map((hex, i) => ({
    index: i,
    hex,
    letter: colorLetter(i),
    cells: counts[i],
    share: counts[i] / chart.cells.length,
    yards: counts[i] * yardsPerCell * carry,
  }));
}

/** Yarn per cell: a C2C tile is ~3 dc + 3 ch; a tapestry cell is one sc. */
export function yardsPerCell(mode, yardsPerSc) {
  return mode === 'c2c' ? yardsPerSc * 6.4 : yardsPerSc;
}

/**
 * Remove "confetti": single cells none of whose neighbours share their color.
 * Each is a color change for one stitch, which is miserable to work.
 */
export function cleanConfetti(chart, passes = 1) {
  let cells = chart.cells.slice();
  let changed = 0;
  for (let p = 0; p < passes; p++) {
    const next = cells.slice();
    for (let y = 0; y < chart.h; y++) {
      for (let x = 0; x < chart.w; x++) {
        const c = cells[y * chart.w + x];
        const nb = [];
        if (x > 0) nb.push(cells[y * chart.w + x - 1]);
        if (x < chart.w - 1) nb.push(cells[y * chart.w + x + 1]);
        if (y > 0) nb.push(cells[(y - 1) * chart.w + x]);
        if (y < chart.h - 1) nb.push(cells[(y + 1) * chart.w + x]);
        if (nb.length && !nb.includes(c)) {
          const tally = {};
          for (const n of nb) tally[n] = (tally[n] || 0) + 1;
          const best = Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]);
          next[y * chart.w + x] = best;
          changed++;
        }
      }
    }
    cells = next;
  }
  return { chart: { ...chart, cells }, changed };
}

export function countConfetti(chart) {
  return cleanConfetti(chart).changed;
}

/**
 * Turn sampled image pixels ([r,g,b] per cell, row-major) into a chart.
 * Picks `colors` colors by k-means unless a palette is supplied.
 */
export function imageToChart(pixels, w, h, { colors = 5, palette = null, dither = false } = {}) {
  const pal = palette && palette.length ? palette : kmeans(pixels, colors).map((c) => c.hex);
  const idx = quantise(pixels, w, h, pal, { dither });
  return { w, h, palette: pal, cells: Array.from(idx) };
}

/** Flood fill from (x, y) with color c. */
export function floodFill(chart, x, y, c) {
  const target = at(chart, x, y);
  if (target === c) return chart;
  const cells = chart.cells.slice();
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= chart.w || cy >= chart.h) continue;
    const i = cy * chart.w + cx;
    if (cells[i] !== target) continue;
    cells[i] = c;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return { ...chart, cells };
}

/** Cells on a line (Bresenham), for the line tool. */
export function lineCells(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

/** Compact storage: run-length encode cells as "count:color" pairs. */
export function packCells(cells) {
  return runs(cells).map((r) => (r.n > 1 ? `${r.n}:${r.color}` : `${r.color}`)).join(',');
}

export function unpackCells(str, n) {
  if (Array.isArray(str)) return str.slice(0, n);
  const out = [];
  for (const part of String(str || '').split(',')) {
    if (!part) continue;
    const [a, b] = part.includes(':') ? part.split(':').map(Number) : [1, Number(part)];
    for (let i = 0; i < a && out.length < n; i++) out.push(b);
  }
  while (out.length < n) out.push(0);
  return out;
}

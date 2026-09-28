// Symbol diagrams from written instructions. Each stitch is drawn from where
// it's worked (its base, on the round below) to where its head sits (on this
// round), so increases fan out and decreases lean together, like a printed
// chart. Output is an SVG string (used on screen and in print).

import { SYMBOLS, symbolFor, STITCH_BY_ID, stitchLabel } from './stitches.js';

const ROUNDISH = new Set(['round']);

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Map the 40x40 symbol box (base at (20,35), top at (20,5)) onto a segment.
function place(id, A, B, maxWidth) {
  const vx = B[0] - A[0];
  const vy = B[1] - A[1];
  const L = Math.hypot(vx, vy) || 1;
  const ux = vx / L;
  const uy = vy / L;
  const nx = -uy;
  const ny = ux;
  const s = L / 30;
  const t = Math.min(s, maxWidth / 24);
  const a = t * nx;
  const b = t * ny;
  const c = -s * ux;
  const d = -s * uy;
  const e = A[0] - 20 * t * nx + 35 * s * ux;
  const f = A[1] - 20 * t * ny + 35 * s * uy;
  const m = [a, b, c, d, e, f].map((v) => Number(v.toFixed(3))).join(' ');
  const sym = SYMBOLS[symbolFor(id)] || SYMBOLS.sc;
  let out = '';
  if (sym.d) out += `<path class="sym" d="${sym.d}" transform="matrix(${m})" vector-effect="non-scaling-stroke"${sym.dash ? ' stroke-dasharray="3 4"' : ''}/>`;
  if (sym.fill) out += `<path class="sym-fill" d="${sym.fill}" transform="matrix(${m})"/>`;
  return out;
}

// Short stitches (sc and friends) float as a mark in the middle of the band;
// when several share a base, a thin stem shows where they're worked.
const SHORT = new Set(['sc', 'inc', 'dec', 'invdec', 'esc', 'spike', 'crab', 'waistcoat', 'fsc', 'slst']);

function stem(A, B) {
  const t = 8 / 30;
  const x = A[0] + (B[0] - A[0]) * t;
  const y = A[1] + (B[1] - A[1]) * t;
  return `<path class="sym" d="M${A[0].toFixed(1)} ${A[1].toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}" vector-effect="non-scaling-stroke"/>`;
}

// Which symbol an atom draws per head: an inc is two sc, "3 dc in next" is
// three dc, a (sc, hdc, dc) group is its own stitches.
function headsOf(atom) {
  if (atom.st === 'group') {
    const out = [];
    for (const inner of atom.inner || []) {
      if (inner.st === 'sk') continue;
      const n = inner.multi || (inner.st === 'inc' ? 2 : 1);
      for (let k = 0; k < n; k++) out.push(inner.st === 'inc' ? 'sc' : inner.st);
    }
    return out;
  }
  if (atom.countsAs) return [atom.countsAs];
  if (atom.st === 'inc') return [atom.base || 'sc', atom.base || 'sc'];
  if (atom.multi) return Array(atom.multi).fill(atom.st);
  return [atom.st];
}

function legsOf(atom) {
  // Decreases: the stitches that lean together into one head.
  if (atom.c >= 2 && atom.p === 1 && atom.st !== 'xst') {
    const base = /^(sc|hdc|dc|tr|dtr)\dtog$/.exec(atom.st)?.[1] || atom.base || 'sc';
    return Array(atom.c).fill(base);
  }
  return null;
}

function roundsFrom(lines, maxRows) {
  const rows = [];
  for (const line of lines) {
    if (!['row', 'round', 'chain'].includes(line.kind)) continue;
    const n = line.repeatCount || 1;
    for (let k = 0; k < n && rows.length < maxRows; k++) {
      rows.push({ label: line.num !== null ? line.num + k : rows.length + 1, kind: line.kind, atoms: line.atoms, produces: line.produces || 0, ring: line.ring, mods: line.mods });
    }
  }
  return rows;
}

/**
 * Build a symbol diagram for the lines of one part.
 * Returns { svg, used: [stitch ids], mode } or null if there's nothing to draw.
 */
export function diagram(lines, { mode = 'auto', maxRows = 24, terms = 'US' } = {}) {
  const rows = roundsFrom(lines, maxRows);
  if (!rows.length) return null;
  const isRound = mode === 'round' || (mode === 'auto' && (rows.some((r) => ROUNDISH.has(r.kind)) || rows[0].ring));
  const used = new Set();
  const body = isRound ? radial(rows, used) : flat(rows, used);
  const legend = [...used].filter((id) => id !== 'sk');
  return { svg: body, used: legend, mode: isRound ? 'round' : 'row', rows: rows.length, legend: legend.map((id) => ({ id, label: stitchLabel(id, terms), name: STITCH_BY_ID[id]?.name || stitchLabel(id, terms) })) };
}

function radial(rows, used) {
  const r0 = 14;
  const dr = 24;
  const R = r0 + rows.length * dr + 16;
  const size = R * 2;
  const cx = R;
  const cy = R;
  let out = `<circle class="ring-guide" cx="${cx}" cy="${cy}" r="${r0 - 4}" stroke-dasharray="2 3"/>`;
  used.add('mr');
  const pt = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  rows.forEach((row, i) => {
    const inner = i === 0 ? r0 - 4 : r0 + i * dr - 2;
    const outer = r0 + (i + 1) * dr - 4;
    const heads = Math.max(1, row.produces);
    const slot = (2 * Math.PI) / heads;
    const start = -Math.PI / 2 + slot / 2;
    const arc = outer * slot;
    out += `<circle class="ring-guide" cx="${cx}" cy="${cy}" r="${(outer + 2).toFixed(1)}"/>`;
    let k = 0;
    for (const atom of row.atoms) {
      if (atom.st === 'sk' || atom.move) continue;
      const legs = legsOf(atom);
      if (legs) {
        const top = pt(outer, start + k * slot);
        legs.forEach((leg, j) => {
          const off = (j - (legs.length - 1) / 2) * slot * 0.75;
          const A = pt(inner, start + k * slot + off);
          out += place(leg, A, top, arc);
          if (SHORT.has(leg)) out += stem(A, top);
          used.add(atom.st === 'invdec' ? 'invdec' : legs.length === 2 && leg === 'sc' ? 'dec' : atom.st);
        });
        k += 1;
        continue;
      }
      const hs = headsOf(atom);
      const mid = start + (k + (hs.length - 1) / 2) * slot;
      hs.forEach((id, j) => {
        const a = start + (k + j) * slot;
        // Stitches worked into one place lean in toward it, without all
        // collapsing onto a single point.
        const baseA = atom.place === 'ring' || hs.length === 1 ? a : mid + (a - mid) * 0.35;
        const base = pt(inner, baseA);
        if (id === 'ch') {
          // Chains lie along the round.
          const mr = (inner + outer) / 2;
          out += place('ch', pt(mr - 8, a), pt(mr + 8, a), arc * 1.1);
        } else {
          const top = pt(outer, a);
          out += place(id, base, top, arc);
          if (hs.length > 1 && SHORT.has(id)) out += stem(base, top);
        }
        used.add(id === 'sc' && atom.st === 'inc' ? 'inc' : id);
      });
      k += hs.length;
    }
    // Round number just inside the start of the round.
    const [lx, ly] = pt((inner + outer) / 2, -Math.PI / 2 - Math.min(0.5, slot * 0.6) - 0.05);
    out += `<text class="rlabel" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle">${esc(row.label)}</text>`;
  });
  return `<svg class="diagram" viewBox="0 0 ${size.toFixed(0)} ${size.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stitch diagram">${out}</svg>`;
}

function flat(rows, used) {
  const w = 18;
  const dr = 30;
  const widest = Math.max(...rows.map((r) => Math.max(r.produces, r.atoms.reduce((a, x) => a + (x.c || 0), 0))), 1);
  const W = widest * w + 60;
  const H = rows.length * dr + 30;
  let out = '';
  const x0 = 40;
  rows.forEach((row, i) => {
    const yBase = H - 12 - i * dr;
    const yTop = yBase - dr + 6;
    const heads = Math.max(1, row.produces);
    const off = x0 + ((widest - heads) * w) / 2;
    // Right-handed flat work: odd rows run right to left.
    const rtl = row.kind !== 'chain' && (row.label % 2 === 1);
    const xAt = (k) => (rtl ? off + (heads - 1 - k) * w + w / 2 : off + k * w + w / 2);
    let k = 0;
    if (row.kind === 'chain') {
      for (let c = 0; c < heads; c++) out += place('ch', [xAt(c) - 7, yBase - 8], [xAt(c) + 7, yBase - 8], w * 1.1);
      used.add('ch');
    } else {
      for (const atom of row.atoms) {
        if (atom.st === 'sk' || atom.move) continue;
        const legs = legsOf(atom);
        if (legs) {
          const top = [xAt(k), yTop];
          legs.forEach((leg, j) => {
            const dx = (j - (legs.length - 1) / 2) * w * 0.8 * (rtl ? -1 : 1);
            out += place(leg, [xAt(k) + dx, yBase], top, w);
            if (SHORT.has(leg)) out += stem([xAt(k) + dx, yBase], top);
          });
          used.add(atom.st);
          k += 1;
          continue;
        }
        const hs = headsOf(atom);
        const mid = (xAt(k) + xAt(k + hs.length - 1)) / 2;
        hs.forEach((id, j) => {
          if (id === 'ch') out += place('ch', [xAt(k + j) - 7, yBase - 12], [xAt(k + j) + 7, yBase - 12], w * 1.1);
          else {
            const bx = hs.length > 1 ? mid + (xAt(k + j) - mid) * 0.35 : xAt(k + j);
            out += place(id, [bx, yBase], [xAt(k + j), yTop], w);
            if (hs.length > 1 && SHORT.has(id)) out += stem([bx, yBase], [xAt(k + j), yTop]);
          }
          used.add(id === 'sc' && atom.st === 'inc' ? 'inc' : id);
        });
        k += hs.length;
      }
    }
    out += `<text class="rlabel" x="${rtl ? W - 16 : 16}" y="${yBase - 10}" text-anchor="middle">${esc(row.kind === 'chain' ? 'ch' : row.label)}</text>`;
  });
  return `<svg class="diagram" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stitch diagram">${out}</svg>`;
}

/** A standalone symbol as an SVG string (for legends in print). */
export function symbolSvg(id, size = 28) {
  const sym = SYMBOLS[symbolFor(id)] || SYMBOLS.sc;
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">${sym.d ? `<path class="sym" d="${sym.d}"${sym.dash ? ' stroke-dasharray="3 4"' : ''}/>` : ''}${sym.fill ? `<path class="sym-fill" d="${sym.fill}"/>` : ''}</svg>`;
}

// Colorwork chart designer: paint a grid, import a photo, and get written
// row-by-row (tapestry) or diagonal (C2C) instructions with yarn per color.

import { h, mount, btn, iconBtn, field, input, numberInput, select, pageHead, subnav, modal, confirmDialog, toast, empty, menu, toggle } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { debounce, download, slug, pickFile, loadImage, clamp, copyText } from '../core/util.js';
import {
  MODES, blankChart, resizeChart, tapestryRows, c2cRows, colorStats, yardsPerCell, cleanConfetti, countConfetti, imageToChart, floodFill,
  lineCells, packCells, unpackCells,
} from '../crochet/chart.js';
import { colorLetter } from '../crochet/generators.js';
import { textBitmap } from '../crochet/font.js';
import { inkFor, nearestTo, harmony, colorName } from '../crochet/color.js';
import { YARN_WEIGHTS, yardsPerSc } from '../crochet/calc.js';
import { backLink, yardsText, len, yarnName } from './common.js';
import { printElement } from './print.js';
import { can, saveVerb } from '../core/host.js';
import { CREATE_TABS } from './create.js';

const load = (row) => ({ ...row, cells: unpackCells(row.cells, row.w * row.h) });

export async function render(root, id, route) {
  if (id === 'new') {
    const c = blankChart(30, 30);
    const row = await store.put('charts', { name: 'Untitled chart', w: c.w, h: c.h, palette: c.palette, cells: packCells(c.cells), mode: 'tapestry' });
    go(`/create/charts/${row.id}${route.query.photo ? '?photo=1' : ''}`, { replace: true });
    return null;
  }
  if (id) return editor(root, id, route);
  root.append(pageHead('Create', 'Write patterns that check their own stitch counts. Design charts and shapes.'), subnav(CREATE_TABS, '#/create/charts'));
  return list(root);
}

export function chartImage(chart, px = 6, { grid = false } = {}) {
  const c = document.createElement('canvas');
  c.width = chart.w * px;
  c.height = chart.h * px;
  const ctx = c.getContext('2d');
  for (let y = 0; y < chart.h; y++) {
    for (let x = 0; x < chart.w; x++) {
      ctx.fillStyle = chart.palette[chart.cells[y * chart.w + x]] || '#fff';
      ctx.fillRect(x * px, y * px, px, px);
    }
  }
  if (grid && px >= 6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= chart.w; x++) { ctx.beginPath(); ctx.moveTo(x * px + 0.5, 0); ctx.lineTo(x * px + 0.5, c.height); ctx.stroke(); }
    for (let y = 0; y <= chart.h; y++) { ctx.beginPath(); ctx.moveTo(0, y * px + 0.5); ctx.lineTo(c.width, y * px + 0.5); ctx.stroke(); }
  }
  return c;
}

function list(root) {
  const content = h('div');
  root.append(h('div.row.wrap', { style: { marginBottom: '14px' } },
    btn('From a photo', () => go('/create/charts/new?photo=1'), { ico: 'image' }),
    btn('New chart', () => go('/create/charts/new'), { kind: 'primary', ico: 'plus' })), content);
  function draw() {
    const all = store.all('charts');
    if (!all.length) {
      mount(content, empty('grid', 'No charts yet', 'Paint a design, or turn a photo into a C2C or tapestry graph with a few clicks.', btn('From a photo', () => go('/create/charts/new?photo=1'), { kind: 'primary', ico: 'image' })));
      return;
    }
    mount(content, h('div.grid', all.map((row) => {
      const chart = load(row);
      const img = chartImage(chart, Math.max(2, Math.floor(220 / Math.max(chart.w, chart.h))));
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;image-rendering:pixelated';
      return h('a.card.pattern-card', { href: `#/create/charts/${row.id}` },
        h('div.cover', { style: { background: 'var(--surface-2)', padding: '10px' } }, img),
        h('h3', row.name || 'Untitled chart'),
        h('div.chips', { style: { marginTop: '6px' } }, h('span.chip', `${row.w} × ${row.h}`), h('span.chip', (MODES.find((m) => m[0] === row.mode) || MODES[0])[1]), h('span.chip', `${row.palette.length} colors`)));
    })));
  }
  draw();
  return store.on('charts', draw);
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function editor(root, id, route) {
  const row0 = store.get('charts', id);
  if (!row0) {
    root.append(backLink('#/create/charts', 'Charts'), empty('alert', 'Chart not found', null));
    return null;
  }
  let chart = load(row0);
  let meta = { name: row0.name, mode: row0.mode || 'tapestry', start: row0.start || 'bottom-right', weight: row0.weight ?? 4 };
  let tool = 'pencil';
  let color = Math.min(1, chart.palette.length - 1);
  let mirrorX = false;
  let mirrorY = false;
  let zoom = clamp(Math.floor(640 / Math.max(chart.w, chart.h)), 6, 26);
  let cur = null; // highlighted instruction row
  const undo = [];
  const redo = [];

  const persist = debounce(() => store.put('charts', { ...row0, ...meta, w: chart.w, h: chart.h, palette: chart.palette, cells: packCells(chart.cells) }, { silent: true }), 500);
  const commit = () => { persist(); drawSide(); };
  const snapshot = () => {
    undo.push({ cells: chart.cells.slice(), w: chart.w, h: chart.h, palette: chart.palette.slice() });
    if (undo.length > 60) undo.shift();
    redo.length = 0;
  };
  const restore = (from, to) => {
    const s = from.pop();
    if (!s) return;
    to.push({ cells: chart.cells.slice(), w: chart.w, h: chart.h, palette: chart.palette.slice() });
    chart = { ...chart, ...s };
    color = Math.min(color, chart.palette.length - 1);
    paint();
    drawPalette();
    commit();
  };

  // ---- canvas -------------------------------------------------------------
  const canvas = h('canvas', { 'aria-label': 'Chart grid' });
  const stage = h('div.chart-stage.painting', canvas);
  const M = { left: 30, right: 30, top: 8, bottom: 24 };

  function paint(preview = null) {
    const W = chart.w * zoom;
    const H = chart.h * zoom;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = (W + M.left + M.right) * dpr;
    canvas.height = (H + M.top + M.bottom) * dpr;
    canvas.style.width = `${W + M.left + M.right}px`;
    canvas.style.height = `${H + M.top + M.bottom}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cells = preview || chart.cells;
    for (let y = 0; y < chart.h; y++) {
      for (let x = 0; x < chart.w; x++) {
        ctx.fillStyle = chart.palette[cells[y * chart.w + x]] || '#fff';
        ctx.fillRect(M.left + x * zoom, M.top + y * zoom, zoom, zoom);
      }
    }
    // Highlight the instruction row being followed.
    if (cur !== null) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(M.left, M.top, W, H);
      ctx.restore();
      const cellsOn = highlightCells(cur);
      for (const [x, y] of cellsOn) {
        ctx.fillStyle = chart.palette[cells[y * chart.w + x]];
        ctx.fillRect(M.left + x * zoom, M.top + y * zoom, zoom, zoom);
      }
    }
    if (zoom >= 5) {
      ctx.lineWidth = 1;
      for (let x = 0; x <= chart.w; x++) {
        ctx.strokeStyle = (chart.w - x) % 10 === 0 ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.moveTo(M.left + x * zoom + 0.5, M.top);
        ctx.lineTo(M.left + x * zoom + 0.5, M.top + H);
        ctx.stroke();
      }
      for (let y = 0; y <= chart.h; y++) {
        ctx.strokeStyle = (chart.h - y) % 10 === 0 ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.moveTo(M.left, M.top + y * zoom + 0.5);
        ctx.lineTo(M.left + W, M.top + y * zoom + 0.5);
        ctx.stroke();
      }
    }
    // Row numbers from the bottom; column numbers along the bottom.
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink-3') || '#888';
    ctx.fillStyle = ink;
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const every = zoom >= 12 ? 1 : zoom >= 7 ? 5 : 10;
    for (let r = 1; r <= chart.h; r++) {
      if (r % every && r !== 1) continue;
      const y = M.top + (chart.h - r) * zoom + zoom / 2;
      const flat = meta.mode === 'tapestry';
      const rightSide = !flat || r % 2 === 1;
      ctx.textAlign = 'right';
      if (!flat || rightSide) {
        ctx.textAlign = 'left';
        ctx.fillText(String(r), M.left + W + 5, y);
      }
      if (flat && !rightSide) {
        ctx.textAlign = 'right';
        ctx.fillText(String(r), M.left - 5, y);
      }
    }
    ctx.textAlign = 'center';
    for (let c = 1; c <= chart.w; c++) {
      if (c % every && c !== 1) continue;
      ctx.fillText(String(c), M.left + (chart.w - c) * zoom + zoom / 2, M.top + H + 12);
    }
  }

  function highlightCells(r) {
    const out = [];
    if (meta.mode === 'c2c') {
      const d = r - 1;
      const fromRight = meta.start.endsWith('right');
      for (let v = Math.max(0, d - (chart.w - 1)); v <= Math.min(d, chart.h - 1); v++) {
        const u = d - v;
        out.push([fromRight ? chart.w - 1 - u : u, chart.h - 1 - v]);
      }
    } else {
      for (let x = 0; x < chart.w; x++) out.push([x, chart.h - r]);
    }
    return out;
  }

  const cellAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - M.left) / zoom);
    const y = Math.floor((e.clientY - rect.top - M.top) / zoom);
    return x >= 0 && y >= 0 && x < chart.w && y < chart.h ? [x, y] : null;
  };
  const setCell = (cells, x, y, c) => {
    const pts = [[x, y]];
    if (mirrorX) pts.push([chart.w - 1 - x, y]);
    if (mirrorY) pts.push([x, chart.h - 1 - y]);
    if (mirrorX && mirrorY) pts.push([chart.w - 1 - x, chart.h - 1 - y]);
    for (const [px, py] of pts) cells[py * chart.w + px] = c;
  };

  let drag = null;
  // Text waiting to be stamped: { cells, w, h, color }.
  let stamp = null;
  const stampCells = (at) => {
    const cells = chart.cells.slice();
    for (const [dx, dy] of stamp.cells) {
      const x = at[0] + dx;
      const y = at[1] + dy;
      if (x >= 0 && y >= 0 && x < chart.w && y < chart.h) cells[y * chart.w + x] = stamp.color;
    }
    return cells;
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (tool === 'hand') return;
    const at = cellAt(e);
    if (!at) return;
    e.preventDefault();
    if (tool === 'stamp' && stamp) {
      snapshot();
      chart = { ...chart, cells: stampCells(at) };
      stamp = null;
      tool = 'pencil';
      drawTools();
      paint();
      commit();
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    const c = tool === 'eraser' ? 0 : color;
    if (tool === 'pipette') {
      color = chart.cells[at[1] * chart.w + at[0]];
      tool = 'pencil';
      drawTools();
      drawPalette();
      return;
    }
    snapshot();
    if (tool === 'fill') {
      chart = floodFill(chart, at[0], at[1], c);
      paint();
      commit();
      return;
    }
    drag = { start: at, last: at, c };
    if (tool === 'pencil' || tool === 'eraser') {
      setCell(chart.cells, at[0], at[1], c);
      paint();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (tool === 'stamp' && stamp) {
      const at = cellAt(e);
      if (at) paint(stampCells(at));
      return;
    }
    if (!drag) return;
    const at = cellAt(e);
    if (!at) return;
    if (tool === 'pencil' || tool === 'eraser') {
      for (const [x, y] of lineCells(drag.last[0], drag.last[1], at[0], at[1])) setCell(chart.cells, x, y, drag.c);
      drag.last = at;
      paint();
    } else if (tool === 'line' || tool === 'rect') {
      drag.last = at;
      paint(shapeCells(drag.start, at, drag.c));
    }
  });
  const end = () => {
    if (!drag) return;
    if (tool === 'line' || tool === 'rect') chart = { ...chart, cells: shapeCells(drag.start, drag.last, drag.c) };
    drag = null;
    paint();
    commit();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function shapeCells(a, b, c) {
    const cells = chart.cells.slice();
    if (tool === 'line') {
      for (const [x, y] of lineCells(a[0], a[1], b[0], b[1])) setCell(cells, x, y, c);
    } else {
      const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
      const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setCell(cells, x, y, c);
    }
    return cells;
  }

  // ---- toolbar and palette --------------------------------------------------
  const toolbar = h('div.toolbar');
  const TOOLS = [['pencil', 'create', 'Pencil (B)'], ['fill', 'fill', 'Fill (G)'], ['line', 'line', 'Line (L)'], ['rect', 'rect', 'Rectangle (R)'], ['eraser', 'eraser', 'Eraser (E)'], ['pipette', 'pipette', 'Pick color (I)'], ['hand', 'hand', 'Scroll (H)']];
  function drawTools() {
    stage.classList.toggle('painting', tool !== 'hand');
    mount(toolbar, 
      ...TOOLS.map(([t, ico, title]) => btn(null, () => { tool = t; drawTools(); }, { ico, title, kind: tool === t ? 'on' : 'ghost', small: true })),
      h('span.sep'),
      btn(null, () => { mirrorX = !mirrorX; drawTools(); }, { ico: 'mirror', title: 'Mirror left–right', kind: mirrorX ? 'on' : 'ghost', small: true }),
      btn(null, () => { mirrorY = !mirrorY; drawTools(); }, { ico: 'mirror', title: 'Mirror top–bottom', kind: mirrorY ? 'on' : 'ghost', small: true, attrs: { style: 'transform:rotate(90deg)' } }),
      h('span.sep'),
      iconBtn('undo', 'Undo (Ctrl+Z)', () => restore(undo, redo)),
      iconBtn('redo', 'Redo (Ctrl+Y)', () => restore(redo, undo)),
      h('span.sep'),
      iconBtn('zoom-out', 'Zoom out (−)', () => { zoom = Math.max(3, zoom - 2); paint(); }),
      iconBtn('zoom-in', 'Zoom in (+)', () => { zoom = Math.min(40, zoom + 2); paint(); }),
      h('span.sep'),
      btn(`${chart.w} × ${chart.h}`, resize, { small: true, kind: 'ghost', ico: 'maximize', title: 'Grid size' }),
      btn('Photo', () => importPhoto(), { small: true, kind: 'ghost', ico: 'image', title: 'Import a photo' }),
      btn('Text', addText, { small: true, kind: tool === 'stamp' ? 'on' : 'ghost', ico: 'text', title: 'Letters and numbers' }));
  }

  const palEl = h('div.pal');
  function drawPalette() {
    mount(palEl, 
      ...chart.palette.map((hex, i) => h('button.pal-swatch', {
        type: 'button', class: i === color ? 'on' : '', style: { '--c': hex, color: inkFor(hex) }, title: `${colorLetter(i)} · ${colorName(hex)}. Double-click to edit.`,
        onClick: () => { color = i; if (tool === 'eraser' || tool === 'pipette') tool = 'pencil'; drawPalette(); drawTools(); },
        onDblclick: () => editColor(i),
      }, colorLetter(i))),
      iconBtn('plus', 'Add a color', () => {
        snapshot();
        const next = harmony(chart.palette[chart.palette.length - 1] || '#b4481f', 'analogous', 2)[1];
        chart = { ...chart, palette: [...chart.palette, next] };
        color = chart.palette.length - 1;
        drawPalette();
        commit();
      }),
      iconBtn('palette', 'Edit selected color', () => editColor(color)));
  }

  async function editColor(i) {
    let hex = chart.palette[i];
    const yarns = store.all('yarns').filter((y) => y.hex);
    const res = await modal({
      title: `Color ${colorLetter(i)}`,
      body: (close) => h('div.stack',
        h('div.row', h('input', { type: 'color', value: hex, onInput: (e) => { hex = e.target.value; } }), h('span.soft', 'Pick any color, or use a yarn from your stash:')),
        yarns.length ? h('div.list', { style: { maxHeight: '260px', overflow: 'auto' } }, yarns.map((y) => h('button.list-row.link', {
          type: 'button', style: { border: 0, background: 'none', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' },
          onClick: () => close({ hex: y.hex }),
        }, h('span.swatch', { style: { '--c': y.hex, width: '24px', height: '24px' } }), h('div.grow', yarnName(y))))) : null),
      actions: [
        chart.palette.length > 2 && i > 0 ? { label: 'Remove color', kind: 'danger', value: 'remove' } : null,
        { label: 'Cancel', kind: 'ghost', value: null },
        { label: 'Use color', kind: 'primary', run: () => ({ hex }) },
      ].filter(Boolean),
    });
    if (!res) return;
    snapshot();
    if (res === 'remove') {
      // Cells in the removed color become the background.
      const cells = chart.cells.map((c) => (c === i ? 0 : c > i ? c - 1 : c));
      chart = { ...chart, cells, palette: chart.palette.filter((_, k) => k !== i) };
      color = Math.min(color, chart.palette.length - 1);
    } else {
      const palette = chart.palette.slice();
      palette[i] = res.hex;
      chart = { ...chart, palette };
    }
    paint();
    drawPalette();
    commit();
  }

  // Names and dates for C2C blankets: type, then tap where it goes.
  async function addText() {
    let text = '';
    let scale = 1;
    const info = h('div.muted', { style: { fontSize: '13px' } }, 'Type something to see its size.');
    const upd = () => {
      const b = textBitmap(text, scale);
      info.textContent = text.trim() ? `${b.w} × ${b.h} ${meta.mode === 'c2c' ? 'tiles' : 'stitches'} in color ${colorLetter(color)}${b.w > chart.w ? ` — wider than the chart (${chart.w})` : ''}` : 'Type something to see its size.';
    };
    const res = await modal({
      title: 'Add text',
      body: h('div.stack',
        field('Text', input({ maxlength: 40, placeholder: 'e.g. MIRA 2026', onInput: (e) => { text = e.target.value; upd(); } }), 'Capital letters, numbers, ! ? . - & and <3 for a heart'),
        field('Size', select([[1, 'Small (7 rows tall)'], [2, 'Large (14 rows tall)']], scale, (v) => { scale = Number(v); upd(); })),
        info),
      actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Place it', kind: 'primary', value: 'ok' }],
    });
    if (res !== 'ok' || !text.trim()) return;
    stamp = { ...textBitmap(text, scale), color: tool === 'eraser' ? 0 : color };
    tool = 'stamp';
    drawTools();
    toast('Tap the chart where the top-left corner of the text should go.');
  }

  async function resize() {
    let w = chart.w;
    let hh = chart.h;
    const res = await modal({
      title: 'Grid size',
      body: h('div.stack', h('div.fields', field('Width (stitches)', numberInput(w, (v) => { w = v; }, { min: 2, max: 300, step: 1 })), field('Height (rows)', numberInput(hh, (v) => { hh = v; }, { min: 2, max: 300, step: 1 }))),
        h('p.muted', { style: { fontSize: '13px' } }, 'The design stays anchored to the bottom-left corner, where Row 1 starts.')),
      actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Resize', kind: 'primary', value: 'ok' }],
    });
    if (res !== 'ok') return;
    snapshot();
    chart = resizeChart(chart, clamp(Math.round(w || 2), 2, 300), clamp(Math.round(hh || 2), 2, 300));
    zoom = clamp(Math.floor(640 / Math.max(chart.w, chart.h)), 4, 26);
    paint();
    drawTools();
    commit();
  }

  async function importPhoto() {
    const file = await pickFile('image/*');
    if (!file) return;
    const url = URL.createObjectURL(file);
    let img;
    try {
      img = await loadImage(url);
    } catch (err) {
      toast(err.message, { kind: 'err' });
      return;
    }
    const aspect = img.naturalHeight / img.naturalWidth;
    const opts = { w: 50, colors: 6, dither: false, stash: false, clean: true };
    const preview = h('canvas', { style: { width: '100%', imageRendering: 'pixelated', borderRadius: '10px', background: 'var(--surface-2)' } });
    const info = h('div.muted', { style: { fontSize: '13px' } });
    let result = null;
    const compute = debounce(() => {
      const w = clamp(Math.round(opts.w || 10), 5, 200);
      const hh = clamp(Math.round(w * aspect), 5, 300);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = hh;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, hh);
      const data = ctx.getImageData(0, 0, w, hh).data;
      const px = [];
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3] / 255;
        px.push([data[i] * a + 255 * (1 - a), data[i + 1] * a + 255 * (1 - a), data[i + 2] * a + 255 * (1 - a)]);
      }
      let palette = null;
      if (opts.stash) {
        // Pick colors, then snap each to the nearest yarn you own.
        const picked = imageToChart(px, w, hh, { colors: opts.colors }).palette;
        const yarns = store.all('yarns').filter((y) => y.hex);
        palette = [...new Set(picked.map((hex) => nearestTo(hex, yarns)?.item.hex || hex))];
      }
      let ch = imageToChart(px, w, hh, { colors: opts.colors, palette, dither: opts.dither });
      let removed = 0;
      if (opts.clean) {
        const r = cleanConfetti(ch, 2);
        ch = r.chart;
        removed = r.changed;
      }
      result = ch;
      const src = chartImage(ch, 4);
      preview.width = src.width;
      preview.height = src.height;
      preview.getContext('2d').drawImage(src, 0, 0);
      info.textContent = `${w} × ${hh} stitches · ${ch.palette.length} colors${opts.clean ? ` · ${removed} single-stitch color changes cleaned up` : ` · ${countConfetti(ch)} single-stitch color changes`}`;
    }, 120);
    const res = await modal({
      title: 'Chart from a photo',
      wide: true,
      body: () => {
        compute();
        return h('div.cols',
          h('div.stack.tight', preview, info),
          h('div.stack',
            field('Width in stitches', numberInput(opts.w, (v) => { opts.w = v; compute(); }, { min: 5, max: 200, step: 1 }), 'C2C: each tile is a stitch'),
            field(`Colors: ${opts.colors}`, h('input', { type: 'range', min: 2, max: 12, value: opts.colors, onInput: (e) => { opts.colors = Number(e.target.value); e.target.closest('label').querySelector('.field-label').textContent = `Colors: ${opts.colors}`; compute(); } })),
            toggle('Clean up confetti', opts.clean, (v) => { opts.clean = v; compute(); }, 'Remove lone stitches of a color'),
            toggle('Dither', opts.dither, (v) => { opts.dither = v; compute(); }, 'Smoother shading, more color changes'),
            store.all('yarns').some((y) => y.hex) ? toggle('Use my stash colors', opts.stash, (v) => { opts.stash = v; compute(); }, 'Snap to yarn you own') : null));
      },
      actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Use this chart', kind: 'primary', value: 'ok' }],
    });
    URL.revokeObjectURL(url);
    if (res !== 'ok' || !result) return;
    snapshot();
    chart = { ...chart, ...result };
    color = Math.min(1, chart.palette.length - 1);
    zoom = clamp(Math.floor(640 / Math.max(chart.w, chart.h)), 4, 26);
    if (meta.name === 'Untitled chart') meta.name = file.name.replace(/\.[a-z]+$/i, '').slice(0, 60) || 'Photo chart';
    nameInput.value = meta.name;
    paint();
    drawPalette();
    drawTools();
    commit();
  }

  // ---- side panel ---------------------------------------------------------
  const side = h('div.stack');
  function drawSide() {
    const rows = meta.mode === 'c2c' ? c2cRows(chart, { start: meta.start }) : tapestryRows(chart, { mode: meta.mode, handed: store.settings().handed });
    const perSc = yardsPerSc({ weightId: meta.weight });
    const stats = colorStats(chart, { mode: meta.mode, yardsPerCell: yardsPerCell(meta.mode, perSc) });
    const w = YARN_WEIGHTS[meta.weight];
    const scPerIn = ((w.sc[0] + w.sc[1]) / 2) / 4;
    // A C2C tile is about 3 dc wide and 3 dc tall.
    const cellIn = meta.mode === 'c2c' ? 3 / (scPerIn / 1.05) : 1 / scPerIn;
    const rowIn = meta.mode === 'c2c' ? cellIn : cellIn * 0.9;
    const bobbins = Math.max(...rows.map((r) => r.runs.length));
    const changes = rows.reduce((a, r) => a + r.changes, 0);
    mount(side, 
      h('div.card',
        h('div.fields',
          field('Worked as', select(MODES, meta.mode, (v) => { meta.mode = v; cur = null; paint(); commit(); })),
          field('Yarn weight', select(YARN_WEIGHTS.map((x) => [x.id, x.name]), meta.weight, (v) => { meta.weight = Number(v); commit(); }))),
        meta.mode === 'c2c' ? h('div', { style: { marginTop: '10px' } }, field('First tile', select([['bottom-right', 'Bottom right corner'], ['bottom-left', 'Bottom left corner']], meta.start, (v) => { meta.start = v; commit(); paint(); }))) : null,
        h('dl.kv', { style: { marginTop: '12px' } },
          h('dt', 'Size'), h('dd', `${chart.w} × ${chart.h} ${meta.mode === 'c2c' ? 'tiles' : 'stitches'}`),
          h('dt', 'Finished'), h('dd', `≈ ${len(chart.w * cellIn, 0)} × ${len(chart.h * rowIn, 0)}`),
          h('dt', meta.mode === 'c2c' ? 'Rows' : 'Rows'), h('dd', String(rows.length)),
          h('dt', 'Color changes'), h('dd', changes.toLocaleString()),
          h('dt', 'Most colors in a row'), h('dd', `${bobbins} ${meta.mode === 'c2c' ? 'bobbins' : 'runs'}`))),
      h('div.card',
        h('h3', 'Yarn per color'),
        h('div.list', stats.map((s) => h('div.list-row',
          h('span.pal-swatch', { style: { '--c': s.hex, color: inkFor(s.hex), width: '28px', height: '28px', borderRadius: '8px' } }, s.letter),
          h('div.grow', h('div.title', colorName(s.hex)), h('div.meta', `${s.cells.toLocaleString()} ${meta.mode === 'c2c' ? 'tiles' : 'sts'} · ${Math.round(s.share * 100)}%`)),
          h('b.num', yardsText(s.yards))))),
        h('p.muted', { style: { fontSize: '12px', marginTop: '8px' } }, 'Estimate for the chosen weight, including carried strands for tapestry.')),
      h('div.card',
        h('div.card-head', h('h3', 'Instructions'), btn('Copy', () => copyInstructions(rows), { small: true, kind: 'ghost', ico: 'copy' })),
        h('div.instructions', rows.map((r) => h('div.instr-row', {
          class: cur === r.row ? 'cur' : '', style: { cursor: 'pointer' },
          onClick: () => { cur = cur === r.row ? null : r.row; paint(); drawSide(); },
        },
        h('b', `Row ${r.row}`),
        h('span', { title: meta.mode === 'c2c' ? `${r.bottom} / ${r.side}` : r.side || '' }, r.dir),
        h('span', r.runs.map((run) => h('span.run', h('span.swatch', { style: { '--c': chart.palette[run.color] } }), `${run.n} ${colorLetter(run.color)}`)),
          meta.mode === 'c2c' ? h('span.muted', { style: { fontSize: '11.5px' } }, ` ${r.tiles} tiles · ${r.bottom === r.side ? r.bottom : `${r.bottom}/${r.side}`}`) : null))))));
  }

  async function copyInstructions(rows) {
    const letters = chart.palette.map((hex, i) => `${colorLetter(i)} = ${colorName(hex)} (${hex})`).join('\n');
    const text = `${meta.name}\n${MODES.find((m) => m[0] === meta.mode)[1]}, ${chart.w} × ${chart.h}\n${letters}\n\n${rows.map((r) => `Row ${r.row} ${r.dir}${r.side && meta.mode !== 'c2c' ? ` (${r.side})` : ''}${meta.mode === 'c2c' ? ` [${r.tiles} tiles, ${r.bottom}/${r.side}]` : ''}: ${r.runs.map((x) => `${x.n} ${colorLetter(x.color)}`).join(', ')}`).join('\n')}`;
    await copyText(text);
    toast('Instructions copied.');
  }

  // ---- keyboard -----------------------------------------------------------
  const onKey = (e) => {
    if (e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) restore(redo, undo); else restore(undo, redo); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); restore(redo, undo); return; }
    const map = { b: 'pencil', g: 'fill', l: 'line', r: 'rect', e: 'eraser', i: 'pipette', h: 'hand' };
    if (map[k] && !e.ctrlKey && !e.metaKey) { tool = map[k]; drawTools(); return; }
    if (/^[1-9]$/.test(k) && Number(k) <= chart.palette.length) { color = Number(k) - 1; drawPalette(); return; }
    if (k === '+' || k === '=') { zoom = Math.min(40, zoom + 2); paint(); }
    if (k === '-') { zoom = Math.max(3, zoom - 2); paint(); }
    if (cur !== null && (k === 'arrowup' || k === 'arrowdown')) {
      e.preventDefault();
      const max = meta.mode === 'c2c' ? chart.w + chart.h - 1 : chart.h;
      cur = clamp(cur + (k === 'arrowup' ? 1 : -1), 1, max);
      paint();
      drawSide();
    }
  };
  document.addEventListener('keydown', onKey);

  // ---- layout -------------------------------------------------------------
  const nameInput = h('input', { value: meta.name, 'aria-label': 'Chart name', style: { font: '600 28px/1.2 var(--serif)', border: '0', background: 'transparent', padding: '0', minHeight: '0' }, onInput: (e) => { meta.name = e.target.value; persist(); } });
  root.append(
    backLink('#/create/charts', 'Charts'),
    h('header.page-head', h('div.grow', nameInput),
      h('div.page-actions',
        btn('Work on it', async () => {
          persist.flush();
          const p = await store.put('projects', { name: meta.name, status: 'active', chartId: row0.id, startedAt: Date.now(), counters: [], photoIds: [], yarns: [], pos: { step: 0, atom: 0 } });
          go(`/build/${p.id}`);
        }, { kind: 'primary', ico: 'play' }),
        btn('Share', () => { persist.flush(); go(`/share?kind=chart&id=${row0.id}`); }, { ico: 'share' }),
        iconBtn('more', 'More', (e) => menu(e.currentTarget, [
          { label: `${saveVerb} chart image`, ico: 'download', run: () => exportChart(chart, meta).toBlob((b) => download(`${slug(meta.name)}.png`, b)) },
          can.print ? { label: 'Print chart and instructions', ico: 'print', run: () => printChart(chart, meta) } : null,
          { label: 'Clean up confetti', ico: 'sparkle', run: () => { snapshot(); const r = cleanConfetti(chart, 2); chart = r.chart; paint(); commit(); toast(`${r.changed} lone stitches merged into their neighbours.`); } },
          { label: 'Flip left–right', ico: 'mirror', run: () => { snapshot(); const cells = []; for (let y = 0; y < chart.h; y++) for (let x = 0; x < chart.w; x++) cells.push(chart.cells[y * chart.w + (chart.w - 1 - x)]); chart = { ...chart, cells }; paint(); commit(); } },
          { label: 'Clear', ico: 'eraser', run: () => { snapshot(); chart = { ...chart, cells: chart.cells.map(() => 0) }; paint(); commit(); } },
          '-',
          { label: 'Delete chart', ico: 'trash', danger: true, run: async () => {
            if (!(await confirmDialog('Delete this chart?', `“${meta.name}” will be removed.`, { ok: 'Delete', danger: true }))) return;
            persist.flush();
            await store.remove('charts', row0.id);
            go('/create/charts');
          } },
        ])))),
    h('div.chart-layout',
      h('div', toolbar, h('div.card.tight', { style: { marginBottom: '10px' } }, palEl), stage,
        h('p.muted', { style: { fontSize: '12.5px', marginTop: '8px' } }, 'Keys: B pencil · G fill · L line · R rectangle · E eraser · I pick · 1–9 colors · Ctrl+Z undo · click an instruction row to follow it, then ↑ ↓.')),
      side));

  drawTools();
  drawPalette();
  paint();
  drawSide();
  if (route.query.photo) {
    // File pickers need a fresh tap, so offer the button rather than opening it.
    const banner = h('div.note', { style: { marginBottom: '12px' } }, icon('image'),
      h('div.grow', h('b', 'Turn a photo into a chart. '), 'Pick a picture; you choose the width in stitches and how many colors.'),
      btn('Choose a photo', () => { banner.remove(); importPhoto(); }, { kind: 'primary', small: true }));
    root.querySelector('.chart-layout').before(banner);
  }
  return () => {
    persist.flush();
    document.removeEventListener('keydown', onKey);
  };
}

/**
 * A printable chart: row numbers on the working side of every row, column
 * numbers, bold lines every 10, and a color key with yardage.
 */
export function exportChart(chart, meta) {
  const cell = Math.max(10, Math.min(28, Math.floor(2200 / Math.max(chart.w, chart.h))));
  const m = { left: 44, right: 44, top: 70, bottom: 40 };
  const keyRows = Math.ceil(chart.palette.length / 4);
  const W = chart.w * cell + m.left + m.right;
  const H = chart.h * cell + m.top + m.bottom + keyRows * 34 + 20;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#241c17';
  ctx.font = "600 26px ui-serif, Georgia, serif";
  ctx.fillText(meta.name || 'Chart', m.left, 38);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#5a4d44';
  ctx.fillText(`${(MODES.find((x) => x[0] === meta.mode) || MODES[0])[1]} · ${chart.w} × ${chart.h}${meta.mode === 'c2c' ? ` · first tile ${meta.start.replace('-', ' ')}` : ''}`, m.left, 58);
  ctx.drawImage(chartImage(chart, cell), m.left, m.top);
  for (let x = 0; x <= chart.w; x++) {
    ctx.strokeStyle = (chart.w - x) % 10 === 0 ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = (chart.w - x) % 10 === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(m.left + x * cell + 0.5, m.top);
    ctx.lineTo(m.left + x * cell + 0.5, m.top + chart.h * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= chart.h; y++) {
    ctx.strokeStyle = (chart.h - y) % 10 === 0 ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = (chart.h - y) % 10 === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(m.left, m.top + y * cell + 0.5);
    ctx.lineTo(m.left + chart.w * cell, m.top + y * cell + 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = '#5a4d44';
  ctx.font = `600 ${Math.min(12, cell - 2)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  for (let r = 1; r <= chart.h; r++) {
    const y = m.top + (chart.h - r) * cell + cell / 2;
    const rightSide = meta.mode !== 'tapestry' || r % 2 === 1;
    ctx.textAlign = rightSide ? 'left' : 'right';
    ctx.fillText(String(r), rightSide ? m.left + chart.w * cell + 6 : m.left - 6, y);
  }
  ctx.textAlign = 'center';
  for (let col = 1; col <= chart.w; col++) {
    if (cell < 14 && col % 5 && col !== 1) continue;
    ctx.fillText(String(col), m.left + (chart.w - col) * cell + cell / 2, m.top + chart.h * cell + 14);
  }
  // Color key.
  const perSc = yardsPerSc({ weightId: meta.weight });
  const stats = colorStats(chart, { mode: meta.mode, yardsPerCell: yardsPerCell(meta.mode, perSc) });
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  stats.forEach((s, i) => {
    const kx = m.left + (i % 4) * 230;
    const ky = m.top + chart.h * cell + 40 + Math.floor(i / 4) * 34;
    ctx.fillStyle = s.hex;
    ctx.fillRect(kx, ky, 22, 22);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(kx + 0.5, ky + 0.5, 21, 21);
    ctx.fillStyle = '#241c17';
    ctx.fillText(`${s.letter} · ${colorName(s.hex)} · ${s.cells} · ≈${Math.ceil(s.yards)} yd`, kx + 30, ky + 11);
  });
  return c;
}

function printChart(chart, meta) {
  const rows = meta.mode === 'c2c' ? c2cRows(chart, { start: meta.start }) : tapestryRows(chart, { mode: meta.mode, handed: store.settings().handed });
  const img = h('img.print-chart', { src: exportChart(chart, meta).toDataURL('image/png'), alt: meta.name });
  const doc = h('article.doc',
    img,
    h('h2', 'Row by row'),
    h('div', rows.map((r) => h('div.doc-row', h('span.doc-box'), h('span.doc-text-line', `Row ${r.row} ${r.dir}${r.side && meta.mode !== 'c2c' ? ` (${r.side})` : ''}: `, r.runs.map((x) => `${x.n} ${colorLetter(x.color)}`).join(', ')), h('span.doc-count', meta.mode === 'c2c' ? `${r.tiles} tiles` : '')))));
  printElement(doc, meta.name);
}

export { load as loadChart };

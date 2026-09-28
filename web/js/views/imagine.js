// Imagine: palettes, generators and ideas. Everything here can be saved
// straight into a pattern, chart or project.

import { h, mount, btn, iconBtn, field, numberInput, select, pageHead, subnav, toast, toggle, menu } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { debounce, copyText, pickFile, loadImage, uid } from '../core/util.js';
import { harmony, HARMONIES, hexToHsl, hslToHex, inkFor, colorName, valueGrey, kmeans, nearestTo, hexDelta, hexToLab } from '../crochet/color.js';
import { granny, grannySide, blanketLayout, stripes, stripesPattern, STRIPE_STYLES, hat, idea, rng, colorLetter } from '../crochet/generators.js';
import { YARN_WEIGHTS, HEADS, yardsPerSc, skeinsNeeded } from '../crochet/calc.js';
import { parseSection } from '../crochet/parser.js';
import { packCells } from '../crochet/chart.js';
import { yarnName, yardsText, len, unitLabel } from './common.js';
import { blankPattern } from './create.js';

const TABS = [
  ['#/imagine/palettes', 'Palettes', 'palette'],
  ['#/imagine/granny', 'Granny squares', 'grid'],
  ['#/imagine/stripes', 'Stripes', 'layers'],
  ['#/imagine/hats', 'Hats', 'sparkle'],
  ['#/imagine/ideas', 'Ideas', 'dice'],
];

// The working palette is shared by every generator on this page.
export function currentPalette() {
  return store.metaGet('imaginePalette', null) || { colors: ['#2f6690', '#efe3cc', '#b7410e', '#9caf88', '#e1ad01'], locked: [] };
}
const setCurrentPalette = (pal) => store.metaSet('imaginePalette', pal);

export function render(root, route) {
  const [tab = 'palettes'] = route.parts;
  root.append(pageHead('Imagine', 'Play with color, generate patterns, and find the next thing to make.'), subnav(TABS, `#/imagine/${tab}`));
  const body = h('div');
  root.append(body);
  switch (tab) {
    case 'granny': return grannyTab(body);
    case 'stripes': return stripesTab(body);
    case 'hats': return hatsTab(body);
    case 'ideas': return ideasTab(body);
    default: return palettesTab(body);
  }
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

function palettesTab(root) {
  let pal = currentPalette();
  let rule = store.metaGet('imagineRule', 'analogous');
  let count = pal.colors.length;
  let values = false;
  let seed = Date.now() % 100000;
  const strip = h('div.palette-strip');
  const previews = h('div.grid', { style: { '--grid-min': '220px', marginTop: '14px' } });
  const warnings = h('div');
  const saved = h('div');
  const stashBox = h('div');

  const commit = () => {
    setCurrentPalette(pal);
    drawStrip();
    drawPreviews();
    drawStash();
  };

  function generate() {
    const base = pal.colors.find((_, i) => pal.locked.includes(i)) || pal.colors[0];
    const r = rng(++seed);
    const [hh, s, l] = hexToHsl(base);
    // Nudge the base a little each shuffle unless it's locked.
    const b = pal.locked.length ? base : hslToHex([hh + (r() - 0.5) * 80, Math.min(0.85, Math.max(0.25, s + (r() - 0.5) * 0.3)), Math.min(0.75, Math.max(0.28, l + (r() - 0.5) * 0.3))]);
    const fresh = harmony(b, rule, count, r);
    pal = { ...pal, colors: Array.from({ length: count }, (_, i) => (pal.locked.includes(i) && pal.colors[i] ? pal.colors[i] : fresh[i])) };
    commit();
  }

  function drawStrip() {
    mount(strip, pal.colors.map((hex, i) => {
      const locked = pal.locked.includes(i);
      const picker = h('input', { type: 'color', value: hex, style: { position: 'absolute', opacity: 0, inset: 0, width: '100%', height: '100%', cursor: 'pointer' }, 'aria-label': `Change color ${i + 1}`, onInput: (e) => { pal.colors[i] = e.target.value; commit(); } });
      const shown = values ? valueGrey(hex) : hex;
      return h('div', { style: { '--c': shown, '--ink-on': inkFor(shown) } },
        picker,
        h('div.tools', { style: { zIndex: 1 } },
          h('button', { type: 'button', title: locked ? 'Unlock' : 'Lock this color', 'aria-pressed': locked ? 'true' : 'false', onClick: () => { pal.locked = locked ? pal.locked.filter((x) => x !== i) : [...pal.locked, i]; commit(); } }, icon(locked ? 'lock' : 'unlock')),
          h('button', { type: 'button', title: 'Copy hex', onClick: async () => { await copyText(hex); toast(`Copied ${hex}`); } }, icon('copy'))),
        h('div.hex', { style: { position: 'relative', pointerEvents: 'none' } }, hex),
        h('div.nm', { style: { position: 'relative', pointerEvents: 'none' } }, colorName(hex)));
    }));
    // Contrast warnings: colors too close to tell apart in yarn.
    const close = [];
    for (let a = 0; a < pal.colors.length; a++) {
      for (let b = a + 1; b < pal.colors.length; b++) {
        if (hexDelta(pal.colors[a], pal.colors[b]) < 9) close.push(`${colorName(pal.colors[a])} and ${colorName(pal.colors[b])}`);
      }
    }
    const Ls = pal.colors.map((c) => hexToLab(c)[0]).sort((x, y) => x - y);
    const spread = Ls[Ls.length - 1] - Ls[0];
    mount(warnings,
      close.length ? h('div.note.warn', { style: { marginTop: '10px' } }, icon('alert'), h('span', `${close.join('; ')} will be hard to tell apart once stitched.`)) : null,
      spread < 25 ? h('div.note', { style: { marginTop: '10px' } }, icon('eye'), h('span', 'Low value contrast: in colorwork the design may disappear. Switch on the value check to see it in grey.')) : null);
  }

  function drawPreviews() {
    const g = h('canvas.preview', { width: 300, height: 300 });
    drawGranny(g.getContext('2d'), 0, 0, 300, Math.min(pal.colors.length, 6), pal.colors.map((c) => (values ? valueGrey(c) : c)), cssVar('--surface'));
    const st = h('canvas.preview', { width: 300, height: 300 });
    drawStripes(st.getContext('2d'), 300, 300, stripes({ rows: 30, colors: pal.colors.length, style: 'fibonacci' }), pal.colors.map((c) => (values ? valueGrey(c) : c)));
    const cc = h('canvas.preview', { width: 300, height: 300 });
    drawMotif(cc.getContext('2d'), 300, pal.colors.map((c) => (values ? valueGrey(c) : c)));
    mount(previews,
      h('div.card.tight', g, h('div.muted.center', { style: { fontSize: '12.5px', marginTop: '6px' } }, 'Granny square')),
      h('div.card.tight', st, h('div.muted.center', { style: { fontSize: '12.5px', marginTop: '6px' } }, 'Fibonacci stripes')),
      h('div.card.tight', cc, h('div.muted.center', { style: { fontSize: '12.5px', marginTop: '6px' } }, 'Colorwork motif')));
  }

  function drawStash() {
    const yarns = store.all('yarns').filter((y) => y.hex);
    if (!yarns.length) {
      mount(stashBox, h('p.muted', 'Add yarn to your stash to see which of your yarns match this palette.'));
      return;
    }
    mount(stashBox, h('div.list', pal.colors.map((hex) => {
      const m = nearestTo(hex, yarns);
      return h('div.list-row',
        h('span.swatch', { style: { '--c': hex, width: '26px', height: '26px' } }),
        icon('chevron-right'),
        h('span.swatch', { style: { '--c': m.item.hex, width: '26px', height: '26px' } }),
        h('div.grow', h('div.title.ellipsis', yarnName(m.item)), h('div.meta', `${yardsText((m.item.skeins || 0) * (m.item.yardsPerSkein || 0))} in stash`)),
        h('span.chip', { class: m.delta < 5 ? 'sage' : m.delta < 12 ? 'mustard' : '' }, m.delta < 5 ? 'Great match' : m.delta < 12 ? 'Close' : 'Far'));
    })));
  }

  function drawSaved() {
    const list = store.all('palettes');
    mount(saved, list.length ? h('div.grid.small', list.map((p) => h('div.card.tight',
      h('div.mini-pal', p.colors.map((c) => h('span', { style: { '--c': c } }))),
      h('div.row.between', { style: { marginTop: '8px' } },
        h('button', { type: 'button', style: { border: 0, background: 'none', font: '600 14px var(--sans)', color: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left' }, onClick: () => { pal = { colors: p.colors.slice(), locked: [] }; count = p.colors.length; commit(); drawControls(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, p.name),
        iconBtn('more', 'Palette options', (e) => menu(e.currentTarget, [
          { label: 'Share', ico: 'share', run: () => go(`/share?kind=palette&id=${p.id}`) },
          { label: 'Delete', ico: 'trash', danger: true, run: () => store.remove('palettes', p.id) },
        ])))))) : h('p.muted', 'Saved palettes appear here.'));
  }

  async function fromPhoto() {
    const file = await pickFile('image/*');
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const c = document.createElement('canvas');
      const scale = Math.min(1, 120 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const px = [];
      for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
      const k = kmeans(px, count, 10);
      pal = { colors: k.map((x) => x.hex), locked: [] };
      count = pal.colors.length;
      commit();
      drawControls();
      toast('Palette pulled from your photo.');
    } catch (err) {
      toast(err.message, { kind: 'err' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function fromStash() {
    const yarns = store.all('yarns').filter((y) => y.hex);
    if (yarns.length < 2) {
      toast('Add at least two yarns with colors to your stash first.');
      return;
    }
    // Greedy: start anywhere, keep adding the yarn most different from the rest.
    const r = rng(++seed);
    const picked = [yarns[Math.floor(r() * yarns.length)]];
    while (picked.length < Math.min(count, yarns.length)) {
      let best = null;
      let bd = -1;
      for (const y of yarns) {
        if (picked.includes(y)) continue;
        const d = Math.min(...picked.map((p) => hexDelta(p.hex, y.hex))) * (0.8 + r() * 0.4);
        if (d > bd) {
          bd = d;
          best = y;
        }
      }
      picked.push(best);
    }
    pal = { colors: picked.map((y) => y.hex), locked: [] };
    count = pal.colors.length;
    commit();
    drawControls();
    toast('A palette you can make right now, from yarn you own.');
  }

  const controls = h('div.row.wrap', { style: { margin: '14px 0 0', gap: '8px' } });
  function drawControls() {
    mount(controls,
      btn('Shuffle', generate, { kind: 'primary', ico: 'shuffle', title: 'Shuffle (space)' }),
      select(HARMONIES, rule, (v) => { rule = v; store.metaSet('imagineRule', v); generate(); }, { style: { width: 'auto' }, 'aria-label': 'Harmony' }),
      select([3, 4, 5, 6, 7, 8].map((n) => [n, `${n} colors`]), count, (v) => { count = Number(v); generate(); }, { style: { width: 'auto' }, 'aria-label': 'Number of colors' }),
      btn('From a photo', fromPhoto, { ico: 'image' }),
      btn('From my stash', fromStash, { ico: 'yarn' }),
      toggle('Value check', values, (v) => { values = v; drawStrip(); drawPreviews(); }),
      h('span.grow'),
      btn('Save', async () => {
        const name = `${colorName(pal.colors[0])} & ${colorName(pal.colors[Math.min(2, pal.colors.length - 1)])}`;
        await store.put('palettes', { name, colors: pal.colors.slice() });
        toast(`Saved “${name}”.`);
      }, { ico: 'star' }),
      btn('Use in a chart', async () => {
        const cells = new Array(30 * 30).fill(0);
        const row = await store.put('charts', { name: 'Palette chart', w: 30, h: 30, palette: pal.colors.slice(), cells: packCells(cells), mode: 'tapestry' });
        go(`/create/charts/${row.id}`);
      }, { ico: 'grid' }));
  }

  const onKey = (e) => {
    if (e.key === ' ' && !e.target.matches('input, textarea, select, button')) {
      e.preventDefault();
      generate();
    }
  };
  document.addEventListener('keydown', onKey);

  root.append(strip, controls, warnings, previews,
    h('div.cols', { style: { marginTop: '8px' } },
      h('div', h('div.section-title', h('h2', 'Closest yarn in your stash'), null), stashBox),
      h('div', h('div.section-title', h('h2', 'Saved palettes'), null), saved)));
  drawControls();
  commit();
  drawSaved();
  const off = store.on('palettes', drawSaved);
  return () => { off(); document.removeEventListener('keydown', onKey); };
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';
}

// ---------------------------------------------------------------------------
// Drawing helpers for previews
// ---------------------------------------------------------------------------

export function drawGranny(ctx, x, y, size, rounds, colors, bg) {
  const unit = size / (2 * rounds + 1.2);
  const c = { x: x + size / 2, y: y + size / 2 };
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, size, size);
  for (let r = rounds; r >= 1; r--) {
    const half = (r + 0.5) * unit;
    ctx.fillStyle = colors[(r - 1) % colors.length];
    roundRect(ctx, c.x - half, c.y - half, half * 2, half * 2, unit * 0.45);
    ctx.fill();
  }
  // Ch-1 gaps between clusters, and post lines inside each cluster.
  for (let r = 1; r <= rounds; r++) {
    const outer = (r + 0.5) * unit;
    const inner = (r - 0.5) * unit;
    const per = r + 1;
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k <= per; k++) {
        const t = -outer + (2 * outer * k) / per;
        const gap = k > 0 && k < per;
        for (const [pos, w, col] of gap ? [[t, unit * 0.16, bg]] : []) {
          ctx.fillStyle = col;
          fillBand(ctx, c, side, pos, inner, outer, w);
        }
        if (k < per) {
          for (let post = 1; post <= 2; post++) {
            const pp = t + ((2 * outer) / per) * (post / 3);
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            fillBand(ctx, c, side, pp, inner + unit * 0.12, outer - unit * 0.12, unit * 0.05);
          }
        }
      }
    }
  }
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(c.x, c.y, unit * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function fillBand(ctx, c, side, pos, inner, outer, w) {
  // A short bar across the ring band at position `pos` along a side.
  const len = outer - inner;
  if (side === 0) ctx.fillRect(c.x + pos - w / 2, c.y - outer, w, len);
  else if (side === 1) ctx.fillRect(c.x + inner, c.y + pos - w / 2, len, w);
  else if (side === 2) ctx.fillRect(c.x - pos - w / 2, c.y + inner, w, len);
  else ctx.fillRect(c.x - outer, c.y - pos - w / 2, len, w);
}

function roundRect(ctx, x, y, w, hh, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hh, r);
  ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawStripes(ctx, w, hh, seq, colors) {
  const total = seq.reduce((a, b) => a + b.rows, 0) || 1;
  const rowH = hh / total;
  let y = 0;
  for (const band of seq) {
    ctx.fillStyle = colors[band.color % colors.length];
    ctx.fillRect(0, y, w, band.rows * rowH + 0.5);
    // Stitch texture: little Vs along each row.
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for (let r = 0; r < band.rows; r++) {
      const ry = y + r * rowH;
      ctx.beginPath();
      for (let x = 0; x < w; x += Math.max(4, rowH * 0.9)) {
        ctx.moveTo(x, ry + rowH * 0.2);
        ctx.lineTo(x + rowH * 0.45, ry + rowH * 0.8);
      }
      ctx.stroke();
    }
    y += band.rows * rowH;
  }
}

function drawMotif(ctx, size, colors) {
  // A small tapestry-style heart and border in the palette.
  const g = 15;
  const cell = size / g;
  const heart = ['...............', '...............', '...XX.....XX...', '..XXXX...XXXX..', '.XXXXXX.XXXXXX.', '.XXXXXXXXXXXXX.', '.XXXXXXXXXXXXX.', '..XXXXXXXXXXX..', '...XXXXXXXXX...', '....XXXXXXX....', '.....XXXXX.....', '......XXX......', '.......X.......', '...............', '...............'];
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const edge = x === 0 || y === 0 || x === g - 1 || y === g - 1;
      const inHeart = heart[y][x] === 'X';
      ctx.fillStyle = edge ? colors[2 % colors.length] : inHeart ? colors[(y > 7 ? 3 : 0) % colors.length] : colors[1 % colors.length];
      ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i <= g; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
}

function paletteSelect(pal, onPick) {
  const saved = store.all('palettes');
  return select([['current', 'Working palette'], ...saved.map((p) => [p.id, p.name])], 'current', (v) => {
    onPick(v === 'current' ? currentPalette().colors : store.get('palettes', v).colors);
  }, { 'aria-label': 'Palette', style: { width: 'auto' } });
}

// ---------------------------------------------------------------------------
// Granny squares and blankets
// ---------------------------------------------------------------------------

function grannyTab(root) {
  const s = { rounds: 5, colors: currentPalette().colors, mode: 'cycle', across: 6, down: 8, weight: 4, seed: 3, blanket: 'random', border: true };
  const square = h('canvas.preview', { width: 360, height: 360 });
  const blanket = h('canvas.preview', { width: 480, height: 600 });
  const text = h('pre', { style: { font: '13px/1.6 var(--mono)', whiteSpace: 'pre-wrap', margin: 0, maxHeight: '360px', overflow: 'auto' } });
  const statsEl = h('div');
  const form = h('div.card');

  function roundColors(sq = 0) {
    const n = s.colors.length;
    return Array.from({ length: s.rounds }, (_, r) => {
      if (s.border && r === s.rounds - 1 && n > 1) return 0;
      if (s.mode === 'solid') return 0;
      if (s.mode === 'random') return Math.floor(rng(s.seed * 97 + sq * 13 + r)() * n);
      return (r + sq) % n;
    });
  }

  function draw() {
    const cols = roundColors();
    drawGranny(square.getContext('2d'), 0, 0, 360, s.rounds, cols.map((i) => s.colors[i]), cssVar('--surface-2'));
    const lay = blanketLayout({ across: s.across, down: s.down, colors: s.colors.length, seed: s.seed });
    const cell = Math.min(480 / s.across, 600 / s.down);
    blanket.width = Math.round(cell * s.across);
    blanket.height = Math.round(cell * s.down);
    const bctx = blanket.getContext('2d');
    for (let y = 0; y < s.down; y++) {
      for (let x = 0; x < s.across; x++) {
        const idx = y * s.across + x;
        const rc = roundColors(s.blanket === 'random' ? idx : 0).map((i) => (s.blanket === 'random' ? (i + lay[y][x]) % s.colors.length : i));
        if (s.border && s.colors.length > 1) rc[rc.length - 1] = 0;
        drawGranny(bctx, x * cell, y * cell, cell, s.rounds, rc.map((i) => s.colors[i]), s.colors[0]);
      }
    }
    const letters = roundColors().map((i) => colorLetter(i));
    const g = granny({ rounds: s.rounds, colors: letters });
    text.textContent = g.text;
    // Yarn per color, for the whole blanket.
    const perDc = yardsPerSc({ weightId: s.weight }) * 1.7;
    const perCh = yardsPerSc({ weightId: s.weight }) * 0.35;
    const byColor = s.colors.map(() => 0);
    const squares = s.across * s.down;
    for (let q = 0; q < squares; q++) {
      const rc = roundColors(s.blanket === 'random' ? q : 0).map((i, r) => (s.blanket === 'random' && !(s.border && r === s.rounds - 1) ? (i + (lay[Math.floor(q / s.across)]?.[q % s.across] || 0)) % s.colors.length : i));
      g.perRound.forEach((pr, r) => { byColor[rc[r]] += pr.dc * perDc + pr.ch * perCh + 0.3; });
    }
    // Joining and a simple border: about 15% extra in the border color.
    const total = byColor.reduce((a, b) => a + b, 0);
    byColor[0] += total * 0.15;
    const side = grannySide(s.rounds, s.weight);
    mount(statsEl,
      h('dl.kv',
        h('dt', 'One square'), h('dd', `≈ ${len(side, 1)} across · ${g.totalDc} dc`),
        h('dt', 'Blanket'), h('dd', `${squares} squares · ≈ ${len(side * s.across, 0)} × ${len(side * s.down, 0)}`),
        h('dt', 'Total yarn'), h('dd', `≈ ${yardsText(total * 1.15)}`)),
      h('div.list', { style: { marginTop: '10px' } }, s.colors.map((hex, i) => h('div.list-row',
        h('span.pal-swatch', { style: { '--c': hex, color: inkFor(hex), width: '26px', height: '26px', borderRadius: '8px' } }, colorLetter(i)),
        h('div.grow', colorName(hex)), h('b.num', yardsText(byColor[i])), h('span.muted.num', { style: { fontSize: '12px', width: '84px', textAlign: 'right' } }, `${skeinsNeeded(byColor[i], 200, 0.1)} × 200 yd`)))));
  }

  function drawForm() {
    mount(form,
      h('h3', 'Square'),
      h('div.fields',
        field('Rounds', numberInput(s.rounds, (v) => { s.rounds = Math.max(1, Math.min(20, Math.round(v || 1))); draw(); }, { min: 1, max: 20, step: 1 })),
        field('Colors by round', select([['cycle', 'Cycle the palette'], ['random', 'Random'], ['solid', 'One color']], s.mode, (v) => { s.mode = v; draw(); })),
        field('Yarn weight', select(YARN_WEIGHTS.map((w) => [w.id, w.name]), s.weight, (v) => { s.weight = Number(v); draw(); })),
        field('Palette', paletteSelect(s.colors, (c) => { s.colors = c; draw(); }))),
      h('div', { style: { marginTop: '10px' } }, toggle('Last round in Color A', s.border, (v) => { s.border = v; draw(); }, 'Ties a scrappy blanket together')),
      h('hr'),
      h('h3', 'Blanket'),
      h('div.fields',
        field('Across', numberInput(s.across, (v) => { s.across = Math.max(1, Math.min(30, Math.round(v || 1))); draw(); }, { min: 1, step: 1 })),
        field('Down', numberInput(s.down, (v) => { s.down = Math.max(1, Math.min(30, Math.round(v || 1))); draw(); }, { min: 1, step: 1 })),
        field('Layout', select([['random', 'Scrappy (no neighbours match)'], ['same', 'Every square the same']], s.blanket, (v) => { s.blanket = v; draw(); }))),
      h('div.btn-row', { style: { marginTop: '12px' } },
        btn('Reshuffle', () => { s.seed++; draw(); }, { ico: 'shuffle' }),
        btn('Save as pattern', async () => {
          const letters = roundColors().map((i) => colorLetter(i));
          const g = granny({ rounds: s.rounds, colors: letters });
          const legend = s.colors.map((hex, i) => `Color ${colorLetter(i)}: ${colorName(hex)} (${hex})`).join('\n');
          const pat = await store.put('patterns', blankPattern({
            title: `${s.rounds}-round granny ${s.blanket === 'random' ? 'scrap ' : ''}blanket`,
            category: 'Blanket', yarnWeight: s.weight, difficulty: 1,
            materials: legend,
            notes: `Make ${s.across * s.down} squares and join them ${s.across} across by ${s.down} down. Whipstitch or slip-stitch join through back loops for a flat seam.`,
            sections: [{ id: uid(6), name: 'Square', text: g.text, pieces: 1 }],
          }));
          toast('Saved as a pattern.');
          go(`/create/patterns/${pat.id}`);
        }, { kind: 'primary', ico: 'book' })));
  }

  drawForm();
  draw();
  root.append(h('div.cols',
    h('div.stack', form, h('div.card', h('h3', 'Pattern'), text)),
    h('div.stack',
      h('div.grid', { style: { '--grid-min': '200px' } }, h('div.card.tight', square), h('div.card.tight', blanket)),
      h('div.card', h('h3', 'Yarn for the blanket'), statsEl))));
  return null;
}

// ---------------------------------------------------------------------------
// Stripes
// ---------------------------------------------------------------------------

function stripesTab(root) {
  const s = { rows: 80, width: 120, style: 'fibonacci', band: 4, stitch: 'hdc', seed: 5, colors: currentPalette().colors, weight: 4 };
  const cv = h('canvas.preview', { width: 480, height: 600 });
  const out = h('pre', { style: { font: '13px/1.6 var(--mono)', whiteSpace: 'pre-wrap', margin: 0, maxHeight: '320px', overflow: 'auto' } });
  const statsEl = h('div');
  let seq = [];
  const draw = debounce(() => {
    seq = stripes({ rows: s.rows, colors: s.colors.length, style: s.style, band: s.band, seed: s.seed });
    drawStripes(cv.getContext('2d'), cv.width, cv.height, seq, s.colors);
    const text = stripesPattern({ seq, width: s.width, stitch: s.stitch });
    out.textContent = seq.map((b, i) => `${colorLetter(b.color)} × ${b.rows}`).join(' · ');
    const factor = { sc: 1, hdc: 1.35, dc: 1.7 }[s.stitch];
    const perRow = s.width * yardsPerSc({ weightId: s.weight }) * factor;
    const byColor = s.colors.map(() => 0);
    for (const b of seq) byColor[b.color] += b.rows * perRow + 0.4;
    const parsed = parseSection(text);
    mount(statsEl,
      h('div.chips', { style: { marginBottom: '10px' } }, h('span.chip', `${seq.length} stripes`), h('span.chip', `${s.rows} rows`), parsed.errors ? h('span.chip.err', 'Check the counts') : h('span.chip.sage', icon('check'), 'Pattern checks out')),
      h('div.list', s.colors.map((hex, i) => h('div.list-row',
        h('span.pal-swatch', { style: { '--c': hex, color: inkFor(hex), width: '26px', height: '26px', borderRadius: '8px' } }, colorLetter(i)),
        h('div.grow', colorName(hex), h('span.muted', ` · ${seq.filter((b) => b.color === i).reduce((a, b) => a + b.rows, 0)} rows`)),
        h('b.num', yardsText(byColor[i]))))));
  }, 40);
  root.append(h('div.cols',
    h('div.stack',
      h('div.card',
        h('div.fields',
          field('Style', select(STRIPE_STYLES, s.style, (v) => { s.style = v; draw(); })),
          field('Rows', numberInput(s.rows, (v) => { s.rows = Math.max(2, Math.round(v || 2)); draw(); }, { min: 2, step: 1 })),
          field('Stripe size', numberInput(s.band, (v) => { s.band = Math.max(1, Math.round(v || 1)); draw(); }, { min: 1, step: 1 }), 'Rows per band'),
          field('Width (stitches)', numberInput(s.width, (v) => { s.width = Math.max(2, Math.round(v || 2)); draw(); }, { min: 2, step: 1 })),
          field('Stitch', select([['sc', 'sc'], ['hdc', 'hdc'], ['dc', 'dc']], s.stitch, (v) => { s.stitch = v; draw(); })),
          field('Yarn weight', select(YARN_WEIGHTS.map((w) => [w.id, w.name]), s.weight, (v) => { s.weight = Number(v); draw(); })),
          field('Palette', paletteSelect(s.colors, (c) => { s.colors = c; draw(); }))),
        h('div.btn-row', { style: { marginTop: '12px' } },
          btn('Reshuffle', () => { s.seed++; draw(); }, { ico: 'shuffle' }),
          btn('Save as pattern', async () => {
            const legend = s.colors.map((hex, i) => `Color ${colorLetter(i)}: ${colorName(hex)} (${hex})`).join('\n');
            const pat = await store.put('patterns', blankPattern({
              title: `${STRIPE_STYLES.find((x) => x[0] === s.style)[1]} stripes`, category: 'Blanket', yarnWeight: s.weight, difficulty: 1, materials: legend,
              sections: [{ id: uid(6), name: 'Blanket', text: stripesPattern({ seq, width: s.width, stitch: s.stitch }), pieces: 1 }],
            }));
            toast('Saved as a pattern.');
            go(`/create/patterns/${pat.id}`);
          }, { kind: 'primary', ico: 'book' }))),
      h('div.card', h('h3', 'Sequence'), out),
      h('div.card', h('h3', 'Yarn per color'), statsEl)),
    h('div.card.tight', cv)));
  draw();
  return null;
}

// ---------------------------------------------------------------------------
// Hats
// ---------------------------------------------------------------------------

function hatsTab(root) {
  const cm = store.settings().units === 'cm';
  const k = cm ? 2.54 : 1;
  const s = { size: 'Adult M', circ: 22 * k, height: 8.5 * k, stitch: 'hdc', sts: 13, rows: 10, brim: 'ribbed', brimDepth: 1.5 * k, slouch: 0, weight: 4, ease: 1.5 * k };
  const per = cm ? 10 : 4;
  const u = unitLabel();
  const out = h('pre', { style: { font: '13px/1.7 var(--mono)', whiteSpace: 'pre-wrap', margin: 0 } });
  const statsEl = h('div');
  const cv = h('canvas.preview', { width: 420, height: 320 });
  let result = null;
  const draw = debounce(() => {
    result = hat({ circ: s.circ, height: s.height, stitch: s.stitch, gaugeSts: s.sts, gaugeRows: s.rows, per, ease: s.ease, brim: s.brim, brimDepth: s.brimDepth, slouch: s.slouch });
    out.textContent = result.text;
    const check = parseSection(result.text);
    mount(statsEl, h('dl.kv',
      h('dt', 'Around'), h('dd', `${result.count} sts ≈ ${result.finishedCirc.toFixed(1)} ${u} (${(s.circ - result.finishedCirc).toFixed(1)} ${u} negative ease)`),
      h('dt', 'Crown'), h('dd', `${result.crownRounds} increase rounds, ≈ ${result.crownDiameter.toFixed(1)} ${u} across`),
      h('dt', 'Height'), h('dd', `≈ ${result.finishedHeight.toFixed(1)} ${u} in ${result.rounds} rounds`),
      h('dt', 'Yarn'), h('dd', `≈ ${yardsText(result.stitches * yardsPerSc({ weightId: s.weight, scPer4in: s.sts * (cm ? 4 / 3.937 : 1) }) * ({ sc: 1, hdc: 1.35, dc: 1.7 }[s.stitch]))}`),
      h('dt', 'Check'), h('dd', check.errors ? `${check.errors} count errors` : 'Every round checks out')));
    drawHat();
  }, 40);
  function drawHat() {
    const ctx = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent');
    const scale = Math.min(300 / (result.finishedCirc / 2), 250 / (result.finishedHeight + 0.5));
    const w = (result.finishedCirc / 2) * scale;
    const crownH = (result.crownDiameter / 2) * scale * 0.9;
    const total = result.finishedHeight * scale;
    const brimH = s.brim === 'none' ? 0 : (result.brimRows / Math.max(1, result.rounds)) * total * 1.6;
    const x0 = (W - w) / 2;
    const y1 = H - 30;
    const y0 = y1 - total;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x0, y0 + crownH);
    ctx.bezierCurveTo(x0, y0 - crownH * 0.1, x0 + w, y0 - crownH * 0.1, x0 + w, y0 + crownH);
    ctx.lineTo(x0 + w, y1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    for (let r = 1; r < result.rounds; r++) {
      const y = y0 + crownH * 0.35 + ((y1 - brimH - y0) * r) / result.rounds;
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y);
      ctx.lineTo(x0 + w - 2, y);
      ctx.stroke();
    }
    if (brimH) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x0, y1 - brimH, w, brimH);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      for (let x = x0 + 6; x < x0 + w; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, y1 - brimH + 2);
        ctx.lineTo(x, y1 - 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = cssVar('--ink-3');
    ctx.font = '600 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${result.finishedCirc.toFixed(1)} ${u} around`, W / 2, H - 8);
  }
  const conv = (v) => (cm ? v * 2.54 : v);
  const wrap = h('div');
  root.append(wrap);
  const layout = () => mount(wrap, h('div.cols',
    h('div.stack',
      h('div.card',
        h('div.fields',
          field('Size', select([...HEADS.map((x) => [x.name, x.name]), ['custom', 'Custom']], s.size, (v) => {
            s.size = v;
            const head = HEADS.find((x) => x.name === v);
            if (head) { s.circ = conv(head.circ); s.height = conv(head.height); }
            layout();
            draw();
          })),
          field(`Head (${u})`, numberInput(Number(s.circ.toFixed(1)), (v) => { s.circ = v || 1; s.size = 'custom'; draw(); }, { min: 5 })),
          field(`Height (${u})`, numberInput(Number(s.height.toFixed(1)), (v) => { s.height = v || 1; draw(); }, { min: 2 })),
          field(`Slouch (${u})`, numberInput(s.slouch, (v) => { s.slouch = v || 0; draw(); }, { min: 0 }))),
        h('div.fields', { style: { marginTop: '12px' } },
          field('Stitch', select([['sc', 'sc (dense)'], ['hdc', 'hdc'], ['dc', 'dc (fast)']], s.stitch, (v) => { s.stitch = v; s.rows = Math.round({ sc: 14, hdc: 10, dc: 7 }[v] * (cm ? 2.5 : 1)); layout(); draw(); })),
          field(`Sts / ${per} ${u}`, numberInput(s.sts, (v) => { s.sts = v || 1; draw(); }, { min: 1 })),
          field(`Rows / ${per} ${u}`, numberInput(s.rows, (v) => { s.rows = v || 1; draw(); }, { min: 1 })),
          field('Brim', select([['ribbed', 'Post-stitch rib'], ['plain', 'Back-loop band'], ['none', 'No brim']], s.brim, (v) => { s.brim = v; draw(); })),
          field('Yarn weight', select(YARN_WEIGHTS.map((w) => [w.id, w.name]), s.weight, (v) => { s.weight = Number(v); draw(); }))),
        h('div.btn-row', { style: { marginTop: '12px' } },
          btn('Save as pattern', async () => {
            const pat = await store.put('patterns', blankPattern({
              title: `Top-down ${s.stitch} beanie (${s.size === 'custom' ? `${s.circ.toFixed(1)} ${u}` : s.size})`, category: 'Hat', yarnWeight: s.weight,
              gauge: { sts: s.sts, rows: s.rows, per, unit: u }, size: `${result.finishedCirc.toFixed(1)} ${u} around, ${result.finishedHeight.toFixed(1)} ${u} tall`,
              notes: 'Worked top down from a flat circle. Try it on after the crown: it should lie flat and reach just past the top of your ears.',
              sections: [{ id: uid(6), name: 'Hat', text: result.text, pieces: 1 }],
            }));
            toast('Saved as a pattern.');
            go(`/create/patterns/${pat.id}`);
          }, { kind: 'primary', ico: 'book' }))),
      h('div.card', h('h3', 'Pattern'), out)),
    h('div.stack', h('div.card.tight', cv), h('div.card', statsEl))));
  layout();
  draw();
  return null;
}

// ---------------------------------------------------------------------------
// Ideas
// ---------------------------------------------------------------------------

function ideasTab(root) {
  let seed = Math.floor(Date.now() / 1000) % 100000;
  const card = h('div.card.idea-card');
  const draw = () => {
    const i = idea(seed);
    const pal = currentPalette().colors;
    mount(card,
      h('div.eyebrow', { style: { fontFamily: 'var(--sans)' } }, 'Make a…'),
      h('p', { style: { margin: 0 } }, 'A ', h('b', i.make), ' in ', h('b', i.stitch), ', using ', h('b', i.yarn), ', ', h('b', i.twist), '.'),
      h('div.mini-pal', { style: { marginTop: '16px', maxWidth: '360px' } }, pal.map((c) => h('span', { style: { '--c': c } }))),
      h('div.btn-row', { style: { marginTop: '18px' } },
        btn('Another', () => { seed++; draw(); }, { kind: 'primary', ico: 'dice' }),
        btn('Plan it', async () => {
          const p = await store.put('projects', { name: `${i.make[0].toUpperCase()}${i.make.slice(1)}`, status: 'idea', notes: `A ${i.make} in ${i.stitch}, using ${i.yarn}, ${i.twist}.\nPalette: ${pal.join(', ')}`, counters: [], photoIds: [], yarns: [] });
          toast('Added to your ideas.');
          go(`/plan/projects/${p.id}`);
        }, { ico: 'plan' }),
        btn('New palette', () => go('/imagine/palettes'), { kind: 'ghost', ico: 'palette' })));
  };
  draw();
  root.append(card,
    h('div.section-title', h('h2', 'Challenges'), null),
    h('div.grid', [
      ['One-skein week', 'Make something complete from a single skein. Use the swatch yardage calculator to plan it.', '#/plan/calc#swatch'],
      ['Stash-only palette', 'Build a palette only from yarn you own, then make a granny blanket from it.', '#/imagine/palettes'],
      ['Photo to blanket', 'Turn a photo you love into a C2C chart with five colors or fewer.', '#/create/charts/new?photo=1'],
      ['Design a creature', 'Sketch a silhouette in the shape builder and write a whole amigurumi around it.', '#/create/shapes'],
    ].map(([t, d, href]) => h('a.card', { href }, h('h3', t), h('p.soft', { style: { fontSize: '14px', marginTop: '6px' } }, d)))));
  return null;
}


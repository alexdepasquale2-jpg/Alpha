// Amigurumi shape builder: choose a silhouette and a size, get the rounds.

import { h, mount, btn, field, numberInput, select, segmented, pageHead, subnav, modal, toast, toggle } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { debounce, copyText, uid, fmt } from '../core/util.js';
import { amigurumi, SHAPES } from '../crochet/generators.js';
import { YARN_WEIGHTS, HOOKS, yardsForTally } from '../crochet/calc.js';
import { parseSection } from '../crochet/parser.js';
import { stitchInfo } from '../crochet/stitches.js';
import { CREATE_TABS, blankPattern } from './create.js';
import { yardsText } from './common.js';

const DEFAULTS = {
  sphere: { diameter: 8 },
  egg: { width: 7, height: 9, taper: 0.18 },
  ellipsoid: { width: 6, height: 10 },
  tube: { diameter: 3, length: 8, closedTop: false },
  cone: { diameter: 5, height: 7, closedTop: false },
  custom: { profile: [{ z: 0, r: 0 }, { z: 1.5, r: 3 }, { z: 4.5, r: 3.6 }, { z: 7, r: 2.4 }, { z: 9.5, r: 3.2 }, { z: 12, r: 0 }] },
};

const LABELS = { diameter: 'Diameter', width: 'Width', height: 'Height', length: 'Length', taper: 'Taper' };

export function render(root) {
  const st = store.settings();
  const inch = st.units !== 'cm';
  const unit = inch ? 'in' : 'cm';
  const toCm = (v) => (inch ? v * 2.54 : v);
  const fromCm = (v) => (inch ? v / 2.54 : v);
  // Defaults are in cm; show friendly round numbers in inches.
  const startParams = structuredClone(DEFAULTS);
  if (inch) {
    const conv = (v) => Math.round((v / 2.54) * 4) / 4;
    for (const p of Object.values(startParams)) {
      for (const k of ['diameter', 'width', 'height', 'length']) if (p[k] !== undefined) p[k] = conv(p[k]);
      if (p.profile) p.profile = p.profile.map((q) => ({ z: conv(q.z), r: conv(q.r) }));
    }
  }
  const state = {
    shape: 'sphere',
    params: startParams,
    sts: inch ? 20 : 20,
    rows: 22,
    start: 6,
    snap: true,
    stagger: true,
    invisible: true,
    weight: 4,
    hook: 3.5,
    color: '#d98e73',
  };
  const gaugePer = inch ? 4 : 10;

  root.append(pageHead('Create', 'Write patterns that check their own stitch counts. Design charts and shapes.'), subnav(CREATE_TABS, '#/create/shapes'));
  const form = h('div.card');
  const preview = h('canvas', { width: 520, height: 420, 'aria-label': 'Shape preview', style: { width: '100%', maxWidth: '520px' } });
  const stats = h('div.stats', { style: { marginTop: '12px' } });
  const rounds = h('pre', { style: { font: '13.5px/1.7 var(--mono)', whiteSpace: 'pre-wrap', margin: 0, maxHeight: '420px', overflow: 'auto' } });
  let result = null;

  root.append(h('div.cols',
    h('div.stack', form,
      h('div.card', h('div.card-head', h('h3', 'Rounds'), h('div.btn-row',
        btn('Copy', async () => { await copyText(result.text); toast('Rounds copied.'); }, { small: true, kind: 'ghost', ico: 'copy' }),
        btn('Add to a pattern', addToPattern, { small: true, ico: 'plus' }),
        btn('Save as pattern', saveAsPattern, { small: true, kind: 'primary', ico: 'book' }))), rounds)),
    h('div.stack', h('div.shape-preview', preview), h('div.card', stats))));

  function params() {
    const p = { ...state.params[state.shape] };
    for (const k of ['diameter', 'width', 'height', 'length']) if (p[k] !== undefined) p[k] = toCm(p[k]);
    if (p.profile) p.profile = p.profile.map((q) => ({ z: toCm(q.z), r: toCm(q.r) }));
    return p;
  }

  const recompute = debounce(() => {
    const stsPerCm = state.sts / (gaugePer * (inch ? 2.54 : 1));
    const rowsPerCm = state.rows / (gaugePer * (inch ? 2.54 : 1));
    const name = SHAPES.find((s) => s.id === state.shape).name;
    try {
      result = amigurumi({ shape: state.shape, params: params(), stsPerCm, rowsPerCm, start: state.start, snap: state.snap, stagger: state.stagger, invisible: state.invisible, name });
    } catch (err) {
      rounds.textContent = err.message;
      return;
    }
    rounds.textContent = result.text;
    const sec = parseSection(result.text);
    const yards = yardsForTally(sec.tally, (id) => stitchInfo(id)?.yarn ?? 1, { weightId: state.weight, scPer4in: inch ? state.sts * (4 / gaugePer) : state.sts * (10.16 / gaugePer) });
    mount(stats, 
      statBox('Rounds', String(result.rounds)),
      statBox('Stitches', result.stitches.toLocaleString()),
      statBox('Widest', `${result.max} sts`),
      statBox('Size', `${fmt(fromCm(result.size.width), 1)} × ${fmt(fromCm(result.size.length), 1)} ${unit}`),
      statBox('Yarn', `≈ ${yardsText(yards)}`),
      result.stuffingGrams ? statBox('Stuffing', `≈ ${Math.max(1, Math.round(result.stuffingGrams))} g`) : null,
      sec.errors ? statBox('Check', `${sec.errors} errors`) : statBox('Check', 'Counts ✓'));
    drawPreview();
  }, 60);

  function statBox(label, value) {
    return h('div.stat', h('div.stat-value', { style: { fontSize: '20px' } }, value), h('div.stat-label', label));
  }

  function drawForm() {
    const p = state.params[state.shape];
    const shapeDef = SHAPES.find((s) => s.id === state.shape);
    const dims = shapeDef.fields.filter((f) => f !== 'closedTop' && f !== 'profile');
    mount(form, 
      h('h3', 'Shape'),
      h('div', { style: { margin: '8px 0 4px', overflowX: 'auto' } }, segmented(SHAPES.map((s) => [s.id, s.name]), state.shape, (v) => { state.shape = v; state.snap = v !== 'cone' && v !== 'custom' ? state.snap : false; drawForm(); recompute(); }, { label: 'Shape' })),
      h('p.muted', { style: { fontSize: '13px' } }, shapeDef.about),
      dims.length ? h('div.fields', dims.map((k) => field(k === 'taper' ? 'Taper (0–0.4)' : `${LABELS[k]} (${unit})`, numberInput(p[k], (v) => { p[k] = v || 0; recompute(); }, { min: 0, step: k === 'taper' ? 0.02 : 0.5 })))) : null,
      shapeDef.fields.includes('closedTop') ? h('div', { style: { marginTop: '10px' } }, toggle('Close the end', !!p.closedTop, (v) => { p.closedTop = v; recompute(); }, 'Decrease back to a point')) : null,
      state.shape === 'custom' ? profileEditor(p) : null,
      h('hr'),
      h('h3', 'Your gauge'),
      h('p.muted', { style: { fontSize: '13px' } }, `Single crochet in the round, measured over ${gaugePer} ${unit}. Amigurumi is worked tight: a hook a size or two smaller than the yarn asks for.`),
      h('div.fields',
        field(`Stitches / ${gaugePer} ${unit}`, numberInput(state.sts, (v) => { state.sts = v || 1; recompute(); }, { min: 1 })),
        field(`Rounds / ${gaugePer} ${unit}`, numberInput(state.rows, (v) => { state.rows = v || 1; recompute(); }, { min: 1 })),
        field('Yarn', select(YARN_WEIGHTS.map((w) => [w.id, w.name]), state.weight, (v) => { state.weight = Number(v); recompute(); })),
        field('Hook', select(HOOKS.map((x) => [x.mm, `${x.mm} mm`]), state.hook, (v) => { state.hook = Number(v); }))),
      h('hr'),
      h('h3', 'Style'),
      h('div.fields', field('Magic ring', select([[5, '5 sc'], [6, '6 sc'], [7, '7 sc'], [8, '8 sc']], state.start, (v) => { state.start = Number(v); recompute(); }))),
      h('div.stack.tight', { style: { marginTop: '10px' } },
        toggle('Even rhythm', state.snap, (v) => { state.snap = v; recompute(); }, `Keep counts on multiples of ${state.start}: tidy “(sc n, inc) ×${state.start}” rounds`),
        toggle('Stagger increases', state.stagger, (v) => { state.stagger = v; recompute(); }, 'Rounder shapes, no hexagon corners'),
        toggle('Invisible decreases', state.invisible, (v) => { state.invisible = v; recompute(); }, 'Front-loop decreases that hide on the right side')),
      h('div.row', { style: { marginTop: '12px' } }, h('span.field-label', 'Preview color'), h('input', { type: 'color', value: state.color, onInput: (e) => { state.color = e.target.value; drawPreview(); } })));
  }

  function profileEditor(p) {
    const cv = h('canvas.profile-editor', { width: 480, height: 300, 'aria-label': 'Profile editor: drag the points' });
    const maxZ = () => Math.max(4, ...p.profile.map((q) => q.z)) * 1.1;
    const maxR = () => Math.max(3, ...p.profile.map((q) => q.r)) * 1.25;
    const toPx = (q) => [30 + (q.r / maxR()) * (cv.width - 60), 20 + (q.z / maxZ()) * (cv.height - 40)];
    const fromPx = (x, y) => ({ r: Math.max(0, ((x - 30) / (cv.width - 60)) * maxR()), z: Math.max(0, ((y - 20) / (cv.height - 40)) * maxZ()) });
    const draw = () => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = 'rgba(128,128,128,0.35)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(30, 10);
      ctx.lineTo(30, cv.height - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      const pts = p.profile.map(toPx);
      ctx.strokeStyle = state.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      for (const [x, y] of pts) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#888';
      ctx.font = '11px system-ui';
      ctx.fillText('center line', 36, cv.height - 8);
    };
    let dragging = -1;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)];
    };
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e);
      const pts = p.profile.map(toPx);
      dragging = pts.findIndex(([px, py]) => Math.hypot(px - x, py - y) < 16);
      if (dragging < 0) {
        // Add a point where the profile is closest in height.
        const q = fromPx(x, y);
        const at = p.profile.findIndex((pt) => pt.z > q.z);
        p.profile.splice(at < 0 ? p.profile.length - 1 : Math.max(1, at), 0, q);
        dragging = p.profile.indexOf(q);
      }
      cv.setPointerCapture(e.pointerId);
      draw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (dragging < 0) return;
      const [x, y] = pos(e);
      const q = fromPx(x, y);
      const prev = p.profile[dragging - 1];
      const next = p.profile[dragging + 1];
      // Keep points in order along the height; the ends stay on the center line.
      q.z = Math.min(next ? next.z - 0.05 : q.z, Math.max(prev ? prev.z + 0.05 : 0, q.z));
      if (dragging === 0) q.z = 0;
      p.profile[dragging] = q;
      draw();
      recompute();
    });
    cv.addEventListener('pointerup', () => { dragging = -1; });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const [x, y] = pos(e);
      const i = p.profile.map(toPx).findIndex(([px, py]) => Math.hypot(px - x, py - y) < 16);
      if (i > 0 && i < p.profile.length - 1 && p.profile.length > 3) {
        p.profile.splice(i, 1);
        draw();
        recompute();
      }
    });
    draw();
    return h('div', { style: { marginTop: '12px' } }, cv,
      h('p.muted', { style: { fontSize: '12.5px' } }, `Drag points to shape the silhouette (the left edge is the center line, in ${unit}). Tap empty space to add a point; right-click to remove one.`),
      btn('Reset', () => { state.params.custom = structuredClone(startParams.custom); drawForm(); recompute(); }, { small: true, kind: 'ghost', ico: 'refresh' }));
  }

  function drawPreview() {
    if (!result) return;
    const ctx = preview.getContext('2d');
    const W = preview.width;
    const H = preview.height;
    ctx.clearRect(0, 0, W, H);
    const pts = result.profile;
    const maxR = Math.max(...pts.map((q) => q.r), 0.5);
    const maxZ = Math.max(...pts.map((q) => q.z), 0.5);
    const scale = Math.min((W - 80) / (2 * maxR), (H - 80) / maxZ);
    const cx = W / 2;
    const top = (H - maxZ * scale) / 2;
    // Silhouette with a soft, lit-from-the-left gradient.
    const grad = ctx.createLinearGradient(cx - maxR * scale, 0, cx + maxR * scale, 0);
    grad.addColorStop(0, shade(state.color, -0.35));
    grad.addColorStop(0.32, shade(state.color, 0.25));
    grad.addColorStop(0.62, state.color);
    grad.addColorStop(1, shade(state.color, -0.45));
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(cx - q.r * scale, top + q.z * scale) : ctx.moveTo(cx - q.r * scale, top + q.z * scale)));
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(cx + pts[i].r * scale, top + pts[i].z * scale);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // Round lines: the front half of each round as a flattened ellipse.
    ctx.save();
    ctx.clip();
    result.geometry.forEach((g, i) => {
      const rx = g.r * scale;
      if (rx < 1) return;
      const y = top + g.z * scale;
      const prev = result.counts[i - 1];
      const changed = prev !== undefined && prev !== g.count;
      ctx.strokeStyle = changed ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.13)';
      ctx.lineWidth = changed ? 1.6 : 1;
      ctx.beginPath();
      ctx.ellipse(cx, y, rx, rx * 0.16, 0, 0, Math.PI);
      ctx.stroke();
    });
    ctx.restore();
    // A little shadow underneath.
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(cx, top + maxZ * scale + 16, maxR * scale * 0.8, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink-3') || '#888';
    ctx.font = '600 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('magic ring', cx, top - 8);
  }

  async function saveAsPattern() {
    const pat = await store.put('patterns', blankPattern({
      title: `${result.name} (${fmt(fromCm(result.size.width), 1)} ${unit})`,
      category: 'Amigurumi',
      yarnWeight: state.weight,
      hookMm: state.hook,
      gauge: { sts: state.sts, rows: state.rows, per: gaugePer, unit },
      sections: [{ id: uid(6), name: result.name, text: result.text, pieces: 1 }],
      notes: 'Worked in continuous rounds. Move your stitch marker up at the start of every round.',
    }));
    toast('Saved as a pattern.');
    go(`/create/patterns/${pat.id}`);
  }

  async function addToPattern() {
    const pats = store.all('patterns');
    if (!pats.length) return saveAsPattern();
    const choice = await modal({
      title: 'Add these rounds to…',
      body: (close) => h('div.list', pats.map((p) => h('button.list-row.link', { type: 'button', style: { border: 0, background: 'none', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }, onClick: () => close(p) }, icon('book'), h('div.grow', p.title)))),
    });
    if (!choice) return null;
    const next = { ...choice, sections: [...(choice.sections || []), { id: uid(6), name: result.name, text: result.text, pieces: 1 }] };
    await store.put('patterns', next);
    toast(`Added as a new part of “${choice.title}”.`);
    go(`/create/patterns/${choice.id}`);
    return null;
  }

  drawForm();
  recompute();
  return null;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(Math.max(0, Math.min(255, amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}


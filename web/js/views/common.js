// Shared pieces for the section views.

import { h, s, toast } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { pickFile, shrinkImage } from '../core/util.js';
import { parsePattern } from '../crochet/parser.js';
import { SYMBOLS, symbolFor, stitchInfo, STITCH_BY_ID } from '../crochet/stitches.js';
import { weightById, hookLabel, yardsPerSc, yardsForTally, minutesForTally } from '../crochet/calc.js';

export const STATUSES = [
  ['idea', 'Ideas', 'plum'],
  ['queued', 'Queued', 'mustard'],
  ['active', 'In progress', 'accent'],
  ['done', 'Finished', 'sage'],
  ['frogged', 'Frogged', ''],
];
export const statusName = (id) => (STATUSES.find((x) => x[0] === id) || STATUSES[1])[1];

export function statusChip(status) {
  const [, label, tone] = STATUSES.find((x) => x[0] === status) || STATUSES[1];
  return h('span.chip', { class: tone }, h('span.status-dot', { class: `st-${status}` }), label);
}

export const CATEGORIES = ['Amigurumi', 'Blanket', 'Garment', 'Hat', 'Scarf & cowl', 'Shawl', 'Bag', 'Home', 'Accessory', 'Baby', 'Toy', 'Other'];

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/** An <img> for a stored photo, filled in once the blob URL is ready. */
export function photo(id, attrs = {}) {
  const img = h('img', { alt: attrs.alt || '', loading: 'lazy', ...attrs });
  if (id) store.mediaUrl(id).then((url) => { if (url) img.src = url; });
  return img;
}

/** Pick photos from the device (or camera), shrink and store them. */
export async function addPhotos({ multiple = true, max = 1600 } = {}) {
  const files = await pickFile('image/*', { multiple });
  const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
  const ids = [];
  for (const f of list) {
    try {
      const { blob, w, h: ht } = await shrinkImage(f, max);
      ids.push(await store.putMedia(blob, { w, h: ht }));
    } catch (err) {
      toast(err.message, { kind: 'err' });
    }
  }
  return ids;
}

export function coverId(project) {
  if (!project) return null;
  if (project.coverId) return project.coverId;
  if (project.photoIds?.length) return project.photoIds[project.photoIds.length - 1];
  const pat = project.patternId ? store.get('patterns', project.patternId) : null;
  return pat?.coverId || null;
}

export function thumb(id, fallbackIcon = 'yarn') {
  return h('div.thumb', id ? photo(id) : icon(fallbackIcon));
}

// ---------------------------------------------------------------------------
// Patterns and progress
// ---------------------------------------------------------------------------

const parsedCache = new Map();

export function parsed(pattern) {
  if (!pattern) return null;
  const hit = parsedCache.get(pattern.id);
  if (hit && hit.at === pattern.updatedAt && hit.terms === pattern.terms) return hit.value;
  const value = parsePattern(pattern);
  parsedCache.set(pattern.id, { at: pattern.updatedAt, terms: pattern.terms, value });
  return value;
}

export function projectProgress(project) {
  const pat = project.patternId ? store.get('patterns', project.patternId) : null;
  if (project.status === 'done') return { pct: 1, done: 1, total: 1, pattern: pat };
  if (!pat) return { pct: null, pattern: null };
  const p = parsed(pat);
  const total = p.steps.length;
  const done = Math.min(total, project.pos?.step || 0);
  return { pct: total ? done / total : 0, done, total, pattern: pat, parsed: p, step: p.steps[done] || null };
}

export function progressBar(pct, tone = '') {
  return h('div.progress', { class: tone, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round((pct || 0) * 100) },
    h('span', { style: { width: `${Math.round((pct || 0) * 100)}%` } }));
}

const effort = (id) => {
  const info = stitchInfo(id) || stitchInfo(STITCH_BY_ID[id] ? id : 'sc');
  return Math.max(0.5, info?.h ?? 1) * (id === 'bobble' || id === 'puff' || id === 'pc' ? 3 : 1);
};
const yarnFactor = (id) => stitchInfo(id)?.yarn ?? STITCH_BY_ID[id]?.yarn ?? 1;

/** Yardage and time estimates for a parsed pattern. */
export function estimates(pattern, p = parsed(pattern)) {
  const st = store.settings();
  const opts = { weightId: pattern.yarnWeight ?? 4, calibration: st.yarnCalibration || 1 };
  if (pattern.gauge?.sts && pattern.gauge?.per) {
    // Gauge in whatever stitch; treat as sc-ish per 4 in.
    const per4 = pattern.gauge.unit === 'cm' ? (pattern.gauge.sts / pattern.gauge.per) * 10.16 : (pattern.gauge.sts / pattern.gauge.per) * 4;
    opts.scPer4in = per4;
  }
  const yards = yardsForTally(p.tally, yarnFactor, opts);
  const minutes = minutesForTally(p.tally, effort, st.speed || 20);
  return { yards, minutes, perSc: yardsPerSc(opts) };
}

// ---------------------------------------------------------------------------
// Yarn
// ---------------------------------------------------------------------------

export const weightName = (id) => (id === null || id === undefined || id === '' ? '—' : `${id} · ${weightById(id).name}`);

export function yarnName(y) {
  if (!y) return 'Unknown yarn';
  return [y.brand, y.line].filter(Boolean).join(' ') + (y.colorway ? ` — ${y.colorway}` : '') || 'Untitled yarn';
}

export const yarnYards = (y) => (Number(y.skeins) || 0) * (Number(y.yardsPerSkein) || 0);

/** Yards of a stash yarn promised to queued or in-progress projects. */
export function allocated(yarnId) {
  let n = 0;
  for (const p of store.all('projects')) {
    if (p.status !== 'queued' && p.status !== 'active') continue;
    for (const a of p.yarns || []) if (a.yarnId === yarnId) n += Number(a.yards) || 0;
  }
  return n;
}

export function hookText(mm) {
  return mm ? hookLabel(mm) : '—';
}

// ---------------------------------------------------------------------------
// Stitch symbols
// ---------------------------------------------------------------------------

export function symbolEl(id, size = 40, cls = 'sym-icon') {
  const sym = SYMBOLS[symbolFor(id)] || SYMBOLS.sc;
  return s('svg', { viewBox: '0 0 40 40', width: size, height: size, class: cls, 'aria-hidden': 'true' },
    sym.d ? s('path', { d: sym.d, class: 'sym', 'stroke-dasharray': sym.dash ? '3 4' : null }) : null,
    sym.fill ? s('path', { d: sym.fill, class: 'sym-fill' }) : null);
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export function unitLabel() {
  return store.settings().units === 'cm' ? 'cm' : 'in';
}

/** Show a length stored in inches in the user's units. */
export function len(inches, places = 1) {
  if (!Number.isFinite(inches)) return '—';
  return store.settings().units === 'cm' ? `${(inches * 2.54).toFixed(places)} cm` : `${inches.toFixed(places)} in`;
}

export const yardsText = (yd) => {
  if (!Number.isFinite(yd)) return '—';
  const m = yd * 0.9144;
  return store.settings().units === 'cm' ? `${Math.round(m).toLocaleString()} m` : `${Math.round(yd).toLocaleString()} yd`;
};

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

export function backLink(href, label) {
  return h('a.back', { href }, icon('chevron-left'), label);
}

export function colorDot(hex, size = 14) {
  return h('span.swatch', { style: { '--c': hex, width: `${size}px`, height: `${size}px` } });
}

export function initials(name) {
  return (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?';
}

export function avatar(name, color, small = false) {
  return h('span.avatar', { class: small ? 'small' : '', style: { '--c': color || '#b4481f' } }, initials(name));
}

/** Render hashtags in plain text as tappable spans, safely. */
export function richText(text, onTag) {
  const out = [];
  const re = /(#[a-z0-9][a-z0-9-]{0,31})/gi;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tag = m[1].slice(1).toLowerCase();
    out.push(h('span.tag', { role: onTag ? 'link' : null, tabindex: onTag ? 0 : null, onClick: onTag ? () => onTag(tag) : null }, m[1]));
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const tagsFrom = (text) => [...new Set((String(text).match(/#[a-z0-9][a-z0-9-]{0,31}/gi) || []).map((t) => t.slice(1).toLowerCase()))];

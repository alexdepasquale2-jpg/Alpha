// Search everything, and jump anywhere: Ctrl/⌘+K or "/".

import { h, mount } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { STITCHES, STITCH_PATTERNS } from '../crochet/stitches.js';
import { colorName } from '../crochet/color.js';
import { yarnName } from './common.js';

const ACTIONS = [
  ['New project', '/plan/projects/new', 'plus', 'plan start queue'],
  ['New pattern', '/create/patterns/new', 'create', 'write'],
  ['New chart', '/create/charts/new', 'grid', 'colorwork c2c tapestry graph'],
  ['Chart from a photo', '/create/charts/new?photo=1', 'image', 'picture image convert'],
  ['Amigurumi shape builder', '/create/shapes', 'circle', 'ball sphere egg cone tube'],
  ['Row tracker', '/build', 'counter', 'counter work build'],
  ['Calculators', '/plan/calc', 'calculator', 'gauge yardage pricing chain increase decrease wpi'],
  ['Stash', '/plan/stash', 'yarn', 'yarn inventory'],
  ['People and sizes', '/plan/people', 'users', 'measurements head recipients'],
  ['Sales', '/plan/sales', 'tag', 'sell market shop revenue'],
  ['Shopping list', '/plan/shopping', 'bag', 'buy'],
  ['Palette studio', '/imagine/palettes', 'palette', 'color colours harmony'],
  ['Granny square generator', '/imagine/granny', 'grid', 'blanket'],
  ['Stripe generator', '/imagine/stripes', 'layers', 'blanket fibonacci'],
  ['Hat generator', '/imagine/hats', 'sparkle', 'beanie'],
  ['Idea spinner', '/imagine/ideas', 'dice', 'inspiration'],
  ['Community board', '/post', 'post', 'feed social'],
  ['Share and backup', '/share', 'share', 'link qr export import restore'],
  ['Stitch dictionary', '/create/stitches', 'stitch', 'abbreviations symbols'],
  ['Settings', '/settings', 'settings', 'theme units terms'],
];

function index() {
  const items = [];
  for (const p of store.all('projects')) items.push({ label: p.name, sub: `Project · ${p.status}`, href: `/plan/projects/${p.id}`, ico: 'plan', text: `${p.name} ${p.recipient || ''} ${(p.tags || []).join(' ')} ${p.category || ''}` });
  for (const p of store.all('patterns')) items.push({ label: p.title, sub: `Pattern${p.designer ? ` · ${p.designer}` : ''}`, href: `/create/patterns/${p.id}`, ico: 'book', text: `${p.title} ${p.designer || ''} ${p.category || ''} ${(p.tags || []).join(' ')}` });
  for (const c of store.all('charts')) items.push({ label: c.name, sub: `Chart · ${c.w} × ${c.h}`, href: `/create/charts/${c.id}`, ico: 'grid', text: c.name });
  for (const y of store.all('yarns')) items.push({ label: yarnName(y), sub: `Yarn · ${y.location || 'stash'}`, href: '/plan/stash', ico: 'yarn', text: `${yarnName(y)} ${y.fiber || ''} ${y.location || ''} ${colorName(y.hex || '#888888')}` });
  for (const p of store.all('people')) items.push({ label: p.name, sub: `Person · ${p.relation || ''}`, href: '/plan/people', ico: 'users', text: `${p.name} ${p.relation || ''}` });
  for (const s of STITCHES) items.push({ label: `${s.name} (${s.us}${s.uk !== s.us ? ` / UK ${s.uk}` : ''})`, sub: 'Stitch', href: `/create/stitches/${s.id}`, ico: 'stitch', text: `${s.name} ${s.ukName} ${s.us} ${s.uk}` });
  for (const s of STITCH_PATTERNS) items.push({ label: s.name, sub: 'Stitch pattern', href: `/create/stitches/p/${s.id}`, ico: 'stitch', text: `${s.name} ${s.aka}` });
  for (const [label, href, ico, extra] of ACTIONS) items.push({ label, sub: 'Go to', href, ico, text: `${label} ${extra}`, action: true });
  return items;
}

function score(item, words) {
  const text = item.text.toLowerCase();
  const label = item.label.toLowerCase();
  let s = 0;
  for (const w of words) {
    if (!text.includes(w)) return -1;
    s += label.startsWith(w) ? 6 : label.includes(w) ? 3 : 1;
  }
  return s + (item.action ? 0.5 : 0);
}

let open = false;

export function openSearch() {
  if (open) return;
  open = true;
  const all = index();
  let results = [];
  let active = 0;
  const list = h('div.list', { role: 'listbox', style: { maxHeight: '56vh', overflow: 'auto', marginTop: '10px' } });
  const inp = h('input', { type: 'search', placeholder: 'Search projects, patterns, yarn, stitches… or jump to a tool', 'aria-label': 'Search', autocomplete: 'off', style: { fontSize: '17px', minHeight: '48px' } });
  const dlg = h('dialog.modal.wide', { 'aria-label': 'Search' }, h('div.modal-body', { style: { paddingTop: '18px' } }, h('div.search', icon('search'), inp), list,
    h('p.muted', { style: { fontSize: '12px', margin: '10px 2px 0' } }, '↑ ↓ to move · Enter to open · Esc to close')));
  const close = () => {
    open = false;
    dlg.close();
    dlg.remove();
  };
  const choose = (item) => {
    close();
    if (item) go(item.href);
  };
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    results = words.length
      ? all.map((it) => [it, score(it, words)]).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([it]) => it)
      : all.filter((it) => it.action).slice(0, 8);
    active = Math.min(active, Math.max(0, results.length - 1));
    mount(list, results.length ? results.map((it, i) => h('button.list-row.link', {
      type: 'button', role: 'option', 'aria-selected': i === active ? 'true' : 'false',
      style: { border: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', background: i === active ? 'var(--accent-soft)' : 'none' },
      onClick: () => choose(it),
      onMouseenter: () => { active = i; },
    }, icon(it.ico), h('div.grow', h('div.title.ellipsis', it.label), h('div.meta', it.sub)), icon('chevron-right')))
      : h('div.list-row.muted', 'Nothing matches.'));
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  inp.addEventListener('input', () => { active = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(results.length - 1, active + 1); draw(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
    if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  draw();
  inp.focus();
}

export function installSearchKeys() {
  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches?.('input, textarea, select, [contenteditable]');
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      openSearch();
    } else if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      openSearch();
    }
  });
}

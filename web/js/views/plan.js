// Plan: projects, stash, hooks and notions, calculators, shopping list.

import { h, mount, btn, iconBtn, field, input, numberInput, select, textarea, segmented, pageHead, subnav, modal, confirmDialog, toast, empty, stat, menu } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { debounce, dateInput, parseDateInput, daysUntil, duration, money, fmt, copyText, plural } from '../core/util.js';
import { hexDelta, colorFamily, FAMILIES, colorName } from '../crochet/color.js';
import {
  YARN_WEIGHTS, HOOKS, STEEL_HOOKS, compareGauge, startingChain, distribute, yardageFromSwatch, quickYardage,
  skeinsNeeded, substitute, pricing, BLANKETS, HEADS, SCARVES, FABRICS,
} from '../crochet/calc.js';
import {
  STATUSES, statusChip, statusName, CATEGORIES, photo, addPhotos, coverId, projectProgress, progressBar, yarnName, yarnYards,
  allocated, hookText, weightName, backLink, unitLabel, len, yardsText, estimates,
} from './common.js';

const TABS = [
  ['#/plan/projects', 'Projects', 'board'],
  ['#/plan/stash', 'Stash', 'yarn'],
  ['#/plan/hooks', 'Hooks & notions', 'hook'],
  ['#/plan/people', 'People', 'users'],
  ['#/plan/sales', 'Sales', 'tag'],
  ['#/plan/calc', 'Calculators', 'calculator'],
  ['#/plan/shopping', 'Shopping', 'bag'],
];

export async function render(root, route) {
  const [tab = 'projects', id] = route.parts;
  if (tab === 'projects' && id === 'new') {
    const p = await store.put('projects', { name: 'Untitled project', status: route.query.status || 'queued', patternId: route.query.pattern || null, counters: [], photoIds: [], yarns: [] });
    go(`/plan/projects/${p.id}`, { replace: true });
    return null;
  }
  if (tab === 'projects' && id) return projectDetail(root, id);
  root.append(
    pageHead('Plan', 'What you’re making, what you’ll need, and what it all comes to.'),
    subnav(TABS, `#/plan/${tab}`),
  );
  const body = h('div');
  root.append(body);
  switch (tab) {
    case 'stash': return stashTab(body);
    case 'hooks': return hooksTab(body);
    case 'calc': return calcTab(body);
    case 'shopping': return shoppingTab(body);
    case 'people': return (await import('./people.js')).peopleTab(body);
    case 'sales': return (await import('./sales.js')).salesTab(body);
    default: return projectsTab(body);
  }
}

// ---------------------------------------------------------------------------
// Projects board
// ---------------------------------------------------------------------------

function projectsTab(root) {
  let query = '';
  let mobileStatus = 'active';
  const search = h('div.search', icon('search'), input({ type: 'search', placeholder: 'Search projects', 'aria-label': 'Search projects', onInput: (e) => { query = e.target.value.toLowerCase(); draw(); } }));
  const bar = h('div.row.wrap', { style: { marginBottom: '14px' } },
    h('div.grow', { style: { maxWidth: '360px' } }, search),
    btn('New project', () => go('/plan/projects/new'), { kind: 'primary', ico: 'plus' }));
  const content = h('div');
  root.append(bar, content);

  function card(p) {
    const prog = projectProgress(p);
    const d = p.deadline ? daysUntil(p.deadline) : null;
    const cid = coverId(p);
    const el = h('a.proj-card', { href: `#/plan/projects/${p.id}`, draggable: 'true', dataset: { id: p.id } },
      cid ? h('div.cover', photo(cid)) : null,
      h('div.name', p.name),
      prog.pct !== null && p.status !== 'done' ? progressBar(prog.pct) : null,
      h('div.meta',
        p.category ? h('span', p.category) : null,
        p.recipient ? h('span', `for ${p.recipient}`) : null,
        d !== null && p.status !== 'done' ? h('span.chip', { class: d < 0 ? 'err' : d <= 7 ? 'warn' : '' }, icon('calendar'), d < 0 ? `${-d}d late` : `${d}d`) : null,
        p.timeMs ? h('span', duration(p.timeMs)) : null));
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', p.id);
      e.dataTransfer.effectAllowed = 'move';
    });
    return el;
  }

  function draw() {
    const all = store.all('projects').filter((p) => !query || `${p.name} ${p.category || ''} ${p.recipient || ''} ${(p.tags || []).join(' ')}`.toLowerCase().includes(query));
    if (!store.all('projects').length) {
      mount(content, empty('board', 'No projects yet', 'Plan your first make: pick a pattern, pull yarn from your stash, set a deadline.', btn('New project', () => go('/plan/projects/new'), { kind: 'primary', ico: 'plus' })));
      return;
    }
    const board = h('div.board', STATUSES.map(([st, label]) => {
      const items = all.filter((p) => (p.status || 'queued') === st);
      const col = h('div.board-col', { dataset: { status: st } },
        h('div.board-col-head', h('span.row', h('span.status-dot', { class: `st-${st}` }), label), h('span.count', String(items.length))),
        items.map(card),
        st === 'idea' || st === 'queued' ? btn('Add', () => go(`/plan/projects/new?status=${st}`), { kind: 'ghost', small: true, ico: 'plus' }) : null);
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain');
        const p = store.get('projects', id);
        if (p && p.status !== st) await setStatus(p, st);
      });
      return col;
    }));
    const counts = Object.fromEntries(STATUSES.map(([st]) => [st, all.filter((p) => (p.status || 'queued') === st).length]));
    const mobile = h('div.board-mobile',
      h('div.chips', { style: { marginBottom: '12px' } }, STATUSES.map(([st, label]) => h('button.chip', { class: mobileStatus === st ? 'on' : '', onClick: () => { mobileStatus = st; draw(); } }, `${label} ${counts[st]}`))),
      h('div.stack', all.filter((p) => (p.status || 'queued') === mobileStatus).map(card)),
      counts[mobileStatus] ? null : h('p.muted', `Nothing ${statusName(mobileStatus).toLowerCase()}.`));
    mount(content, board, mobile);
  }
  draw();
  return store.on('projects', draw);
}

async function setStatus(p, status) {
  const patch = { ...p, status };
  if (status === 'active' && !p.startedAt) patch.startedAt = Date.now();
  if (status === 'done' && !p.finishedAt) patch.finishedAt = Date.now();
  await store.put('projects', patch);
  if (status === 'done') {
    toast(`Finished “${p.name}”. Lovely work.`);
    if ((p.yarns || []).length) offerDeduct(patch);
  }
}

async function offerDeduct(p) {
  const ok = await confirmDialog('Take the yarn out of your stash?', `This subtracts the yardage planned for “${p.name}” from each stash yarn, so your stash stays accurate.`, { ok: 'Update stash' });
  if (!ok) return;
  for (const a of p.yarns || []) {
    const y = store.get('yarns', a.yarnId);
    if (!y || !y.yardsPerSkein) continue;
    const skeins = Math.max(0, (Number(y.skeins) || 0) - (Number(a.yards) || 0) / y.yardsPerSkein);
    await store.put('yarns', { ...y, skeins: Math.round(skeins * 100) / 100 });
  }
  toast('Stash updated.');
}

// ---------------------------------------------------------------------------
// Project detail
// ---------------------------------------------------------------------------

function projectDetail(root, id) {
  let p = store.get('projects', id);
  if (!p) {
    root.append(backLink('#/plan/projects', 'Projects'), empty('alert', 'Project not found', 'It may have been deleted.'));
    return null;
  }
  const save = debounce(async () => { p = await store.put('projects', p, { silent: true }); }, 350);
  const set = (key, value) => { p = { ...p, [key]: value }; save(); };

  const nameInput = h('input.title-input', {
    value: p.name, 'aria-label': 'Project name', maxlength: 120,
    style: { font: '600 28px/1.2 var(--serif)', border: '0', background: 'transparent', padding: '0', minHeight: '0' },
    onInput: (e) => set('name', e.target.value || 'Untitled project'),
  });
  const statusSel = select(STATUSES.map(([v, l]) => [v, l]), p.status, async (v) => {
    save.flush();
    await setStatus(store.get('projects', p.id) || p, v);
    p = store.get('projects', p.id);
    draw();
  }, { 'aria-label': 'Status', style: { width: 'auto' } });

  const actions = h('div.page-actions',
    btn('Work on it', () => { save.flush(); go(`/build/${p.id}`); }, { kind: 'primary', ico: 'play' }),
    btn('Post progress', () => { save.flush(); go(`/post?project=${p.id}`); }, { ico: 'camera' }),
    iconBtn('more', 'More', (e) => menu(e.currentTarget, [
      { label: 'Duplicate', ico: 'copy', run: async () => { const c = await store.put('projects', { ...p, id: null, name: `${p.name} (copy)`, status: 'queued', pos: null, sessions: [], timeMs: 0, photoIds: [], coverId: null, startedAt: null, finishedAt: null }); go(`/plan/projects/${c.id}`); } },
      '-',
      { label: 'Delete project', ico: 'trash', danger: true, run: async () => {
        if (!(await confirmDialog('Delete this project?', `“${p.name}” and its photos will be removed from this device.`, { ok: 'Delete', danger: true }))) return;
        for (const mid of p.photoIds || []) await store.removeMedia(mid);
        await store.remove('projects', p.id);
        go('/plan/projects');
      } },
    ])));

  const body = h('div');
  root.append(backLink('#/plan/projects', 'Projects'),
    h('header.page-head', h('div.grow', nameInput, h('div.row.wrap', { style: { marginTop: '8px' } }, statusSel)), actions),
    body);

  function draw() {
    const prog = projectProgress(p);
    const patterns = store.all('patterns');
    mount(body, h('div.cols',
      h('div.stack',
        overviewCard(patterns),
        yarnCard(),
        h('div.card', h('h3', 'Notes'), textarea(p.notes, (v) => set('notes', v), { rows: 5, placeholder: 'Modifications, who it’s for, what you’d change next time…', 'aria-label': 'Notes' }))),
      h('div.stack',
        progressCard(prog),
        photosCard(),
        moneyCard())));
  }

  function overviewCard(patterns) {
    const patSel = select([['', 'No pattern (free-form)'], ...patterns.map((x) => [x.id, x.title || 'Untitled pattern'])], p.patternId || '', (v) => { set('patternId', v || null); save.flush(); setTimeout(draw, 400); });
    const hooks = store.all('tools').filter((t) => t.kind === 'hook').sort((a, b) => a.mm - b.mm);
    const hookOpts = [['', '—'], ...HOOKS.map((x) => [x.mm, `${x.mm} mm${x.us !== '—' ? ` · ${x.us}` : ''}${hooks.some((o) => o.mm === x.mm) ? '  ✓ owned' : ''}`])];
    return h('div.card',
      h('div.card-head', h('h3', 'Overview'), p.patternId ? h('a.btn.small.ghost', { href: `#/create/patterns/${p.patternId}` }, icon('book'), 'Open pattern') : h('a.btn.small.ghost', { href: '#/create/patterns/new' }, icon('plus'), 'Write one')),
      h('div.fields',
        field('Pattern', patSel),
        (() => {
          const pat = p.patternId ? store.get('patterns', p.patternId) : null;
          if (!pat || (pat.sizes || []).length < 2) return null;
          return field('Size', select(pat.sizes.map((n, i) => [i, n]), p.sizeIndex ?? 0, (v) => { set('sizeIndex', Number(v)); save.flush(); setTimeout(draw, 300); }));
        })(),
        field('Category', select([['', '—'], ...CATEGORIES.map((c) => [c, c])], p.category || '', (v) => set('category', v))),
        field('Hook', select(hookOpts, p.hookMm || '', (v) => set('hookMm', v ? Number(v) : null))),
        field('Made for', h('div',
          input({ value: p.recipient || '', placeholder: 'Me, a gift, a customer…', list: 'people-list', onInput: (e) => set('recipient', e.target.value) }),
          h('datalist', { id: 'people-list' }, store.all('people').map((x) => h('option', { value: x.name }))))),
        field('Due', input({ type: 'date', value: dateInput(p.deadline), onChange: (e) => set('deadline', parseDateInput(e.target.value)) })),
        field('Started', input({ type: 'date', value: dateInput(p.startedAt), onChange: (e) => set('startedAt', parseDateInput(e.target.value)) })),
        field('Finished size', input({ value: p.size || '', placeholder: `e.g. 40 × 50 ${unitLabel()}`, onInput: (e) => set('size', e.target.value) })),
        field('Tags', input({ value: (p.tags || []).join(', '), placeholder: 'gift, market, wip', onInput: (e) => set('tags', e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)) }))));
  }

  function progressCard(prog) {
      const pat = prog.pattern;
    let eta = null;
    if (pat && prog.parsed) {
      const rest = prog.parsed.steps.slice(prog.done).reduce((a, s) => a + (s.count || 0), 0);
      const est = estimates(pat, prog.parsed);
      const perSt = prog.parsed.stitches ? est.minutes / prog.parsed.stitches : 0;
      eta = rest * perSt;
    }
    return h('div.card',
      h('div.card-head', h('h3', 'Progress'), statusChip(p.status)),
      prog.pct !== null ? h('div.stack.tight',
        h('div.row', progressBar(prog.pct), h('b.num', `${Math.round(prog.pct * 100)}%`)),
        prog.step ? h('div.soft', { style: { fontSize: '14px' } }, `Next: ${prog.step.part} · ${prog.step.label}${prog.step.pieces > 1 ? ` (piece ${prog.step.piece}/${prog.step.pieces})` : ''}`) : null,
        h('div.muted', { style: { fontSize: '13px' } }, `${prog.done} of ${prog.total} rows${eta ? ` · about ${duration(eta * 60000)} to go at your pace` : ''}`))
        : h('p.muted', 'Link a pattern to track rows. Counters work either way.'),
      h('hr'),
      h('div.stats', stat('Time', duration(p.timeMs || 0), `${(p.sessions || []).length} sessions`), stat('Counters', String((p.counters || []).length), (p.counters || []).map((c) => `${c.name} ${c.value}`).join(', ') || 'none')),
      h('div.btn-row', { style: { marginTop: '12px' } }, btn('Open row tracker', () => { save.flush(); go(`/build/${p.id}`); }, { ico: 'counter', small: true }),
        btn('Log time', async () => {
          const mins = await askNumber('Log time by hand', 'Minutes', 30);
          if (!mins) return;
          const end = Date.now();
          p = { ...p, timeMs: (p.timeMs || 0) + mins * 60000, sessions: [...(p.sessions || []), { start: end - mins * 60000, end }] };
          save.flush();
          draw();
        }, { ico: 'clock', small: true, kind: 'ghost' })));
  }

  function photosCard() {
    const ids = p.photoIds || [];
    return h('div.card',
      h('div.card-head', h('h3', 'Photos'), btn('Add', async () => {
        const added = await addPhotos();
        if (!added.length) return;
        p = { ...p, photoIds: [...(p.photoIds || []), ...added] };
        save.flush();
        draw();
      }, { ico: 'camera', small: true })),
      ids.length ? h('div.attach-grid', ids.map((mid) => h('div.ph', { title: p.coverId === mid ? 'Cover photo' : '' },
        photo(mid, { alt: 'Project photo' }),
        h('button', { type: 'button', 'aria-label': 'Photo options', onClick: (e) => menu(e.currentTarget, [
          { label: 'Use as cover', ico: 'star', run: () => { p = { ...p, coverId: mid }; save.flush(); draw(); } },
          { label: 'Remove photo', ico: 'trash', danger: true, run: async () => { p = { ...p, photoIds: ids.filter((x) => x !== mid), coverId: p.coverId === mid ? null : p.coverId }; save.flush(); await store.removeMedia(mid); draw(); } },
        ]) }, icon('more')))))
        : h('p.muted', 'Progress shots make the best posts, and the best memories.'));
  }

  function yarnCard() {
    const yarns = store.all('yarns');
    const rows = (p.yarns || []).map((a, i) => {
      const y = store.get('yarns', a.yarnId);
      const have = y ? yarnYards(y) : 0;
      const promised = y ? allocated(y.id) : 0;
      const short = y && (p.status === 'queued' || p.status === 'active') && promised > have;
      return h('div.list-row',
        y ? h('span.swatch', { style: { '--c': y.hex || '#ccc', width: '28px', height: '28px' } }) : icon('alert'),
        h('div.grow', h('div.title.ellipsis', y ? yarnName(y) : 'Missing yarn'), h('div.meta', y ? `${weightName(y.weight)} · ${yardsText(have)} in stash${short ? ` · short ${yardsText(promised - have)} across projects` : ''}` : 'Removed from stash')),
        h('div', { style: { width: '110px' } }, h('div.input-group', numberInput(a.yards, (v) => {
          const next = (p.yarns || []).slice();
          next[i] = { ...a, yards: v || 0 };
          set('yarns', next);
        }, { 'aria-label': 'Yards needed', min: 0 }), h('span.addon', 'yd'))),
        iconBtn('x', 'Remove yarn', () => { set('yarns', (p.yarns || []).filter((_, k) => k !== i)); save.flush(); draw(); }));
    });
    const total = (p.yarns || []).reduce((a, x) => a + (Number(x.yards) || 0), 0);
    const prog = projectProgress(p);
    const est = prog.pattern ? estimates(prog.pattern, prog.parsed) : null;
    return h('div.card',
      h('div.card-head', h('h3', 'Yarn'), btn('From stash', async () => {
        if (!yarns.length) {
          toast('Your stash is empty. Add yarn in Plan → Stash first.');
          return;
        }
        const pick = await chooseYarn(yarns);
        if (!pick) return;
        set('yarns', [...(p.yarns || []), { yarnId: pick.id, yards: est ? Math.round(est.yards) : 100 }]);
        save.flush();
        draw();
      }, { ico: 'plus', small: true })),
      rows.length ? h('div.list', rows) : h('p.muted', 'Pull yarn from your stash to see what you’ll need to buy.'),
      h('div.row.wrap.between', { style: { marginTop: '10px', fontSize: '13.5px' } },
        h('span.soft', `Planned: ${yardsText(total)}`),
        est ? h('span.muted', `Pattern estimate ≈ ${yardsText(est.yards)} (±20%)`) : null));
  }

  function moneyCard() {
    const st = store.settings();
    let materials = 0;
    for (const a of p.yarns || []) {
      const y = store.get('yarns', a.yarnId);
      if (y && y.price && y.yardsPerSkein) materials += (Number(a.yards) || 0) / y.yardsPerSkein * y.price;
    }
    materials += Number(p.extraCost) || 0;
    const hours = (p.timeMs || 0) / 3600000;
    const pr = pricing({ materials, hours, rate: st.rate || 15, overheadPct: 10, markup: 2 });
    return h('div.card',
      h('div.card-head', h('h3', 'Cost & price'), h('a.btn.small.ghost', { href: '#/plan/calc#pricing' }, icon('calculator'), 'Calculator')),
      h('dl.kv',
        h('dt', 'Yarn used'), h('dd', money(materials - (Number(p.extraCost) || 0), st.currency)),
        h('dt', 'Other materials'), h('dd', h('div.input-group', { style: { maxWidth: '140px' } }, h('span.addon', { style: { borderRadius: '8px 0 0 8px', borderLeft: '1px solid var(--line-2)', borderRight: 0 } }, st.currency), numberInput(p.extraCost, (v) => { set('extraCost', v || 0); }, { style: { borderRadius: '0 8px 8px 0' }, 'aria-label': 'Other materials cost' }))),
        h('dt', 'Your time'), h('dd', `${fmt(hours, 1)} h at ${money(st.rate || 15, st.currency)}/h`),
        h('dt', 'Wholesale'), h('dd', money(pr.wholesale, st.currency)),
        h('dt', 'Retail'), h('dd', h('b', money(pr.retail, st.currency)))),
      h('p.muted', { style: { fontSize: '12.5px', marginTop: '10px' } }, 'Materials + labour + 10% overhead = wholesale; retail is double. Set your hourly rate in Settings.'),
      p.status === 'done' ? h('div.row.wrap', { style: { marginTop: '10px' } },
        p.sale?.sold ? h('span.chip.sage', icon('check'), `Sold for ${money(Number(p.sale.sold.price) || 0, st.currency)}`)
          : p.sale?.forSale ? h('span.chip.accent', icon('tag'), `For sale at ${money(Number(p.sale.price) || 0, st.currency)}`) : null,
        btn(p.sale?.forSale ? 'Edit sale' : 'Put up for sale', async () => {
          save.flush();
          const { saleModal } = await import('./sales.js');
          await saleModal(store.get('projects', p.id) || p);
          p = store.get('projects', p.id) || p;
          draw();
        }, { small: true, ico: 'tag' })) : null);
  }

  draw();
  return () => save.flush();
}

async function askNumber(title, label, value) {
  let v = value;
  const res = await modal({
    title,
    body: field(label, numberInput(value, (x) => { v = x; }, { min: 0 })),
    actions: [{ label: 'Cancel', value: null, kind: 'ghost' }, { label: 'Save', run: () => v, kind: 'primary' }],
  });
  return res ? Number(res) : null;
}

function chooseYarn(yarns) {
  return modal({
    title: 'Pick yarn from your stash',
    body: (close) => h('div.list', yarns.map((y) => h('button.list-row.link', {
      type: 'button', style: { border: 0, background: 'none', textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' },
      onClick: () => close(y),
    }, h('span.swatch', { style: { '--c': y.hex || '#ccc', width: '28px', height: '28px' } }),
    h('div.grow', h('div.title', yarnName(y)), h('div.meta', `${weightName(y.weight)} · ${yardsText(yarnYards(y) - allocated(y.id))} free`))))),
  });
}

// ---------------------------------------------------------------------------
// Stash
// ---------------------------------------------------------------------------

function stashTab(root) {
  let q = '';
  let weight = 'all';
  let family = null;
  let sort = 'recent';
  const content = h('div');
  const search = h('div.search', icon('search'), input({ type: 'search', placeholder: 'Search brand, color, fiber, bin…', 'aria-label': 'Search stash', onInput: (e) => { q = e.target.value.toLowerCase(); draw(); } }));
  root.append(content);

  function draw() {
    const all = store.all('yarns');
    const totalYards = all.reduce((a, y) => a + yarnYards(y), 0);
    const skeins = all.reduce((a, y) => a + (Number(y.skeins) || 0), 0);
    const value = all.reduce((a, y) => a + (Number(y.skeins) || 0) * (Number(y.price) || 0), 0);
    const grams = all.reduce((a, y) => a + (Number(y.skeins) || 0) * (Number(y.gramsPerSkein) || 0), 0);
    let list = all.filter((y) => {
      if (weight !== 'all' && String(y.weight) !== String(weight)) return false;
      if (family && colorFamily(y.hex || '#888888') !== family) return false;
      if (q && !`${yarnName(y)} ${y.fiber || ''} ${y.location || ''} ${y.dyeLot || ''} ${colorName(y.hex || '#888888')}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'yards') list.sort((a, b) => yarnYards(b) - yarnYards(a));
    else if (sort === 'color') list.sort((a, b) => hue(a.hex) - hue(b.hex));
    else if (sort === 'name') list.sort((a, b) => yarnName(a).localeCompare(yarnName(b)));
    const st = store.settings();
    const weightsPresent = [...new Set(all.map((y) => y.weight).filter((w) => w !== undefined && w !== null && w !== ''))].sort();
    mount(content, 
      h('div.stats.card', { style: { marginBottom: '14px' } },
        stat('Yarns', String(all.length)),
        stat('Skeins', fmt(skeins, 1)),
        stat('Length', yardsText(totalYards)),
        stat('Weight', `${fmt(grams / 1000, 2)} kg`),
        stat('Value', money(value, st.currency))),
      h('div.row.wrap', { style: { marginBottom: '10px' } },
        h('div.grow', { style: { maxWidth: '360px' } }, search),
        select([['recent', 'Recently added'], ['color', 'By color'], ['yards', 'Most yardage'], ['name', 'By name']], sort, (v) => { sort = v; draw(); }, { style: { width: 'auto' }, 'aria-label': 'Sort' }),
        btn('Match a color', () => matchColor(), { ico: 'pipette' }),
        btn('Add yarn', async () => { await yarnModal(); }, { kind: 'primary', ico: 'plus' })),
      h('div.row.wrap', { style: { marginBottom: '14px', gap: '6px' } },
        segmented([['all', 'All'], ...weightsPresent.map((w) => [String(w), YARN_WEIGHTS[w]?.name || String(w)])], String(weight), (v) => { weight = v; draw(); }, { small: true, label: 'Weight' }),
        h('div.chips', FAMILIES.map((f) => h('button.chip', { class: family === f ? 'on' : '', onClick: () => { family = family === f ? null : f; draw(); }, title: f }, h('span.swatch', { style: { '--c': familyHex(f), width: '10px', height: '10px' } }), f)))),
      all.length === 0
        ? empty('yarn', 'Your stash is empty', 'Add yarn once and every project, palette and calculator can use it.', btn('Add yarn', () => yarnModal(), { kind: 'primary', ico: 'plus' }))
        : list.length === 0 ? h('p.muted', 'No yarn matches those filters.')
          : h('div.grid', list.map((y) => {
            const free = yarnYards(y) - allocated(y.id);
            return h('div.card.link', { onClick: () => yarnModal(y), tabindex: 0, role: 'button', onKeydown: (e) => { if (e.key === 'Enter') yarnModal(y); } },
              h('div.yarn-card',
                h('div.yarn-ball', { style: { '--c': y.hex || '#cccccc' } }),
                h('div', { style: { minWidth: 0 } },
                  h('div.title.ellipsis', { style: { fontWeight: 650 } }, y.colorway || colorName(y.hex || '#888888')),
                  h('div.muted.ellipsis', { style: { fontSize: '13px' } }, [y.brand, y.line].filter(Boolean).join(' ') || '—'),
                  h('div.chips', { style: { marginTop: '6px' } },
                    y.weight !== undefined && y.weight !== '' ? h('span.chip', YARN_WEIGHTS[y.weight]?.name || y.weight) : null,
                    h('span.chip', { class: free < 0 ? 'err' : '' }, `${fmt(Number(y.skeins) || 0, 2)} sk · ${yardsText(yarnYards(y))}`),
                    y.location ? h('span.chip', icon('pin'), y.location) : null))));
          })));
  }

  async function matchColor() {
    let hex = '#b4481f';
    const out = h('div.stack');
    const run = () => {
      const all = store.all('yarns').filter((y) => y.hex);
      const ranked = all.map((y) => ({ y, d: hexDelta(hex, y.hex) })).sort((a, b) => a.d - b.d).slice(0, 5);
      mount(out, ranked.length ? h('div.list', ranked.map(({ y, d }) => h('div.list-row',
        h('span.swatch', { style: { '--c': y.hex, width: '30px', height: '30px' } }),
        h('div.grow', h('div.title', yarnName(y)), h('div.meta', `${yardsText(yarnYards(y))} in stash`)),
        h('span.chip', { class: d < 5 ? 'sage' : d < 12 ? 'mustard' : '' }, d < 2.3 ? 'Identical' : d < 5 ? 'Very close' : d < 12 ? 'Similar' : `ΔE ${fmt(d, 0)}`)))) : h('p.muted', 'Add yarn with colors to your stash first.'));
    };
    await modal({
      title: 'Which of my yarns is closest?',
      body: () => {
        run();
        return h('div.stack', h('div.row', h('input', { type: 'color', value: hex, onInput: (e) => { hex = e.target.value; run(); }, 'aria-label': 'Color to match' }), h('span.soft', 'Pick a color, from a pattern photo or a paint chip.')), out);
      },
    });
  }

  draw();
  return store.on('yarns', draw);
}

function hue(hex) {
  if (!hex) return 999;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.08) return 400 + (1 - max) * 10;
  let hh;
  if (max === r) hh = ((g - b) / (max - min)) % 6;
  else if (max === g) hh = (b - r) / (max - min) + 2;
  else hh = (r - g) / (max - min) + 4;
  return (hh * 60 + 360) % 360;
}

const FAMILY_HEX = { red: '#c62828', orange: '#ef6c00', yellow: '#f9c80e', green: '#4a8c3a', blue: '#2f6690', purple: '#6a4c93', pink: '#e75480', brown: '#7b4a26', grey: '#9a9a9a', black: '#1b1b1b', white: '#f5f5f5' };
const familyHex = (f) => FAMILY_HEX[f];

export async function yarnModal(yarn = null) {
  const y = yarn ? { ...yarn } : { weight: 4, skeins: 1, hex: '#b4481f' };
  const setv = (k) => (e) => { y[k] = e.target.value; };
  const setn = (k) => (v) => { y[k] = v; };
  const res = await modal({
    title: yarn ? 'Edit yarn' : 'Add yarn',
    wide: true,
    body: h('div.stack',
      h('div.fields.wide',
        field('Brand', input({ value: y.brand || '', onInput: setv('brand'), placeholder: 'Maker or mill' })),
        field('Yarn line', input({ value: y.line || '', onInput: setv('line'), placeholder: 'e.g. Worsted Wool' })),
        field('Colorway', input({ value: y.colorway || '', onInput: setv('colorway'), placeholder: 'e.g. Rust' }))),
      h('div.fields',
        field('Color', h('div.row', h('input', { type: 'color', value: y.hex || '#b4481f', onInput: (e) => { y.hex = e.target.value; } }), h('span.muted', { style: { fontSize: '12px' } }, 'Closest match'))),
        field('Weight', select(YARN_WEIGHTS.map((w) => [w.id, `${w.id} ${w.name}`]), y.weight ?? 4, (v) => { y.weight = Number(v); })),
        field('Fiber', input({ value: y.fiber || '', onInput: setv('fiber'), placeholder: 'Wool, cotton…' })),
        field('Dye lot', input({ value: y.dyeLot || '', onInput: setv('dyeLot') }))),
      h('div.fields',
        field('Yards per skein', numberInput(y.yardsPerSkein, setn('yardsPerSkein'), { min: 0 })),
        field('Grams per skein', numberInput(y.gramsPerSkein, setn('gramsPerSkein'), { min: 0 })),
        field('Skeins', numberInput(y.skeins, setn('skeins'), { min: 0, step: '0.25' }), 'Partial skeins are fine'),
        field(`Price per skein (${store.settings().currency})`, numberInput(y.price, setn('price'), { min: 0 }))),
      h('div.fields.wide',
        field('Where it lives', input({ value: y.location || '', onInput: setv('location'), placeholder: 'Bin A, shelf 2…' })),
        field('Notes', input({ value: y.notes || '', onInput: setv('notes') })))),
    actions: [
      yarn ? { label: 'Delete', kind: 'danger', ico: 'trash', value: 'delete' } : null,
      { label: 'Cancel', kind: 'ghost', value: null },
      { label: yarn ? 'Save' : 'Add to stash', kind: 'primary', value: 'save' },
    ].filter(Boolean),
  });
  if (res === 'save') {
    const saved = await store.put('yarns', y);
    toast(yarn ? 'Yarn updated.' : 'Added to your stash.');
    return saved;
  }
  if (res === 'delete' && (await confirmDialog('Delete this yarn?', `${yarnName(yarn)} will be removed from your stash.`, { ok: 'Delete', danger: true }))) {
    await store.remove('yarns', yarn.id);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hooks and notions
// ---------------------------------------------------------------------------

function hooksTab(root) {
  const content = h('div');
  root.append(content);
  function draw() {
    const tools = store.all('tools');
    const hooks = tools.filter((t) => t.kind === 'hook');
    const notions = tools.filter((t) => t.kind === 'notion').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const owned = (mm) => hooks.find((x) => Math.abs(x.mm - mm) < 0.01);
    const pill = (hk, steel = false) => {
      const have = owned(hk.mm);
      return h('button.hook-pill', {
        type: 'button', class: have ? 'have' : '', title: have ? 'You own this size. Tap to edit.' : 'Tap to add this size',
        onClick: () => (have ? hookModal(have) : store.put('tools', { kind: 'hook', mm: hk.mm, qty: 1 })),
      }, h('b', `${hk.mm}`), h('span', steel ? `#${hk.us}` : hk.us !== '—' ? hk.us : 'mm'));
    };
    mount(content, 
      h('div.card',
        h('div.card-head', h('h3', 'Hooks'), h('span.muted', { style: { fontSize: '13px' } }, `${hooks.length} owned · tap a size to add or edit`)),
        h('div.hooks-rail', HOOKS.map((hk) => pill(hk))),
        h('details', { style: { marginTop: '12px' } }, h('summary.muted', { style: { cursor: 'pointer', fontSize: '13.5px' } }, 'Steel hooks for thread'),
          h('div.hooks-rail', { style: { marginTop: '8px' } }, STEEL_HOOKS.map((hk) => pill(hk, true)))),
        hooks.length ? h('div.list', { style: { marginTop: '14px' } }, hooks.sort((a, b) => a.mm - b.mm).map((hk) => h('div.list-row.link', { onClick: () => hookModal(hk) },
          icon('hook'), h('div.grow', h('div.title', hookText(hk.mm)), h('div.meta', [hk.material, hk.brand, hk.qty > 1 ? `×${hk.qty}` : null].filter(Boolean).join(' · ') || 'Tap to add details')),
          icon('chevron-right')))) : null),
      h('div.card', { style: { marginTop: '14px' } },
        h('div.card-head', h('h3', 'Notions'), btn('Add', () => notionModal(), { ico: 'plus', small: true })),
        notions.length ? h('div.list', notions.map((n) => h('div.list-row.link', { onClick: () => notionModal(n) },
          icon('archive'), h('div.grow', h('div.title', n.name), n.notes ? h('div.meta', n.notes) : null),
          h('span.chip', `× ${n.qty ?? 1}`)))) : h('p.muted', 'Stitch markers, safety eyes, fiberfill, needles, buttons, blocking mats…')));
  }
  draw();
  return store.on('tools', draw);
}

async function hookModal(hk) {
  const x = { ...hk };
  const res = await modal({
    title: `${hookText(hk.mm)} hook`,
    body: h('div.fields',
      field('Material', select(['', 'Aluminium', 'Ergonomic', 'Steel', 'Bamboo', 'Wood', 'Plastic', 'Resin', 'Tunisian'].map((m) => [m, m || '—']), x.material || '', (v) => { x.material = v; })),
      field('Brand', input({ value: x.brand || '', onInput: (e) => { x.brand = e.target.value; } })),
      field('How many', numberInput(x.qty ?? 1, (v) => { x.qty = v; }, { min: 1, step: 1 }))),
    actions: [{ label: 'Remove', kind: 'danger', value: 'delete', ico: 'trash' }, { label: 'Cancel', kind: 'ghost', value: null }, { label: 'Save', kind: 'primary', value: 'save' }],
  });
  if (res === 'save') await store.put('tools', x);
  if (res === 'delete') await store.remove('tools', hk.id);
}

async function notionModal(n = null) {
  const x = n ? { ...n } : { kind: 'notion', qty: 1 };
  const res = await modal({
    title: n ? 'Edit notion' : 'Add a notion',
    body: h('div.stack',
      field('What', input({ value: x.name || '', placeholder: 'e.g. Safety eyes, 10 mm', onInput: (e) => { x.name = e.target.value; } })),
      h('div.fields', field('How many', numberInput(x.qty ?? 1, (v) => { x.qty = v; }, { min: 0 })), field('Notes', input({ value: x.notes || '', onInput: (e) => { x.notes = e.target.value; } })))),
    actions: [n ? { label: 'Delete', kind: 'danger', value: 'delete', ico: 'trash' } : null, { label: 'Cancel', kind: 'ghost', value: null }, { label: 'Save', kind: 'primary', value: 'save' }].filter(Boolean),
  });
  if (res === 'save' && x.name) await store.put('tools', x);
  if (res === 'delete') await store.remove('tools', n.id);
}

// ---------------------------------------------------------------------------
// Calculators
// ---------------------------------------------------------------------------

function calcTab(root) {
  const u = unitLabel();
  const per = u === 'cm' ? 10 : 4;
  const perText = `per ${per} ${u}`;
  const st = store.settings();

  // A calculator card: inputs on top, a live result below.
  function calc(id, title, sub, inputs, compute) {
    const out = h('div.well', { style: { marginTop: '12px' } });
    const refresh = () => {
      try {
        mount(out, ...[compute()].flat().filter(Boolean));
      } catch (err) {
        mount(out, h('span.muted', err.message));
      }
    };
    const card = h('section.card', { id },
      h('h3', title), sub ? h('p.muted', { style: { fontSize: '13.5px' } }, sub) : null,
      inputs(refresh), out);
    refresh();
    return card;
  }
  const num = (obj, key, label, attrs = {}, hint = null) => (refresh) => field(label, numberInput(obj[key], (v) => { obj[key] = v; refresh(); }, attrs), hint);
  const group = (...parts) => (refresh) => h('div.fields', parts.map((p) => p(refresh)));
  const result = (big, sub) => [h('div.result', big), sub ? h('div.result-sub', sub) : null];

  const g = { patternSts: 16, patternRows: 18, mySts: 17, myRows: 18, hook: 5 };
  const r = { width: u === 'cm' ? 120 : 48, height: u === 'cm' ? 150 : 60, sts: 14, rows: 16, multiple: 1, plus: 0, turning: 1 };
  const d = { current: 60, change: 9, round: true, stitch: 'sc' };
  const sw = { sw: per, sh: per, grams: 8, tw: u === 'cm' ? 120 : 48, th: u === 'cm' ? 150 : 60, pieces: 1, ypk: 200, gpk: 100 };
  const qk = { preset: 'Throw', w: 50, h: 60, weight: 4, fabric: 'sc', ypk: 200 };
  const sub = { patYards: 200, patGrams: 100, patSkeins: 6, subYards: 220, subGrams: 100 };
  const pr = { materials: 24, hours: 12, rate: st.rate || 15, overhead: 10, markup: 2 };
  const yarnId = { wpi: 10, yards: 200, grams: 100 };

  root.append(h('div.grid.two',
    calc('gauge', 'Gauge check', `Stitches and rows ${perText}, from the pattern and from your swatch.`,
      (refresh) => h('div.stack.tight',
        group(num(g, 'patternSts', 'Pattern sts'), num(g, 'patternRows', 'Pattern rows'), num(g, 'mySts', 'Your sts'), num(g, 'myRows', 'Your rows'))(refresh),
        h('div.fields', field('Your hook', select(HOOKS.map((x) => [x.mm, `${x.mm} mm`]), g.hook, (v) => { g.hook = Number(v); refresh(); })))),
      () => {
        const c = compareGauge({ patternSts: g.patternSts, patternRows: g.patternRows, mySts: g.mySts, myRows: g.myRows, hookMm: g.hook });
        if (!c.advice) return h('span.muted', 'Fill in both gauges.');
        return [
          h('div.result', c.advice),
          c.suggestedHook ? h('div.result-sub', `Try a ${hookText(c.suggestedHook)} hook and swatch again.`) : null,
          c.widthScale ? h('div.result-sub', `At your gauge the piece comes out ${fmt(c.widthScale * 100, 0)}% as wide${c.heightScale ? ` and ${fmt(c.heightScale * 100, 0)}% as tall` : ''}: a 20 ${u} width becomes ${fmt(20 * c.widthScale, 1)} ${u}.`) : null,
        ];
      }),
    calc('resize', 'Size to stitches', 'How many stitches and rows for a size, with a stitch multiple and your starting chain.',
      (refresh) => h('div.stack.tight',
        group(num(r, 'width', `Width (${u})`), num(r, 'height', `Length (${u})`), num(r, 'sts', `Sts ${perText}`), num(r, 'rows', `Rows ${perText}`))(refresh),
        group(num(r, 'multiple', 'Multiple of', { min: 1, step: 1 }), num(r, 'plus', 'Plus', { min: 0, step: 1 }), num(r, 'turning', 'Turning ch', { min: 0, step: 1 }))(refresh)),
      () => {
        const c = startingChain({ width: r.width, gaugeSts: r.sts, gaugePer: per, multiple: r.multiple || 1, plus: r.plus || 0, turning: r.turning || 0 });
        const rows = Math.round((r.height * r.rows) / per);
        return result(`Chain ${c.chain} · ${c.sts} sts × ${rows} rows`, `${c.repeats} repeat${c.repeats === 1 ? '' : 's'} of ${r.multiple || 1}${r.plus ? ` + ${r.plus}` : ''}. Actual width ≈ ${fmt(c.actual, 1)} ${u}.`);
      }),
    calc('even', 'Increase or decrease evenly', 'Spread shaping across a row or round, written out and ready to paste.',
      (refresh) => h('div.stack.tight',
        group(num(d, 'current', 'Stitches now', { min: 1, step: 1 }), num(d, 'change', 'Change by (−/+)', { step: 1 }))(refresh),
        h('div.row.wrap', segmented([['round', 'Round'], ['row', 'Row']], d.round ? 'round' : 'row', (v) => { d.round = v === 'round'; refresh(); }, { small: true }),
          segmented([['sc', 'sc'], ['hdc', 'hdc'], ['dc', 'dc']], d.stitch, (v) => { d.stitch = v; refresh(); }, { small: true }))),
      () => {
        const res = distribute(d.current || 0, d.change || 0, { round: d.round, stitch: d.stitch });
        if (res.error) return h('span', { style: { color: 'var(--err)' } }, res.error);
        const text = `${res.text} (${res.to})`;
        return [h('div', { style: { font: '600 17px/1.5 var(--mono)' } }, text),
          h('div.row', { style: { marginTop: '8px' } }, btn('Copy', async () => { await copyText(text); toast('Copied.'); }, { small: true, ico: 'copy' }), h('span.result-sub', `${res.from} → ${res.to} stitches`))];
      }),
    calc('swatch', 'Yardage from a swatch', 'Weigh a swatch in your yarn and stitch. The most accurate estimate short of making it.',
      (refresh) => h('div.stack.tight',
        group(num(sw, 'sw', `Swatch width (${u})`), num(sw, 'sh', `Swatch height (${u})`), num(sw, 'grams', 'Swatch weight (g)'))(refresh),
        group(num(sw, 'tw', `Project width (${u})`), num(sw, 'th', `Project length (${u})`), num(sw, 'pieces', 'Pieces', { min: 1, step: 1 }))(refresh),
        group(num(sw, 'ypk', 'Yards / skein'), num(sw, 'gpk', 'Grams / skein'))(refresh)),
      () => {
        const res = yardageFromSwatch({ swatchW: sw.sw, swatchH: sw.sh, swatchGrams: sw.grams, targetW: sw.tw, targetH: sw.th, pieces: sw.pieces || 1, yardsPerSkein: sw.ypk, gramsPerSkein: sw.gpk });
        if (!res) return h('span.muted', 'Enter the swatch size and weight.');
        return result(`${Math.round(res.grams)} g${res.yards ? ` · ${yardsText(res.yards)}` : ''}`, res.skeins ? `${skeinsNeeded(res.grams, sw.gpk, 0.1)} skeins with a 10% safety margin (${fmt(res.skeins, 2)} exact).` : null);
      }),
    calc('quick', 'Quick yardage estimate', 'No swatch yet? A ballpark from size, yarn weight and stitch.',
      (refresh) => h('div.stack.tight',
        h('div.fields',
          field('Size', select([...BLANKETS, ...SCARVES].map((b) => [b.name, `${b.name} (${b.w}×${b.h} in)`]).concat([['custom', 'Custom']]), qk.preset, (v) => {
            qk.preset = v;
            const b = [...BLANKETS, ...SCARVES].find((x) => x.name === v);
            if (b) { qk.w = b.w; qk.h = b.h; }
            refresh();
          })),
          field('Yarn weight', select(YARN_WEIGHTS.map((w) => [w.id, `${w.id} ${w.name}`]), qk.weight, (v) => { qk.weight = Number(v); refresh(); })),
          field('Stitch', select(FABRICS, qk.fabric, (v) => { qk.fabric = v; refresh(); }))),
        group(num(qk, 'w', 'Width (in)'), num(qk, 'h', 'Length (in)'), num(qk, 'ypk', 'Yards / skein'))(refresh)),
      () => {
        const q = quickYardage({ widthIn: qk.w, heightIn: qk.h, weightId: qk.weight, fabric: qk.fabric });
        return result(`${yardsText(q.low)} – ${yardsText(q.high)}`, qk.ypk ? `Plan on ${skeinsNeeded(q.high, qk.ypk, 0)} skeins of ${qk.ypk} yd to be safe.` : null);
      }),
    calc('substitute', 'Yarn substitution', 'Swapping the pattern’s yarn for another? Get skeins, and a thickness sanity check.',
      (refresh) => h('div.stack.tight',
        group(num(sub, 'patYards', 'Pattern yd / skein'), num(sub, 'patGrams', 'Pattern g / skein'), num(sub, 'patSkeins', 'Pattern skeins'))(refresh),
        group(num(sub, 'subYards', 'Your yd / skein'), num(sub, 'subGrams', 'Your g / skein'))(refresh)),
      () => {
        const s = substitute(sub);
        const tone = { good: 'Good match', close: 'Close: swatch first', poor: 'Different thickness: expect a different fabric' }[s.match];
        return result(`${s.skeins} skeins (${yardsText(s.totalYards)})`, s.match ? `${tone} — yards per gram differ by ${fmt(Math.abs(s.densityDiffPct), 0)}%.` : null);
      }),
    calc('wpi', 'What weight is this yarn?', 'Wrap it snugly around a ruler for an inch and count the wraps, or use the label’s yards and grams.',
      (refresh) => group(num(yarnId, 'wpi', 'Wraps per inch'), num(yarnId, 'yards', 'Yards on the label'), num(yarnId, 'grams', 'Grams on the label'))(refresh),
      () => {
        // Weights are ordered finest first, so the first minimum you reach is the answer.
        const byWpi = yarnId.wpi ? YARN_WEIGHTS.find((w) => yarnId.wpi >= w.wpi[0]) || YARN_WEIGHTS[7] : null;
        const per100 = yarnId.yards && yarnId.grams ? (yarnId.yards / yarnId.grams) * 100 : null;
        const byLen = per100 ? YARN_WEIGHTS.find((w) => per100 >= w.ypc[0]) || YARN_WEIGHTS[7] : null;
        if (!byWpi && !byLen) return h('span.muted', 'Enter wraps per inch, or yards and grams.');
        return [
          byWpi ? h('div.result', `${byWpi.id} · ${byWpi.name}`, h('span.muted', { style: { fontSize: '14px', fontFamily: 'var(--sans)' } }, ` by wraps (${byWpi.aka})`)) : null,
          byLen ? h('div.result-sub', `${Math.round(per100)} yd per 100 g suggests ${byLen.name} (${byLen.aka}).`) : null,
          byWpi || byLen ? h('div.result-sub', `Start with a ${(byWpi || byLen).hook[0]}–${(byWpi || byLen).hook[1]} mm hook.`) : null,
        ];
      }),
    calc('pricing', 'Pricing', 'For markets, commissions and shops: materials, your time, overhead and markup.',
      (refresh) => h('div.stack.tight',
        group(num(pr, 'materials', `Materials (${st.currency})`), num(pr, 'hours', 'Hours'), num(pr, 'rate', `Hourly rate (${st.currency})`))(refresh),
        group(num(pr, 'overhead', 'Overhead %'), num(pr, 'markup', 'Retail markup ×', { step: 0.1 }))(refresh)),
      () => {
        const p = pricing({ materials: pr.materials || 0, hours: pr.hours || 0, rate: pr.rate || 0, overheadPct: pr.overhead || 0, markup: pr.markup || 1 });
        return result(`Retail ${money(p.retail, st.currency)}`, `Wholesale ${money(p.wholesale, st.currency)} · labour ${money(p.labor, st.currency)} · overhead ${money(p.overhead, st.currency)}${p.perHourAtRetail ? ` · you earn ${money(p.perHourAtRetail, st.currency)}/h at retail` : ''}`);
      }),
    hookTable(),
    weightTable(),
    sizeTables()));

  if (location.hash.includes('#pricing')) setTimeout(() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }), 100);
  return null;
}

function hookTable() {
  const owned = new Set(store.all('tools').filter((t) => t.kind === 'hook').map((t) => t.mm));
  return h('section.card', { id: 'hooks' },
    h('h3', 'Hook sizes'),
    h('p.muted', { style: { fontSize: '13.5px' } }, 'Metric is the only size that means the same thing everywhere. Owned sizes are highlighted.'),
    h('div', { style: { maxHeight: '340px', overflow: 'auto', marginTop: '8px' } },
      h('table.table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' } },
        h('thead', h('tr', ['Metric', 'US', 'UK (old)'].map((t) => h('th', { style: { textAlign: 'left', padding: '6px', color: 'var(--ink-3)', fontSize: '12px' } }, t)))),
        h('tbody', HOOKS.map((x) => h('tr', { style: { background: owned.has(x.mm) ? 'var(--accent-soft)' : null } },
          h('td', { style: { padding: '6px', fontWeight: 650 } }, `${x.mm} mm`), h('td', { style: { padding: '6px' } }, x.us), h('td', { style: { padding: '6px' } }, x.uk)))))));
}

function weightTable() {
  return h('section.card', { id: 'weights' },
    h('h3', 'Yarn weights'),
    h('p.muted', { style: { fontSize: '13.5px' } }, 'Craft Yarn Council categories with typical single crochet gauge per 4 in.'),
    h('div.list', { style: { marginTop: '8px' } }, YARN_WEIGHTS.map((w) => h('div.list-row',
      h('span.chip', { style: { minWidth: '30px', justifyContent: 'center' } }, String(w.id)),
      h('div.grow', h('div.title', w.name), h('div.meta', w.aka)),
      h('div', { style: { textAlign: 'right', fontSize: '12.5px' } }, h('div', `${w.hook[0]}–${w.hook[1]} mm`), h('div.muted', `${w.sc[0]}–${w.sc[1]} ${w.id === 0 ? 'dc' : 'sc'} · ${w.wpi[0]}–${w.wpi[1]} WPI`))))));
}

function sizeTables() {
  return h('section.card', { id: 'sizes' },
    h('h3', 'Standard sizes'),
    h('div.cols.even', { style: { marginTop: '8px' } },
      h('div', h('div.eyebrow', 'Blankets'), h('div.list', BLANKETS.map((b) => h('div.list-row', h('div.grow', b.name), h('span.num', `${len(b.w, 0)} × ${len(b.h, 0)}`))))),
      h('div', h('div.eyebrow', 'Hats (head circumference, height)'), h('div.list', HEADS.map((b) => h('div.list-row', h('div.grow', b.name), h('span.num', `${len(b.circ, 1)} · ${len(b.height, 1)}`)))))));
}

// ---------------------------------------------------------------------------
// Shopping
// ---------------------------------------------------------------------------

function shoppingTab(root) {
  const content = h('div');
  root.append(content);
  function suggestions() {
    const out = [];
    for (const y of store.all('yarns')) {
      const need = allocated(y.id);
      const have = yarnYards(y);
      if (need > have && y.yardsPerSkein) {
        const skeins = Math.ceil((need - have) / y.yardsPerSkein);
        out.push({ text: `${yarnName(y)}: ${plural(skeins, 'skein')} (${yardsText(need - have)} short)`, hex: y.hex });
      }
    }
    return out;
  }
  function draw() {
    const items = store.all('shopping', { sort: 'createdAt' }).reverse();
    const sugg = suggestions().filter((s) => !items.some((i) => i.text === s.text));
    const addInput = input({ placeholder: 'Add something to buy…', 'aria-label': 'New item' });
    const add = async () => {
      const text = addInput.value.trim();
      if (!text) return;
      await store.put('shopping', { text, done: false });
    };
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    mount(content, h('div.cols',
      h('div.card',
        h('div.card-head', h('h3', 'To buy'), items.length ? btn('Copy list', async () => {
          await copyText(items.filter((i) => !i.done).map((i) => `☐ ${i.text}`).join('\n'));
          toast('List copied.');
        }, { small: true, ico: 'copy', kind: 'ghost' }) : null),
        h('div.row', { style: { marginBottom: '12px' } }, h('div.grow', addInput), btn('Add', add, { kind: 'primary', ico: 'plus' })),
        items.length ? h('div.list', items.map((i) => h('div.list-row',
          h('input', { type: 'checkbox', checked: !!i.done, 'aria-label': `Bought ${i.text}`, onChange: (e) => store.put('shopping', { ...i, done: e.target.checked }) }),
          h('div.grow', { style: { textDecoration: i.done ? 'line-through' : null, color: i.done ? 'var(--ink-3)' : null } }, i.text),
          iconBtn('x', 'Remove', () => store.remove('shopping', i.id)))))
          : h('p.muted', 'Nothing on the list.'),
        items.some((i) => i.done) ? btn('Clear bought items', async () => { for (const i of items.filter((x) => x.done)) await store.remove('shopping', i.id); }, { kind: 'ghost', small: true }) : null),
      h('div.card',
        h('h3', 'Suggested from your plans'),
        h('p.muted', { style: { fontSize: '13.5px' } }, 'Queued and in-progress projects that need more of a yarn than your stash holds.'),
        sugg.length ? h('div.list', sugg.map((s) => h('div.list-row',
          h('span.swatch', { style: { '--c': s.hex || '#ccc', width: '20px', height: '20px' } }),
          h('div.grow', s.text),
          btn('Add', () => store.put('shopping', { text: s.text, done: false }), { small: true, ico: 'plus' }))))
          : h('div.note.ok', icon('check'), h('span', 'Your stash covers everything you’ve planned.')))));
  }
  draw();
  const offs = ['shopping', 'yarns', 'projects'].map((s) => store.on(s, draw));
  return () => offs.forEach((o) => o());
}


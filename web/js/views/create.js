// Create: pattern library and editor (with the live checker), and the router
// for charts, shapes and the stitch dictionary.

import { h, mount, btn, iconBtn, field, input, numberInput, select, textarea, segmented, pageHead, subnav, modal, confirmDialog, toast, empty, menu, svgFromString } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { debounce, download, slug, duration, uid } from '../core/util.js';
import { parseSection, renumber, addCounts } from '../crochet/parser.js';
import { convertTerms, detectTerms } from '../crochet/terms.js';
import { distribute, YARN_WEIGHTS, HOOKS } from '../crochet/calc.js';
import { diagram } from '../crochet/diagram.js';
import { parsed, estimates, photo, addPhotos, backLink, yardsText, symbolEl, CATEGORIES } from './common.js';
import { patternDocument, printElement, abbreviations } from './print.js';

export const CREATE_TABS = [
  ['#/create/patterns', 'Patterns', 'book'],
  ['#/create/charts', 'Charts', 'grid'],
  ['#/create/shapes', 'Shapes', 'circle'],
  ['#/create/stitches', 'Stitches', 'stitch'],
];

export async function render(root, route) {
  const [tab = 'patterns', id, sub] = route.parts;
  if (tab === 'charts') return (await import('./charts.js')).render(root, id, route);
  if (tab === 'shapes') return (await import('./shapes.js')).render(root, route);
  if (tab === 'stitches') return (await import('./stitches.js')).render(root, id, sub);
  if (id === 'new') {
    const pat = await store.put('patterns', blankPattern());
    go(`/create/patterns/${pat.id}`, { replace: true });
    return null;
  }
  if (id) return editor(root, id, route);
  root.append(pageHead('Create', 'Write patterns that check their own stitch counts. Design charts and shapes.'), subnav(CREATE_TABS, '#/create/patterns'));
  return library(root);
}

export function blankPattern(extra = {}) {
  const st = store.settings();
  return {
    title: 'Untitled pattern',
    designer: st.name || '',
    terms: st.terms || 'US',
    difficulty: 2,
    yarnWeight: 4,
    hookMm: 5,
    gauge: { sts: 14, rows: 16, per: st.units === 'cm' ? 10 : 4, unit: st.units === 'cm' ? 'cm' : 'in' },
    sections: [{ id: uid(6), name: 'Main', text: '', pieces: 1 }],
    tags: [],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

function library(root) {
  let q = '';
  const content = h('div');
  const search = h('div.search', icon('search'), input({ type: 'search', placeholder: 'Search patterns', 'aria-label': 'Search patterns', onInput: (e) => { q = e.target.value.toLowerCase(); draw(); } }));
  root.append(
    h('div.row.wrap', { style: { marginBottom: '14px' } },
      h('div.grow', { style: { maxWidth: '360px' } }, search),
      btn('Paste a pattern', pasteImport, { ico: 'upload' }),
      btn('New pattern', () => go('/create/patterns/new'), { kind: 'primary', ico: 'plus' })),
    content);

  function draw() {
    const all = store.all('patterns').filter((p) => !q || `${p.title} ${p.designer || ''} ${p.category || ''} ${(p.tags || []).join(' ')}`.toLowerCase().includes(q));
    if (!store.all('patterns').length) {
      mount(content, empty('book', 'No patterns yet', 'Write one from scratch, paste one in to check its counts, or generate one from a shape, hat or granny square.', h('div.btn-row', { style: { justifyContent: 'center' } },
        btn('New pattern', () => go('/create/patterns/new'), { kind: 'primary', ico: 'plus' }), btn('Paste a pattern', pasteImport, { ico: 'upload' }))));
      return;
    }
    mount(content, 
      h('div.grid', all.map((p) => {
        const pp = parsed(p);
        const d = diagram(pp.sections[0]?.parsed.lines || [], { maxRows: 8 });
        return h('a.card.pattern-card', { href: `#/create/patterns/${p.id}` },
          h('div.cover', p.coverId ? photo(p.coverId) : d ? svgFromString(d.svg) : icon('book', 'big')),
          h('h3', p.title || 'Untitled pattern'),
          h('div.muted', { style: { fontSize: '13px', margin: '2px 0 8px' } }, [p.designer, p.category].filter(Boolean).join(' · ') || '—'),
          h('div.chips',
            h('span.chip', `${pp.rows} rows`),
            pp.errors ? h('span.chip.err', icon('alert'), `${pp.errors} to fix`) : pp.rows ? h('span.chip.sage', icon('check'), 'Counts check out') : null,
            p.terms === 'UK' ? h('span.chip', 'UK terms') : null));
      })),
      h('div.section-title', h('h2', 'Generate a pattern'), null),
      h('div.quick',
        h('a', { href: '#/create/shapes' }, icon('circle'), h('div', 'Amigurumi shape'), h('span', 'Balls, eggs, tubes, cones, freeform')),
        h('a', { href: '#/imagine/hats' }, icon('sparkle'), h('div', 'Top-down hat'), h('span', 'Any head, any gauge')),
        h('a', { href: '#/imagine/granny' }, icon('grid'), h('div', 'Granny square'), h('span', 'Plus a blanket planner')),
        h('a', { href: '#/imagine/stripes' }, icon('layers'), h('div', 'Stripe sequence'), h('span', 'Fibonacci, random, gradient'))));
  }

  async function pasteImport() {
    let text = '';
    let title = '';
    const res = await modal({
      title: 'Paste a pattern',
      wide: true,
      body: h('div.stack',
        h('p.soft', 'Paste the written instructions. Lines like “Head:” or “Arms (make 2):” become parts. Loopwright checks every stitch count and tells you what doesn’t add up.'),
        field('Title', input({ placeholder: 'Pattern name', onInput: (e) => { title = e.target.value; } })),
        textarea('', (v) => { text = v; }, { rows: 14, placeholder: 'Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)\n…', style: { fontFamily: 'var(--mono)', fontSize: '14px' } })),
      actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Import', kind: 'primary', value: 'ok' }],
    });
    if (res !== 'ok' || !text.trim()) return;
    const terms = detectTerms(text) || store.settings().terms;
    const sections = splitSections(text);
    const pat = await store.put('patterns', blankPattern({ title: title.trim() || 'Imported pattern', terms, sections }));
    toast(`Imported in ${terms} terms. Check the Details tab if that’s wrong.`);
    go(`/create/patterns/${pat.id}`);
  }

  draw();
  return store.on('patterns', draw);
}

/** Split pasted text into sections at part headings ("Body:", "Arms (make 2):"). */
export function splitSections(text) {
  const out = [];
  let cur = { id: uid(6), name: 'Main', text: '', pieces: 1 };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const isHeading = /^[A-Za-z][\w '&/-]{0,40}(\s*\((?:make|x)?\s*\d+\))?\s*:$/.test(line) && !/^(rnds?|rows?|r|rounds?)\s*\d/i.test(line);
    if (isHeading) {
      if (cur.text.trim()) out.push(cur);
      const make = /\((?:make|x)?\s*(\d+)\)/i.exec(line);
      cur = { id: uid(6), name: line.replace(/\s*\(.*\)\s*:$|:$/g, '').trim(), text: '', pieces: make ? Number(make[1]) : 1 };
      continue;
    }
    cur.text += (cur.text ? '\n' : '') + raw;
  }
  if (cur.text.trim() || !out.length) out.push(cur);
  return out.map((s) => ({ ...s, text: s.text.replace(/^\n+|\n+$/g, '') }));
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function editor(root, id, route) {
  let pat = store.get('patterns', id);
  if (!pat) {
    root.append(backLink('#/create/patterns', 'Patterns'), empty('alert', 'Pattern not found', 'It may have been deleted.'));
    return null;
  }
  let tab = route.query.tab || 'write';
  // Which size of a graded pattern the checker, diagram and preview show.
  let size = 0;
  let previewSize = null;
  const graded = () => (pat.sizes || []).length > 1;
  const persist = debounce(async () => { pat = await store.put('patterns', pat, { silent: true }); }, 400);
  const update = (patch) => {
    pat = { ...pat, ...patch, updatedAt: Date.now() };
    persist();
  };

  const title = h('input', {
    value: pat.title, 'aria-label': 'Pattern title', maxlength: 140,
    style: { font: '600 28px/1.2 var(--serif)', border: '0', background: 'transparent', padding: '0', minHeight: '0' },
    onInput: (e) => update({ title: e.target.value }),
  });
  const tabs = segmented([['write', 'Write & check', 'create'], ['details', 'Details', 'list'], ['diagram', 'Diagram', 'stitch'], ['preview', 'Preview', 'eye']], tab, (v) => {
    tab = v;
    history.replaceState(null, '', `#/create/patterns/${pat.id}?tab=${v}`);
    draw();
  }, { label: 'Editor view' });
  const body = h('div', { style: { marginTop: '16px' } });

  root.append(
    backLink('#/create/patterns', 'Patterns'),
    h('header.page-head', h('div.grow', title),
      h('div.page-actions',
        btn('Work on it', startProject, { kind: 'primary', ico: 'play' }),
        btn('Share', () => { persist.flush(); go(`/share?kind=pattern&id=${pat.id}`); }, { ico: 'share' }),
        iconBtn('more', 'More', (e) => menu(e.currentTarget, [
          { label: 'Print or save PDF', ico: 'print', run: () => { persist.flush(); printElement(patternDocument(pat, { size: previewSize }), pat.title); } },
          { label: 'Download as text', ico: 'download', run: () => download(`${slug(pat.title)}.txt`, asText(pat), 'text/plain') },
          { label: `Convert to ${pat.terms === 'UK' ? 'US' : 'UK'} terms`, ico: 'swap', run: convert },
          { label: 'Duplicate', ico: 'copy', run: async () => { persist.flush(); const c = await store.put('patterns', { ...pat, id: null, title: `${pat.title} (copy)`, sample: false }); go(`/create/patterns/${c.id}`); } },
          '-',
          { label: 'Delete pattern', ico: 'trash', danger: true, run: async () => {
            if (!(await confirmDialog('Delete this pattern?', `“${pat.title}” will be removed. Projects using it keep their progress but lose the row list.`, { ok: 'Delete', danger: true }))) return;
            persist.flush();
            await store.remove('patterns', pat.id);
            go('/create/patterns');
          } },
        ])))),
    tabs,
    body);

  async function startProject() {
    persist.flush();
    const existing = store.all('projects').find((p) => p.patternId === pat.id && p.status === 'active');
    if (existing) return go(`/build/${existing.id}`);
    const p = await store.put('projects', { name: pat.title, status: 'active', patternId: pat.id, category: pat.category || null, hookMm: pat.hookMm || null, startedAt: Date.now(), counters: [], photoIds: [], yarns: [], pos: { step: 0, atom: 0 } });
    toast('Project started.');
    go(`/build/${p.id}`);
    return null;
  }

  async function convert() {
    const to = pat.terms === 'UK' ? 'US' : 'UK';
    if (!(await confirmDialog(`Convert to ${to} terms?`, `Every stitch name in the text is rewritten (${pat.terms === 'UK' ? 'dc → sc, tr → dc' : 'sc → dc, dc → tr'}…). You can convert back any time.`, { ok: 'Convert' }))) return;
    update({
      terms: to,
      sections: pat.sections.map((s) => ({ ...s, text: convertTerms(s.text, pat.terms || 'US', to) })),
      materials: convertTerms(pat.materials || '', pat.terms || 'US', to),
      notes: convertTerms(pat.notes || '', pat.terms || 'US', to),
    });
    persist.flush();
    toast(`Now in ${to} terms.`);
    draw();
  }

  function draw() {
    body.replaceChildren();
    if (tab === 'details') body.append(detailsTab());
    else if (tab === 'diagram') body.append(diagramTab());
    else if (tab === 'preview') {
      body.append(h('div.row.wrap', { style: { justifyContent: 'flex-end', marginBottom: '10px' } },
        graded() ? select([['all', 'All sizes'], ...pat.sizes.map((n, i) => [i, `Size ${n} only`])], previewSize === null ? 'all' : previewSize, (v) => { previewSize = v === 'all' ? null : Number(v); draw(); }, { style: { width: 'auto' }, 'aria-label': 'Size to show' }) : null,
        btn('Print or save PDF', () => { persist.flush(); printElement(patternDocument(pat, { size: previewSize }), pat.title); }, { ico: 'print' })),
      h('div.card.pad-lg', patternDocument(pat, { size: previewSize })));
    }
    else body.append(writeTab());
  }

  // ---- write & check ------------------------------------------------------

  function writeTab() {
    const checker = h('div');
    const summary = h('div');
    const areas = [];

    const refresh = debounce(() => {
      const p = parsed(pat, graded() ? size : null);
      const est = estimates(pat, p);
      const perSize = graded() ? pat.sizes.map((n, i) => ({ n, i, errors: parsed(pat, i).errors })) : null;
      mount(summary,
        perSize ? h('div.stack.tight', { style: { marginBottom: '10px' } },
          h('div.muted', { style: { fontSize: '12.5px' } }, 'Checking size'),
          h('div.chips', perSize.map((x) => h('button.chip', {
            class: x.i === size ? 'on' : x.errors ? 'err' : 'sage',
            onClick: () => { size = x.i; refresh(); },
            title: x.errors ? `${x.errors} count errors` : 'Counts check out',
          }, x.errors ? icon('alert') : icon('check'), x.n)))) : null,
        h('div.check-summary',
        h('span.chip', `${p.rows} rows`),
        h('span.chip', `${p.stitches.toLocaleString()} sts`),
        p.errors ? h('span.chip.err', icon('alert'), `${p.errors} error${p.errors === 1 ? '' : 's'}`) : h('span.chip.sage', icon('check'), 'No count errors'),
        p.warnings ? h('span.chip.warn', `${p.warnings} to review`) : null,
        p.stitches ? h('span.chip', icon('yarn'), `≈ ${yardsText(est.yards)}`) : null,
        p.stitches ? h('span.chip', icon('clock'), `≈ ${duration(est.minutes * 60000)}`) : null));
      mount(checker, ...p.sections.map((sec, si) => h('div',
        p.sections.length > 1 ? h('div.check-line.heading', sec.name || `Part ${si + 1}`) : null,
        h('div.checker', sec.parsed.lines.map((line, li) => checkLine(line, () => focusLine(si, li)))))));
    }, 120);

    function focusLine(si, li) {
      const ta = areas[si];
      if (!ta) return;
      const lines = ta.value.split('\n');
      const start = lines.slice(0, li).reduce((a, l) => a + l.length + 1, 0);
      ta.focus();
      ta.setSelectionRange(start, start + (lines[li] || '').length);
      const lineHeight = 26;
      ta.scrollTop = Math.max(0, li * lineHeight - ta.clientHeight / 2);
    }

    const sectionsEl = h('div');
    const drawSections = () => {
      areas.length = 0;
      mount(sectionsEl, ...pat.sections.map((sec, i) => {
        const ta = textarea(sec.text, (v) => {
          const sections = pat.sections.slice();
          sections[i] = { ...sections[i], text: v };
          update({ sections });
          autosize(ta);
          refresh();
        }, { spellcheck: 'false', 'aria-label': `${sec.name} instructions`, placeholder: i === 0 ? 'Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)\nRnd 3: (sc, inc) x6 (18)\n\nOne row or round per line. Put the count at the end in brackets.' : '' });
        areas.push(ta);
        setTimeout(() => autosize(ta));
        return h('div.section-block',
          h('div.section-bar',
            h('input', { value: sec.name, 'aria-label': 'Part name', onInput: (e) => { const sections = pat.sections.slice(); sections[i] = { ...sections[i], name: e.target.value }; update({ sections }); refresh(); } }),
            h('span.muted', { style: { fontSize: '12.5px', whiteSpace: 'nowrap' } }, 'make'),
            numberInput(sec.pieces || 1, (v) => { const sections = pat.sections.slice(); sections[i] = { ...sections[i], pieces: Math.max(1, Math.round(v || 1)) }; update({ sections }); refresh(); }, { class: 'pieces', min: 1, step: 1, 'aria-label': 'How many to make' }),
            iconBtn('more', 'Part options', (e) => menu(e.currentTarget, [
              { label: 'Insert even increase / decrease', ico: 'calculator', run: () => insertShaping(i) },
              { label: 'Renumber rows', ico: 'list', run: () => rewrite(i, (t) => ({ text: renumber(t) }), 'Rows renumbered.') },
              { label: 'Add missing stitch counts', ico: 'check', run: () => rewrite(i, (t) => addCounts(t, { terms: pat.terms }), (r) => (r.added ? `Added ${r.added} count${r.added === 1 ? '' : 's'}.` : 'Every row the checker is sure of already has a count.')) },
              i > 0 ? { label: 'Move up', ico: 'chevron-up', run: () => move(i, -1) } : null,
              i < pat.sections.length - 1 ? { label: 'Move down', ico: 'chevron-down', run: () => move(i, 1) } : null,
              pat.sections.length > 1 ? { label: 'Delete part', ico: 'trash', danger: true, run: async () => {
                if (sec.text.trim() && !(await confirmDialog('Delete this part?', `“${sec.name}” and its rows will be removed.`, { ok: 'Delete', danger: true }))) return;
                update({ sections: pat.sections.filter((_, k) => k !== i) });
                drawSections();
                refresh();
              } } : null,
            ]))),
          h('div.rows-editor', ta));
      }));
    };
    // Apply a text transform to one part, with an undo toast.
    const rewrite = (i, fn, message) => {
      const before = pat.sections[i].text;
      const res = fn(before);
      if (res.text === before) {
        toast(typeof message === 'function' ? message(res) : 'Nothing to change.');
        return;
      }
      const sections = pat.sections.slice();
      sections[i] = { ...sections[i], text: res.text };
      update({ sections });
      drawSections();
      refresh();
      toast(typeof message === 'function' ? message(res) : message, {
        action: { label: 'Undo', run: () => { const back = pat.sections.slice(); back[i] = { ...back[i], text: before }; update({ sections: back }); drawSections(); refresh(); } },
      });
    };
    const move = (i, d) => {
      const sections = pat.sections.slice();
      [sections[i], sections[i + d]] = [sections[i + d], sections[i]];
      update({ sections });
      drawSections();
      refresh();
    };

    async function insertShaping(i) {
      const sec = pat.sections[i];
      const p = parseSection(sec.text, { terms: pat.terms });
      const last = [...p.lines].reverse().find((l) => ['row', 'round', 'chain'].includes(l.kind));
      const cur = { from: last ? (last.declared ?? last.produces) || 24 : 24, change: 6, round: !last || last.kind !== 'row', stitch: 'sc', offset: 0 };
      const out = h('div.well', { style: { font: '600 15px/1.5 var(--mono)' } });
      const calc = () => {
        const r = distribute(cur.from, cur.change, { round: cur.round, stitch: cur.stitch, offset: cur.offset, invisible: false });
        out.textContent = r.error || `${r.text} (${r.to})`;
        return r;
      };
      const res = await modal({
        title: 'Insert even shaping',
        body: () => {
          calc();
          return h('div.stack',
            h('div.fields',
              field('Stitches now', numberInput(cur.from, (v) => { cur.from = v || 0; calc(); }, { min: 1, step: 1 })),
              field('Change by (−/+)', numberInput(cur.change, (v) => { cur.change = v || 0; calc(); }, { step: 1 })),
              field('Shift start', numberInput(cur.offset, (v) => { cur.offset = v || 0; calc(); }, { min: 0, step: 1 }), 'Stagger rounds')),
            h('div.row.wrap',
              segmented([['round', 'Round'], ['row', 'Row']], cur.round ? 'round' : 'row', (v) => { cur.round = v === 'round'; calc(); }, { small: true }),
              segmented([['sc', 'sc'], ['hdc', 'hdc'], ['dc', 'dc']], cur.stitch, (v) => { cur.stitch = v; calc(); }, { small: true })),
            out);
        },
        actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Insert', kind: 'primary', run: () => calc() }],
      });
      if (!res || res.error) return;
      const num = last && last.numTo !== null ? last.numTo + 1 : 1;
      const word = cur.round ? 'Rnd' : 'Row';
      const line = `${word} ${num}: ${res.text} (${res.to})`;
      const sections = pat.sections.slice();
      sections[i] = { ...sec, text: sec.text.replace(/\s*$/, '') + (sec.text.trim() ? '\n' : '') + line };
      update({ sections });
      drawSections();
      refresh();
    }

    drawSections();
    refresh.flush();
    return h('div.editor',
      h('div',
        sectionsEl,
        h('div.btn-row', { style: { marginTop: '12px' } },
          btn('Add part', () => { update({ sections: [...pat.sections, { id: uid(6), name: `Part ${pat.sections.length + 1}`, text: '', pieces: 1 }] }); drawSections(); refresh(); }, { ico: 'plus' }),
          h('span.muted', { style: { fontSize: '13px' } }, `Written in ${pat.terms || 'US'} terms`))),
      h('aside.card', { style: { position: 'sticky', top: '12px', maxHeight: 'calc(100vh - 24px)', overflow: 'auto' } },
        h('div.card-head', h('h3', 'Stitch count check'), h('span.muted', { style: { fontSize: '12px' } }, 'Live')),
        summary, checker));
  }

  function checkLine(line, onFocus) {
    if (line.kind === 'blank') return null;
    if (line.kind === 'heading') return h('div.check-line.heading', line.label, line.pieces > 1 ? h('span.muted', ` × ${line.pieces}`) : null);
    if (line.kind === 'note') return h('div.check-line.note-line', h('span.lbl', ''), h('span.txt', line.raw.trim()), h('span'));
    const worst = line.issues.some((i) => i.level === 'error') ? 'has-error' : line.issues.some((i) => i.level === 'warn') ? 'has-warn' : '';
    const count = line.declared ?? line.produces;
    return h('div.check-line', { class: worst, onClick: onFocus, style: { cursor: 'pointer' }, title: 'Show this line in the editor' },
      h('span.lbl', line.label || (line.kind === 'chain' ? 'Chain' : '—')),
      h('span.txt', summaryText(line)),
      h('span.cnt', count ?? '—', line.kind !== 'chain' && line.consumes ? h('small', `uses ${line.consumes}`) : null),
      line.issues.length ? h('div.issues', line.issues.map((i) => h('div.issue', { class: i.level }, icon(i.level === 'error' ? 'alert' : 'info'), h('span', i.msg)))) : null);
  }

  function summaryText(line) {
    // What the person wrote, minus the label and the count we show alongside.
    let text = line.num !== null ? line.raw.replace(/^[^:.)]*[:.)]\s*/, '') : line.raw.trim();
    text = text.replace(/\s*[([{<]\s*=?\s*\d+[^)\]}>]*[)\]}>]\s*\.?\s*$/, '');
    const mods = line.mods.length ? ` · ${line.mods.join(', ')}` : '';
    return `${text}${mods}${line.reading ? ` · read as: ${line.reading}` : ''}`;
  }

  // ---- details ------------------------------------------------------------

  function detailsTab() {
    const g = pat.gauge || {};
    const setGauge = (k, v) => update({ gauge: { ...(pat.gauge || {}), [k]: v } });
    const abbr = abbreviations(pat);
    const cover = h('div');
    const drawCover = () => mount(cover, pat.coverId
      ? h('div.stack.tight', photo(pat.coverId, { style: { borderRadius: '12px', maxHeight: '240px', objectFit: 'cover', width: '100%' } }), h('div.btn-row', btn('Replace', pickCover, { small: true, ico: 'camera' }), btn('Remove', () => { update({ coverId: null }); drawCover(); }, { small: true, kind: 'ghost' })))
      : btn('Add a cover photo', pickCover, { ico: 'camera' }));
    async function pickCover() {
      const [mid] = await addPhotos({ multiple: false });
      if (mid) {
        update({ coverId: mid });
        persist.flush();
        drawCover();
      }
    }
    drawCover();
    return h('div.cols',
      h('div.stack',
        h('div.card',
          h('h3', 'About'),
          h('div.fields.wide',
            field('Designer', input({ value: pat.designer || '', onInput: (e) => update({ designer: e.target.value }) })),
            field('Category', select([['', '—'], ...CATEGORIES.map((c) => [c, c])], pat.category || '', (v) => update({ category: v }))),
            field('Skill level', select([[1, 'Beginner'], [2, 'Easy'], [3, 'Intermediate'], [4, 'Experienced'], [5, 'Expert']], pat.difficulty || 2, (v) => update({ difficulty: Number(v) }))),
            field('Terms', select([['US', 'US terms (sc, hdc, dc)'], ['UK', 'UK terms (dc, htr, tr)']], pat.terms || 'US', (v) => { update({ terms: v }); toast(`Reading the pattern in ${v} terms. Use More → Convert to rewrite the text.`); }), 'How the text is written'),
            field('Finished size', input({ value: pat.size || '', placeholder: 'e.g. 20 × 24 in', onInput: (e) => update({ size: e.target.value }) })),
            field('Sizes', input({ value: (pat.sizes || []).join(', '), placeholder: 'S, M, L, XL', onInput: (e) => update({ sizes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }) }), 'Graded pattern? Write numbers as 20 (24, 28)'),
            field('Tags', input({ value: (pat.tags || []).join(', '), placeholder: 'amigurumi, gift', onInput: (e) => update({ tags: e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) }) })))),
        h('div.card',
          h('h3', 'Yarn, hook and gauge'),
          h('div.fields',
            field('Yarn weight', select(YARN_WEIGHTS.map((w) => [w.id, `${w.id} ${w.name}`]), pat.yarnWeight ?? 4, (v) => update({ yarnWeight: Number(v) }))),
            field('Hook', select([['', '—'], ...HOOKS.map((x) => [x.mm, `${x.mm} mm${x.us !== '—' ? ` (${x.us})` : ''}`])], pat.hookMm || '', (v) => update({ hookMm: v ? Number(v) : null }))),
            field('Gauge stitches', numberInput(g.sts, (v) => setGauge('sts', v), { min: 0 })),
            field('Gauge rows', numberInput(g.rows, (v) => setGauge('rows', v), { min: 0 })),
            field('Over', h('div.input-group', numberInput(g.per ?? 4, (v) => setGauge('per', v), { min: 0 }), h('span.addon', select([['in', 'in'], ['cm', 'cm']], g.unit || 'in', (v) => setGauge('unit', v), { style: { border: 0, minHeight: '0', padding: '0 20px 0 0', background: 'transparent' } }))))),
          field('Materials', textarea(pat.materials, (v) => update({ materials: v }), { rows: 3, placeholder: 'Yarn with yardage per color, hook, notions…' }))),
        h('div.card',
          h('h3', 'Notes and credits'),
          field('Pattern notes', textarea(pat.notes, (v) => update({ notes: v }), { rows: 4, placeholder: 'Construction, special stitches, how to read the pattern…' })),
          h('div.fields.wide', { style: { marginTop: '12px' } },
            field('Source link', input({ value: pat.source || '', type: 'url', placeholder: 'https://', onInput: (e) => update({ source: e.target.value }) })),
            field('Copyright / license line', input({ value: pat.license || '', placeholder: '© You. Sell what you make, don’t share the pattern.', onInput: (e) => update({ license: e.target.value }) }))))),
      h('div.stack',
        h('div.card', h('h3', 'Cover'), cover),
        h('div.card', h('h3', 'Abbreviations'), h('p.muted', { style: { fontSize: '13px' } }, 'Built from the stitches the pattern actually uses.'),
          abbr.length ? h('dl.doc-abbr', abbr.map((a) => [h('dt', a.abbr), h('dd', a.name)])) : h('p.muted', 'Write some rows first.'))));
  }

  // ---- diagram ------------------------------------------------------------

  function diagramTab() {
    const p = parsed(pat, graded() ? size : null);
    const parts = [];
    for (const [si, sec] of p.sections.entries()) {
      let block = { name: sec.name || `Part ${si + 1}`, lines: [] };
      for (const line of sec.parsed.lines) {
        if (line.kind === 'heading') {
          if (block.lines.some((l) => l.atoms?.length)) parts.push(block);
          block = { name: line.label, lines: [] };
        } else block.lines.push(line);
      }
      if (block.lines.some((l) => l.atoms?.length)) parts.push(block);
    }
    if (!parts.length) return empty('stitch', 'Nothing to draw yet', 'Write some rows or rounds and a symbol chart appears here.');
    let which = 0;
    let rows = 16;
    const stage = h('div');
    const drawD = () => {
      const d = diagram(parts[which].lines, { terms: pat.terms, maxRows: rows });
      if (!d) {
        mount(stage, h('p.muted', 'This part has no stitches to draw.'));
        return;
      }
      const svgEl = svgFromString(d.svg);
      mount(stage, h('div.cols.side',
        h('div.diagram-wrap', svgEl),
        h('div.card',
          h('h3', 'Key'),
          h('div.list', d.legend.map((x) => h('div.list-row', h('span', { style: { width: '34px', display: 'grid', placeItems: 'center' } }, symbolEl(x.id, 30)), h('div.grow', h('div.abbr', x.label), h('div.meta', x.name))))),
          h('p.muted', { style: { fontSize: '12.5px', marginTop: '10px' } }, d.mode === 'round' ? 'Read from the center out, counter-clockwise from the number.' : 'Read from the bottom. Odd rows right to left, even rows left to right.'),
          btn('Download SVG', () => download(`${slug(pat.title)}-${slug(parts[which].name)}.svg`, d.svg.replace('<svg ', '<svg style="background:#fff" ').replace('</svg>', '<style>.sym{fill:none;stroke:#222;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.sym-fill{fill:#222}.ring-guide{fill:none;stroke:#ccc;stroke-dasharray:2 5}.rlabel{font:700 9px sans-serif;fill:#888}</style></svg>'), 'image/svg+xml'), { ico: 'download', small: true }))));
    };
    drawD();
    return h('div',
      h('div.row.wrap', { style: { marginBottom: '12px' } },
        parts.length > 1 ? select(parts.map((pp, i) => [i, pp.name]), which, (v) => { which = Number(v); drawD(); }, { style: { width: 'auto' }, 'aria-label': 'Part' }) : null,
        select([[8, 'First 8 rows'], [16, 'First 16 rows'], [24, 'First 24 rows'], [40, 'Up to 40 rows']], rows, (v) => { rows = Number(v); drawD(); }, { style: { width: 'auto' }, 'aria-label': 'Rows to draw' })),
      stage);
  }

  draw();
  return () => persist.flush();
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(220, ta.scrollHeight + 4)}px`;
}

export function asText(pat) {
  const lines = [pat.title || 'Untitled pattern'];
  if (pat.designer) lines.push(`by ${pat.designer}`);
  lines.push('');
  if (pat.materials) lines.push('MATERIALS', pat.materials, '');
  const abbr = abbreviations(pat);
  if (abbr.length) lines.push(`ABBREVIATIONS (${pat.terms || 'US'} terms)`, ...abbr.map((a) => `${a.abbr} — ${a.name}`), '');
  if (pat.notes) lines.push('NOTES', pat.notes, '');
  for (const s of pat.sections || []) {
    lines.push(`${(s.name || 'Instructions').toUpperCase()}${s.pieces > 1 ? ` (make ${s.pieces})` : ''}`, s.text, '');
  }
  return lines.join('\n');
}

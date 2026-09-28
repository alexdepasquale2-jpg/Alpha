// Pattern documents: the formatted page used for Preview, Print and PDF.

import { h, mount, svgFromString } from '../core/dom.js';
import * as store from '../core/store.js';
import { usedStitches } from '../crochet/parser.js';
import { STITCH_BY_ID, stitchLabel } from '../crochet/stitches.js';
import { weightById, hookLabel } from '../crochet/calc.js';
import { diagram } from '../crochet/diagram.js';
import { parsed, photo, estimates, yardsText } from './common.js';
import { duration } from '../core/util.js';

const DIFFICULTY = ['', 'Beginner', 'Easy', 'Intermediate', 'Experienced', 'Expert'];

export function abbreviations(pattern) {
  const ids = usedStitches(pattern);
  const order = ['ch', 'slst', 'sc', 'hdc', 'dc', 'tr', 'dtr', 'inc', 'dec', 'invdec', 'mr', 'blo', 'flo', 'camel', 'sk'];
  ids.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const terms = pattern.terms || 'US';
  return ids.map((id) => {
    if (id === 'sk') return { abbr: terms === 'UK' ? 'miss' : 'sk', name: terms === 'UK' ? 'miss (skip)' : 'skip' };
    const s = STITCH_BY_ID[id];
    const abbr = id === 'dec' ? 'dec' : stitchLabel(id, terms);
    const name = s ? (terms === 'UK' ? s.ukName : s.name) : stitchLabel(id, terms);
    const other = s && s.uk !== s.us ? (terms === 'UK' ? ` (US ${s.us})` : ` (UK ${s.uk})`) : '';
    const detail = id === 'dec' ? `${terms === 'UK' ? 'dc2tog' : 'sc2tog'}: ${name}` : id === 'inc' ? `2 ${terms === 'UK' ? 'dc' : 'sc'} in the same stitch` : `${name}${other}`;
    return { abbr, name: detail };
  });
}

function gaugeText(g) {
  if (!g || !g.sts) return null;
  return `${g.sts} sts${g.rows ? ` × ${g.rows} rows` : ''} = ${g.per || 4} ${g.unit || 'in'}`;
}

export function patternDocument(pattern, { diagrams = true, size = null } = {}) {
  const graded = (pattern.sizes || []).length > 1;
  const p = parsed(pattern, graded ? size ?? 0 : null);
  const est = estimates(pattern, p);
  const st = store.settings();
  const meta = [
    ['Skill level', DIFFICULTY[pattern.difficulty] || null],
    ['Category', pattern.category],
    ['Yarn', pattern.yarnWeight !== undefined && pattern.yarnWeight !== null && pattern.yarnWeight !== '' ? `${weightById(pattern.yarnWeight).name} (${pattern.yarnWeight})` : null],
    ['Hook', pattern.hookMm ? hookLabel(pattern.hookMm) : null],
    ['Gauge', gaugeText(pattern.gauge)],
    ['Finished size', pattern.size],
    ['Terms', pattern.terms === 'UK' ? 'UK' : 'US'],
    graded ? ['Sizes', size === null ? `${pattern.sizes[0]} (${pattern.sizes.slice(1).join(', ')})` : `${pattern.sizes[size]} only`] : null,
    ['Rows', `${p.rows} rows · ${p.stitches.toLocaleString()} stitches`],
    ['Yarn estimate', `≈ ${yardsText(est.yards)}`],
    ['Time', `≈ ${duration(est.minutes * 60000)} at ${st.speed || 20} sts/min`],
  ].filter((x) => x && x[1]);

  const abbr = abbreviations(pattern);
  const doc = h('article.doc',
    h('header.doc-head',
      h('h1', pattern.title || 'Untitled pattern'),
      pattern.designer ? h('p.doc-by', `by ${pattern.designer}`) : null),
    pattern.coverId ? photo(pattern.coverId, { class: 'doc-cover', alt: '' }) : null,
    h('dl.doc-meta', meta.map(([k, v]) => [h('dt', k), h('dd', v)])),
    graded && size === null ? h('p.doc-note', { style: { marginLeft: 0 } }, `Numbers for larger sizes follow in brackets: ${pattern.sizes[0]} (${pattern.sizes.slice(1).join(', ')}). Where only one number is given it applies to all sizes; a dash means the step doesn’t apply.`) : null,
    pattern.materials ? h('section', h('h2', 'Materials'), h('p.doc-text', pattern.materials)) : null,
    abbr.length ? h('section', h('h2', 'Abbreviations'), h('dl.doc-abbr', abbr.map((a) => [h('dt', a.abbr), h('dd', a.name)]))) : null,
    pattern.notes ? h('section', h('h2', 'Notes'), h('p.doc-text', pattern.notes)) : null,
    p.sections.map((sec) => {
      const lines = sec.parsed.lines;
      const d = diagrams ? diagram(lines, { terms: pattern.terms, maxRows: 16 }) : null;
      return h('section.doc-section',
        h('h2', sec.name || 'Instructions', sec.pieces > 1 ? h('span.doc-make', ` (make ${sec.pieces})`) : null),
        lines.map((line) => {
          if (line.kind === 'blank') return null;
          if (line.kind === 'heading') return h('h3.doc-sub', line.label, line.pieces > 1 ? ` (make ${line.pieces})` : '');
          const text = graded && size === null ? line.original.trim() : line.raw.trim();
          if (line.kind === 'note') return h('p.doc-note', text);
          const count = line.declared ?? line.produces;
          return h('div.doc-row',
            h('span.doc-box', { 'aria-hidden': 'true' }),
            h('span.doc-text-line', text),
            h('span.doc-count', count !== null && count !== undefined && line.kind !== 'chain' && !(graded && size === null) ? `(${count})` : ''));
        }),
        d && d.rows >= 3 ? h('figure.doc-figure', svgFromString(d.svg), h('figcaption', `Symbol chart, first ${d.rows} ${d.mode === 'round' ? 'rounds' : 'rows'} · `, d.legend.map((x, i) => `${i ? ', ' : ''}${x.label} ${x.name.toLowerCase()}`))) : null);
    }),
    h('footer.doc-foot',
      pattern.license ? h('p', pattern.license) : h('p', `© ${new Date().getFullYear()} ${pattern.designer || st.name || 'the designer'}. You may sell what you make from this pattern; please don’t redistribute the pattern itself.`),
      h('p.muted', 'Written and stitch-count checked with Loopwright.')));
  return doc;
}

/** Print an element on its own (and so "Save as PDF" from the dialog). */
export function printElement(el, title = document.title) {
  const root = document.getElementById('print-root');
  mount(root, el);
  const oldTitle = document.title;
  document.title = title;
  document.body.classList.add('printing');
  const done = () => {
    document.body.classList.remove('printing');
    root.replaceChildren();
    document.title = oldTitle;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // Give images a moment to load before the print dialog snapshots the page.
  setTimeout(() => {
    window.print();
    setTimeout(done, 1000);
  }, 300);
}

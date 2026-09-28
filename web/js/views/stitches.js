// The stitch dictionary: every stitch the checker knows, with symbols, US and
// UK names, how-to steps, and a set of classic stitch patterns.

import { h, mount, btn, input, pageHead, subnav, empty, toast } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { uid } from '../core/util.js';
import { STITCHES, STITCH_PATTERNS, STITCH_CATEGORIES, STITCH_BY_ID } from '../crochet/stitches.js';
import { symbolEl, backLink } from './common.js';
import { CREATE_TABS, blankPattern } from './create.js';

export function render(root, id, sub) {
  if (id === 'p' && sub) return patternDetail(root, sub);
  if (id) return detail(root, id);
  return list(root);
}

const primary = (s) => (store.settings().terms === 'UK' ? s.uk : s.us);
const secondary = (s) => (store.settings().terms === 'UK' ? `US ${s.us}` : `UK ${s.uk}`);

function list(root) {
  let q = '';
  let cat = null;
  const content = h('div');
  root.append(
    pageHead('Create', 'Write patterns that check their own stitch counts. Design charts and shapes.'),
    subnav(CREATE_TABS, '#/create/stitches'),
    h('div.row.wrap', { style: { marginBottom: '12px' } },
      h('div.search.grow', { style: { maxWidth: '360px' } }, icon('search'), input({ type: 'search', placeholder: 'Search stitches (sc, bobble, treble…)', 'aria-label': 'Search stitches', onInput: (e) => { q = e.target.value.toLowerCase(); draw(); } }))),
    content);
  function draw() {
    const items = STITCHES.filter((s) => (!cat || s.cat === cat) && (!q || `${s.name} ${s.ukName} ${s.us} ${s.uk} ${s.id}`.toLowerCase().includes(q)));
    mount(content, 
      h('div.chips', { style: { marginBottom: '14px' } },
        h('button.chip', { class: cat ? '' : 'on', onClick: () => { cat = null; draw(); } }, 'All'),
        STITCH_CATEGORIES.map(([id, label]) => h('button.chip', { class: cat === id ? 'on' : '', onClick: () => { cat = cat === id ? null : id; draw(); } }, label))),
      items.length ? h('div.grid.small', items.map((s) => h('a.card.tight', { href: `#/create/stitches/${s.id}` },
        h('div.stitch-card',
          h('div.sym-box', symbolEl(s.id, 40)),
          h('div', { style: { minWidth: 0 } },
            h('div.abbr', primary(s), primary(s) !== (store.settings().terms === 'UK' ? s.us : s.uk) ? h('span.muted', ` · ${secondary(s)}`) : null),
            h('div.clamp2', { style: { fontWeight: 650, fontSize: '14px', lineHeight: 1.25 } }, store.settings().terms === 'UK' ? s.ukName : s.name))))))
        : h('p.muted', 'No stitch matches that.'),
      h('div.section-title', h('h2', 'Stitch patterns'), null),
      h('div.grid', STITCH_PATTERNS.filter((p) => !q || `${p.name} ${p.aka}`.toLowerCase().includes(q)).map((p) => h('a.card', { href: `#/create/stitches/p/${p.id}` },
        h('h3', p.name),
        p.aka ? h('div.muted', { style: { fontSize: '13px' } }, p.aka) : null,
        h('p.soft', { style: { fontSize: '14px', margin: '8px 0' } }, p.about),
        h('div.chips', h('span.chip', `Multiple of ${p.multiple}${p.plus ? ` + ${p.plus}` : ''}`), h('span.chip', ['', 'Easy', 'Easy', 'Intermediate'][p.level] || 'Intermediate'))))));
  }
  draw();
  return null;
}

function detail(root, id) {
  const s = STITCH_BY_ID[id];
  if (!s) {
    root.append(backLink('#/create/stitches', 'Stitches'), empty('alert', 'Unknown stitch', null));
    return null;
  }
  const uk = store.settings().terms === 'UK';
  const counts = s.c !== undefined
    ? `Worked into ${s.c === 0 ? 'nothing below (it makes its own base)' : `${s.c} stitch${s.c === 1 ? '' : 'es'}`}, leaves ${s.p === 0 ? 'nothing to count' : `${s.p} stitch${s.p === 1 ? '' : 'es'}`}.`
    : 'A way of working other stitches; it doesn’t change the count.';
  root.append(
    backLink('#/create/stitches', 'Stitches'),
    h('div.cols',
      h('div.stack',
        h('div.card.pad-lg',
          h('div.row.top', { style: { gap: '18px' } },
            h('div.sym-box', { style: { width: '96px', height: '96px', borderRadius: '22px', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flex: 'none' } }, symbolEl(s.id, 76)),
            h('div',
              h('div.eyebrow', STITCH_CATEGORIES.find((c) => c[0] === s.cat)?.[1] || ''),
              h('h1', uk ? s.ukName : s.name),
              h('div.row.wrap', { style: { marginTop: '8px' } },
                h('span.chip.accent', `US ${s.us}`),
                h('span.chip.sage', `UK ${s.uk}`),
                s.turn ? h('span.chip', `Turning ch ${s.turn}`) : null,
                s.h ? h('span.chip', `${s.h}× sc height`) : null))),
          h('p', { style: { marginTop: '16px' } }, counts)),
        h('div.card',
          h('h3', 'How to'),
          h('ol.steps', s.steps.map((st) => h('li', st)))),
        s.tip ? h('div.note', icon('info'), h('span', s.tip)) : null),
      h('div.stack',
        h('div.card',
          h('h3', 'In a pattern'),
          h('p.soft', { style: { fontSize: '14px' } }, uk
            ? `Write it as “${s.uk}”. In US patterns the same stitch is “${s.us}”.`
            : `Write it as “${s.us}”. In UK patterns the same stitch is “${s.uk}”.`),
          h('p.muted', { style: { fontSize: '13px' } }, 'The pattern checker understands it, including counts like “3 dc in next st”, repeats and totals.')),
        h('div.card',
          h('h3', 'Related'),
          h('div.chips', STITCHES.filter((x) => x.cat === s.cat && x.id !== s.id).slice(0, 8).map((x) => h('a.chip', { href: `#/create/stitches/${x.id}`, style: { textDecoration: 'none' } }, uk ? x.uk : x.us)))))));
  return null;
}

function patternDetail(root, id) {
  const p = STITCH_PATTERNS.find((x) => x.id === id);
  if (!p) {
    root.append(backLink('#/create/stitches', 'Stitches'), empty('alert', 'Unknown stitch pattern', null));
    return null;
  }
  root.append(
    backLink('#/create/stitches', 'Stitches'),
    h('div.cols',
      h('div.card.pad-lg',
        h('div.eyebrow', 'Stitch pattern'),
        h('h1', p.name),
        p.aka ? h('p.muted', p.aka) : null,
        h('p', { style: { marginTop: '10px' } }, p.about),
        h('div.chips', { style: { margin: '10px 0 16px' } }, h('span.chip.accent', `Multiple of ${p.multiple}${p.plus ? ` + ${p.plus}` : ''}`)),
        h('div.stack.tight', p.rows.map((r) => (/^(row|rnd)/i.test(r) ? h('div.doc-row', h('span.doc-box'), h('span', r), h('span')) : h('p.doc-note', { style: { marginLeft: 0 } }, r))))),
      h('div.stack',
        h('div.card',
          h('h3', 'Use it'),
          h('p.soft', { style: { fontSize: '14px' } }, `Chain any multiple of ${p.multiple}${p.plus ? `, plus ${p.plus}` : ''}. The size calculator in Plan works out the chain for a width at your gauge.`),
          h('div.btn-row',
            btn('Start a pattern with it', async () => {
              const pat = await store.put('patterns', blankPattern({ title: `${p.name} piece`, sections: [{ id: uid(6), name: p.name, text: p.rows.join('\n'), pieces: 1 }] }));
              toast('Pattern created.');
              go(`/create/patterns/${pat.id}`);
            }, { kind: 'primary', ico: 'plus' }),
            h('a.btn', { href: '#/plan/calc#resize' }, icon('calculator'), 'Chain for a width'))))));
  return null;
}

// Selling what you make: inventory, a fast market-day till, and the numbers
// (revenue, what materials cost, what your time actually earned).

import { h, mount, btn, field, input, numberInput, select, modal, toast, empty, stat, segmented, confirmDialog } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { money, fmt, timeAgo, dateInput, parseDateInput } from '../core/util.js';
import { pricing } from '../crochet/calc.js';
import { photo, coverId } from './common.js';

export const CHANNELS = ['Market', 'Online shop', 'Commission', 'Gift shop', 'Other'];

/** Materials cost of a project, from the yarn it pulled from the stash. */
export function materialsCost(p) {
  let m = Number(p.extraCost) || 0;
  for (const a of p.yarns || []) {
    const y = store.get('yarns', a.yarnId);
    if (y && y.price && y.yardsPerSkein) m += ((Number(a.yards) || 0) / y.yardsPerSkein) * y.price;
  }
  return m;
}

export function suggestedPrice(p) {
  const st = store.settings();
  return pricing({ materials: materialsCost(p), hours: (p.timeMs || 0) / 3600000, rate: st.rate || 15, overheadPct: 10, markup: 2 }).retail;
}

export function salesTab(root) {
  let view = 'stock';
  const content = h('div');
  const tabs = segmented([['stock', 'For sale', 'tag'], ['till', 'Market day', 'bag'], ['sold', 'Sold', 'check']], view, (v) => { view = v; draw(); }, { label: 'Sales view' });
  root.append(h('div.row.wrap.between', { style: { marginBottom: '14px' } }, tabs,
    btn('Put something up for sale', pickToSell, { ico: 'plus', kind: 'primary' })), content);
  const st = () => store.settings();

  function draw() {
    const projects = store.all('projects');
    const stock = projects.filter((p) => p.sale?.forSale && !p.sale?.sold);
    const sold = projects.filter((p) => p.sale?.sold).sort((a, b) => b.sale.sold.at - a.sale.sold.at);
    const cur = st().currency;
    if (view === 'till') return drawTill(stock, sold, cur);
    if (view === 'sold') return drawSold(sold, cur);
    const value = stock.reduce((a, p) => a + (Number(p.sale.price) || 0), 0);
    mount(content,
      h('div.stats.card', { style: { marginBottom: '14px' } },
        stat('Items for sale', String(stock.length)),
        stat('At list price', money(value, cur)),
        stat('Sold this year', String(sold.filter((p) => new Date(p.sale.sold.at).getFullYear() === new Date().getFullYear()).length))),
      stock.length ? h('div.grid', stock.map((p) => itemCard(p, cur))) : empty('tag', 'Nothing for sale yet', 'Mark a finished project as for sale and set a price. Loopwright suggests one from your materials and time.', btn('Put something up for sale', pickToSell, { kind: 'primary', ico: 'plus' })));
    return null;
  }

  function itemCard(p, cur) {
    const cost = materialsCost(p);
    const price = Number(p.sale.price) || 0;
    const cid = coverId(p);
    return h('div.card',
      cid ? h('div.thumb', { style: { aspectRatio: '4 / 3', marginBottom: '10px' } }, photo(cid)) : null,
      h('div.row.between', h('h3', p.name), h('b.result', money(price, cur))),
      h('div.muted', { style: { fontSize: '13px', margin: '4px 0 10px' } }, `Materials ${money(cost, cur)} · ${fmt((p.timeMs || 0) / 3600000, 1)} h · margin ${money(price - cost, cur)}`),
      h('div.btn-row', btn('Sold', () => sell(p), { kind: 'primary', small: true, ico: 'check' }), btn('Edit', () => saleModal(p), { small: true, kind: 'ghost' })));
  }

  function drawTill(stock, sold, cur) {
    const today = new Date().toDateString();
    const todays = sold.filter((p) => new Date(p.sale.sold.at).toDateString() === today);
    const total = todays.reduce((a, p) => a + (Number(p.sale.sold.price) || 0), 0);
    mount(content,
      h('div.card.pad-lg', { style: { marginBottom: '14px', textAlign: 'center' } },
        h('div.eyebrow', 'Today'),
        h('div.big-number', money(total, cur)),
        h('div.muted', `${todays.length} sold${todays.length ? `: ${todays.map((p) => p.name).join(', ')}` : ''}`)),
      stock.length ? h('div.grid.small', stock.map((p) => h('button.card.link', {
        type: 'button', style: { textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' },
        onClick: () => sell(p, true),
      }, h('div', { style: { fontWeight: 650 } }, p.name), h('div.result', { style: { marginTop: '6px' } }, money(Number(p.sale.price) || 0, cur)), h('div.muted', { style: { fontSize: '12px' } }, 'Tap when it sells')))) : h('p.muted', 'Nothing in stock.'));
  }

  function drawSold(sold, cur) {
    const year = new Date().getFullYear();
    const thisYear = sold.filter((p) => new Date(p.sale.sold.at).getFullYear() === year);
    const revenue = thisYear.reduce((a, p) => a + (Number(p.sale.sold.price) || 0), 0);
    const materials = thisYear.reduce((a, p) => a + materialsCost(p), 0);
    const hours = thisYear.reduce((a, p) => a + (p.timeMs || 0) / 3600000, 0);
    const byChannel = {};
    for (const p of thisYear) byChannel[p.sale.sold.channel || 'Other'] = (byChannel[p.sale.sold.channel || 'Other'] || 0) + (Number(p.sale.sold.price) || 0);
    mount(content,
      h('div.stats.card', { style: { marginBottom: '14px' } },
        stat(`Revenue ${year}`, money(revenue, cur)),
        stat('Materials', money(materials, cur)),
        stat('Profit', money(revenue - materials, cur)),
        stat('Per hour', hours ? money((revenue - materials) / hours, cur) : '—', hours ? `over ${fmt(hours, 1)} h` : 'log time to see this')),
      Object.keys(byChannel).length ? h('div.chips', { style: { marginBottom: '12px' } }, Object.entries(byChannel).sort((a, b) => b[1] - a[1]).map(([c, v]) => h('span.chip', `${c}: ${money(v, cur)}`))) : null,
      sold.length ? h('div.list', sold.map((p) => h('div.list-row',
        icon('check'),
        h('div.grow', h('div.title', p.name), h('div.meta', [p.sale.sold.channel, p.sale.sold.buyer, timeAgo(p.sale.sold.at)].filter(Boolean).join(' · '))),
        h('b.num', money(Number(p.sale.sold.price) || 0, cur)),
        btn('Undo', async () => {
          if (!(await confirmDialog('Undo this sale?', `${p.name} goes back into stock.`, { ok: 'Undo sale' }))) return;
          await store.put('projects', { ...p, sale: { ...p.sale, sold: null } });
        }, { kind: 'ghost', small: true })))) : empty('check', 'No sales yet', 'Sales you record show up here with your totals.'));
  }

  async function sell(p, quick = false) {
    const cur = st().currency;
    const sale = { price: Number(p.sale.price) || 0, at: Date.now(), channel: quick ? 'Market' : p.sale.channel || 'Market', buyer: '' };
    if (!quick) {
      const res = await modal({
        title: `Sold: ${p.name}`,
        body: h('div.fields',
          field(`Price (${cur})`, numberInput(sale.price, (v) => { sale.price = v || 0; }, { min: 0 })),
          field('Where', select(CHANNELS.map((c) => [c, c]), sale.channel, (v) => { sale.channel = v; })),
          field('Buyer', input({ placeholder: 'Optional', onInput: (e) => { sale.buyer = e.target.value; } })),
          field('Date', input({ type: 'date', value: dateInput(sale.at), onChange: (e) => { sale.at = parseDateInput(e.target.value) || Date.now(); } }))),
        actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Record sale', kind: 'primary', value: 'ok' }],
      });
      if (res !== 'ok') return;
    }
    await store.put('projects', { ...p, sale: { ...p.sale, sold: sale } });
    toast(`${p.name} sold for ${money(sale.price, cur)}.`, { action: { label: 'Undo', run: () => store.put('projects', { ...p }) } });
  }

  async function pickToSell() {
    const candidates = store.all('projects').filter((p) => p.status === 'done' && !p.sale?.forSale && !p.quick);
    if (!candidates.length) {
      toast('Finish a project first (Plan → Projects), then put it up for sale here.');
      return;
    }
    const chosen = await modal({
      title: 'What are you selling?',
      body: (close) => h('div.list', candidates.map((p) => h('button.list-row.link', { type: 'button', style: { border: 0, width: '100%', background: 'none', textAlign: 'left', font: 'inherit', color: 'inherit' }, onClick: () => close(p) },
        icon('tag'), h('div.grow', h('div.title', p.name), h('div.meta', `suggested ${money(suggestedPrice(p), st().currency)}`))))),
    });
    if (chosen) saleModal(chosen);
  }

  const off = store.on('projects', draw);
  draw();
  return off;
}

export async function saleModal(p) {
  const st = store.settings();
  const sale = { forSale: true, price: Math.round(suggestedPrice(p)), channel: 'Market', ...(p.sale || {}) };
  const res = await modal({
    title: `Sell ${p.name}`,
    body: h('div.stack',
      h('div.fields',
        field(`Price (${st.currency})`, numberInput(sale.price, (v) => { sale.price = v || 0; }, { min: 0 }), `Suggested ${money(suggestedPrice(p), st.currency)} from materials and ${fmt((p.timeMs || 0) / 3600000, 1)} h`),
        field('Usually sold at', select(CHANNELS.map((c) => [c, c]), sale.channel, (v) => { sale.channel = v; })))),
    actions: [
      p.sale?.forSale ? { label: 'Take off sale', kind: 'danger', value: 'off' } : null,
      { label: 'Cancel', kind: 'ghost', value: null },
      { label: p.sale?.forSale ? 'Save' : 'Put up for sale', kind: 'primary', value: 'ok' },
    ].filter(Boolean),
  });
  if (res === 'ok') await store.put('projects', { ...p, sale: { ...sale, forSale: true } });
  if (res === 'off') await store.put('projects', { ...p, sale: { ...sale, forSale: false } });
}

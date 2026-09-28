// Share: links, QR codes, share cards, files, print, and backups. Also
// receives shares (#/s/CODE and #/import/DATA).

import { h, mount, btn, input, segmented, pageHead, modal, confirmDialog, toast, empty, toggle, svgFromString } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { copyText, download, slug, pickFile, readText, fmt, loadImage } from '../core/util.js';
import { qrSvg } from '../core/qr.js';
import { envelope, makeLink, unpack, parseShareInput, KINDS } from '../core/share.js';
import * as api from '../core/api.js';
import { diagram } from '../crochet/diagram.js';
import { parsePattern } from '../crochet/parser.js';
import { unpackCells, packCells } from '../crochet/chart.js';
import { weightById, hookLabel } from '../crochet/calc.js';
import { colorName, inkFor } from '../crochet/color.js';
import { backLink, parsed } from './common.js';
import { patternDocument, printElement } from './print.js';
import { chartImage } from './charts.js';

const STORE_OF = { pattern: 'patterns', chart: 'charts', palette: 'palettes' };
// A share opened from a file, handed from the picker to the preview route.
let incomingFile = null;
const ICON_OF = { pattern: 'book', chart: 'grid', palette: 'palette' };
const titleOf = (kind, item) => (kind === 'pattern' ? item.title : item.name) || 'Untitled';

export async function render(root, route) {
  if (route.section === 's') return receive(root, { code: route.parts[0] });
  if (route.section === 'import') return receive(root, { packed: route.parts[0] });
  root.append(pageHead('Share', 'Hand a pattern to a friend, print it, post it, or back up everything you’ve made.'));
  const { kind, id } = route.query;
  const item = kind && id ? store.get(STORE_OF[kind], id) : null;
  const panel = h('div');
  root.append(h('div.cols', h('div.stack', panel), h('div.stack', importCard(), backupCard())));
  if (item) sharePanel(panel, kind, item);
  else pickerPanel(panel);
  return null;
}

// ---------------------------------------------------------------------------
// Choose something to share
// ---------------------------------------------------------------------------

function pickerPanel(root) {
  let kind = 'pattern';
  const list = h('div');
  const draw = () => {
    const items = store.all(STORE_OF[kind]);
    mount(list, items.length
      ? h('div.list', items.map((it) => h('button.list-row.link', {
        type: 'button', style: { border: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', background: 'none' },
        onClick: () => { history.replaceState(null, '', `#/share?kind=${kind}&id=${it.id}`); sharePanel(root, kind, it); },
      }, h('span.share-kind', { class: kind }, icon(ICON_OF[kind])), h('div.grow', h('div.title', titleOf(kind, it)), h('div.meta', subtitle(kind, it))), icon('chevron-right'))))
      : empty(ICON_OF[kind], `No ${KINDS[kind].toLowerCase()}s yet`, null));
  };
  mount(root, h('div.card',
    h('h2', 'Share something'),
    h('p.soft', { style: { fontSize: '14px', margin: '4px 0 12px' } }, 'Pick what to share. You get a link, a QR code to show on your phone, a share image for social media, and a file.'),
    segmented([['pattern', 'Patterns', 'book'], ['chart', 'Charts', 'grid'], ['palette', 'Palettes', 'palette']], kind, (v) => { kind = v; draw(); }, { label: 'Kind' }),
    h('div', { style: { marginTop: '12px' } }, list)));
  draw();
}

function subtitle(kind, it) {
  if (kind === 'pattern') {
    const p = parsed(it);
    return [it.category, `${p.rows} rows`, it.terms === 'UK' ? 'UK terms' : null].filter(Boolean).join(' · ');
  }
  if (kind === 'chart') return `${it.w} × ${it.h} · ${it.palette.length} colors`;
  return it.colors.map(colorName).join(', ');
}

// ---------------------------------------------------------------------------
// Share one item
// ---------------------------------------------------------------------------

async function sharePanel(root, kind, item) {
  let selfContained = !(await api.online());
  let link = null;
  const linkBox = h('div');
  const qrBox = h('div');
  const cardBox = h('div');

  async function makeIt() {
    mount(linkBox, h('p.muted.pulse', 'Making a link…'));
    link = await makeLink(envelope(kind, item), { preferServer: !selfContained });
    const tooBig = link.url.length > 2300;
    mount(linkBox,
      h('div.link-box', input({ value: link.url, readonly: true, 'aria-label': 'Share link', onFocus: (e) => e.target.select() }), btn('Copy', async () => { await copyText(link.url); toast('Link copied.'); }, { ico: 'copy', kind: 'primary' })),
      h('p.muted', { style: { fontSize: '12.5px', marginTop: '8px' } }, link.mode === 'server'
        ? `Short code ${link.code}: works for anyone who can reach this Loopwright server.`
        : `A self-contained link (${fmt(link.url.length / 1024, 1)} KB): the ${kind} travels inside it, so it works anywhere Loopwright is hosted. Nothing is uploaded.`));
    mount(qrBox, tooBig
      ? h('div.note', icon('info'), h('span', 'This link is too long for a QR code. Use the community server for a short code, or send the file.'))
      : h('div.stack.tight', { style: { alignItems: 'flex-start' } }, h('div.qr-box', svgFromString(qrSvg(link.url, { ecl: 'M' }))), h('span.muted', { style: { fontSize: '12.5px' } }, 'Show this on your phone at a market or meetup.')));
    drawCard();
  }

  async function drawCard() {
    mount(cardBox, h('p.muted.pulse', 'Drawing a share card…'));
    const canvas = await shareCard(kind, item, link?.url);
    canvas.className = 'card-canvas';
    mount(cardBox, canvas, h('div.btn-row', { style: { marginTop: '10px' } },
      btn('Download image', () => canvas.toBlob((b) => download(`${slug(titleOf(kind, item))}.png`, b)), { ico: 'download', small: true }),
      navigator.canShare ? btn('Share image', () => canvas.toBlob(async (b) => {
        const file = new File([b], `${slug(titleOf(kind, item))}.png`, { type: 'image/png' });
        try {
          if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: titleOf(kind, item), text: link?.url });
        } catch { /* cancelled */ }
      }), { ico: 'share', small: true }) : null));
  }

  mount(root,
    backLink('#/share', 'Share something else'),
    h('div.card.pad-lg',
      h('div.share-item', h('span.share-kind', { class: kind }, icon(ICON_OF[kind])), h('div.grow', h('div.eyebrow', KINDS[kind]), h('h2', titleOf(kind, item)), h('div.muted', subtitle(kind, item)))),
      h('hr'),
      h('div.row.between.wrap', h('h3', 'Link'), toggle('Self-contained link', selfContained, (v) => { selfContained = v; makeIt(); }, 'No server needed')),
      h('div', { style: { marginTop: '10px' } }, linkBox),
      h('div.btn-row', { style: { marginTop: '12px' } },
        navigator.share ? btn('Share…', async () => { try { await navigator.share({ title: titleOf(kind, item), text: `${titleOf(kind, item)} — made with Loopwright`, url: link?.url }); } catch { /* cancelled */ } }, { ico: 'share' }) : null,
        btn('Post it', () => go('/post'), { ico: 'post', kind: 'ghost' }),
        btn('Download file', () => download(`${slug(titleOf(kind, item))}.loopwright.json`, envelope(kind, item)), { ico: 'download', kind: 'ghost' }),
        kind === 'pattern' ? btn('Print / PDF', () => printElement(patternDocument(item), titleOf(kind, item)), { ico: 'print', kind: 'ghost' }) : null),
      h('hr'),
      h('div.cols.even', h('div', h('h3', { style: { marginBottom: '10px' } }, 'QR code'), qrBox), h('div', h('h3', { style: { marginBottom: '10px' } }, 'Share card'), cardBox))));
  makeIt();
}

// A 1080×1350 image for social media: preview, details, QR.
export async function shareCard(kind, item, url) {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const accent = '#b4481f';
  ctx.fillStyle = '#faf6f0';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 16);
  const serif = "600 72px ui-serif, 'Iowan Old Style', Palatino, Georgia, serif";
  ctx.fillStyle = '#241c17';
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillText(KINDS[kind].toUpperCase(), 80, 110);
  ctx.font = serif;
  wrapText(ctx, titleOf(kind, item), 80, 190, W - 160, 80, 2);
  ctx.font = '400 30px system-ui, sans-serif';
  ctx.fillStyle = '#5a4d44';
  const by = kind === 'pattern' ? [item.designer && `by ${item.designer}`, item.category].filter(Boolean).join(' · ') : subtitle(kind, item);
  ctx.fillText(by || '', 80, 360);

  // Preview area.
  const box = { x: 80, y: 410, w: W - 160, h: 640 };
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, box.x, box.y, box.w, box.h, 28);
  ctx.fill();
  try {
    if (kind === 'pattern') {
      if (item.coverId) {
        const url2 = await store.mediaUrl(item.coverId);
        const img = await loadImage(url2);
        drawCover(ctx, img, box);
      } else {
        const p = parsePattern(item);
        const d = diagram(p.sections[0]?.parsed.lines || [], { maxRows: 12 });
        if (d) {
          const svg = d.svg.replace('<svg ', '<svg width="600" height="600" ').replace('</svg>', `<style>.sym{fill:none;stroke:#241c17;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.sym-fill{fill:#241c17}.ring-guide{fill:none;stroke:#e0d6ca;stroke-dasharray:2 5}.rlabel{font:700 9px sans-serif;fill:#8b7d72}</style></svg>`);
          const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
          const s = Math.min((box.w - 60) / img.width, (box.h - 60) / img.height);
          ctx.drawImage(img, box.x + (box.w - img.width * s) / 2, box.y + (box.h - img.height * s) / 2, img.width * s, img.height * s);
        }
      }
    } else if (kind === 'chart') {
      const chart = { ...item, cells: unpackCells(item.cells, item.w * item.h) };
      const px = Math.max(1, Math.floor(Math.min((box.w - 60) / chart.w, (box.h - 60) / chart.h)));
      const img = chartImage(chart, px, { grid: px >= 10 });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, box.x + (box.w - img.width) / 2, box.y + (box.h - img.height) / 2);
    } else {
      const n = item.colors.length;
      item.colors.forEach((hex, i) => {
        const bw = (box.w - 60) / n;
        ctx.fillStyle = hex;
        ctx.fillRect(box.x + 30 + i * bw, box.y + 30, bw, box.h - 60);
        ctx.fillStyle = inkFor(hex);
        ctx.font = '700 24px ui-monospace, monospace';
        ctx.fillText(hex.toUpperCase(), box.x + 44 + i * bw, box.y + box.h - 90);
        ctx.font = '400 22px system-ui, sans-serif';
        ctx.fillText(colorName(hex), box.x + 44 + i * bw, box.y + box.h - 56);
      });
    }
  } catch (err) {
    console.warn('Share card preview failed', err);
  }

  // Details and QR.
  ctx.fillStyle = '#241c17';
  ctx.font = '600 30px system-ui, sans-serif';
  const details = kind === 'pattern'
    ? [parsed(item).rows ? `${parsed(item).rows} rows` : null, item.yarnWeight !== undefined && item.yarnWeight !== null ? weightById(item.yarnWeight).name : null, item.hookMm ? hookLabel(item.hookMm) : null, item.terms === 'UK' ? 'UK terms' : 'US terms'].filter(Boolean).join('  ·  ')
    : kind === 'chart' ? `${item.w} × ${item.h}  ·  ${item.palette.length} colors` : `${item.colors.length} colors`;
  ctx.fillText(details, 80, 1120);
  ctx.font = '400 26px system-ui, sans-serif';
  ctx.fillStyle = '#8b7d72';
  ctx.fillText('Made with Loopwright', 80, 1250);
  if (url && url.length < 1800) {
    const qimg = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(url, { px: 4 }))}`);
    ctx.drawImage(qimg, W - 80 - 200, 1090, 200, 200);
  }
  return c;
}

function drawCover(ctx, img, box) {
  const s = Math.max(box.w / img.width, box.h / img.height);
  const w = img.width * s;
  const hh = img.height * s;
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, 28);
  ctx.clip();
  ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - hh) / 2, w, hh);
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
  const words = String(text).split(/\s+/);
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(lines === maxLines - 1 ? `${line}…` : line, x, y + lines * lineH);
      lines++;
      if (lines >= maxLines) return;
      line = words[i];
    } else line = test;
  }
  ctx.fillText(line, x, y + lines * lineH);
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

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function importCard() {
  let text = '';
  return h('div.card',
    h('h3', 'Open a share'),
    h('p.soft', { style: { fontSize: '14px', margin: '4px 0 10px' } }, 'Paste a link or 8-letter code someone sent you, or open a .loopwright.json file.'),
    h('div.row', h('div.grow', input({ placeholder: 'Link or code', 'aria-label': 'Share link or code', onInput: (e) => { text = e.target.value; }, onKeydown: (e) => { if (e.key === 'Enter') open(); } })), btn('Open', () => open(), { kind: 'primary' })),
    btn('Open a file', async () => {
      const f = await pickFile('.json,application/json');
      if (!f) return;
      try {
        const data = JSON.parse(await readText(f));
        if (data.kind === 'backup') {
          toast('That’s a backup: use “Restore” below.');
          return;
        }
        if (data.app !== 'loopwright' || !KINDS[data.kind]) throw new Error('Not a Loopwright share file.');
        incomingFile = data;
        go('/import/file');
      } catch (err) {
        toast(err.message, { kind: 'err' });
      }
    }, { ico: 'upload', kind: 'ghost', small: true, attrs: { style: 'margin-top:10px' } }));

  function open() {
    const parsedInput = parseShareInput(text);
    if (!parsedInput) {
      toast('That doesn’t look like a Loopwright link or code.', { kind: 'err' });
      return;
    }
    go(parsedInput.code ? `/s/${parsedInput.code}` : `/import/${parsedInput.packed}`);
  }
}

async function receive(root, { code, packed }) {
  root.append(backLink('#/share', 'Share'));
  const body = h('div');
  root.append(body);
  mount(body, h('p.muted.pulse', 'Opening…'));
  let env;
  try {
    if (code) {
      if (!(await api.online())) throw new Error('Share codes need the Loopwright server this code came from. Ask for a self-contained link or the file instead.');
      env = (await api.getShare(code.toUpperCase())).envelope;
    } else if (packed === 'file') {
      env = incomingFile;
      if (!env) throw new Error('Nothing to open. Pick the file again.');
    } else {
      env = await unpack(packed);
    }
    if (!env || env.app !== 'loopwright' || !KINDS[env.kind]) throw new Error('That isn’t a Loopwright share.');
  } catch (err) {
    mount(body, empty('alert', 'Couldn’t open that share', err.message));
    return null;
  }
  const kind = env.kind;
  const data = sanitize(kind, env.data);
  mount(body, h('div.card.pad-lg',
    h('div.share-item', h('span.share-kind', { class: kind }, icon(ICON_OF[kind])), h('div.grow', h('div.eyebrow', `${KINDS[kind]} shared${env.from?.name ? ` by ${env.from.name}` : ''}`), h('h1', titleOf(kind, data)))),
    h('div', { style: { margin: '16px 0' } }, previewOf(kind, data)),
    h('div.btn-row',
      btn('Save to my studio', async () => {
        const row = await store.put(STORE_OF[kind], { ...data, id: null, sample: false, receivedFrom: env.from?.name || null });
        toast('Saved.');
        go(kind === 'pattern' ? `/create/patterns/${row.id}` : kind === 'chart' ? `/create/charts/${row.id}` : '/imagine/palettes');
      }, { kind: 'primary', ico: 'download' }),
      btn('Not now', () => go('/'), { kind: 'ghost' }))));
  return null;
}

// Shares come from other people: keep only the fields we know, of the types we expect.
function sanitize(kind, d = {}) {
  const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#cccccc');
  if (kind === 'pattern') {
    return {
      title: str(d.title) || 'Shared pattern', designer: str(d.designer), category: str(d.category, 40), difficulty: num(d.difficulty) || 2,
      terms: d.terms === 'UK' ? 'UK' : 'US', yarnWeight: num(d.yarnWeight), hookMm: num(d.hookMm),
      gauge: d.gauge && typeof d.gauge === 'object' ? { sts: num(d.gauge.sts), rows: num(d.gauge.rows), per: num(d.gauge.per) || 4, unit: d.gauge.unit === 'cm' ? 'cm' : 'in' } : null,
      size: str(d.size), materials: str(d.materials, 4000), notes: str(d.notes, 8000), license: str(d.license, 300), source: str(d.source, 500),
      tags: Array.isArray(d.tags) ? d.tags.slice(0, 12).map((t) => str(t, 32)) : [],
      sections: (Array.isArray(d.sections) ? d.sections : []).slice(0, 40).map((s) => ({ id: str(s.id, 20) || Math.random().toString(36).slice(2, 8), name: str(s.name, 80) || 'Part', text: str(s.text, 60000), pieces: Math.max(1, Math.min(50, num(s.pieces) || 1)) })),
    };
  }
  if (kind === 'chart') {
    const w = Math.max(2, Math.min(300, num(d.w) || 10));
    const hh = Math.max(2, Math.min(300, num(d.h) || 10));
    const palette = (Array.isArray(d.palette) ? d.palette : []).slice(0, 32).map(hex);
    const cells = unpackCells(d.cells, w * hh).map((c) => Math.max(0, Math.min(palette.length - 1, Number(c) || 0)));
    return { name: str(d.name) || 'Shared chart', w, h: hh, palette: palette.length ? palette : ['#ffffff', '#000000'], cells: packCells(cells), mode: ['tapestry', 'round', 'c2c'].includes(d.mode) ? d.mode : 'tapestry', start: d.start === 'bottom-left' ? 'bottom-left' : 'bottom-right', weight: num(d.weight) ?? 4 };
  }
  return { name: str(d.name) || 'Shared palette', colors: (Array.isArray(d.colors) ? d.colors : []).slice(0, 12).map(hex) };
}

function previewOf(kind, data) {
  if (kind === 'palette') return h('div.palette-strip', { style: { minHeight: '140px' } }, data.colors.map((c) => h('div', { style: { '--c': c, '--ink-on': inkFor(c) } }, h('div.hex', c), h('div.nm', colorName(c)))));
  if (kind === 'chart') {
    const chart = { ...data, cells: unpackCells(data.cells, data.w * data.h) };
    const img = chartImage(chart, Math.max(3, Math.floor(420 / Math.max(chart.w, chart.h))), { grid: true });
    img.style.cssText = 'max-width:100%;image-rendering:pixelated;border-radius:12px';
    return h('div.stack.tight', img, h('div.muted', `${data.w} × ${data.h} · ${data.palette.length} colors`));
  }
  const p = parsePattern(data);
  return h('div.stack',
    h('div.chips', h('span.chip', `${p.rows} rows`), h('span.chip', `${p.stitches.toLocaleString()} stitches`), p.errors ? h('span.chip.err', `${p.errors} count errors`) : h('span.chip.sage', icon('check'), 'Counts check out'), h('span.chip', `${data.terms} terms`)),
    h('div.card.flat', { style: { maxHeight: '380px', overflow: 'auto' } }, patternDocument(data, { diagrams: false })));
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

function backupCard() {
  const usage = h('div.muted', { style: { fontSize: '13px' } });
  store.usage().then((u) => {
    if (!u) return;
    usage.textContent = `Using ${fmt((u.usage || 0) / 1048576, 1)} MB on this device${u.persisted ? ' · protected from automatic clean-up' : ''}.`;
  });
  let withPhotos = true;
  return h('div.card',
    h('h3', 'Backup and restore'),
    h('p.soft', { style: { fontSize: '14px', margin: '4px 0 10px' } }, 'Everything lives on this device. Download a backup now and then, and use it to move to a new phone or computer.'),
    toggle('Include photos', withPhotos, (v) => { withPhotos = v; }),
    h('div.btn-row', { style: { marginTop: '12px' } },
      btn('Download backup', async () => {
        const data = await store.exportAll({ media: withPhotos });
        download(`loopwright-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
        await store.metaSet('lastBackup', Date.now());
        toast('Backup downloaded.');
      }, { kind: 'primary', ico: 'download' }),
      btn('Restore…', async () => {
        const f = await pickFile('.json,application/json');
        if (!f) return;
        let data;
        try {
          data = JSON.parse(await readText(f));
        } catch {
          toast('That file isn’t valid JSON.', { kind: 'err' });
          return;
        }
        const mode = await modal({
          title: 'Restore a backup',
          body: h('p', 'Merge keeps what you have and adds anything newer from the backup. Replace clears this device first.'),
          actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Replace', kind: 'danger', value: 'replace' }, { label: 'Merge', kind: 'primary', value: 'merge' }],
        });
        if (!mode) return;
        if (mode === 'replace' && !(await confirmDialog('Replace everything?', 'Projects, patterns, charts, stash and journal on this device will be replaced by the backup.', { ok: 'Replace', danger: true }))) return;
        try {
          const n = await store.importAll(data, mode);
          toast(`Restored ${n} items.`);
        } catch (err) {
          toast(err.message, { kind: 'err' });
        }
      }, { ico: 'upload' }),
      navigator.storage?.persist ? btn('Protect storage', async () => {
        const ok = await navigator.storage.persist();
        toast(ok ? 'The browser will keep your data even when space runs low.' : 'The browser declined; installing the app to your home screen usually helps.');
      }, { kind: 'ghost', ico: 'lock' }) : null),
    h('div', { style: { marginTop: '10px' } }, usage));
}


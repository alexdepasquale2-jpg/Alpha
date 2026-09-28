// Build: the work-mode tracker. Big targets, follows the pattern row by row
// or stitch by stitch, keeps counters, times sessions, keeps the screen on,
// and listens for "next" when your hands are full.

import { h, mount, btn, iconBtn, field, input, numberInput, pageHead, modal, confirmDialog, toast, empty, menu, segmented, toggle } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { clock, duration, uid, vibrate, clamp } from '../core/util.js';
import { stitchLabel } from '../crochet/stitches.js';
import { tapestryRows, c2cRows } from '../crochet/chart.js';
import { colorLetter } from '../crochet/generators.js';
import { inkFor } from '../crochet/color.js';
import { projectProgress, progressBar, coverId, thumb, statusChip, parsed, backLink } from './common.js';
import { loadChart } from './charts.js';

export async function render(root, route) {
  const [id] = route.parts;
  if (!id) return picker(root);
  return work(root, id);
}

// ---------------------------------------------------------------------------
// Picker
// ---------------------------------------------------------------------------

function picker(root) {
  root.append(pageHead('Build', 'Pick up a project and keep your place, row by row or stitch by stitch.'));
  const content = h('div');
  root.append(content);
  const draw = () => {
    const active = store.all('projects').filter((p) => p.status === 'active');
    const queued = store.all('projects').filter((p) => p.status === 'queued' || p.status === 'idea');
    mount(content,
      active.length ? h('div.grid.two', active.map((p) => {
        const prog = projectProgress(p);
        return h('a.card', { href: `#/build/${p.id}` },
          h('div.continue', { style: { gridTemplateColumns: '72px minmax(0,1fr)' } },
            thumb(coverId(p)),
            h('div',
              h('h3', p.name),
              h('div.muted', { style: { fontSize: '13px', margin: '4px 0 8px' } }, prog.step ? `${prog.step.part} · ${prog.step.label}` : p.chartId ? 'Chart' : p.patternId ? 'Pattern complete' : 'Counters only'),
              prog.pct !== null ? progressBar(prog.pct) : null)));
      })) : empty('build', 'Nothing in progress', 'Start a project from your queue, or open a pattern and press “Work on it”.', null),
      queued.length ? h('div',
        h('div.section-title', h('h2', 'Start one of these'), h('a', { href: '#/plan/projects' }, 'All projects')),
        h('div.list', queued.slice(0, 8).map((p) => h('div.list-row',
          statusChip(p.status),
          h('div.grow.title', p.name),
          btn('Start', async () => {
            await store.put('projects', { ...p, status: 'active', startedAt: p.startedAt || Date.now() });
            go(`/build/${p.id}`);
          }, { small: true, ico: 'play' }))))) : null,
      h('div.section-title', h('h2', 'Just a counter'), null),
      h('div.card', h('p.soft', 'No project, no pattern: a big row counter you can keep on screen.'),
        btn('Open a counter', async () => {
          let p = store.all('projects').find((x) => x.quick);
          if (!p) p = await store.put('projects', { name: 'Quick counter', status: 'active', quick: true, counters: [{ id: uid(6), name: 'Rows', value: 0 }, { id: uid(6), name: 'Repeats', value: 0 }], photoIds: [], yarns: [] });
          go(`/build/${p.id}`);
        }, { ico: 'counter' })));
  };
  draw();
  return store.on('projects', draw);
}

// ---------------------------------------------------------------------------
// Steps: what we're walking through
// ---------------------------------------------------------------------------

function stepsFor(p) {
  if (p.chartId) {
    const row = store.get('charts', p.chartId);
    if (!row) return { steps: [], kind: 'none' };
    const chart = loadChart(row);
    const rows = row.mode === 'c2c' ? c2cRows(chart, { start: row.start || 'bottom-right' }) : tapestryRows(chart, { mode: row.mode, handed: store.settings().handed });
    return {
      kind: 'chart',
      palette: chart.palette,
      steps: rows.map((r) => ({
        part: row.name,
        label: `Row ${r.row}`,
        text: r.runs.map((x) => `${x.n} ${colorLetter(x.color)}`).join(', '),
        count: r.runs.reduce((a, x) => a + x.n, 0),
        runs: r.runs,
        dir: r.dir,
        side: r.side || null,
        extra: row.mode === 'c2c' ? `${r.tiles} tiles · ${r.bottom === r.side ? `${r.bottom} both edges` : `${r.bottom} along the bottom, ${r.side} up the side`}` : null,
        atoms: r.runs.flatMap((x) => Array(x.n).fill({ st: row.mode === 'c2c' ? 'tile' : 'sc', color: x.color })),
        notes: [],
      })),
    };
  }
  if (p.patternId) {
    const pat = store.get('patterns', p.patternId);
    if (!pat) return { steps: [], kind: 'none' };
    return { kind: 'pattern', steps: parsed(pat).steps, terms: pat.terms || 'US' };
  }
  return { steps: [], kind: 'none' };
}

// Stitch-by-stitch description of one atom.
function atomText(a, terms) {
  if (!a) return { name: '', where: '' };
  if (a.st === 'tile') return { name: 'tile', where: '' };
  if (a.st === 'sk') return { name: terms === 'UK' ? 'miss' : 'skip', where: 'the next stitch' };
  if (a.st === 'group') return { name: `(${a.text})`, where: a.place === 'same' ? 'in the same stitch' : a.place === 'sp' ? 'in the next space' : 'in the next stitch' };
  const lbl = a.st === 'dec' ? 'dec' : stitchLabel(a.st, terms);
  if (a.move) return { name: lbl, where: 'moving along, not counted' };
  if (a.countsAs) return { name: `ch ${a.n || 3}`, where: `counts as a ${stitchLabel(a.countsAs, terms)}` };
  if (a.st === 'ch') return { name: 'ch', where: '' };
  if (a.multi) return { name: `${a.multi} ${lbl}`, where: a.place === 'ring' ? 'into the ring' : a.place === 'same' ? 'in the same stitch' : a.place === 'sp' ? 'in the next space' : 'in the next stitch' };
  if (a.place === 'ring') return { name: lbl, where: 'into the ring' };
  if (a.st === 'inc') return { name: 'inc', where: `2 ${terms === 'UK' ? 'dc' : 'sc'} in the next stitch` };
  if (a.st === 'dec' || a.st === 'invdec' || /tog$/.test(a.st)) return { name: lbl, where: `over the next ${a.c} stitches` };
  return { name: lbl, where: a.place === 'same' ? 'in the same stitch' : 'in the next stitch' };
}

// ---------------------------------------------------------------------------
// Work mode
// ---------------------------------------------------------------------------

function work(root, id) {
  let p = store.get('projects', id);
  if (!p) {
    root.append(backLink('#/build', 'Build'), empty('alert', 'Project not found', null));
    return null;
  }
  const settings = store.settings();
  const src = stepsFor(p);
  const steps = src.steps;
  let pos = { step: 0, atom: 0, rep: 0, ...(p.pos || {}) };
  pos.step = clamp(pos.step, 0, Math.max(0, steps.length));
  let mode = p.trackMode || 'row';
  let saveTimer = null;
  let wakeLock = null;
  let recog = null;
  let tick = null;

  const save = (patch = {}) => {
    p = { ...store.get('projects', id), ...p, ...patch, pos };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.put('projects', p, { silent: true }), 250);
  };
  const flush = () => {
    clearTimeout(saveTimer);
    return store.put('projects', { ...p, pos }, { silent: true });
  };

  // ---- timer -------------------------------------------------------------
  const running = () => !!p.timer?.start;
  const sessionMs = () => (running() ? Date.now() - p.timer.start : 0);
  const startTimer = () => {
    if (running()) return;
    p = { ...p, timer: { start: Date.now() } };
    flush();
    drawTimer();
  };
  const stopTimer = () => {
    if (!running()) return;
    const end = Date.now();
    const start = p.timer.start;
    const ms = end - start;
    p = { ...p, timer: null, timeMs: (p.timeMs || 0) + ms, sessions: [...(p.sessions || []), { start, end }] };
    flush();
    drawTimer();
    if (ms > 60000) toast(`Logged ${duration(ms)}.`);
  };

  // ---- elements ------------------------------------------------------------
  const timerFace = h('div.timer-face', '0:00');
  const timerBtn = h('div');
  const nowEl = h('section.now', { 'aria-live': 'polite' });
  const listEl = h('div.list.upcoming');
  const countersEl = h('div.stack.tight');

  function drawTimer() {
    timerFace.textContent = clock(sessionMs());
    mount(timerBtn, running()
      ? btn('Pause', stopTimer, { ico: 'pause', small: true })
      : btn('Start timer', startTimer, { ico: 'play', small: true, kind: 'primary' }));
  }

  // ---- navigation ----------------------------------------------------------
  const cur = () => steps[pos.step] || null;
  const atoms = () => cur()?.atoms || [];

  function advanceRow(dir = 1) {
    const before = pos.step;
    pos.step = clamp(pos.step + dir, 0, steps.length);
    pos.atom = 0;
    pos.rep = 0;
    if (pos.step !== before) {
      // Linked counters follow the rows.
      p = { ...p, counters: (p.counters || []).map((c) => (c.linked ? bump(c, dir) : c)) };
      if (settings.haptics) vibrate(dir > 0 ? [18, 40, 18] : 10);
      if (dir > 0) {
        const done = steps[before];
        const next = steps[pos.step];
        if (!next) finished();
        else if (done && (next.part !== done.part || next.piece !== done.piece)) celebrate(`${done.part}${done.pieces > 1 ? ` ${done.piece} of ${done.pieces}` : ''} done!`);
      }
    }
    save();
    draw();
  }

  function advanceStitch(dir = 1) {
    const n = atoms().length;
    if (!n) return advanceRow(dir);
    const next = pos.atom + dir;
    if (next >= n) return advanceRow(1);
    if (next < 0) {
      if (pos.step === 0) return null;
      advanceRow(-1);
      pos.atom = Math.max(0, atoms().length - 1);
      save();
      draw();
      return null;
    }
    pos.atom = next;
    if (settings.haptics) vibrate(8);
    save();
    drawNow();
    return null;
  }

  function jump(i) {
    pos = { step: clamp(i, 0, steps.length), atom: 0, rep: 0 };
    save();
    draw();
  }

  async function finished() {
    celebrate('Pattern complete!');
    stopTimer();
    if (await confirmDialog('You finished the pattern!', 'Mark the project as finished? You can add photos and post it next.', { ok: 'Mark finished' })) {
      await store.put('projects', { ...p, pos, status: 'done', finishedAt: Date.now() });
      go(`/plan/projects/${p.id}`);
    }
  }

  function bump(c, d) {
    let v = (Number(c.value) || 0) + d;
    if (c.max && v > c.max) v = 1;
    if (c.max && v < 1 && d < 0) v = c.max;
    return { ...c, value: Math.max(0, v) };
  }

  // ---- the "now" card --------------------------------------------------------
  function drawNow() {
    const step = cur();
    const total = steps.length;
    if (src.kind === 'none') {
      mount(nowEl,
        h('div.now-top', h('div', h('div.now-part', 'Counters'), h('div.now-label', p.name))),
        h('p.soft', { style: { marginTop: '10px' } }, p.quick ? 'A free counter. Tap the big button to count a row.' : 'No pattern or chart linked, so this is a counter. Link a pattern from the project page to follow it row by row.'),
        bigCounter());
      return;
    }
    if (!step) {
      mount(nowEl,
        h('div.now-part', 'All done'),
        h('div.now-label', 'Finished'),
        h('p.soft', { style: { marginTop: '10px' } }, `${total} rows worked.`),
        h('div.now-actions', btn('Back a row', () => advanceRow(-1), { ico: 'undo' }), btn('Start over', () => jump(0), { kind: 'ghost' })));
      return;
    }
    const inPart = steps.filter((s) => s.part === step.part && s.piece === step.piece);
    const idxInPart = inPart.indexOf(step) + 1;
    const a = atoms();
    const t = atomText(a[pos.atom], src.terms);
    const doneSt = a.slice(0, pos.atom).reduce((acc, x) => acc + (x.p ?? 1), 0);
    mount(nowEl,
      h('div.now-top',
        h('div',
          h('div.now-part', `${step.part}${step.pieces > 1 ? ` · piece ${step.piece} of ${step.pieces}` : ''} · ${idxInPart} of ${inPart.length}`),
          h('div.now-label', step.label, step.rangeLabel ? h('span.muted', { style: { fontSize: '16px', fontFamily: 'var(--sans)', marginLeft: '10px' } }, `of ${step.rangeLabel}`) : null)),
        segmented([['row', 'Rows', 'list'], ['stitch', 'Stitches', 'stitch']], mode, (v) => { mode = v; save({ trackMode: v }); drawNow(); }, { small: true, label: 'Tracking mode' })),
      step.notes?.length ? h('div.stack.tight', { style: { marginTop: '12px' } }, step.notes.map((n) => h('div.note.warn', icon('flag'), h('span', n)))) : null,
      src.kind === 'chart'
        ? h('div.seq', step.runs.map((r, i) => h('span.part', { class: mode === 'stitch' && runIndex(step, pos.atom) === i ? 'cur' : '', style: { background: src.palette[r.color], color: inkFor(src.palette[r.color]), borderColor: 'transparent' } }, `${r.n} ${colorLetter(r.color)}`)))
        : h('p.now-text', step.text.replace(/^[^:]*:\s*/, '')),
      h('div.row.wrap', { style: { gap: '14px' } },
        step.count ? h('span.now-count', h('b', String(step.count)), src.kind === 'chart' ? 'stitches' : 'sts at the end') : null,
        step.dir ? h('span.chip', `${step.dir} ${step.side || ''}`) : null,
        step.mods?.length ? step.mods.map((m) => h('span.chip.accent', m)) : null,
        step.extra ? h('span.muted', { style: { fontSize: '13px' } }, step.extra) : null),
      mode === 'row' && step.summary ? repeatHelper(step) : null,
      mode === 'stitch' && a.length
        ? h('div',
          h('button.tapzone', { type: 'button', onClick: () => advanceStitch(1), 'aria-label': `Next stitch: ${t.name}` },
            a[pos.atom]?.color !== undefined ? h('span.swatch', { style: { '--c': src.palette[a[pos.atom].color], width: '44px', height: '44px', borderRadius: '12px' } }) : null,
            h('span.st-name', a[pos.atom]?.color !== undefined ? `${colorLetter(a[pos.atom].color)}` : t.name),
            t.where ? h('span.st-where', t.where) : null,
            h('span.st-pos', `${pos.atom + 1} of ${a.length}${src.kind === 'pattern' ? ` · ${doneSt} of ${step.count ?? '?'} sts made` : ''}`)),
          a.length <= 160 ? h('div.stitch-bar', a.map((_, i) => h('i', { class: i < pos.atom ? 'done' : i === pos.atom ? 'cur' : '' }))) : progressBar(pos.atom / a.length))
        : null,
      h('div.now-actions',
        btn('Back', () => (mode === 'stitch' ? advanceStitch(-1) : advanceRow(-1)), { ico: 'undo', kind: 'ghost', big: true }),
        btn(mode === 'stitch' ? 'Next stitch' : 'Row done', () => (mode === 'stitch' ? advanceStitch(1) : advanceRow(1)), { kind: 'primary', ico: mode === 'stitch' ? 'chevron-right' : 'check', big: true }),
        mode === 'stitch' ? btn('Skip to next row', () => advanceRow(1), { kind: 'ghost', ico: 'chevron-down', small: true }) : null),
      h('div.row', { style: { marginTop: '14px' } }, progressBar(pos.step / Math.max(1, total)), h('span.muted.num', { style: { fontSize: '13px' } }, `${pos.step} / ${total}`)));
  }

  function runIndex(step, atomIdx) {
    let n = 0;
    for (let i = 0; i < step.runs.length; i++) {
      n += step.runs[i].n;
      if (atomIdx < n) return i;
    }
    return step.runs.length - 1;
  }

  // For rows with a repeat, count repeats with a tap.
  function repeatHelper(step) {
    const rep = step.summary.find((x) => x.reps > 1 && x.st === 'group');
    if (!rep) return null;
    const n = rep.reps;
    return h('div.counter', { style: { marginTop: '14px' } },
      iconBtn('minus', 'One repeat back', () => { pos.rep = Math.max(0, (pos.rep || 0) - 1); save(); drawNow(); }, ''),
      h('div', h('div.name', `Repeats of ${rep.text}`), h('div.sub', `${pos.rep || 0} of ${n} done`)),
      h('div.row', h('div.val', `${pos.rep || 0}`), btn(null, () => {
        pos.rep = (pos.rep || 0) + 1;
        if (settings.haptics) vibrate(10);
        if (pos.rep >= n) {
          pos.rep = n;
          toast('All repeats done. Finish the row and tap “Row done”.');
        }
        save();
        drawNow();
      }, { ico: 'plus', kind: 'primary', title: 'Count a repeat' })));
  }

  function bigCounter() {
    const c = (p.counters || [])[0];
    if (!c) return btn('Add a counter', addCounter, { kind: 'primary', ico: 'plus' });
    return h('div', { style: { marginTop: '14px' } },
      h('button.tapzone', { type: 'button', onClick: () => changeCounter(c.id, 1), 'aria-label': `Add one to ${c.name}` },
        h('span.st-where', c.name),
        h('span.st-name', { style: { fontSize: '88px' } }, String(c.value || 0)),
        h('span.st-pos', c.max ? `of ${c.max}` : 'Tap to count')),
      h('div.now-actions', btn('−1', () => changeCounter(c.id, -1), { kind: 'ghost', big: true }), btn('Reset', () => setCounter(c.id, 0), { kind: 'ghost' })));
  }

  // ---- side lists ----------------------------------------------------------
  function drawList() {
    if (!steps.length) {
      mount(listEl);
      listEl.style.display = 'none';
      return;
    }
    listEl.style.display = '';
    const from = Math.max(0, pos.step - 2);
    const to = Math.min(steps.length, pos.step + 7);
    mount(listEl, steps.slice(from, to).map((s, k) => {
      const i = from + k;
      return h('button.list-row.link', {
        type: 'button', class: i < pos.step ? 'done' : i === pos.step ? 'cur' : '', onClick: () => jump(i),
        style: { border: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', background: i === pos.step ? null : 'none' },
      },
      i < pos.step ? icon('check') : i === pos.step ? icon('chevron-right') : h('span', { style: { width: '20px' } }),
      h('div.grow', h('div.title.ellipsis', `${s.label}${s.pieces > 1 ? ` · ${s.piece}/${s.pieces}` : ''}`), h('div.meta.ellipsis', s.text.replace(/^[^:]*:\s*/, ''))),
      s.count ? h('span.muted.num', String(s.count)) : null);
    }));
  }

  function changeCounter(cid, d) {
    p = { ...p, counters: (p.counters || []).map((c) => (c.id === cid ? bump(c, d) : c)) };
    if (settings.haptics) vibrate(10);
    save();
    drawCounters();
    if (src.kind === 'none') drawNow();
  }
  function setCounter(cid, v) {
    p = { ...p, counters: (p.counters || []).map((c) => (c.id === cid ? { ...c, value: v } : c)) };
    save();
    drawCounters();
    if (src.kind === 'none') drawNow();
  }

  async function addCounter(existing = null) {
    const c = existing ? { ...existing } : { id: uid(6), name: 'Repeat', value: 0, linked: false, max: null };
    const res = await modal({
      title: existing ? 'Edit counter' : 'New counter',
      body: h('div.stack',
        field('Name', input({ value: c.name, onInput: (e) => { c.name = e.target.value; } })),
        h('div.fields', field('Value', numberInput(c.value, (v) => { c.value = v || 0; }, { min: 0, step: 1 })), field('Counts up to', numberInput(c.max, (v) => { c.max = v || null; }, { min: 0, step: 1 }), 'Then starts again at 1')),
        steps.length ? toggle('Follow the rows', !!c.linked, (v) => { c.linked = v; }, 'Goes up by one every time you finish a row') : null),
      actions: [existing ? { label: 'Delete', kind: 'danger', value: 'delete' } : null, { label: 'Cancel', kind: 'ghost', value: null }, { label: 'Save', kind: 'primary', value: 'save' }].filter(Boolean),
    });
    if (res === 'save') {
      const list = p.counters || [];
      p = { ...p, counters: existing ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c] };
    } else if (res === 'delete') {
      p = { ...p, counters: (p.counters || []).filter((x) => x.id !== c.id) };
    } else return;
    save();
    drawCounters();
    drawNow();
  }

  function drawCounters() {
    mount(countersEl, (p.counters || []).map((c) => h('div.counter',
      iconBtn('minus', `Take one off ${c.name}`, () => changeCounter(c.id, -1), ''),
      h('button', { type: 'button', style: { border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }, onClick: () => addCounter(c) },
        h('div.name', c.name), h('div.sub', [c.linked ? 'follows rows' : null, c.max ? `up to ${c.max}` : null].filter(Boolean).join(' · ') || 'tap to edit')),
      h('div.row', h('div.val', String(c.value || 0)), btn(null, () => changeCounter(c.id, 1), { ico: 'plus', kind: 'primary', title: `Add one to ${c.name}` })))),
    btn('Add counter', () => addCounter(), { small: true, kind: 'ghost', ico: 'plus' }));
  }

  // ---- extras: wake lock, voice, focus ---------------------------------------
  async function setWake(on) {
    try {
      if (on && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        toast('Screen will stay on while this page is open.');
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      } else if (on) {
        toast('This browser can’t keep the screen on.', { kind: 'err' });
        return false;
      }
    } catch {
      toast('Couldn’t keep the screen on (battery saver?).', { kind: 'err' });
      return false;
    }
    return true;
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible' && wakeLock?.released) setWake(true);
  };

  function setVoice(on) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!on) {
      if (recog) {
        recog.onend = null;
        recog.stop();
        recog = null;
      }
      return true;
    }
    if (!SR) {
      toast('Voice commands need Chrome, Edge or Safari.', { kind: 'err' });
      return false;
    }
    recog = new SR();
    recog.continuous = true;
    recog.interimResults = false;
    recog.lang = navigator.language || 'en-US';
    recog.onresult = (e) => {
      const said = e.results[e.results.length - 1][0].transcript.toLowerCase();
      if (/\b(next|done|row|go)\b/.test(said)) (mode === 'stitch' && !/row/.test(said) ? advanceStitch(1) : advanceRow(1));
      else if (/\b(back|undo|previous)\b/.test(said)) (mode === 'stitch' ? advanceStitch(-1) : advanceRow(-1));
      else if (/\b(stitch|plus|count)\b/.test(said)) {
        const c = (p.counters || [])[0];
        if (mode === 'stitch') advanceStitch(1);
        else if (c) changeCounter(c.id, 1);
      } else if (/\bpause\b/.test(said)) stopTimer();
      else if (/\bstart\b/.test(said)) startTimer();
    };
    recog.onend = () => { if (recog) try { recog.start(); } catch { /* already started */ } };
    try {
      recog.start();
      toast('Listening for “next”, “back”, “stitch”, “pause”.');
    } catch {
      return false;
    }
    return true;
  }

  function celebrate(text) {
    toast(text);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = h('canvas.celebrate');
    document.body.append(c);
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const ctx = c.getContext('2d');
    const colors = ['#b4481f', '#e1ad01', '#5c7a57', '#7a4a78', '#2f6690'];
    const bits = Array.from({ length: 90 }, () => ({ x: c.width / 2, y: c.height * 0.4, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 4, r: 3 + Math.random() * 4, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6 }));
    let frames = 0;
    const step = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const b of bits) {
        b.x += b.vx;
        b.y += b.vy;
        b.vy += 0.4;
        b.a += 0.2;
        ctx.fillStyle = b.c;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.r, b.r * 0.6, b.a, 0, Math.PI * 2);
        ctx.fill();
      }
      if (++frames < 90) requestAnimationFrame(step);
      else c.remove();
    };
    step();
  }

  // ---- keyboard ------------------------------------------------------------
  const onKey = (e) => {
    if (e.target.matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      if (e.target.closest('button') && e.key !== 'ArrowRight') return;
      e.preventDefault();
      if (src.kind === 'none') {
        const c = (p.counters || [])[0];
        if (c) changeCounter(c.id, 1);
      } else if (mode === 'stitch') advanceStitch(1);
      else advanceRow(1);
    } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (mode === 'stitch') advanceStitch(-1);
      else advanceRow(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      advanceRow(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      advanceRow(-1);
    }
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisible);

  // ---- layout ----------------------------------------------------------------
  let focus = false;
  const wakeToggle = toggle('Keep screen on', false, async (v) => { if (!(await setWake(v))) wakeToggle.querySelector('input').checked = false; });
  const voiceToggle = toggle('Voice commands', false, (v) => { if (!setVoice(v)) voiceToggle.querySelector('input').checked = false; }, 'Say “next” or “back”');
  const hapticsToggle = toggle('Vibrate on taps', !!settings.haptics, (v) => { settings.haptics = v; store.saveSettings({ haptics: v }); });

  root.append(
    h('div.row.between.wrap', { style: { marginBottom: '14px' } },
      h('div', backLink(p.quick ? '#/build' : `#/plan/projects/${p.id}`, p.quick ? 'Build' : 'Project'), h('h1', { style: { fontSize: '24px' } }, p.name)),
      h('div.row.wrap',
        h('div.card.tight.row', { style: { padding: '8px 12px' } }, icon('timer'), timerFace, timerBtn),
        iconBtn('maximize', 'Focus mode', () => { focus = !focus; document.body.classList.toggle('focus-mode', focus); }),
        iconBtn('more', 'More', (e) => menu(e.currentTarget, [
          { label: 'Jump to row…', ico: 'list', run: async () => {
            if (!steps.length) return;
            const pick = await modal({ title: 'Jump to…', wide: true, body: (close) => h('div.list', { style: { maxHeight: '60vh', overflow: 'auto' } }, steps.map((s, i) => h('button.list-row.link', { type: 'button', style: { border: 0, background: i === pos.step ? 'var(--accent-soft)' : 'none', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }, onClick: () => close(i + 1) }, h('b', { style: { width: '120px' } }, `${s.part} · ${s.label}${s.pieces > 1 ? ` (${s.piece})` : ''}`), h('span.grow.ellipsis.muted', s.text.replace(/^[^:]*:\s*/, ''))))) });
            if (pick) jump(pick - 1);
          } },
          { label: 'Log time by hand', ico: 'clock', run: async () => {
            let mins = 30;
            const ok = await modal({ title: 'Log time', body: field('Minutes', numberInput(mins, (v) => { mins = v || 0; }, { min: 1 })), actions: [{ label: 'Cancel', kind: 'ghost', value: false }, { label: 'Log', kind: 'primary', value: true }] });
            if (!ok || !mins) return;
            const end = Date.now();
            p = { ...p, timeMs: (p.timeMs || 0) + mins * 60000, sessions: [...(p.sessions || []), { start: end - mins * 60000, end }] };
            flush();
            toast(`Logged ${duration(mins * 60000)}.`);
          } },
          { label: 'Start over from the top', ico: 'refresh', run: async () => { if (await confirmDialog('Start over?', 'Your place goes back to the first row. Time and counters are kept.', { ok: 'Start over' })) jump(0); } },
          !p.quick ? { label: 'Post a progress photo', ico: 'camera', run: () => { flush(); go(`/post?project=${p.id}`); } } : null,
        ])))),
    h('div.work',
      nowEl,
      h('div.stack',
        steps.length ? h('div.card', h('div.card-head', h('h3', 'Rows'), h('span.muted', { style: { fontSize: '12.5px' } }, 'Tap to jump')), listEl) : null,
        h('div.card', h('div.card-head', h('h3', 'Counters'), null), countersEl),
        h('div.card', h('h3', 'Hands-free'), h('div.stack.tight', wakeToggle, voiceToggle, hapticsToggle),
          h('p.muted', { style: { fontSize: '12.5px', marginTop: '10px' } }, 'Keys: Space or → next · ← back · ↓ next row · ↑ previous row.')))));

  function draw() {
    drawNow();
    drawList();
    drawCounters();
  }
  draw();
  drawTimer();
  tick = setInterval(() => { if (running()) timerFace.textContent = clock(sessionMs()); }, 1000);
  if (!running() && src.kind !== 'none' && pos.step === 0 && !(p.sessions || []).length) {
    // First visit: nudge the timer on rather than start it silently.
    toast('Tip: start the timer to log your time on this project.', { timeout: 4000 });
  }

  return () => {
    clearInterval(tick);
    flush();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
    setVoice(false);
    if (wakeLock) wakeLock.release().catch(() => {});
    document.body.classList.remove('focus-mode');
  };
}

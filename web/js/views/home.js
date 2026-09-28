// Studio: today at a glance.

import { h, mount, btn, stat, input, toast, s as svgEl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { online, listPosts } from '../core/api.js';
import { duration, daysUntil, timeAgo, hashString } from '../core/util.js';
import { STITCHES } from '../crochet/stitches.js';
import { projectProgress, progressBar, coverId, thumb, yarnYards, yardsText, statusChip, symbolEl, avatar } from './common.js';
import { brandMark } from '../core/brand.js';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Up late';
  if (hr < 12) return 'Good morning';
  if (hr < 18) return 'Good afternoon';
  return 'Good evening';
}

const VERBS = [['plan', 'plan'], ['create', 'create'], ['post', 'post'], ['share', 'share'], ['build', 'build'], ['imagine', 'imagine']];

export function render(root) {
  const draw = () => {
    const st = store.settings();
    const projects = store.all('projects');
    const active = projects.filter((p) => p.status === 'active');
    const weekAgo = Date.now() - 7 * 86400000;
    const weekMs = projects.reduce((a, p) => a + (p.sessions || []).filter((x) => x.end > weekAgo).reduce((b, x) => b + (x.end - Math.max(x.start, weekAgo)), 0), 0);
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const finished = projects.filter((p) => p.status === 'done' && (p.finishedAt || p.updatedAt) >= yearStart).length;
    const stashYards = store.all('yarns').reduce((a, y) => a + yarnYards(y), 0);

    const hero = h('section.hero',
      brandMark('hero-art'),
      h('div.eyebrow', new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
      h('h1', st.name ? `${greeting()}, ${st.name}.` : 'Welcome to your crochet studio.'),
      h('p', st.name
        ? 'Everything you’re making, planning and dreaming up, in one place.'
        : 'Loopwright keeps your projects, patterns, stash and ideas together, checks your stitch counts, counts your rows, and helps you share what you make.'),
      h('div.hero-verbs', VERBS.map(([id, label], i) => [h('a', { href: `#/${id}` }, label), i < VERBS.length - 1 ? h('span', { 'aria-hidden': 'true' }, '·') : null])),
      st.name ? null : nameForm());

    const cont = active.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const continueCard = cont ? continueBlock(cont) : h('div.card.stitched',
      h('div.row.wrap.between',
        h('div', h('h3', 'Nothing on the hook'), h('p.muted', 'Start a project, or pick one from your queue.')),
        btn('Plan a project', () => go('/plan/projects/new'), { kind: 'primary', ico: 'plus' })));

    const deadlines = projects
      .filter((p) => p.deadline && p.status !== 'done' && p.status !== 'frogged' && daysUntil(p.deadline) <= 45)
      .sort((a, b) => a.deadline - b.deadline)
      .slice(0, 4);

    const stitch = STITCHES[hashString(new Date().toDateString()) % STITCHES.length];

    mount(root, 
      hero,
      continueCard,
      h('div.stats.card', { style: { marginTop: '14px' } },
        stat('On the hook', String(active.length), active.length === 1 ? 'project' : 'projects'),
        stat('This week', duration(weekMs), 'of stitching'),
        stat('Stash', yardsText(stashYards), `${store.all('yarns').length} yarns`),
        stat('Finished', String(finished), `in ${new Date().getFullYear()}`)),
      hoursChart(projects),
      h('div.cols', { style: { marginTop: '8px' } },
        h('div',
          h('div.section-title', h('h2', 'Start something'), null),
          h('div.quick',
            quick('#/plan/projects/new', 'plan', 'New project', 'Plan yarn, hook, deadline'),
            quick('#/create/patterns/new', 'create', 'Write a pattern', 'With live stitch counts'),
            quick('#/create/charts/new', 'grid', 'Colorwork chart', 'C2C, tapestry, from a photo'),
            quick('#/create/shapes', 'circle', 'Amigurumi shape', 'Rounds from a silhouette'),
            quick('#/imagine/palettes', 'palette', 'Color palette', 'Harmonies and your stash'),
            quick('#/plan/calc', 'calculator', 'Calculators', 'Gauge, yardage, pricing')),
          deadlines.length ? h('div',
            h('div.section-title', h('h2', 'Coming up'), h('a', { href: '#/plan/projects' }, 'All projects')),
            h('div.list', deadlines.map((p) => {
              const d = daysUntil(p.deadline);
              return h('a.list-row', { href: `#/plan/projects/${p.id}` },
                icon('calendar'),
                h('div.grow', h('div.title.ellipsis', p.name), h('div.meta', p.recipient ? `For ${p.recipient}` : new Date(p.deadline).toLocaleDateString())),
                h('span.chip', { class: d < 0 ? 'err' : d <= 7 ? 'warn' : '' }, d < 0 ? `${-d}d late` : d === 0 ? 'Today' : `${d}d`));
            }))) : null),
        h('div',
          h('div.section-title', h('h2', 'Stitch of the day'), h('a', { href: '#/create/stitches' }, 'Dictionary')),
          h('a.card', { href: `#/create/stitches/${stitch.id}` },
            h('div.stitch-card', h('div.sym-box', symbolEl(stitch.id, 44)),
              h('div', h('div.abbr', stitch.us, stitch.uk !== stitch.us ? h('span.muted', ` · UK ${stitch.uk}`) : null), h('h3', stitch.name))),
            h('p.soft', { style: { marginTop: '10px', fontSize: '14px' } }, stitch.tip)),
          communityBox())));
  };

  // Time stitched per week (rolling 7-day windows, so the last bar matches
  // the "This week" stat). One series: no legend, the title names it; the
  // latest week carries the only direct label. Drawn at the card's real width
  // so text stays at its true size.
  function hoursChart(projects) {
    const W = 7 * 86400000;
    const now = Date.now();
    const weeks = Array.from({ length: 8 }, (_, i) => ({ start: now - (8 - i) * W, ms: 0 }));
    for (const p of projects) {
      for (const x of p.sessions || []) {
        for (const w of weeks) {
          const overlap = Math.min(x.end, w.start + W) - Math.max(x.start, w.start);
          if (overlap > 0) w.ms += overlap;
        }
      }
    }
    if (!weeks.some((w) => w.ms)) return null;
    const label = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const wrap = h('div.chart-wrap');
    const tip = h('div.chart-tip', { role: 'status', hidden: true });

    const draw = (VW) => {
      const VH = 150;
      const maxH = Math.max(...weeks.map((w) => w.ms / 3600000));
      const top = maxH <= 1 ? 1 : maxH <= 2 ? 2 : Math.ceil(maxH / 2) * 2;
      const pad = { l: 30, r: 6, t: 22, b: 24 };
      const band = (VW - pad.l - pad.r) / weeks.length;
      const bw = Math.min(24, band * 0.55);
      const y = (hrs) => pad.t + (VH - pad.t - pad.b) * (1 - hrs / top);
      const every = band < 56 ? 2 : 1;
      const svg = svgEl('svg', { viewBox: `0 0 ${VW} ${VH}`, width: VW, height: VH, class: 'bars', role: 'img', 'aria-label': `Hours stitched per week for the last 8 weeks. Last 7 days: ${duration(weeks[7].ms)}.` },
        svgEl('line', { x1: pad.l, x2: VW - pad.r, y1: y(top), y2: y(top), class: 'grid' }),
        svgEl('text', { x: pad.l - 6, y: y(top) + 4, class: 'axis', 'text-anchor': 'end' }, `${top}h`),
        svgEl('line', { x1: pad.l, x2: VW - pad.r, y1: y(0), y2: y(0), class: 'base' }),
        svgEl('text', { x: pad.l - 6, y: y(0) + 4, class: 'axis', 'text-anchor': 'end' }, '0'),
        ...weeks.flatMap((w, i) => {
          const hrs = w.ms / 3600000;
          const x = pad.l + i * band + (band - bw) / 2;
          const y0 = y(0);
          const y1 = y(hrs);
          const hgt = y0 - y1;
          const r = Math.min(4, hgt, bw / 2);
          const d = hgt > 0.5 ? `M${x} ${y0}V${y1 + r}Q${x} ${y1} ${x + r} ${y1}H${x + bw - r}Q${x + bw} ${y1} ${x + bw} ${y1 + r}V${y0}Z` : '';
          const name = i === 7 ? 'Last 7 days' : `Week from ${label(w.start)}`;
          const hit = svgEl('rect', { x: pad.l + i * band, y: pad.t, width: band, height: VH - pad.t - pad.b, class: 'hit', tabindex: 0, 'aria-label': `${name}: ${duration(w.ms)}` });
          const show = () => {
            tip.hidden = false;
            tip.textContent = `${name}: ${duration(w.ms)}`;
            tip.style.left = `${x + bw / 2}px`;
            tip.style.top = `${Math.min(y1, y0 - 2)}px`;
          };
          hit.addEventListener('pointerenter', show);
          hit.addEventListener('focus', show);
          hit.addEventListener('pointerleave', () => { tip.hidden = true; });
          hit.addEventListener('blur', () => { tip.hidden = true; });
          return [
            d ? svgEl('path', { d, class: 'bar' }) : null,
            i === 7 && d ? svgEl('text', { x: x + bw / 2, y: y1 - 7, class: 'cap', 'text-anchor': 'middle' }, duration(w.ms)) : null,
            (7 - i) % every === 0 ? svgEl('text', { x: x + bw / 2, y: VH - 6, class: 'axis', 'text-anchor': 'middle' }, i === 7 ? 'Last 7 days' : label(w.start)) : null,
            hit,
          ];
        }));
      mount(wrap, svg, tip);
    };
    const ro = new ResizeObserver((entries) => {
      const width = Math.round(entries[0].contentRect.width);
      if (width > 0 && width !== wrap.dataset.w) {
        wrap.dataset.w = width;
        draw(width);
      }
    });
    ro.observe(wrap);
    return h('section.card', { style: { marginTop: '14px' } },
      h('div.card-head', h('h3', 'Time stitching'), h('span.muted', { style: { fontSize: '12.5px' } }, 'Hours per week, from your project timers')),
      wrap,
      h('table.sr', h('caption', 'Hours stitched per week'), h('tbody', weeks.map((w, i) => h('tr', h('th', i === 7 ? 'Last 7 days' : `Week from ${label(w.start)}`), h('td', duration(w.ms)))))));
  }

  function nameForm() {
    const inp = input({ placeholder: 'Your name or maker handle', 'aria-label': 'Your name', maxlength: 40 });
    const save = async () => {
      const name = inp.value.trim();
      if (!name) return;
      await store.saveSettings({ name });
      toast(`Nice to meet you, ${name}.`);
      draw();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    return h('div.row.wrap', { style: { marginTop: '16px', maxWidth: '460px' } }, h('div.grow', inp), btn('Save', save, { kind: 'primary' }));
  }

  function continueBlock(p) {
    const prog = projectProgress(p);
    const step = prog.step;
    return h('section.card.pad-lg',
      h('div.eyebrow', 'Pick up where you left off'),
      h('div.continue',
        thumb(coverId(p)),
        h('div',
          h('h2', p.name),
          h('div.row.wrap', { style: { margin: '6px 0 10px', fontSize: '14px' } },
            statusChip(p.status),
            step ? h('span.soft', `${step.part} · ${step.label}${step.pieces > 1 ? ` (piece ${step.piece} of ${step.pieces})` : ''}${step.count ? ` · ${step.count} sts` : ''}`) : h('span.soft', p.patternId ? 'Pattern complete' : 'No pattern linked, counters only'),
            p.timeMs ? h('span.muted', `· ${duration(p.timeMs)} logged`) : null),
          prog.pct !== null ? h('div.row', progressBar(prog.pct), h('span.muted.num', { style: { fontSize: '13px' } }, `${Math.round(prog.pct * 100)}%`)) : null),
        btn('Keep going', () => go(`/build/${p.id}`), { kind: 'primary', ico: 'play' })));
  }

  function quick(href, ico, title, sub) {
    return h('a', { href }, icon(ico), h('div', title), h('span', sub));
  }

  function communityBox() {
    const box = h('div');
    online().then(async (ok) => {
      if (!ok) return;
      try {
        const { posts } = await listPosts({ limit: 3 });
        if (!posts.length) return;
        mount(box, 
          h('div.section-title', h('h2', 'From the community'), h('a', { href: '#/post' }, 'Feed')),
          h('div.list', posts.map((p) => h('a.list-row', { href: '#/post' },
            avatar(p.author.name, p.author.color, true),
            h('div.grow', h('div.title.ellipsis', p.text || 'Shared a photo'), h('div.meta', `${p.author.name} · ${timeAgo(p.at)}`)),
            p.likes ? h('span.chip', icon('heart'), String(p.likes)) : null))));
      } catch {
        /* the studio works without the community */
      }
    });
    return box;
  }

  draw();
  const offs = ['projects', 'yarns', 'meta'].map((s) => store.on(s, draw));
  return () => offs.forEach((off) => off());
}

// Studio: today at a glance.

import { h, mount, btn, stat, input, toast } from '../core/dom.js';
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

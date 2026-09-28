// Boot: app shell, navigation, routing, theme, offline.

import { h, mount, toast } from './core/dom.js';
import { brandMark } from './core/brand.js';
import { applyTheme } from './core/theme.js';
import './core/install.js';
import { icon } from './core/icons.js';
import { parseHash, onRoute } from './core/router.js';
import * as store from './core/store.js';
import { online } from './core/api.js';
import { seedIfFirstRun } from './views/seed.js';
import { openSearch, installSearchKeys } from './views/search.js';

export const SECTIONS = [
  { id: 'plan', label: 'Plan', ico: 'plan', sub: 'Projects, stash, calculators' },
  { id: 'create', label: 'Create', ico: 'create', sub: 'Patterns, charts, shapes' },
  { id: 'post', label: 'Post', ico: 'post', sub: 'Community and journal' },
  { id: 'share', label: 'Share', ico: 'share', sub: 'Links, QR, print, backup' },
  { id: 'build', label: 'Build', ico: 'build', sub: 'Row tracker and counters' },
  { id: 'imagine', label: 'Imagine', ico: 'imagine', sub: 'Palettes and generators' },
];

const VIEWS = {
  home: () => import('./views/home.js'),
  plan: () => import('./views/plan.js'),
  create: () => import('./views/create.js'),
  post: () => import('./views/post.js'),
  share: () => import('./views/share.js'),
  s: () => import('./views/share.js'),
  import: () => import('./views/share.js'),
  build: () => import('./views/build.js'),
  imagine: () => import('./views/imagine.js'),
  settings: () => import('./views/settings.js'),
};

let current = { cleanup: null, token: 0 };
const viewEl = h('div#view');

function buildShell() {
  const navLinks = (cls) => SECTIONS.map((s) => h('a', { href: `#/${s.id}`, dataset: { section: s.id }, class: cls },
    icon(s.ico), cls === 'side' ? h('span', s.label, h('span.nav-sub', s.sub)) : h('span', s.label)));
  const presence = h('div.presence', h('span.dot'), h('span.presence-text', 'Checking for community…'));
  const sidebar = h('aside.sidebar',
    h('a.brand', { href: '#/' }, brandMark(), h('span', h('span.brand-name', 'Loopwright'), h('span.brand-tag', 'the crochet studio'))),
    h('button.search-trigger', { type: 'button', onClick: openSearch, 'aria-label': 'Search' }, icon('search'), h('span', 'Search'), h('kbd', navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl K')),
    h('nav.nav', { 'aria-label': 'Main' },
      h('a', { href: '#/', dataset: { section: 'home' } }, icon('yarn'), h('span', 'Studio', h('span.nav-sub', 'Today at a glance'))),
      navLinks('side')),
    h('div.sidebar-foot',
      presence,
      h('nav.nav', h('a', { href: '#/settings', dataset: { section: 'settings' } }, icon('settings'), h('span', 'Settings')))));
  const topbar = h('header.topbar',
    h('a.brand', { href: '#/' }, brandMark(), h('span.brand-name', 'Loopwright')),
    h('span.spacer'),
    h('span.dot', { title: 'Community server' }),
    h('button.btn.ghost.icon-only', { type: 'button', onClick: openSearch, 'aria-label': 'Search' }, icon('search')),
    h('a.btn.ghost.icon-only', { href: '#/settings', 'aria-label': 'Settings' }, icon('settings')));
  const tabbar = h('nav.tabbar', { 'aria-label': 'Main' }, navLinks('tab'));
  const main = h('main', { id: 'main' }, viewEl);
  mount(document.getElementById('app'), h('div.app', sidebar, h('div', topbar, main), tabbar));
  document.getElementById('app').removeAttribute('aria-busy');
}

function markNav(section) {
  const active = section === 's' || section === 'import' ? 'share' : section;
  document.querySelectorAll('[data-section]').forEach((a) => {
    const on = a.dataset.section === active;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function show(route) {
  const token = ++current.token;
  if (current.cleanup) {
    try {
      current.cleanup();
    } catch (err) {
      console.error(err);
    }
    current.cleanup = null;
  }
  document.body.classList.remove('focus-mode');
  markNav(route.section);
  const loader = VIEWS[route.section] || VIEWS.home;
  let mod;
  try {
    mod = await loader();
  } catch (err) {
    console.error(err);
    mount(viewEl, h('div.page', h('div.note.err', icon('alert'), h('span', 'This part of the app failed to load. Check your connection and reload.'))));
    return;
  }
  if (token !== current.token) return;
  const page = h('div.page');
  mount(viewEl, page);
  try {
    const cleanup = await mod.render(page, route);
    if (token === current.token) current.cleanup = typeof cleanup === 'function' ? cleanup : null;
    else if (typeof cleanup === 'function') cleanup();
  } catch (err) {
    console.error(err);
    mount(page, h('div.note.err', icon('alert'), h('span', `Something went wrong: ${err.message}`)));
  }
  if (!route.query.keepScroll) window.scrollTo(0, 0);
}


async function checkPresence() {
  const ok = await online(true);
  document.querySelectorAll('.dot').forEach((d) => d.classList.toggle('on', ok));
  const text = document.querySelector('.presence-text');
  if (text) text.textContent = ok ? 'Community server connected' : 'Working offline, saved on this device';
  return ok;
}

async function boot() {
  buildShell();
  const persistent = await store.ready;
  applyTheme();
  if (!persistent) toast('Storage is unavailable here (private window?). Changes will be lost when you close the tab.', { kind: 'err', timeout: 8000 });
  await seedIfFirstRun();
  onRoute(show);
  installSearchKeys();
  await show(parseHash());
  checkPresence();
  setInterval(checkPresence, 60000);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !navigator.webdriver) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  store.on('meta', (e) => {
    if (e.id === 'settings' || e.type === 'import') applyTheme();
  });
}

boot();

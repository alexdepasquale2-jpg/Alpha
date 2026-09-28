// Tiny DOM toolkit. Every string child becomes a text node, so user content
// is never parsed as HTML. The only innerHTML in the app is for SVG strings we
// generate ourselves (icons, QR codes, stitch symbols).

import { icon } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el, attrs, isSvg) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class' || k === 'className') {
      const cls = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      if (isSvg) el.setAttribute('class', cls);
      else el.className = cls;
    } else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv === null || sv === undefined) continue;
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    } else if (k === 'dataset') {
      Object.assign(el.dataset, v);
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'value' && !isSvg) {
      el.value = v;
    } else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'multiple' || k === 'open') {
      el[k] = !!v;
      if (v === true && !isSvg) el.setAttribute(k, '');
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** h('div.card.big', { onClick }, 'text', child) */
export function h(tag, attrs, ...children) {
  if (attrs instanceof Node || typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) {
    children.unshift(attrs);
    attrs = {};
  }
  const [head, ...classes] = tag.split('.');
  const [name, id] = head.split('#');
  const el = document.createElement(name || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (classes.length && ('class' in attrs || 'className' in attrs)) {
    const extra = attrs.class ?? attrs.className;
    attrs = { ...attrs, class: [classes.join(' '), extra].flat().filter(Boolean).join(' ') };
    delete attrs.className;
  }
  applyAttrs(el, attrs, false);
  append(el, children);
  return el;
}

export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs, true);
  append(el, children);
  return el;
}

/** Parse an SVG string we generated into a node. */
export function svgFromString(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export function btn(label, onClick, opts = {}) {
  const { kind = '', ico = null, title = null, type = 'button', disabled = false, small = false, big = false, attrs = {} } = opts;
  const classes = ['btn', kind, small ? 'small' : '', big ? 'big' : '', !label && ico ? 'icon-only' : ''].filter(Boolean).join(' ');
  return h('button', { type, class: classes, onClick, title: title || (typeof label === 'string' ? null : undefined), 'aria-label': !label ? title : null, disabled, ...attrs },
    ico ? icon(ico) : null,
    label ? h('span', label) : null);
}

export function iconBtn(ico, title, onClick, kind = 'ghost') {
  return btn(null, onClick, { ico, title, kind });
}

export function field(label, control, hint = null) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  if (!control.id && control.matches && control.matches('input,select,textarea')) control.id = id;
  return h('label.field', { for: control.id || null },
    h('span.field-label', label),
    control,
    hint ? h('span.field-hint', hint) : null);
}

export function input(attrs = {}) {
  return h('input', { type: 'text', ...attrs });
}

export function numberInput(value, onInput, attrs = {}) {
  return h('input', {
    type: 'number',
    inputmode: 'decimal',
    step: 'any',
    value: value ?? '',
    onInput: (e) => onInput(e.target.value === '' ? null : Number(e.target.value), e),
    ...attrs,
  });
}

export function select(options, value, onChange, attrs = {}) {
  return h('select', { onChange: (e) => onChange(e.target.value, e), ...attrs },
    options.map((o) => {
      const [v, label] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: String(v) === String(value) }, label);
    }));
}

export function textarea(value, onInput, attrs = {}) {
  return h('textarea', { onInput: (e) => onInput(e.target.value, e), ...attrs }, value ?? '');
}

export function segmented(options, value, onChange, { label = null, small = false } = {}) {
  const wrap = h('div.segmented', { role: 'radiogroup', 'aria-label': label, class: small ? 'small' : '' });
  for (const o of options) {
    const [v, text, ico] = Array.isArray(o) ? o : [o, o];
    wrap.append(h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(v) === String(value) ? 'true' : 'false',
      class: String(v) === String(value) ? 'on' : '',
      onClick: (e) => {
        for (const b of wrap.children) {
          const on = b === e.currentTarget;
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        }
        onChange(v);
      },
    }, ico ? icon(ico) : null, text ? h('span', text) : null));
  }
  return wrap;
}

export function toggle(label, checked, onChange, hint = null) {
  return h('label.toggle',
    h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked) }),
    h('span.toggle-track', h('span.toggle-thumb')),
    h('span.toggle-text', label, hint ? h('small', hint) : null));
}

export function empty(ico, title, text, action = null) {
  return h('div.empty', icon(ico, 'empty-icon'), h('h3', title), text ? h('p', text) : null, action);
}

export function stat(label, value, sub = null) {
  return h('div.stat', h('div.stat-value', value), h('div.stat-label', label), sub ? h('div.stat-sub', sub) : null);
}

export function swatch(hex, size = 22, title = null) {
  return h('span.swatch', { style: { '--c': hex, width: `${size}px`, height: `${size}px` }, title: title || hex });
}

export function pageHead(title, sub, ...actions) {
  return h('header.page-head',
    h('div.page-titles', h('h1', title), sub ? h('p.page-sub', sub) : null),
    actions.length ? h('div.page-actions', actions) : null);
}

export function subnav(items, active) {
  return h('nav.subnav', { 'aria-label': 'Section' },
    items.map(([href, label, ico]) => h('a', { href, class: active === href ? 'on' : '', 'aria-current': active === href ? 'page' : null }, ico ? icon(ico) : null, h('span', label))));
}

// ---------------------------------------------------------------------------
// Toasts and dialogs
// ---------------------------------------------------------------------------

let toastRoot = null;

export function toast(message, { kind = '', timeout = 3200, action = null } = {}) {
  if (!toastRoot) {
    toastRoot = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRoot);
  }
  const t = h('div.toast', { class: kind }, h('span', message), action ? btn(action.label, () => { action.run(); t.remove(); }, { kind: 'ghost', small: true }) : null);
  toastRoot.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.remove(), 300);
  }, timeout);
  return t;
}

/**
 * A modal dialog. `body` is a node or a function (close) => node.
 * Resolves with whatever `close(value)` is called with (undefined on Esc).
 */
export function modal({ title, body, actions = [], wide = false, className = '' }) {
  return new Promise((resolve) => {
    const dlg = h('dialog.modal', { class: [wide ? 'wide' : '', className].filter(Boolean).join(' ') });
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      dlg.close();
      dlg.remove();
      resolve(value);
    };
    const content = typeof body === 'function' ? body(close) : body;
    dlg.append(
      h('div.modal-head', h('h2', title), iconBtn('x', 'Close', () => close(undefined))),
      h('div.modal-body', content),
      actions.length ? h('div.modal-actions', actions.map((a) => btn(a.label, () => {
        const v = a.run ? a.run() : a.value;
        if (v === false) return;
        close(v === undefined ? a.value : v);
      }, { kind: a.kind || '', ico: a.ico }))) : null,
    );
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(undefined);
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) close(undefined);
    });
    document.body.append(dlg);
    dlg.showModal();
    const first = dlg.querySelector('.modal-body input, .modal-body textarea, .modal-body select');
    if (first) first.focus();
  });
}

export function confirmDialog(title, text, { ok = 'OK', danger = false } = {}) {
  return modal({
    title,
    body: h('p', text),
    actions: [
      { label: 'Cancel', value: false, kind: 'ghost' },
      { label: ok, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  }).then((v) => v === true);
}

export function promptDialog(title, { label = '', value = '', placeholder = '', ok = 'Save', multiline = false } = {}) {
  let current = value;
  const control = multiline
    ? textarea(value, (v) => { current = v; }, { rows: 6, placeholder })
    : input({ value, placeholder, onInput: (e) => { current = e.target.value; } });
  return modal({
    title,
    body: (close) => {
      control.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          close(current);
        }
      });
      return label ? field(label, control) : control;
    },
    actions: [
      { label: 'Cancel', value: undefined, kind: 'ghost' },
      { label: ok, run: () => current, kind: 'primary' },
    ],
  });
}

/** A menu of actions anchored to a button. */
export function menu(anchor, items) {
  document.querySelectorAll('.popmenu').forEach((m) => m.remove());
  const m = h('div.popmenu', { role: 'menu' },
    items.filter(Boolean).map((it) => it === '-' ? h('hr') : h('button', {
      type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '',
      onClick: () => { m.remove(); it.run(); },
    }, it.ico ? icon(it.ico) : null, h('span', it.label))));
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w));
  const below = r.bottom + 6 + m.offsetHeight < window.innerHeight;
  m.style.left = `${left}px`;
  m.style.top = below ? `${r.bottom + 6 + window.scrollY}px` : `${r.top - m.offsetHeight - 6 + window.scrollY}px`;
  setTimeout(() => {
    const off = (e) => {
      if (!m.contains(e.target)) {
        m.remove();
        document.removeEventListener('pointerdown', off, true);
      }
    };
    document.addEventListener('pointerdown', off, true);
  });
  m.querySelector('button')?.focus();
  return m;
}

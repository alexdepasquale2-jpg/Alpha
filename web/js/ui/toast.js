// Transient notifications. DOM rather than canvas: text reflow and stacking are
// free here, and toasts must survive whatever the active scene is drawing.

import { on, EVENTS } from '../core/events.js';

const MAX_VISIBLE = 4;
const DEFAULT_MS = 2200;

let stack = null;

function ensureStack() {
  if (stack) return stack;
  stack = document.createElement('div');
  stack.className = 'toast-stack';
  document.getElementById('overlay').appendChild(stack);
  return stack;
}

/**
 * @param {string} message
 * @param {'info'|'gold'|'bad'} kind
 */
export function toast(message, kind = 'info', ms = DEFAULT_MS) {
  const host = ensureStack();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);

  while (host.children.length > MAX_VISIBLE) host.firstChild.remove();

  setTimeout(() => {
    el.style.transition = 'opacity .3s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, ms);
  return el;
}

/** Wire the global TOAST event once at boot. */
export function initToasts() {
  on(EVENTS.TOAST, (payload) => {
    if (typeof payload === 'string') toast(payload);
    else toast(payload.message, payload.kind ?? 'info', payload.ms ?? DEFAULT_MS);
  });

  on(EVENTS.SAVE_FAILED, ({ error }) => {
    toast(`Save failed: ${error}`, 'bad', 4000);
  });
}

// Light, dark, or follow the device.

import { settings } from './store.js';

export function applyTheme(theme = settings().theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

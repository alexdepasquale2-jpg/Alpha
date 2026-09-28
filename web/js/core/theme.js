// Light, dark, or follow the device.

import { settings } from './store.js';

// Inside an artifact the host may stamp its viewer's theme on <html>;
// "follow the device" hands the choice back to it.
const hostTheme = document.documentElement.dataset.theme;

export function applyTheme(theme = settings().theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else if (hostTheme) root.dataset.theme = hostTheme;
  else delete root.dataset.theme;
}

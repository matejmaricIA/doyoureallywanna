// Loaded first by every page: use the color theme and light/dark choice
// from the settings, and keep the toolbar icon in the theme's color.
// Follows changes made in another tab (the settings page, or a backup
// import) without a reload.
//
// The pages load this with blocking="render", and the first read below is a
// top-level await, so the browser doesn't paint until the colors are right:
// no flash of the default colors (D-027).

import { setToolbarTheme } from '../lib/browser.js';
import { sanitizeSettings } from '../lib/settings.js';

let currentTheme = '';

/** @param {unknown} settings */
function apply(settings) {
  const { theme, appearance } = sanitizeSettings(settings);
  const root = document.documentElement;
  if (appearance === 'browser') delete root.dataset.appearance;
  else root.dataset.appearance = appearance;
  if (theme === currentTheme) return;
  currentTheme = theme;
  root.dataset.theme = theme;
  document.querySelector('link[rel="icon"]')?.setAttribute('href', `/icons/${theme}-32.png`);
  setToolbarTheme(theme);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) apply(changes.settings.newValue);
});

try {
  apply((await chrome.storage.local.get('settings')).settings);
} catch {
  apply(undefined);
}

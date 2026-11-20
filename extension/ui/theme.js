// Loaded first by every page: use the color theme from the settings, and
// keep the toolbar icon in the same color. Follows changes made in another
// tab (the settings page, or a backup import) without a reload.

import { setToolbarTheme } from '../lib/browser.js';
import { sanitizeSettings } from '../lib/settings.js';

let current = '';

/** @param {unknown} settings */
function applyTheme(settings) {
  const { theme } = sanitizeSettings(settings);
  if (theme === current) return;
  current = theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('link[rel="icon"]')?.setAttribute('href', `/icons/${theme}-32.png`);
  setToolbarTheme(theme);
}

chrome.storage.local.get('settings').then(({ settings }) => applyTheme(settings));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) applyTheme(changes.settings.newValue);
});

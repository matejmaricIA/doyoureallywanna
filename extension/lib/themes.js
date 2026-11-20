// The color themes. This list is the one place that defines them: each
// page's colors live in ui/base.css under [data-theme="<key>"], the names
// people see in lib/copy.js (THEME_NAMES), the icons in icons/<key>-*.png.

/**
 * @typedef {object} Theme
 * @property {string} key   used in settings, CSS and icon file names
 * @property {string} icon  toolbar icon color: about 3.3:1 against both a
 *                          light and a dark toolbar (tools/icons.mjs)
 */

/** @type {readonly Theme[]} */
export const THEMES = Object.freeze([
  { key: 'tide', icon: '#409aaf' },
  { key: 'sage', icon: '#5c9c73' },
  { key: 'clay', icon: '#cd794d' },
  { key: 'dusk', icon: '#8788cf' },
  { key: 'ember', icon: '#e8590c' },
]);

export const DEFAULT_THEME = 'tide';

/** @param {unknown} value @returns {value is string} */
export function isTheme(value) {
  return THEMES.some((theme) => theme.key === value);
}

/**
 * The toolbar icon files for a theme, as chrome.action.setIcon wants them.
 * @param {string} key
 */
export function toolbarIconPaths(key) {
  const theme = isTheme(key) ? key : DEFAULT_THEME;
  return { 16: `/icons/${theme}-16.png`, 32: `/icons/${theme}-32.png` };
}

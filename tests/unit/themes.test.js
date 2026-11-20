import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { APPEARANCE_NAMES, THEME_NAMES } from '../../extension/lib/copy.js';
import { APPEARANCES, DEFAULT_THEME, THEMES, isAppearance, isTheme, toolbarIconPaths } from '../../extension/lib/themes.js';

const ext = new URL('../../extension/', import.meta.url);
const css = readFileSync(new URL('ui/base.css', ext), 'utf8');
const TOKENS = ['--bg', '--surface', '--ink', '--muted', '--line', '--line-strong', '--mark-off', '--accent'];

/** The declarations of the CSS rule for one theme. @param {string} key */
function block(key) {
  const start = css.indexOf(`[data-theme="${key}"]`);
  assert.notEqual(start, -1, `no CSS for ${key}`);
  return css.slice(css.indexOf('{', start), css.indexOf('}', start));
}

describe('themes', () => {
  it('has unique keys and a default that exists', () => {
    const keys = THEMES.map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(isTheme(DEFAULT_THEME));
    assert.equal(THEMES[0].key, DEFAULT_THEME);
  });

  it('recognizes only its own keys', () => {
    assert.ok(isTheme('sage'));
    assert.equal(DEFAULT_THEME, 'dusk');
    assert.ok(!isTheme('Sage'));
    assert.ok(!isTheme('__proto__'));
    assert.ok(!isTheme(undefined));
  });

  it("points the toolbar at each theme's icons, and falls back to the default", () => {
    assert.deepEqual(toolbarIconPaths('clay'), { 16: '/icons/clay-16.png', 32: '/icons/clay-32.png' });
    assert.deepEqual(toolbarIconPaths('nope'), toolbarIconPaths(DEFAULT_THEME));
  });

  it('every theme has a name, its colors in base.css (light and dark), and its icons', () => {
    assert.deepEqual(Object.keys(THEME_NAMES), THEMES.map((t) => t.key));
    const pair = /^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/;
    for (const { key } of THEMES) {
      const rule = block(key);
      for (const token of TOKENS) {
        const value = rule.match(new RegExp(`${token}: ([^;]+);`))?.[1];
        assert.match(value ?? '', pair, `${key} ${token}`);
      }
      for (const size of [16, 32]) assert.ok(existsSync(new URL(`icons/${key}-${size}.png`, ext)), `${key}-${size}.png`);
    }
  });

  it('the default theme is also the fallback before a theme is set', () => {
    assert.ok(css.includes(`:root,\n[data-theme="${DEFAULT_THEME}"]`));
  });

  it('light or dark: follows the browser unless told otherwise', () => {
    assert.deepEqual(APPEARANCES, ['browser', 'light', 'dark']);
    assert.deepEqual(Object.keys(APPEARANCE_NAMES), [...APPEARANCES]);
    assert.ok(isAppearance('dark'));
    assert.ok(!isAppearance('auto'));
    assert.ok(!isAppearance(undefined));
    assert.ok(!css.includes('prefers-color-scheme'), 'colors come from light-dark(), not media queries');
    for (const mode of ['light', 'dark']) {
      assert.ok(css.includes(`:root[data-appearance="${mode}"] {\n  color-scheme: ${mode};`), mode);
    }
  });
});

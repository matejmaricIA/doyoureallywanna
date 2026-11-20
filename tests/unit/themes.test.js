import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { THEME_NAMES } from '../../extension/lib/copy.js';
import { DEFAULT_THEME, THEMES, isTheme, toolbarIconPaths } from '../../extension/lib/themes.js';

const ext = new URL('../../extension/', import.meta.url);
const css = readFileSync(new URL('ui/base.css', ext), 'utf8');
const [light, dark] = css.split('@media (prefers-color-scheme: dark)');
const TOKENS = ['--bg', '--surface', '--ink', '--muted', '--line', '--line-strong', '--mark-off', '--accent'];

/** The declarations of the CSS rule for one theme. @param {string} sheet @param {string} key */
function block(sheet, key) {
  const start = sheet.indexOf(`[data-theme="${key}"]`);
  assert.notEqual(start, -1, `no CSS for ${key}`);
  return sheet.slice(sheet.indexOf('{', start), sheet.indexOf('}', start));
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
    assert.ok(!isTheme('Sage'));
    assert.ok(!isTheme('__proto__'));
    assert.ok(!isTheme(undefined));
  });

  it('points the toolbar at each theme\'s icons, and falls back to the default', () => {
    assert.deepEqual(toolbarIconPaths('clay'), { 16: '/icons/clay-16.png', 32: '/icons/clay-32.png' });
    assert.deepEqual(toolbarIconPaths('nope'), toolbarIconPaths(DEFAULT_THEME));
  });

  it('every theme has a name, its colors in base.css (light and dark), and its icons', () => {
    assert.deepEqual(Object.keys(THEME_NAMES), THEMES.map((t) => t.key));
    for (const { key } of THEMES) {
      for (const sheet of [light, dark]) {
        const rule = block(sheet, key);
        for (const token of TOKENS) assert.match(rule, new RegExp(`${token}: #[0-9a-f]{6};`), `${key} ${token}`);
      }
      for (const size of [16, 32]) assert.ok(existsSync(new URL(`icons/${key}-${size}.png`, ext)), `${key}-${size}.png`);
    }
  });

  it('the default theme is also the fallback before a theme is set', () => {
    assert.ok(light.includes(`:root,\n[data-theme="${DEFAULT_THEME}"]`));
    assert.ok(dark.includes(`:root,\n  [data-theme="${DEFAULT_THEME}"]`));
  });
});

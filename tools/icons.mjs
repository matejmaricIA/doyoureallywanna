// Render the icon to the PNGs the browser and stores need, in every theme's
// color, and copy the drawing for the pages' logo.
// Usage: npm run icons
//
// assets/icon.svg        the fermata, for 32 px and up
// assets/icon-small.svg  the same, redrawn on the 16 px grid
//
// Writes, in extension/icons/:
//   icon-{16,32,48,128}.png  default theme: manifest, extensions page, stores
//   <theme>-{16,32}.png      toolbar icon and tab icon for each theme
//   mark.svg                 icon.svg as is; the pages use it as a CSS mask

import { copyFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_THEME, THEMES } from '../extension/lib/themes.js';
import { launch } from './lib/cdp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const large = readFileSync(`${root}/assets/icon.svg`, 'utf8');
const small = readFileSync(`${root}/assets/icon-small.svg`, 'utf8');

// [size, transparent padding]. Toolbar sizes use the whole square; the
// 48 and 128 px icons get a little breathing room.
const PADDING = { 16: 0, 32: 0, 48: 2, 128: 8 };

/** @type {{ file: string, size: number, color: string }[]} */
const jobs = [];
const defaultColor = /** @type {string} */ (THEMES.find((t) => t.key === DEFAULT_THEME)?.icon);
for (const size of [16, 32, 48, 128]) jobs.push({ file: `icon-${size}.png`, size, color: defaultColor });
for (const theme of THEMES) {
  for (const size of [16, 32]) jobs.push({ file: `${theme.key}-${size}.png`, size, color: theme.icon });
}

const browser = await launch({ name: 'icons' });
try {
  const page = await browser.newPage();
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const { file, size, color } of jobs) {
    const pad = PADDING[/** @type {16 | 32 | 48 | 128} */ (size)];
    const inner = size - pad * 2;
    const svg = size === 16 ? small : large;
    await page.setViewport({ width: size, height: size });
    const markup = svg.replace('<svg ', `<svg width="${inner}" height="${inner}" style="display:block;margin:${pad}px;color:${color}" `);
    await page.evaluate(`
      document.documentElement.style.background = 'transparent';
      document.body.style.margin = '0';
      document.body.innerHTML = ${JSON.stringify(markup)};
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    `);
    await page.screenshot(`${root}/extension/icons/${file}`, { clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`wrote extension/icons/${file}`);
  }
} finally {
  await browser.close();
}

copyFileSync(`${root}/assets/icon.svg`, `${root}/extension/icons/mark.svg`);
console.log('wrote extension/icons/mark.svg');

// Render assets/icon.svg to the PNG sizes the browser and stores need.
// Usage: npm run icons

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/cdp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(`${root}/assets/icon.svg`, 'utf8');

// [size, transparent padding]. Toolbar sizes use the whole square; the
// 128px store/management icon gets a little breathing room.
const SIZES = [
  [16, 0],
  [32, 0],
  [48, 2],
  [128, 8],
];

const browser = await launch({ name: 'icons' });
try {
  const page = await browser.newPage();
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const [size, pad] of SIZES) {
    await page.setViewport({ width: size, height: size });
    const inner = size - pad * 2;
    const markup = svg.replace('<svg ', `<svg width="${inner}" height="${inner}" style="display:block;margin:${pad}px" `);
    await page.evaluate(`
      document.documentElement.style.background = 'transparent';
      document.body.style.margin = '0';
      document.body.innerHTML = ${JSON.stringify(markup)};
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    `);
    const file = `${root}/extension/icons/icon-${size}.png`;
    await page.screenshot(file, { clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`wrote extension/icons/icon-${size}.png`);
  }
} finally {
  await browser.close();
}

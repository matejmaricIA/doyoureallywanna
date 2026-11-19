// Regenerate the README screenshots from the real extension pages, filled
// with made-up demo data. Usage: npm run screenshots

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep, waitUntil } from './lib/cdp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'docs', 'images');

const DEMO_SITES = ['youtube.com', 'reddit.com', 'instagram.com', 'mail.google.com'];

// A copy of the extension with access to the demo sites already granted,
// so the screenshots don't show "Needs access". No site is ever visited.
const extDir = mkdtempSync(path.join(os.tmpdir(), 'dyrw-shots-'));
cpSync(path.join(root, 'extension'), extDir, { recursive: true });
const manifestPath = path.join(extDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = DEMO_SITES.map((site) => `*://*.${site}/*`);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

/** Deterministic demo stats for the last 30 days. */
function demoStats() {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const typical = { 'youtube.com': 7, 'reddit.com': 5, 'instagram.com': 3, 'mail.google.com': 6 };
  const opensShare = { 'youtube.com': 0.3, 'reddit.com': 0.25, 'instagram.com': 0.2, 'mail.google.com': 0.7 };
  /** @type {Record<string, Record<string, [number, number]>>} */
  const stats = {};
  const now = new Date();
  for (let i = 1; i < 30; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    stats[day] = {};
    for (const site of DEMO_SITES) {
      const paused = Math.max(0, Math.round(typical[site] * (0.4 + random())));
      if (paused) stats[day][site] = [paused, Math.round(paused * opensShare[site] * (0.6 + random() * 0.8))];
    }
  }
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  stats[today] = { 'youtube.com': [5, 1], 'reddit.com': [3, 1], 'instagram.com': [2, 0], 'mail.google.com': [4, 3] };
  return stats;
}

/** Make Math.random return these values in order, so the copy is the same every run. @param {number[]} values */
const fixedRandom = (values) =>
  `(() => { const v = ${JSON.stringify(values)}; let i = 0; Math.random = () => v[Math.min(i++, v.length - 1)]; })();`;

const browser = await launch({ name: 'screenshots' });
try {
  const id = await browser.loadExtension(extDir);
  const base = `chrome-extension://${id}`;

  const optionsTarget = await waitUntil(
    async () => (await browser.targets()).find((t) => t.url === `${base}/options/options.html`),
    { what: 'options page', timeout: 30_000 },
  );
  const options = await browser.attach(optionsTarget.targetId);
  await options.settle();
  const added = Date.now() - 12 * 86_400_000;
  await options.evaluate(`chrome.storage.local.set(${JSON.stringify({
    schema: 1,
    sites: Object.fromEntries(DEMO_SITES.map((site, i) => [site, { added: added + i * 1000 }])),
    settings: { graceMinutes: 5, countdownSeconds: 5 },
    stats: demoStats(),
  })})`);

  /**
   * @param {string} name
   * @param {{ url: string, width: number, height: number, dark?: boolean, random?: number[],
   *           before?: string, after?: (page: import('./lib/cdp.mjs').Page) => Promise<void>, fullPage?: boolean }} shot
   */
  async function capture(name, shot) {
    const page = await browser.newPage();
    await page.setViewport({ width: shot.width, height: shot.height, scale: 2, dark: shot.dark });
    await page.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: shot.dark ? 'dark' : 'light' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    const scripts = [fixedRandom(shot.random ?? [0]), shot.before ?? ''].join('\n');
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: scripts });
    await page.navigate(shot.url);
    await page.settle();
    await sleep(250);
    if (shot.after) await shot.after(page);
    await page.screenshot(path.join(out, name), { fullPage: shot.fullPage });
    console.log(`wrote docs/images/${name}`);
    return page;
  }

  await capture('settings.png', {
    url: `${base}/options/options.html`,
    width: 860,
    height: 900,
    fullPage: true,
  });

  await capture('pause.png', {
    url: `${base}/pause/pause.html#https://www.youtube.com/`,
    width: 960,
    height: 600,
    random: [0],
  });

  await capture('pause-dark.png', {
    url: `${base}/pause/pause.html#https://www.reddit.com/r/AskReddit/`,
    width: 960,
    height: 600,
    dark: true,
    random: [0.34],
  });

  await capture('turned-back.png', {
    url: `${base}/pause/pause.html#https://instagram.com/`,
    width: 960,
    height: 600,
    random: [0, 0.2],
    after: async (page) => {
      await page.click('#no');
      await sleep(150);
    },
  });

  await capture('popup.png', {
    url: `${base}/popup/popup.html`,
    width: 340,
    height: 200,
    fullPage: true,
    before: `Object.defineProperty(chrome.tabs, 'query', { value: async () => [{ id: 1, url: 'https://www.facebook.com/' }] });`,
  });
} finally {
  await browser.close();
  rmSync(extDir, { recursive: true, force: true });
}

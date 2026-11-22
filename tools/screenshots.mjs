// Regenerate the README screenshots, and the store images, from the real
// extension pages, filled with made-up demo data. Usage: npm run screenshots
//
// docs/images/   README screenshots, at 2× for sharp text
// store/images/  store screenshots (1280×800) and promo tiles (440×280,
//                1400×560), at exactly those pixel sizes, as the stores
//                want them (D-035)

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep, waitUntil } from './lib/cdp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.join(root, 'docs', 'images');
const storeOut = path.join(root, 'store', 'images');
mkdirSync(storeOut, { recursive: true });

const DEMO_SITES = ['youtube.com', 'reddit.com', 'instagram.com', 'mail.google.com'];

// A copy of the extension with access to the demo sites, and suggestions'
// permission, already granted, so the screenshots don't show "Needs access"
// or "Allow". No site is ever visited.
const extDir = mkdtempSync(path.join(os.tmpdir(), 'dyrw-shots-'));
cpSync(path.join(root, 'extension'), extDir, { recursive: true });
const manifestPath = path.join(extDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = DEMO_SITES.map((site) => `*://*.${site}/*`);
manifest.permissions = [...manifest.permissions, ...manifest.optional_permissions];
delete manifest.optional_permissions;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// The promo tiles: the fermata, the name and the tagline on the Dusk dark
// background. Pages of the copied extension, so they use its own styles.
const mark = readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '');
/** @param {{ mark: number, title: number, tag: number, gap: number }} size */
const tile = (size) => `<!doctype html>
<html lang="en" data-appearance="dark">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="ui/base.css" />
    <style>
      html, body { height: 100%; margin: 0; }
      body { display: flex; align-items: center; justify-content: center; background: var(--bg); color: var(--ink); font-family: var(--font); }
      .tile { display: flex; align-items: center; gap: ${size.gap}px; }
      svg { width: ${size.mark}px; height: ${size.mark}px; color: #8788cf; flex: none; }
      h1 { margin: 0; font-size: ${size.title}px; line-height: 1.08; font-weight: 700; letter-spacing: -0.025em; }
      p { margin: 0.45em 0 0; font-size: ${size.tag}px; color: var(--muted); }
    </style>
  </head>
  <body>
    <div class="tile">${mark}<div><h1>Do You Really<br />Wanna?</h1><p>Give it a second thought.</p></div></div>
  </body>
</html>`;
writeFileSync(path.join(extDir, 'store-tile-small.html'), tile({ mark: 92, title: 31, tag: 15, gap: 22 }));
writeFileSync(path.join(extDir, 'store-tile-marquee.html'), tile({ mark: 210, title: 74, tag: 30, gap: 60 }));

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

/** A month of impulse opens of sites that aren't on the list (D-032), the same every run. */
function demoImpulse() {
  const typical = { 'github.com': 6, 'imdb.com': 2, 'news.ycombinator.com': 4, 'wikipedia.org': 1 };
  /** @type {Record<string, Record<string, number>>} */
  const impulse = {};
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    impulse[day] = {};
    for (const [site, n] of Object.entries(typical)) {
      const count = (n * (i % 5 + 2) + i) % (n * 2 + 1);
      if (count) impulse[day][site] = count;
    }
  }
  return impulse;
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
    schema: 3,
    sites: Object.fromEntries(DEMO_SITES.map((site, i) => [site, { added: added + i * 1000 }])),
    settings: { graceMinutes: 5, countdownSeconds: 5, suggestions: true },
    stats: demoStats(),
    quiet: { 'github.com': { added: added + 5000 }, 'wikipedia.org': { added: added + 6000 } },
    impulse: demoImpulse(),
  })})`);

  /**
   * @param {string} name
   * @param {{ url: string, width: number, height: number, dark?: boolean, random?: number[], store?: boolean,
   *           before?: string, after?: (page: import('./lib/cdp.mjs').Page) => Promise<void>, fullPage?: boolean }} shot
   */
  async function capture(name, shot) {
    const page = await browser.newPage();
    // Store images are exactly width × height pixels; README ones are 2×.
    await page.setViewport({ width: shot.width, height: shot.height, scale: shot.store ? 1 : 2, dark: shot.dark });
    if (shot.store) await page.send('Emulation.setScrollbarsHidden', { hidden: true });
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
    await page.screenshot(path.join(shot.store ? storeOut : out, name), { fullPage: shot.fullPage });
    console.log(`wrote ${shot.store ? 'store' : 'docs'}/images/${name}`);
    return page;
  }

  /** Switch the demo profile's color theme. @param {string} theme */
  const setTheme = (theme) =>
    options.evaluate(`chrome.storage.local.get('settings').then(({ settings }) =>
      chrome.storage.local.set({ settings: { ...settings, theme: ${JSON.stringify(theme)} } }))`);

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

  await capture('suggestion.png', {
    url: `${base}/pause/suggestion.html?why=window&n=6#https://www.facebook.com/`,
    width: 960,
    height: 680,
  });

  await capture('popup.png', {
    url: `${base}/popup/popup.html`,
    width: 340,
    height: 200,
    fullPage: true,
    before: `Object.defineProperty(chrome.tabs, 'query', { value: async () => [{ id: 1, url: 'https://www.facebook.com/' }] });`,
  });

  // Store screenshots, in the order the listing shows them.
  const store = { width: 1280, height: 800, store: true };

  await capture('1-pause.png', { ...store, url: `${base}/pause/pause.html#https://www.youtube.com/`, random: [0] });

  await capture('2-turned-back.png', {
    ...store,
    url: `${base}/pause/pause.html#https://instagram.com/`,
    random: [0, 0.2],
    after: async (page) => {
      await page.click('#no');
      await sleep(150);
    },
  });

  await capture('3-stats.png', { ...store, url: `${base}/options/options.html` });

  await capture('4-suggestion.png', { ...store, url: `${base}/pause/suggestion.html?why=day&n=8#https://www.facebook.com/` });

  await setTheme('tide');
  await capture('5-dark-tide.png', {
    ...store,
    url: `${base}/pause/pause.html#https://www.reddit.com/r/AskReddit/`,
    dark: true,
    random: [0.34],
  });
  await setTheme('dusk');

  await capture('promo-small-440x280.png', { width: 440, height: 280, store: true, url: `${base}/store-tile-small.html` });
  await capture('promo-marquee-1400x560.png', { width: 1400, height: 560, store: true, url: `${base}/store-tile-marquee.html` });
} finally {
  await browser.close();
  rmSync(extDir, { recursive: true, force: true });
}

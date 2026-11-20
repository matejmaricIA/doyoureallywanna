// End-to-end smoke test: loads the real extension into a throwaway headless
// Edge/Chrome profile and walks through the whole flow against two local
// test sites. Nothing touches the internet: *.test hosts resolve to a tiny
// server on 127.0.0.1.
//
// Usage: npm run test:e2e   (set BROWSER=/path/to/chrome to pick a browser)

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep, waitUntil } from './lib/cdp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// --- Local test sites -------------------------------------------------------

const server = http.createServer((req, res) => {
  const host = (req.headers.host ?? '').split(':')[0];
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (host === 'distracting.test') {
    res.end(`<!doctype html><title>distracting ${req.url}</title>
      <h1>A distracting site</h1>
      <a id="same" href="/next">same site</a>
      <a id="newtab" href="/popout" target="_blank">same site, new tab</a>`);
  } else {
    res.end(`<!doctype html><title>work ${req.url}</title>
      <h1>A work site</h1>
      <a id="away" href="http://distracting.test:${port}/from-work">a distracting link</a>`);
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const SITE = `http://distracting.test:${port}`;
const WORK = `http://work.test:${port}`;

// --- A copy of the extension with access to the test site pre-granted -------
// (In real use the browser asks you when you add a site. A test can't click
// that browser prompt, so the copy declares the access up front.)

const extDir = mkdtempSync(path.join(os.tmpdir(), 'dyrw-ext-'));
cpSync(path.join(root, 'extension'), extDir, { recursive: true });
const manifestPath = path.join(extDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['*://*.distracting.test/*'];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const browser = await launch({
  name: 'e2e',
  args: ['--host-resolver-rules=MAP *.test 127.0.0.1', '--disable-features=HttpsUpgrades'],
});

/** @type {string[]} */
const pageErrors = [];
browser.on((message) => {
  if (message.method === 'Runtime.exceptionThrown') {
    pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
});

let passed = 0;
/** @param {string} name @param {() => Promise<void>} fn */
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    console.log(`  ✗ ${name}`);
    throw error;
  }
}

/** @param {unknown} actual @param {unknown} expected @param {string} [what] */
function expectEqual(actual, expected, what = 'value') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`Expected ${what} to be ${e}, got ${a}`);
}

/** @param {boolean} condition @param {string} message */
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

let exitCode = 0;
try {
  console.log(`\nE2E: ${path.basename(manifest.name)} ${manifest.version}\n`);
  const id = await browser.loadExtension(extDir);
  const base = `chrome-extension://${id}`;
  const pausePrefix = `${base}/pause/pause.html#`;

  /** @param {import('./lib/cdp.mjs').Page} page */
  const askVisible = (page) => page.evaluate(`!!document.querySelector('[data-state=ask]:not([hidden])')`);
  /** @param {import('./lib/cdp.mjs').Page} page @param {string} expected */
  const waitForUrl = (page, expected) =>
    waitUntil(async () => (await page.url()) === expected, { what: `URL ${expected}` });
  /** @param {import('./lib/cdp.mjs').Page} page @param {string} target */
  const waitForPause = async (page, target) => {
    await waitForUrl(page, `${pausePrefix}${target}`);
    await waitUntil(() => askVisible(page), { what: 'the question' });
  };
  /** @param {string} targetId */
  const isGone = async (targetId) => !(await browser.targets()).some((t) => t.targetId === targetId);

  let options;
  await step('opens "Your list & stats" on install', async () => {
    const target = await waitUntil(
      async () => (await browser.targets()).find((t) => t.url === `${base}/options/options.html`),
      { what: 'options page', timeout: 30_000 },
    );
    options = await browser.attach(target.targetId);
    await options.settle();
    expect((await options.text('#empty'))?.includes('Nothing here yet') === true, 'empty state missing');
    expectEqual(await options.text('#summary-title'), 'What do you open on autopilot?', 'empty-state summary');
  });

  await step('adds a site, normalizing what was typed', async () => {
    await options.evaluate(`document.getElementById('domain').value = 'https://www.distracting.test/some/page'`);
    await options.click('#add-form button[type=submit]');
    await waitUntil(async () => (await options.text('#sites'))?.includes('distracting.test'), { what: 'site in list' });
    const rules = await options.evaluate('chrome.declarativeNetRequest.getDynamicRules()');
    expectEqual(rules.length, 1, 'rule count');
    expectEqual(rules[0].condition.requestDomains, ['distracting.test'], 'rule domain');
  });

  await step('saves settings from the settings form', async () => {
    await options.evaluate(`(() => {
      const input = document.getElementById('countdown');
      input.value = '2';
      input.dispatchEvent(new Event('change'));
    })()`);
    await waitUntil(
      async () => (await options.evaluate(`chrome.storage.local.get('settings')`)).settings?.countdownSeconds === 2,
      { what: 'countdown setting saved' },
    );
  });

  await step('picking a color theme recolors the page and the toolbar icon', async () => {
    /** @param {string} theme */
    const themed = (theme) => options.evaluate(`document.documentElement.dataset.theme === '${theme}'`);
    await waitUntil(() => themed('tide'), { what: 'the default theme' });
    await options.click('label[data-theme=sage] input');
    await waitUntil(
      async () => (await options.evaluate(`chrome.storage.local.get('settings')`)).settings?.theme === 'sage',
      { what: 'theme saved' },
    );
    await waitUntil(() => themed('sage'), { what: 'page recolored' });
    const accent = await options.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`);
    expect(['#4e7c5e', '#80a88d'].includes(accent), `accent should be Sage's, is ${accent}`);
    expectEqual(await options.evaluate(`new URL(document.querySelector('link[rel=icon]').href).pathname`), '/icons/sage-32.png', 'tab icon');
    // setIcon rejects if it can't load an icon file, which would throw here.
    await options.evaluate(`Promise.all([import('${base}/lib/browser.js'), import('${base}/lib/themes.js')])
      .then(async ([browser, { THEMES }]) => {
        for (const { key } of THEMES) await browser.setToolbarTheme(key);
        await browser.setToolbarTheme('sage');
      })`);
  });

  const tabA = await browser.newPage();
  await step('opening a listed site shows the pause page instead', async () => {
    await tabA.navigate(`${SITE}/`);
    await waitForPause(tabA, `${SITE}/`);
    const question = await tabA.text('#question');
    expect(question?.includes('distracting.test') === true, `question doesn't name the site: ${question}`);
    expectEqual(await tabA.text('#count'), 'First time today.', 'count line');
    await waitUntil(() => tabA.evaluate(`document.documentElement.dataset.theme === 'sage'`), { what: 'pause page in Sage' });
  });

  await step('"Yes" opens the site', async () => {
    await tabA.click('#yes');
    await waitForUrl(tabA, `${SITE}/`);
    const alarm = await options.evaluate(`chrome.alarms.get('grace')`);
    const minutesLeft = (alarm.scheduledTime - Date.now()) / 60_000;
    expect(minutesLeft > 4.5 && minutesLeft <= 5.01, `grace alarm should be ~5 min away, is ${minutesLeft}`);
  });

  await step("doesn't ask again in that tab during the grace period", async () => {
    await tabA.navigate(`${SITE}/again`);
    await waitForUrl(tabA, `${SITE}/again`);
    await tabA.settle();
    expectEqual(await tabA.url(), `${SITE}/again`, 'URL after settling');
  });

  await step('never asks when navigating within the site (even into a new tab)', async () => {
    await tabA.click('#newtab');
    const popout = await waitUntil(
      async () => (await browser.targets()).find((t) => t.url.includes('/popout')),
      { what: 'new tab from the site' },
    );
    expectEqual(popout.url, `${SITE}/popout`, 'new tab URL');
    await sleep(300);
    expectEqual((await browser.targets()).find((t) => t.targetId === popout.targetId)?.url, `${SITE}/popout`, 'URL later');
  });

  const tabB = await browser.newPage();
  await step('a link from another site asks, and counts', async () => {
    await tabB.navigate(`${WORK}/`);
    await tabB.settle();
    await tabB.click('#away');
    await waitForPause(tabB, `${SITE}/from-work`);
    expectEqual(await tabB.text('#count'), "That's the 2nd time today.", 'count line');
  });

  await step('"No" counts down, and "Go back instead" returns to the previous page', async () => {
    await tabB.click('#no');
    const countdown = await tabB.text('#countdown');
    expect(/Okay, closing in \d/.test(countdown ?? ''), `countdown text: ${countdown}`);
    expect(await tabB.evaluate(`!document.getElementById('go-back').hidden`), '"Go back instead" should be visible');
    await tabB.click('#go-back');
    await waitForUrl(tabB, `${WORK}/`);
  });

  await step('"No" closes the tab when the countdown ends', async () => {
    const tabC = await browser.newPage(`${SITE}/third`);
    await waitForPause(tabC, `${SITE}/third`);
    await tabC.click('#no');
    await waitUntil(() => isGone(tabC.targetId), { what: 'tab to close', timeout: 6000 });
  });

  await step('never closes the last tab of a window (leaves a new tab instead)', async () => {
    const tabD = await browser.newPage(`${SITE}/fourth`, { newWindow: true });
    const { windowId } = await browser.send('Browser.getWindowForTarget', { targetId: tabD.targetId });
    await waitForPause(tabD, `${SITE}/fourth`);
    await tabD.click('#no');
    await waitUntil(() => isGone(tabD.targetId), { what: 'tab to close', timeout: 6000 });
    const survivors = (await browser.targets()).filter((t) => t.type === 'page');
    const windows = await Promise.all(
      survivors.map((t) => browser.send('Browser.getWindowForTarget', { targetId: t.targetId }).catch(() => ({}))),
    );
    expect(
      windows.some((w) => w.windowId === windowId),
      'the window should still have a tab',
    );
  });

  await step('counts every pause and every "Yes", nothing else', async () => {
    const { stats } = await options.evaluate(`chrome.storage.local.get('stats')`);
    const today = Object.values(stats)[0];
    expectEqual(today['distracting.test'], [4, 1], 'today [paused, opened]');
    // The page only re-renders when visible (requestAnimationFrame), like a person switching to it.
    await options.send('Page.bringToFront');
    await waitUntil(async () => (await options.text('#summary-title'))?.replace(/\s/g, ' ') === 'You turned back 3 of 4 times today.', {
      what: 'summary to show 3 of 4',
    });
  });

  await step('asks again once the grace period runs out', async () => {
    await options.evaluate(`import('${base}/lib/browser.js').then((m) => m.expireGrace(Date.now() + 3600_000))`);
    expectEqual((await options.evaluate('chrome.declarativeNetRequest.getSessionRules()')).length, 0, 'session rules');
    await tabA.navigate(`${SITE}/after-grace`);
    await waitForPause(tabA, `${SITE}/after-grace`);
  });

  const popup = await browser.newPage();
  await step('the popup knows the current site is on the list', async () => {
    // A popup opened as a tab sees itself as the current tab, so pretend
    // the current tab is the listed site.
    await popup.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `Object.defineProperty(chrome.tabs, 'query', { value: async () => [{ id: 1, url: ${JSON.stringify(`${SITE}/x`)} }] });`,
    });
    await popup.navigate(`${base}/popup/popup.html`);
    await waitUntil(() => popup.evaluate(`!document.querySelector('[data-state=listed]').hidden`), {
      what: 'listed state',
    });
    expectEqual(await popup.text('#listed-site'), 'distracting.test', 'listed site');
    expectEqual(await popup.text('#listed-today'), 'Paused 5 times today, you turned back 4.', 'today line');
    await waitUntil(() => popup.evaluate(`document.documentElement.dataset.theme === 'sage'`), { what: 'popup in Sage' });
  });

  await step('removing the site from the popup stops the pausing', async () => {
    await popup.click('#remove');
    await waitUntil(async () => (await options.evaluate('chrome.declarativeNetRequest.getDynamicRules()')).length === 0, {
      what: 'rules removed',
    });
    await waitUntil(() => popup.evaluate(`!document.getElementById('add-form').hidden`), { what: 'add form' });
    expectEqual(await popup.evaluate(`document.getElementById('domain').value`), 'distracting.test', 'prefilled domain');
    const tabE = await browser.newPage();
    await tabE.navigate(`${SITE}/free`);
    await waitForUrl(tabE, `${SITE}/free`);
    await tabE.settle();
    expectEqual(await tabE.url(), `${SITE}/free`, 'URL after settling');
  });

  await step('imports a backup and flags sites that still need access', async () => {
    const backup = {
      app: 'do-you-really-wanna',
      schema: 1,
      sites: { 'distracting.test': { added: 1 }, 'facebook.com': { added: 2 } },
      settings: { graceMinutes: 10, countdownSeconds: 5 },
      stats: { '2026-01-01': { 'facebook.com': [3, 1] } },
    };
    await options.evaluate(`(() => {
      window.confirm = () => true;
      const file = new File([${JSON.stringify(JSON.stringify(backup))}], 'backup.json', { type: 'application/json' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.getElementById('import-file');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
    })()`);
    await waitUntil(async () => (await options.text('#data-status')) === 'Backup imported.', { what: 'import status' });
    expectEqual((await options.evaluate('chrome.declarativeNetRequest.getDynamicRules()')).length, 2, 'rule count');
    await waitUntil(async () => (await options.text('#sites'))?.includes('Needs access'), { what: '"Needs access" on facebook.com' });
    expectEqual(await options.evaluate(`document.getElementById('grace').value`), '10', 'imported setting');
    // The backup has no theme, so it's back to the default.
    await waitUntil(
      () => options.evaluate(`document.documentElement.dataset.theme === 'tide' && document.querySelector('input[value=tide]').checked`),
      { what: 'theme back to Tide after the import' },
    );
  });

  await step('no errors were thrown on any page', async () => {
    expectEqual(pageErrors, [], 'page errors');
  });

  console.log(`\n${passed} passed\n`);
} catch (error) {
  exitCode = 1;
  console.error(`\n${error instanceof Error ? error.stack : error}\n`);
  if (pageErrors.length) console.error('Page errors:', pageErrors);
} finally {
  await browser.close();
  server.close();
  rmSync(extDir, { recursive: true, force: true });
  process.exit(exitCode);
}

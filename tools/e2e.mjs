// End-to-end smoke test: loads the real extension into a throwaway headless
// Edge/Chrome profile and walks through the whole flow against a few local
// test sites. Nothing touches the internet: *.test hosts resolve to a tiny
// server on 127.0.0.1.
//
// Usage: npm run test:e2e   (set BROWSER=/path/to/chrome to pick a browser)

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lastDays } from '../extension/lib/dates.js';
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
    res.end(`<!doctype html><title>${host} ${req.url}</title>
      <h1>Some other site</h1>
      <a id="same" href="/next">same site</a>
      <a id="away" href="http://distracting.test:${port}/from-work">a distracting link</a>`);
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const SITE = `http://distracting.test:${port}`;
const WORK = `http://work.test:${port}`;
const HABIT = `http://habit.test:${port}`; // not on the list, opened a lot
const OFTEN = `http://often.test:${port}`; // the same, but you say "don't ask again"

// --- A copy of the extension with its permissions pre-granted ---------------
// (In real use the browser asks you when you add a site, and when you turn
// on suggestions. A test can't click those browser prompts, so the copy
// declares the access to the test sites, and webNavigation, up front.)

const extDir = mkdtempSync(path.join(os.tmpdir(), 'dyrw-ext-'));
cpSync(path.join(root, 'extension'), extDir, { recursive: true });
const manifestPath = path.join(extDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['*://*.distracting.test/*', '*://*.habit.test/*'];
manifest.permissions = [...manifest.permissions, ...manifest.optional_permissions];
delete manifest.optional_permissions;
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
    await waitUntil(() => themed('dusk'), { what: 'the default theme' });
    await options.click('label[data-theme=sage] input');
    await waitUntil(
      async () => (await options.evaluate(`chrome.storage.local.get('settings')`)).settings?.theme === 'sage',
      { what: 'theme saved' },
    );
    await waitUntil(() => themed('sage'), { what: 'page recolored' });
    // The logo is filled with the accent: Sage's, light (headless follows a light browser).
    expectEqual(await options.evaluate(`getComputedStyle(document.querySelector('.brand .logo')).backgroundColor`), 'rgb(78, 124, 94)', 'accent');
    expectEqual(await options.evaluate(`new URL(document.querySelector('link[rel=icon]').href).pathname`), '/icons/sage-32.png', 'tab icon');
    // setIcon rejects if it can't load an icon file, which would throw here.
    await options.evaluate(`Promise.all([import('${base}/lib/browser.js'), import('${base}/lib/themes.js')])
      .then(async ([browser, { THEMES }]) => {
        for (const { key } of THEMES) await browser.setToolbarTheme(key);
        await browser.setToolbarTheme('sage');
      })`);
  });

  await step('"Light or dark" switches the page, and "Same as my browser" switches it back', async () => {
    const look = () =>
      options.evaluate(`[document.documentElement.dataset.appearance ?? 'browser', getComputedStyle(document.body).backgroundColor]`);
    expectEqual(await look(), ['browser', 'rgb(255, 255, 255)'], 'before');
    await options.click('input[name=appearance][value=dark]');
    await waitUntil(async () => (await look())[0] === 'dark', { what: 'dark' });
    expectEqual(await look(), ['dark', 'rgb(15, 20, 16)'], "Sage's dark background");
    await options.click('input[name=appearance][value=browser]');
    await waitUntil(async () => (await look())[0] === 'browser', { what: 'back to the browser' });
    expectEqual(await look(), ['browser', 'rgb(255, 255, 255)'], 'after');
    expectEqual((await options.evaluate(`chrome.storage.local.get('settings')`)).settings.appearance, 'browser', 'saved');
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

  await step('with a wait chosen, "Yes" counts down before it works (opt-in)', async () => {
    /** @param {string} value */
    const setWait = async (value) => {
      await options.evaluate(`(() => {
        const input = document.getElementById('yes-wait');
        input.value = '${value}';
        input.dispatchEvent(new Event('change'));
      })()`);
      await waitUntil(
        async () => (await options.evaluate(`chrome.storage.local.get('settings')`)).settings?.yesWaitSeconds === Number(value),
        { what: `wait of ${value} s saved` },
      );
    };
    expectEqual(await tabA.evaluate(`document.getElementById('yes').disabled`), false, '"Yes" right away by default');
    await setWait('2');
    // A reload isn't a new attempt, so the counts stay as they are.
    await tabA.send('Page.bringToFront');
    await tabA.send('Page.reload');
    await waitUntil(() => tabA.evaluate(`!!document.querySelector('#yes .wait')`), { what: 'the reloaded page' });
    expectEqual(
      await tabA.evaluate(`[document.getElementById('yes').disabled, document.querySelector('#yes .wait')?.textContent]`),
      [true, '2'],
      '"Yes" waiting, showing the seconds',
    );
    expectEqual(await tabA.evaluate(`document.getElementById('no').disabled`), false, '"No" works straight away');
    await waitUntil(() => tabA.evaluate(`!document.getElementById('yes').disabled`), { what: '"Yes" to work', timeout: 4000 });
    expectEqual(await tabA.text('#yes'), 'Yes, open it', 'label after the wait');
    await setWait('0');
    // The settings page only re-renders when it's in front, and later steps read it.
    await options.send('Page.bringToFront');
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

  await step('adding it back from the popup: the background saves it while the popup asks', async () => {
    await popup.click('#add');
    await waitUntil(() => popup.evaluate(`!document.querySelector('[data-state=listed]').hidden`), { what: 'listed state' });
    const { sites } = await options.evaluate(`chrome.storage.local.get('sites')`);
    expect('distracting.test' in sites, 'site saved');
    expectEqual((await options.evaluate('chrome.declarativeNetRequest.getDynamicRules()')).length, 1, 'rule count');
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
      () => options.evaluate(`document.documentElement.dataset.theme === 'dusk' && document.querySelector('input[value=dusk]').checked`),
      { what: 'theme back to Dusk after the import' },
    );
  });

  // --- Suggestions (opt-in) ---------------------------------------------------

  const suggestPrefix = `${base}/pause/suggestion.html#`;
  const [today, yesterday, twoDaysAgo] = lastDays(3);
  /** @param {string[]} keys */
  const stored = (keys) => options.evaluate(`chrome.storage.local.get(${JSON.stringify(keys)})`);
  /** @param {object} values */
  const store = (values) => options.evaluate(`chrome.storage.local.set(${JSON.stringify(values)})`);
  /** @param {string} site */
  const opensToday = async (site) => (await stored(['opens'])).opens?.[today]?.[site] ?? 0;
  /** @param {string} site  seven opens today and eight on two earlier days: one more qualifies */
  const almostAHabit = async (site) => {
    const { opens = {} } = await stored(['opens']);
    for (const [day, count] of [[today, 7], [yesterday, 8], [twoDaysAgo, 9]]) (opens[day] ??= {})[site] = count;
    await store({ opens });
  };
  /**
   * Open a page the way a person would: typed in the address bar, from a bookmark, ...
   * @param {import('./lib/cdp.mjs').Page} page @param {string} url @param {string} [transitionType]
   */
  const open = async (page, url, transitionType = 'typed') => {
    // A person opens things in the tab they're looking at (and hidden tabs never paint).
    await page.send('Page.bringToFront');
    await page.send('Page.navigate', { url, transitionType });
    // The suggestion page may replace the site while it's still settling.
    await page.settle().catch((error) => {
      if (!/navigated or closed/.test(error.message)) throw error;
    });
  };
  /** @param {import('./lib/cdp.mjs').Page} page @param {string} target */
  const waitForSuggestion = async (page, target) => {
    await waitForUrl(page, `${suggestPrefix}${target}`);
    await waitUntil(() => page.evaluate(`!!document.querySelector('[data-state=suggest]:not([hidden])')`), {
      what: 'the suggestion',
    });
  };

  const tabS = await browser.newPage();
  await step('suggestions are off by default, and nothing is counted', async () => {
    expectEqual(await options.evaluate(`document.getElementById('suggest-switch').checked`), false, 'switch');
    await open(tabS, `${HABIT}/before`);
    await sleep(300);
    expectEqual((await stored(['opens'])).opens, undefined, 'stored counts');
  });

  await step('turning suggestions on asks for the permission and shows the "don\'t ask again" list', async () => {
    await options.click('#suggest-switch');
    await waitUntil(async () => (await stored(['settings'])).settings?.suggestions === true, { what: 'switch saved' });
    await options.send('Page.bringToFront');
    await waitUntil(() => options.evaluate(`!document.getElementById('quiet-block').hidden`), { what: 'quiet list' });
    expectEqual(await options.evaluate(`document.getElementById('suggest-permission').hidden`), true, 'permission note hidden');
  });

  await step('counts opens by typing, bookmark and address bar, but not links, reloads, back or searches', async () => {
    await open(tabS, `${HABIT}/one`);
    await waitUntil(async () => (await opensToday('habit.test')) === 1, { what: 'first typed open counted' });
    await tabS.click('#same');
    await waitForUrl(tabS, `${HABIT}/next`);
    await tabS.send('Page.reload');
    await tabS.settle();
    await tabS.evaluate('history.back()');
    await waitForUrl(tabS, `${HABIT}/one`);
    await open(tabS, `${HABIT}/search?q=x`, 'generated');
    await open(tabS, `${HABIT}/form`, 'form_submit');
    await open(tabS, `${HABIT}/bookmark`, 'auto_bookmark');
    await waitUntil(async () => (await opensToday('habit.test')) >= 2, { what: 'bookmark open counted' });
    await open(tabS, `${HABIT}/address-bar`, 'address_bar');
    await waitUntil(async () => (await opensToday('habit.test')) >= 3, { what: 'address-bar open counted' });
    await sleep(300);
    const all = await options.evaluate('chrome.storage.local.get(null)');
    expectEqual(all.opens, { [today]: { 'habit.test': 3 } }, 'counts: one number per site per day, only impulse opens');
    expectEqual(all.suggestedOn, undefined, 'suggestedOn');
  });

  await step('never counts sites on the list', async () => {
    await open(tabS, `${SITE}/listed`);
    await waitForPause(tabS, `${SITE}/listed`);
    await open(tabS, `${HABIT}/after-listed`);
    await waitUntil(async () => (await opensToday('habit.test')) === 4, { what: 'next open counted' });
    expectEqual(Object.keys((await stored(['opens'])).opens[today]), ['habit.test'], 'sites counted today');
  });

  await step('a site opened a lot gets the suggestion, which resets its counts', async () => {
    await almostAHabit('habit.test');
    await open(tabS, `${HABIT}/often`);
    await waitForSuggestion(tabS, `${HABIT}/often`);
    const question = (await tabS.text('#question'))?.replace(/\s+/g, ' ');
    expectEqual(question, 'I noticed you open habit.test a lot. Do you open it out of habit?', 'question');
    await waitUntil(() => tabS.evaluate(`document.documentElement.dataset.theme === 'dusk' && !!document.querySelector('.brand .logo')`), {
      what: 'suggestion page in the current theme',
    });
    const sizes = await tabS.evaluate(
      `['add', 'quiet', 'let-in'].map((id) => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })`,
    );
    expect(sizes.every(([w, h]) => w === sizes[0][0] && h === sizes[0][1]), `buttons should be the same size: ${JSON.stringify(sizes)}`);
    const { opens, suggestedOn } = await stored(['opens', 'suggestedOn']);
    expectEqual(suggestedOn, today, 'suggestedOn');
    expect(!JSON.stringify(opens ?? {}).includes('habit.test'), `habit.test counts should be gone: ${JSON.stringify(opens)}`);
  });

  await step('"Just let me in" goes back to the site, without counting or asking again', async () => {
    await tabS.click('#let-in');
    await waitForUrl(tabS, `${HABIT}/often`);
    await sleep(500);
    expectEqual(await tabS.url(), `${HABIT}/often`, 'URL after settling');
    expectEqual(await opensToday('habit.test'), 0, 'opens after going back');
  });

  const tabO = await browser.newPage();
  await step('shows at most one suggestion a day', async () => {
    await almostAHabit('often.test');
    await open(tabO, `${OFTEN}/a`);
    await waitUntil(async () => (await opensToday('often.test')) === 8, { what: 'open counted' });
    await sleep(300);
    expectEqual(await tabO.url(), `${OFTEN}/a`, 'no second suggestion today');
    // Pretend the last suggestion was yesterday.
    await store({ suggestedOn: yesterday });
    await open(tabO, `${OFTEN}/b`);
    await waitForSuggestion(tabO, `${OFTEN}/b`);
  });

  await step('"It\'s fine, don\'t ask again" lets you in and never counts the site again', async () => {
    await tabO.click('#quiet');
    await waitForUrl(tabO, `${OFTEN}/b`);
    expectEqual(Object.keys((await stored(['quiet'])).quiet ?? {}), ['often.test'], '"don\'t ask again" list');
    await open(tabO, `${OFTEN}/c`);
    await sleep(400);
    expectEqual(await opensToday('often.test'), 0, 'opens of a site on the "don\'t ask again" list');
    expectEqual(await tabO.url(), `${OFTEN}/c`, 'URL');
  });

  await step('"Add it to my list" adds the site the way the popup does, and lets you in this once', async () => {
    await almostAHabit('habit.test');
    await store({ suggestedOn: yesterday });
    await open(tabS, `${HABIT}/add`);
    await waitForSuggestion(tabS, `${HABIT}/add`);
    await tabS.click('#add');
    await waitForUrl(tabS, `${HABIT}/add`);
    expect(Object.keys((await stored(['sites'])).sites).includes('habit.test'), 'habit.test should be on the list');
    const rules = await options.evaluate('chrome.declarativeNetRequest.getDynamicRules()');
    expect(rules.some((rule) => rule.condition.requestDomains[0] === 'habit.test'), 'habit.test should have a rule');
    expect(!JSON.stringify((await stored(['opens'])).opens ?? {}).includes('habit.test'), 'habit.test counts should be gone');
    // Another tab asks, like for any listed site.
    const tabH = await browser.newPage();
    await open(tabH, `${HABIT}/next-time`);
    await waitForPause(tabH, `${HABIT}/next-time`);
  });

  await step('the "don\'t ask again" list can be edited on the settings page', async () => {
    await options.send('Page.bringToFront');
    await waitUntil(async () => (await options.text('#quiet-list'))?.includes('often.test'), { what: 'often.test listed' });
    await options.click('#quiet-list button');
    await waitUntil(async () => Object.keys((await stored(['quiet'])).quiet).length === 0, { what: 'often.test removed' });
    await options.evaluate(`document.getElementById('quiet-domain').value = 'https://www.Example.org/page'`);
    await options.click('#quiet-form button[type=submit]');
    await waitUntil(async () => Object.keys((await stored(['quiet'])).quiet).join() === 'example.org', { what: 'example.org added' });
    await waitUntil(async () => (await options.text('#quiet-list'))?.includes('example.org'), { what: 'example.org shown' });
  });

  await step('the backup carries the switch and the "don\'t ask again" list, never the counts', async () => {
    await almostAHabit('counted.test');
    const text = await options.evaluate(`new Promise((resolve) => {
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        HTMLAnchorElement.prototype.click = click;
        fetch(this.href).then((r) => r.text()).then(resolve);
      };
      document.getElementById('export').click();
    })`);
    const backup = JSON.parse(text);
    expectEqual(backup.schema, 2, 'schema');
    expectEqual(backup.settings.suggestions, true, 'switch in the backup');
    expectEqual(Object.keys(backup.quiet), ['example.org'], '"don\'t ask again" list in the backup');
    expect(!('opens' in backup) && !('suggestedOn' in backup) && !text.includes('counted.test'), 'counts must not be in the backup');

    await options.evaluate(`(() => {
      const file = new File([${JSON.stringify(text)}], 'backup.json', { type: 'application/json' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.getElementById('import-file');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
    })()`);
    await waitUntil(async () => (await stored(['opens'])).opens === undefined, { what: 'counts cleared by the import' });
    const after = await stored(['settings', 'quiet']);
    expectEqual(after.settings.suggestions, true, 'switch after import');
    expectEqual(Object.keys(after.quiet), ['example.org'], '"don\'t ask again" list after import');
  });

  await step('turning suggestions off deletes every count and stops counting', async () => {
    await almostAHabit('counted.test');
    await store({ suggestedOn: today });
    await options.click('#suggest-switch');
    await waitUntil(async () => (await stored(['settings'])).settings.suggestions === false, { what: 'switch off' });
    const after = await stored(['opens', 'suggestedOn', 'quiet']);
    expectEqual(after.opens, undefined, 'counts');
    expectEqual(after.suggestedOn, undefined, 'suggestedOn');
    expectEqual(Object.keys(after.quiet), ['example.org'], 'the "don\'t ask again" list stays');
    await open(tabO, `${OFTEN}/off`);
    await sleep(400);
    expectEqual((await stored(['opens'])).opens, undefined, 'counts after an open while off');
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

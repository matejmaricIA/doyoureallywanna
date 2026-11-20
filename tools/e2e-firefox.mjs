// End-to-end smoke test in Firefox: installs the real extension into a
// throwaway headless Firefox profile over WebDriver BiDi and walks through
// the pausing flow against local test sites. Nothing touches the internet:
// *.test hosts resolve to a tiny server on 127.0.0.1.
//
// Narrower than tools/e2e.mjs (Edge/Chrome): it covers what differs between
// the browsers (the background page, the redirect rules, the grace rules,
// closing tabs), not every screen.
//
// Usage: npm run test:e2e:firefox   (set FIREFOX=/path/to/firefox to pick one)

import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, waitUntil } from './lib/cdp.mjs';
import { launchFirefox } from './lib/bidi.mjs';

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
      <a id="away" href="http://distracting.test:${port}/from-work">a distracting link</a>`);
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const SITE = `http://distracting.test:${port}`;
const WORK = `http://work.test:${port}`;
const HABIT = `http://habit.test:${port}`;

// --- A copy of the extension with its permissions pre-granted ---------------
// (Same as tools/e2e.mjs: a test can't click the browser's permission prompts.)

const extDir = mkdtempSync(path.join(os.tmpdir(), 'dyrw-ext-ff-'));
cpSync(path.join(root, 'extension'), extDir, { recursive: true });
const manifestPath = path.join(extDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['*://*.distracting.test/*', '*://*.habit.test/*'];
manifest.permissions = [...manifest.permissions, ...manifest.optional_permissions];
delete manifest.optional_permissions;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const firefox = await launchFirefox({
  name: 'e2e-firefox',
  prefs: {
    'network.dns.localDomains': 'distracting.test,work.test,habit.test',
    'dom.security.https_first': false,
    'dom.security.https_first_schemeless': false,
    'dom.security.https_only_mode': false,
    'browser.shell.checkDefaultBrowser': false,
    'datareporting.policy.dataSubmissionEnabled': false,
  },
});

/** @type {string[]} */
const pageErrors = [];
await firefox.send('session.subscribe', { events: ['log.entryAdded'] });
firefox.on((message) => {
  if (message.method === 'log.entryAdded' && message.params.type === 'javascript' && message.params.level === 'error') {
    pageErrors.push(message.params.text);
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
  console.log(`\nE2E (Firefox): ${manifest.name} ${manifest.version}\n`);
  await firefox.installExtension(extDir);

  /** @type {import('./lib/bidi.mjs').Tab} */
  let options;
  let base = '';
  await step('opens "Your list & stats" on install', async () => {
    const found = await waitUntil(
      async () => (await firefox.tabs()).find((t) => /^moz-extension:\/\/[^/]+\/options\/options\.html$/.test(t.url)),
      { what: 'options page', timeout: 30_000 },
    );
    base = found.url.replace(/\/options\/options\.html$/, ''); // URL().origin is "null" for moz-extension:
    options = firefox.tab(found.context);
    await options.settle();
    expect((await options.text('#empty'))?.includes('Nothing here yet') === true, 'empty state missing');
  });
  const pausePrefix = `${base}/pause/pause.html#`;

  /** @param {import('./lib/bidi.mjs').Tab} tab @param {string} expected */
  const waitForUrl = (tab, expected) => waitUntil(async () => (await tab.url()) === expected, { what: `URL ${expected}` });
  /** @param {import('./lib/bidi.mjs').Tab} tab @param {string} target */
  const waitForPause = async (tab, target) => {
    await waitForUrl(tab, `${pausePrefix}${target}`);
    await waitUntil(() => tab.evaluate(`!!document.querySelector('[data-state=ask]:not([hidden])')`), { what: 'the question' });
  };
  /** @param {string} context */
  const isGone = async (context) => !(await firefox.tabs()).some((t) => t.context === context);

  await step('adds a site, and the background page builds its redirect rule', async () => {
    await options.evaluate(`document.getElementById('domain').value = 'https://www.distracting.test/some/page'`);
    await options.click('#add-form button[type=submit]');
    await waitUntil(async () => (await options.text('#sites'))?.includes('distracting.test'), { what: 'site in list' });
    const rules = await options.evaluate('chrome.declarativeNetRequest.getDynamicRules()');
    expectEqual(rules.length, 1, 'rule count');
    expectEqual(rules[0].condition.requestDomains, ['distracting.test'], 'rule domain');
    await options.evaluate(`(() => {
      const input = document.getElementById('countdown');
      input.value = '2';
      input.dispatchEvent(new Event('change'));
    })()`);
  });

  const tabA = await firefox.newTab();
  await step('opening a listed site shows the pause page instead', async () => {
    await tabA.navigate(`${SITE}/`);
    await waitForPause(tabA, `${SITE}/`);
    const question = await tabA.text('#question');
    expect(question?.includes('distracting.test') === true, `question doesn't name the site: ${question}`);
    expectEqual(await tabA.text('#count'), 'First time today.', 'count line');
  });

  await step('"Yes" opens the site', async () => {
    await tabA.click('#yes');
    await waitForUrl(tabA, `${SITE}/`);
  });

  await step("doesn't ask again in that tab during the grace period", async () => {
    await tabA.navigate(`${SITE}/again`);
    await waitForUrl(tabA, `${SITE}/again`);
    await tabA.settle();
    expectEqual(await tabA.url(), `${SITE}/again`, 'URL after settling');
  });

  await step('never asks when navigating within the site (even into a new tab)', async () => {
    await tabA.click('#newtab');
    const popout = await waitUntil(async () => (await firefox.tabs()).find((t) => t.url.includes('/popout')), {
      what: 'new tab from the site',
    });
    expectEqual(popout.url, `${SITE}/popout`, 'new tab URL');
    await sleep(300);
    expectEqual((await firefox.tabs()).find((t) => t.context === popout.context)?.url, `${SITE}/popout`, 'URL later');
  });

  const tabB = await firefox.newTab();
  await step('a link from another site asks (no access to that site needed)', async () => {
    await tabB.navigate(`${WORK}/`);
    await waitForUrl(tabB, `${WORK}/`);
    await tabB.settle();
    await tabB.click('#away');
    await waitForPause(tabB, `${SITE}/from-work`);
    expectEqual(await tabB.text('#count'), "That's the 2nd time today.", 'count line');
  });

  await step('"No" counts down, and "Go back instead" returns to the previous page', async () => {
    await tabB.click('#no');
    const countdown = await tabB.text('#countdown');
    expect(/Okay, closing in \d/.test(countdown ?? ''), `countdown text: ${countdown}`);
    await tabB.click('#go-back');
    await waitForUrl(tabB, `${WORK}/`);
  });

  await step('"No" closes the tab when the countdown ends', async () => {
    const tabC = await firefox.newTab();
    await tabC.navigate(`${SITE}/third`);
    await waitForPause(tabC, `${SITE}/third`);
    await tabC.click('#no');
    await waitUntil(() => isGone(tabC.context), { what: 'tab to close', timeout: 6000 });
  });

  await step('asks again once the grace period runs out', async () => {
    await options.evaluate(`import('${base}/lib/browser.js').then((m) => m.expireGrace(Date.now() + 3600_000))`);
    expectEqual((await options.evaluate('chrome.declarativeNetRequest.getSessionRules()')).length, 0, 'session rules');
    await tabA.navigate(`${SITE}/after-grace`);
    await waitForPause(tabA, `${SITE}/after-grace`);
  });

  await step('counts every pause and every "Yes"', async () => {
    const { stats } = await options.evaluate(`chrome.storage.local.get('stats')`);
    expectEqual(Object.values(stats)[0]['distracting.test'], [4, 1], 'today [paused, opened]');
  });

  // Not pass/fail: what Firefox reports for a page open, which decides how
  // suggestions (isImpulseOpen) would behave here.
  await step('reports webNavigation transitions (info)', async () => {
    await options.evaluate(`(() => {
      globalThis.commits = [];
      chrome.webNavigation.onCommitted.addListener((d) => commits.push(d));
    })()`);
    const tabH = await firefox.newTab();
    await tabH.navigate(`${HABIT}/`);
    await waitForUrl(tabH, `${HABIT}/`);
    await tabH.settle();
    const commits = await options.evaluate(
      `commits.filter((d) => d.frameId === 0).map(({ url, transitionType, transitionQualifiers, documentLifecycle }) =>
        ({ url, transitionType, transitionQualifiers, documentLifecycle }))`,
    );
    console.log(`      ${JSON.stringify(commits)}`);
  });

  // A person's click, on a site we don't have access to yet: Firefox only
  // shows its permission prompt if the request comes in the same moment as
  // the click (D-030). The prompt then just waits; nobody answers it here.
  /** Open an extension page in a new tab (in front, so it can be clicked) and watch for rejections. @param {string} page */
  const openForClicks = async (page) => {
    const tab = await firefox.newTab();
    await tab.navigate(`${base}/${page}`);
    await tab.settle();
    await tab.evaluate(`(() => {
      globalThis.rejections = [];
      addEventListener('unhandledrejection', (e) => rejections.push(String(e.reason?.message ?? e.reason)));
    })()`);
    return tab;
  };

  await step('adding a site on the settings page with a real click asks for access', async () => {
    const tab = await openForClicks('options/options.html');
    await tab.evaluate(`document.getElementById('domain').value = 'asks.test'`);
    await tab.realClick('#add-form button[type=submit]');
    await waitUntil(async () => (await tab.text('#sites'))?.includes('asks.test'), { what: 'site in list' });
    await sleep(300);
    expectEqual(await tab.evaluate('rejections'), [], 'rejections');
    expect(await tab.evaluate(`document.getElementById('add-error').hidden`), 'no error shown: the prompt is waiting');
  });

  await step('adding a site from the popup with a real click asks for access, and the background saves it', async () => {
    const tab = await openForClicks('popup/popup.html');
    // In a tab the popup sees itself as the current page, so show the form by hand.
    await tab.evaluate(`(() => {
      for (const s of document.querySelectorAll('.state')) s.hidden = s.id !== 'add-form';
      document.getElementById('domain').value = 'popup.test';
    })()`);
    await tab.realClick('#add');
    await waitUntil(async () => 'popup.test' in (await tab.evaluate(`chrome.storage.local.get('sites')`)).sites, {
      what: 'site saved by the background',
    });
    await sleep(300);
    expectEqual(await tab.evaluate('rejections'), [], 'rejections');
    expect(
      (await tab.evaluate('chrome.declarativeNetRequest.getDynamicRules()')).some((r) => r.condition.requestDomains?.includes('popup.test')),
      'rule for popup.test',
    );
  });

  await step('no errors were thrown on any page', async () => {
    expectEqual(pageErrors, [], 'page errors');
  });

  console.log(`\nAll ${passed} steps passed in Firefox.\n`);
} catch (error) {
  console.error(`\n${error instanceof Error ? error.stack : error}\n`);
  if (pageErrors.length) console.error(`Page errors:\n  ${pageErrors.join('\n  ')}\n`);
  exitCode = 1;
} finally {
  await firefox.close();
  server.close();
  process.exitCode = exitCode;
}

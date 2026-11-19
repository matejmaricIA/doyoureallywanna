// The page you see instead of a listed site. The site itself never loads
// unless you say "Yes".

import { allowTemporarily } from '../lib/browser.js';
import { PROMPTS, TURNED_BACK, pick, timesTodayLine } from '../lib/copy.js';
import { dayKey } from '../lib/dates.js';
import { displayUrl, findSiteForUrl } from '../lib/domains.js';
import { sumCounts } from '../lib/stats.js';
import { load, recordEvent } from '../lib/store.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** The URL we're pausing, from after the "#". Only http(s) is accepted. */
function readTarget() {
  const raw = location.hash.slice(1);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** @param {'ask' | 'back' | 'unknown'} name */
function show(name) {
  for (const section of document.querySelectorAll('.state')) {
    /** @type {HTMLElement} */ (section).hidden = /** @type {HTMLElement} */ (section).dataset.state !== name;
  }
}

/** Fill the question, with the site name highlighted. @param {string} site */
function renderQuestion(site) {
  const [before, after = ''] = pick(PROMPTS).split('{site}');
  const name = document.createElement('span');
  name.className = 'site';
  name.textContent = site;
  $('question').replaceChildren(before, name, after);
}

async function start() {
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

  const target = readTarget();
  const data = await load();
  const site = target ? findSiteForUrl(target, Object.keys(data.sites)) : null;
  if (!target || !site) return showUnknown(target);

  // A reload or back/forward to this page isn't a new attempt.
  const navigation = /** @type {PerformanceNavigationTiming | undefined} */ (
    performance.getEntriesByType('navigation')[0]
  );
  const isRepeat = navigation?.type === 'reload' || navigation?.type === 'back_forward';
  const stats = isRepeat ? data.stats : await recordEvent(site, 'paused');
  const today = sumCounts(stats, { days: [dayKey()], domain: site });

  document.title = `Do you really wanna? · ${site}`;
  renderQuestion(site);
  $('count').textContent = timesTodayLine(today.paused);
  $('target').textContent = displayUrl(target);
  $('target').title = target;
  show('ask');
  $('no').focus();

  $('yes').addEventListener('click', () => openAnyway(site, target, data.settings.graceMinutes), { once: true });
  $('no').addEventListener('click', () => turnBack(data.settings.countdownSeconds), { once: true });
}

/**
 * @param {string} site
 * @param {string} target
 * @param {number} graceMinutes
 */
async function openAnyway(site, target, graceMinutes) {
  for (const id of ['yes', 'no']) /** @type {HTMLButtonElement} */ ($(id)).disabled = true;
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id !== undefined) await allowTemporarily(tab.id, site, graceMinutes);
    await recordEvent(site, 'opened');
  } catch (error) {
    console.error('Could not set up the grace period', error);
  }
  // replace(), so the Back button skips this page.
  location.replace(target);
}

/** @param {number} seconds */
function turnBack(seconds) {
  const message = pick(TURNED_BACK);
  $('back-title').textContent = message.title;
  $('back-body').textContent = message.body;
  $('go-back').hidden = history.length <= 1;
  show('back');

  let left = seconds;
  const tick = () => {
    if (left <= 0) {
      clearInterval(timer);
      closeTab();
      return;
    }
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(left);
    $('countdown').replaceChildren('Okay, closing in ', num, '…');
    left -= 1;
  };
  const timer = setInterval(tick, 1000);
  tick();

  $('go-back').addEventListener('click', () => {
    clearInterval(timer);
    history.back();
  });
  $('close-now').addEventListener('click', () => {
    clearInterval(timer);
    closeTab();
  });
}

/** Close this tab, but never the whole window: if it's the last tab, leave a fresh new tab behind. */
async function closeTab() {
  $('countdown').textContent = 'Closing…';
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id === undefined) return window.close();
  const tabsInWindow = await chrome.tabs.query({ windowId: tab.windowId });
  if (tabsInWindow.length <= 1) await chrome.tabs.create({ windowId: tab.windowId });
  await chrome.tabs.remove(tab.id);
}

/** @param {string | null} target */
function showUnknown(target) {
  if (target) {
    const link = /** @type {HTMLAnchorElement} */ ($('continue'));
    link.href = target;
    link.textContent = `Continue to ${displayUrl(target, 40)}`;
    link.hidden = false;
  }
  show('unknown');
}

// The browser may prerender a page while you're still typing the address.
// Don't count that as an attempt until the page is actually shown.
if (document.prerendering) {
  document.addEventListener('prerenderingchange', start, { once: true });
} else {
  start();
}

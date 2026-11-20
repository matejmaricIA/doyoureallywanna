// Toolbar popup: add the current site to the list, or see how it's going.

import { hasAccess, releaseAccess, requestAccess, syncRules, unwrapPauseUrl } from '../lib/browser.js';
import { plural } from '../lib/copy.js';
import { dayKey } from '../lib/dates.js';
import { findSiteForUrl, hostOf, normalizeDomain } from '../lib/domains.js';
import { sumCounts } from '../lib/stats.js';
import { load, removeSite } from '../lib/store.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {'none' | 'add' | 'listed'} name */
function show(name) {
  for (const section of document.querySelectorAll('.state')) {
    /** @type {HTMLElement} */ (section).hidden = /** @type {HTMLElement} */ (section).dataset.state !== name;
  }
}

/** The page in the current tab (activeTab lets us see it once you click the icon). */
async function currentUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // On our own pause page, talk about the site being paused.
  return unwrapPauseUrl(tab?.url);
}

async function render() {
  const url = await currentUrl();
  const host = hostOf(url);
  if (!url || !host) return show('none');

  const data = await load();
  const listed = findSiteForUrl(url, Object.keys(data.sites));
  if (listed) return renderListed(listed, data);

  const input = /** @type {HTMLInputElement} */ ($('domain'));
  input.value = normalizeDomain(host) ?? host;
  show('add');
  input.focus();
  input.select();
}

/**
 * @param {string} site
 * @param {import('../lib/backup.js').Data} data
 */
async function renderListed(site, data) {
  const today = sumCounts(data.stats, { days: [dayKey()], domain: site });
  $('listed-site').textContent = site;
  $('listed-today').textContent =
    today.paused === 0
      ? "I haven't had to ask today."
      : `Paused ${plural(today.paused, 'time')} today, you turned back ${today.turnedBack}.`;
  $('listed-access').hidden = await hasAccess(site);
  $('grant').onclick = async () => {
    if (await requestAccess([site])) $('listed-access').hidden = true;
  };
  $('remove').onclick = async () => {
    await removeSite(site);
    await syncRules();
    const { sites } = await load();
    await releaseAccess(site, Object.keys(sites));
    render();
  };
  show('listed');
}

$('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = /** @type {HTMLInputElement} */ ($('domain'));
  const domain = normalizeDomain(input.value);
  const error = $('add-error');
  if (!domain) {
    error.textContent = 'That doesn\'t look like a website. Try something like "reddit.com".';
    error.hidden = false;
    return;
  }
  error.hidden = true;

  // Two things at once, in the same moment as the click (D-030): ask for
  // access (Firefox refuses a permission request that comes after an
  // await), and have the background save the site (the browser's permission
  // prompt can close this popup, and the site should be on the list anyway).
  const saving = chrome.runtime.sendMessage({ addSite: domain }).catch((reason) => {
    console.error('Could not save the site', reason);
    return { added: false };
  });
  const access = requestAccess([domain]).catch(() => false);
  const { added } = await saving;
  const granted = await access;
  if (!granted) {
    if (added) {
      await removeSite(domain);
      await syncRules();
    }
    error.textContent = "Without access to the site I can't pause it, so I didn't add it.";
    error.hidden = false;
    return;
  }
  render();
});

$('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

render();

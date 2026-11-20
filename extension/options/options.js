// "Your list & stats": manage the list, see the numbers, settings,
// suggestions, backup.

import { buildBackup, parseBackup } from '../lib/backup.js';
import {
  hasAccess,
  hasSuggestPermission,
  releaseAccess,
  releaseSuggestPermission,
  requestAccess,
  requestSuggestPermission,
  syncRules,
} from '../lib/browser.js';
import { SUGGESTIONS_DENIED, SUGGESTIONS_NOTE, plural, summaryLines } from '../lib/copy.js';
import { dayKey, lastDays } from '../lib/dates.js';
import { normalizeDomain } from '../lib/domains.js';
import { LIMITS } from '../lib/settings.js';
import { sumCounts, tallyMarks } from '../lib/stats.js';
import {
  addQuiet,
  addSite,
  clearStats,
  load,
  removeQuiet,
  removeSite,
  replaceAll,
  saveSettings,
  setSuggestions,
} from '../lib/store.js';

/** @typedef {import('../lib/backup.js').Data} Data */

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * Tiny element helper.
 * @param {string} tag
 * @param {Record<string, string>} [props]
 * @param {(Node | string)[]} children
 */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

/** Domains on the list that the browser hasn't given us access to. @param {string[]} domains */
async function missingAccess(domains) {
  const checks = await Promise.all(domains.map(hasAccess));
  return domains.filter((_, i) => !checks[i]);
}

/** @typedef {import('../lib/stats.js').Counts} Counts */

let firstRender = true;
let renders = 0;

async function render() {
  const generation = ++renders;
  const data = await load();
  const domains = Object.keys(data.sites).sort();
  const [missing, canSuggest] = await Promise.all([missingAccess(domains), hasSuggestPermission()]);
  // A newer render started meanwhile (storage and permissions change together); let it win.
  if (generation !== renders) return;
  renderSummary(domains, data);
  renderList(domains, missing, data);
  renderSettings(data);
  renderSuggestions(data, canSuggest);
  firstRender = false;
}

/**
 * Tally strokes in groups of five, turned back first.
 * @param {Counts} counts
 * @param {{ cap: number, big?: boolean, draw?: boolean }} options
 */
function tally(counts, { cap, big = false, draw = false }) {
  const { marks, more } = tallyMarks(counts, cap);
  const node = el('div', { class: big ? 'tally tally-big' : 'tally', 'aria-hidden': 'true' });
  const step = Math.min(30, 700 / Math.max(1, marks.length));
  for (let i = 0; i < marks.length; i += 5) {
    const strokes = marks.slice(i, i + 5).map((kind, j) =>
      el('i', { class: `is-${kind}`, style: `--delay: ${Math.round((i + j) * step)}ms` }),
    );
    node.append(el('span', { class: 'tally-group' }, ...strokes));
  }
  if (more) node.append(el('span', { class: 'tally-more' }, `+${more}`));
  if (draw) node.classList.add('is-drawing');
  return node;
}

/**
 * "4 of 5", or "none" when there were no pauses.
 * @param {Counts} counts
 * @param {string} label  spoken after the numbers, shown on narrow screens
 */
function outOf(counts, label) {
  const text = counts.paused ? `${counts.turnedBack} of ${counts.paused}` : 'none';
  return el('span', { class: counts.paused ? 'num' : 'num is-zero' }, text, el('span', { class: 'cell-label' }, ` ${label}`));
}

/**
 * @param {string[]} domains
 * @param {Data} data
 */
function renderSummary(domains, data) {
  const today = sumCounts(data.stats, { days: [dayKey()] });
  const lines = summaryLines({
    sites: domains.length,
    today,
    week: sumCounts(data.stats, { days: lastDays(7) }),
    all: sumCounts(data.stats),
  });
  // Keep "9 of 14" together when the sentence wraps.
  $('summary-title').textContent = lines.title.replace(/(\d+) of (\d+)/, '$1 of $2');
  $('summary-body').textContent = lines.body;
  $('summary-tally').replaceChildren(...(today.paused ? [tally(today, { cap: 60, big: true, draw: firstRender })] : []));
}

/**
 * @param {string[]} domains
 * @param {string[]} missing
 * @param {Data} data
 */
function renderList(domains, missing, data) {
  const today = [dayKey()];
  const week = lastDays(7);
  $('empty').hidden = domains.length > 0;
  $('list-lede').hidden = domains.length === 0;
  $('sites-grid').hidden = domains.length === 0;
  $('sites-note').hidden = domains.length === 0;
  $('sites').replaceChildren(
    ...domains.map((domain) => {
      const todayCounts = sumCounts(data.stats, { days: today, domain });
      const main = el('div', { class: 'site-main' }, el('span', { class: 'site-name' }, domain));
      if (missing.includes(domain)) {
        const allow = el('button', { class: 'btn btn-link', type: 'button', 'aria-label': `Allow access to ${domain}` }, 'Allow');
        allow.addEventListener('click', () => requestAccess([domain]).then(render));
        main.append(el('span', { class: 'site-access' }, 'Needs access', allow));
      }
      const remove = el('button', { class: 'btn btn-link site-remove', type: 'button', 'aria-label': `Remove ${domain}` }, 'Remove');
      remove.addEventListener('click', async () => {
        await removeSite(domain);
        await syncRules();
        await releaseAccess(domain, domains.filter((d) => d !== domain));
      });
      return el(
        'li',
        { class: 'site' },
        main,
        el('div', { class: 'site-today' }, outOf(todayCounts, 'today'), tally(todayCounts, { cap: 20 })),
        el('div', { class: 'site-week' }, outOf(sumCounts(data.stats, { days: week, domain }), 'in the last 7 days')),
        remove,
      );
    }),
  );

  $('access-banner').hidden = missing.length < 2;
  $('access-text').textContent = `${plural(missing.length, 'site')} on your list need access before I can pause them.`;
  $('grant-all').onclick = () => requestAccess(missing).then(render);
}

/** @param {Data} data */
function renderSettings(data) {
  const fields = /** @type {const} */ ([
    ['grace', 'graceMinutes'],
    ['countdown', 'countdownSeconds'],
  ]);
  for (const [id, key] of fields) {
    const input = /** @type {HTMLInputElement} */ ($(id));
    input.min = String(LIMITS[key].min);
    input.max = String(LIMITS[key].max);
    if (document.activeElement !== input) input.value = String(data.settings[key]);
    input.onchange = async () => {
      const saved = await saveSettings({ [key]: Number(input.value) });
      input.value = String(saved[key]);
    };
  }
}

/**
 * The switch, and the "don't ask again" list (shown while suggestions are
 * on, or when it has something in it).
 * @param {Data} data
 * @param {boolean} canSuggest  the browser has granted what suggestions need
 */
function renderSuggestions(data, canSuggest) {
  const on = data.settings.suggestions;
  /** @type {HTMLInputElement} */ ($('suggest-switch')).checked = on;
  $('suggest-permission').hidden = !on || canSuggest;

  const quiet = Object.keys(data.quiet).sort();
  $('quiet-block').hidden = !on && quiet.length === 0;
  $('quiet-empty').hidden = quiet.length > 0;
  $('quiet-list').replaceChildren(
    ...quiet.map((domain) => {
      const remove = el('button', { class: 'btn btn-link', type: 'button', 'aria-label': `Suggest ${domain} again` }, 'Remove');
      remove.addEventListener('click', () => removeQuiet(domain));
      return el('li', {}, el('span', { class: 'site-name' }, domain), remove);
    }),
  );
}

$('suggest-note').textContent = SUGGESTIONS_NOTE;

$('suggest-switch').addEventListener('change', async (event) => {
  const input = /** @type {HTMLInputElement} */ (event.target);
  $('suggest-error').hidden = true;
  if (input.checked) {
    // Ask right away, while the click still counts as one.
    const granted = await requestSuggestPermission().catch(() => false);
    if (!granted) {
      input.checked = false;
      $('suggest-error').textContent = SUGGESTIONS_DENIED;
      $('suggest-error').hidden = false;
      return;
    }
    await setSuggestions(true);
  } else {
    // Deletes every count, then gives the permission back.
    await setSuggestions(false);
    await releaseSuggestPermission();
  }
});

$('suggest-allow').addEventListener('click', () => requestSuggestPermission().then(render, render));

$('quiet-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = /** @type {HTMLInputElement} */ ($('quiet-domain'));
  const error = $('quiet-error');
  const domain = normalizeDomain(input.value);
  if (!domain) {
    error.textContent = 'That doesn\'t look like a website. Try something like "github.com".';
    error.hidden = false;
    return;
  }
  error.hidden = true;
  input.value = '';
  await addQuiet(domain);
});

$('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = /** @type {HTMLInputElement} */ ($('domain'));
  const error = $('add-error');
  const domain = normalizeDomain(input.value);
  if (!domain) {
    error.textContent = 'That doesn\'t look like a website. Try something like "youtube.com".';
    error.hidden = false;
    return;
  }
  error.hidden = true;
  const added = await addSite(domain);
  await syncRules();
  input.value = '';
  // Asking for access needs the click that's still "fresh", so do it right away.
  const granted = await requestAccess([domain]);
  if (!granted && added) {
    error.textContent = `Added, but I can't pause ${domain} until you allow access.`;
    error.hidden = false;
  }
  render();
});

$('export').addEventListener('click', async () => {
  const data = await load();
  const backup = buildBackup(data, chrome.runtime.getManifest().version);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const link = el('a', { href: URL.createObjectURL(blob), download: `do-you-really-wanna-backup-${dayKey()}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(/** @type {HTMLAnchorElement} */ (link).href), 10_000);
  setStatus('Backup saved to your downloads.');
});

$('import').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', async (event) => {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const result = parseBackup(await file.text());
  if (!result.ok) return setStatus(result.error, true);
  const count = Object.keys(result.data.sites).length;
  if (!confirm(`Replace your current list, settings and stats with this backup (${plural(count, 'site')})?`)) return;
  await replaceAll(result.data);
  await syncRules();
  // A backup with suggestions on asks for the permission on this page ("Allow").
  if (!result.data.settings.suggestions) await releaseSuggestPermission();
  setStatus('Backup imported.');
});

$('clear-stats').addEventListener('click', async () => {
  if (!confirm('Delete all your stats? Your list and settings stay. This can\'t be undone.')) return;
  await clearStats();
  setStatus('Stats deleted.');
});

/** @param {string} text @param {boolean} [isError] */
function setStatus(text, isError = false) {
  $('data-status').textContent = text;
  $('data-status').classList.toggle('is-error', isError);
}

$('version').textContent = chrome.runtime.getManifest().version;

// Stay in sync with the popup and pause pages.
let queued = false;
chrome.storage.onChanged.addListener((_, area) => {
  if (area !== 'local' || queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    render();
  });
});
chrome.permissions.onAdded.addListener(() => render());
chrome.permissions.onRemoved.addListener(() => render());

render();

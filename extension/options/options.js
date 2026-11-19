// "Your list & stats": manage the list, see the numbers, settings, backup.

import { buildBackup, parseBackup } from '../lib/backup.js';
import { hasAccess, releaseAccess, requestAccess, syncRules } from '../lib/browser.js';
import { plural } from '../lib/copy.js';
import { dayKey, lastDays } from '../lib/dates.js';
import { normalizeDomain } from '../lib/domains.js';
import { LIMITS } from '../lib/settings.js';
import { sumCounts } from '../lib/stats.js';
import { addSite, clearStats, load, removeSite, replaceAll, saveSettings } from '../lib/store.js';

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

async function render() {
  const data = await load();
  const domains = Object.keys(data.sites).sort();
  const missing = await missingAccess(domains);
  renderList(domains, missing, data);
  renderStats(domains, data);
  renderSettings(data);
}

/**
 * @param {string[]} domains
 * @param {string[]} missing
 * @param {Data} data
 */
function renderList(domains, missing, data) {
  const today = dayKey();
  $('empty').hidden = domains.length > 0;
  $('sites').replaceChildren(
    ...domains.map((domain) => {
      const { paused } = sumCounts(data.stats, { days: [today], domain });
      const row = el(
        'li',
        { class: 'site-row' },
        el(
          'div',
          { class: 'site-main' },
          el('span', { class: 'site-name' }, domain),
          el('span', { class: 'site-sub' }, paused ? `Paused ${plural(paused, 'time')} today` : 'Not paused today'),
        ),
      );
      if (missing.includes(domain)) {
        const allow = el('button', { class: 'btn btn-quiet btn-small', type: 'button' }, 'Allow');
        allow.addEventListener('click', () => requestAccess([domain]).then(render));
        row.append(el('span', { class: 'warn' }, 'Needs access', allow));
      }
      const remove = el('button', { class: 'btn btn-link', type: 'button', 'aria-label': `Remove ${domain}` }, 'Remove');
      remove.addEventListener('click', async () => {
        await removeSite(domain);
        await syncRules();
        await releaseAccess(domain, domains.filter((d) => d !== domain));
      });
      row.append(remove);
      return row;
    }),
  );

  $('access-banner').hidden = missing.length < 2;
  $('access-text').textContent = `${plural(missing.length, 'site')} on your list need access before I can pause them.`;
  $('grant-all').onclick = () => requestAccess(missing).then(render);
}

/**
 * @param {string[]} domains
 * @param {Data} data
 */
function renderStats(domains, data) {
  const today = [dayKey()];
  const week = lastDays(7);
  const tiles = /** @type {const} */ ([
    ['today', today],
    ['week', week],
    ['all', null],
  ]);
  for (const [name, days] of tiles) {
    const counts = sumCounts(data.stats, { days });
    $(`tile-${name}`).textContent = String(counts.turnedBack);
    $(`tile-${name}-sub`).textContent = `out of ${plural(counts.paused, 'pause')}`;
  }

  // Every site that has stats, even ones removed from the list since.
  const sites = new Set(domains);
  for (const perSite of Object.values(data.stats)) for (const site of Object.keys(perSite)) sites.add(site);
  const rows = [...sites]
    .map((domain) => ({
      domain,
      today: sumCounts(data.stats, { days: today, domain }),
      week: sumCounts(data.stats, { days: week, domain }),
      all: sumCounts(data.stats, { domain }),
    }))
    .filter((row) => row.all.paused > 0)
    .sort((a, b) => b.all.paused - a.all.paused || a.domain.localeCompare(b.domain));

  /** @param {import('../lib/stats.js').Counts} counts */
  const cell = (counts) =>
    el('td', {}, String(counts.turnedBack), el('span', { class: 'of' }, ` / ${counts.paused}`));

  $('stats-table-wrap').hidden = rows.length === 0;
  $('stats-rows').replaceChildren(
    ...rows.map((row) => el('tr', {}, el('td', {}, row.domain), cell(row.today), cell(row.week), cell(row.all))),
  );
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

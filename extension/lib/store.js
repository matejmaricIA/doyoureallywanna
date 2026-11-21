// All reads and writes of chrome.storage.local go through here.
// Writes are read-modify-write, so they run under a Web Lock: two tabs
// recording a pause at the same moment can't overwrite each other.

import { SCHEMA } from './backup.js';
import { dayKey } from './dates.js';
import { sanitizeSettings } from './settings.js';
import { addImpulse, forgetImpulse } from './impulse.js';
import { addEvent, pruneStats } from './stats.js';
import { forgetSite, isCovered, pruneOpens, recordOpen } from './suggest.js';

/** @typedef {import('./backup.js').Data} Data */
/** @typedef {import('./backup.js').Sites} Sites */
/** @typedef {import('./settings.js').Settings} Settings */
/** @typedef {import('./suggest.js').Opens} Opens */

const LOCK = 'dyrw-storage';

/**
 * What the suggestion check needs (the last 2 hours' opens, the day of the
 * last suggestion). Turning suggestions off removes these; the stats of
 * impulse opens (`impulse`) stay until you delete them (D-032).
 */
const SUGGESTION_CHECK = ['opens', 'suggestedOn'];

/** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
function withLock(fn) {
  return navigator.locks.request(LOCK, fn);
}

/** @returns {Promise<Data>} */
export async function load() {
  const raw = await chrome.storage.local.get(['sites', 'settings', 'stats', 'quiet', 'impulse']);
  return {
    sites: raw.sites ?? {},
    settings: sanitizeSettings(raw.settings),
    stats: raw.stats ?? {},
    quiet: raw.quiet ?? {},
    impulse: raw.impulse ?? {},
  };
}

/**
 * Put a site on the list. Any suggestion counts for it are dropped:
 * listed sites are never counted.
 * @param {string} domain
 * @returns {Promise<boolean>} false if it was already listed
 */
export function addSite(domain) {
  return withLock(async () => {
    const { sites = {}, opens } = await chrome.storage.local.get(['sites', 'opens']);
    if (sites[domain]) return false;
    sites[domain] = { added: Date.now() };
    await chrome.storage.local.set({ schema: SCHEMA, sites, ...(opens ? { opens: forgetSite(pruneOpens(opens, Date.now()), domain) } : {}) });
    return true;
  });
}

/** @param {string} domain */
export function removeSite(domain) {
  return withLock(async () => {
    const { sites = {} } = await chrome.storage.local.get('sites');
    delete sites[domain];
    await chrome.storage.local.set({ sites });
  });
}

/**
 * @param {string} domain
 * @param {'paused' | 'opened'} kind
 */
export function recordEvent(domain, kind) {
  return withLock(async () => {
    const { stats = {} } = await chrome.storage.local.get('stats');
    const today = dayKey();
    const next = pruneStats(addEvent(stats, domain, kind, today), today);
    await chrome.storage.local.set({ stats: next });
    return next;
  });
}

/** @param {Partial<Settings>} changes */
export function saveSettings(changes) {
  return withLock(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    const next = sanitizeSettings({ ...sanitizeSettings(settings), ...changes });
    await chrome.storage.local.set({ settings: next });
    return next;
  });
}

/** @param {Data} data */
export function replaceAll(data) {
  return withLock(async () => {
    await chrome.storage.local.remove(SUGGESTION_CHECK);
    await chrome.storage.local.set({ schema: SCHEMA, ...data });
  });
}

/** Delete every number: the list's stats and the impulse opens. */
export function clearStats() {
  return withLock(async () => {
    await chrome.storage.local.remove('opens');
    await chrome.storage.local.set({ stats: {}, impulse: {} });
  });
}

/**
 * Delete the impulse-open stats of one site.
 * @param {string} site
 */
export function forgetImpulseSite(site) {
  return withLock(async () => {
    const { impulse = {}, opens } = await chrome.storage.local.get(['impulse', 'opens']);
    // Its recent opens go too, so a suggestion starts from zero.
    const { [site]: _, ...otherOpens } = pruneOpens(opens, Date.now());
    await chrome.storage.local.set({ impulse: forgetImpulse(impulse, site), opens: otherOpens });
  });
}

// --- Suggestions (opt-in, D-020) --------------------------------------------

/**
 * Turn suggestions on or off. Off stops counting and forgets the last
 * hour's opens; the impulse stats stay.
 * @param {boolean} on
 */
export function setSuggestions(on) {
  return withLock(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...sanitizeSettings(settings), suggestions: on } });
    if (!on) await chrome.storage.local.remove(SUGGESTION_CHECK);
  });
}

/**
 * Never suggest this site (or its subdomains). Its recent opens are
 * dropped; its stats stay, and it keeps being counted in them.
 * @param {string} domain
 * @returns {Promise<boolean>} false if it was already there
 */
export function addQuiet(domain) {
  return withLock(async () => {
    const { quiet = {}, opens } = await chrome.storage.local.get(['quiet', 'opens']);
    if (quiet[domain]) return false;
    quiet[domain] = { added: Date.now() };
    await chrome.storage.local.set({ schema: SCHEMA, quiet, ...(opens ? { opens: forgetSite(pruneOpens(opens, Date.now()), domain) } : {}) });
    return true;
  });
}

/** @param {string} domain */
export function removeQuiet(domain) {
  return withLock(async () => {
    const { quiet = {} } = await chrome.storage.local.get('quiet');
    delete quiet[domain];
    await chrome.storage.local.set({ quiet });
  });
}

/**
 * Count one impulse open of `site`, unless suggestions are off or the site
 * is on the list: in the stats (D-032), and, unless it's on the "don't ask
 * again" list, toward a suggestion (D-031).
 * @param {string} site
 * @returns {Promise<boolean>} true if this open should show a suggestion
 */
export function recordImpulseOpen(site) {
  return withLock(async () => {
    const raw = await chrome.storage.local.get(['settings', 'sites', 'quiet', 'impulse', 'opens', 'suggestedOn']);
    if (!sanitizeSettings(raw.settings).suggestions) return false;
    if (isCovered(site, Object.keys(raw.sites ?? {}))) return false;
    const now = new Date();
    const today = dayKey(now);
    const impulse = pruneStats(addImpulse(raw.impulse ?? {}, site, today), today);
    if (isCovered(site, Object.keys(raw.quiet ?? {}))) {
      await chrome.storage.local.set({ impulse });
      return false;
    }
    const { opens, suggest } = recordOpen({ opens: raw.opens, suggestedOn: raw.suggestedOn }, site, now.getTime(), today);
    await chrome.storage.local.set({ impulse, opens, ...(suggest ? { suggestedOn: today } : {}) });
    return suggest;
  });
}

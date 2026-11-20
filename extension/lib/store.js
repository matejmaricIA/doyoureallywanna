// All reads and writes of chrome.storage.local go through here.
// Writes are read-modify-write, so they run under a Web Lock: two tabs
// recording a pause at the same moment can't overwrite each other.

import { SCHEMA } from './backup.js';
import { dayKey } from './dates.js';
import { sanitizeSettings } from './settings.js';
import { addEvent, pruneStats } from './stats.js';
import { forgetSite, isCovered, recordOpen } from './suggest.js';

/** @typedef {import('./backup.js').Data} Data */
/** @typedef {import('./backup.js').Sites} Sites */
/** @typedef {import('./settings.js').Settings} Settings */
/** @typedef {import('./suggest.js').Opens} Opens */

const LOCK = 'dyrw-storage';

/** Keys that only exist while suggestions are on. Turning them off removes these. */
const SUGGESTION_COUNTS = ['opens', 'suggestedOn'];

/** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
function withLock(fn) {
  return navigator.locks.request(LOCK, fn);
}

/** @returns {Promise<Data>} */
export async function load() {
  const raw = await chrome.storage.local.get(['sites', 'settings', 'stats', 'quiet']);
  return {
    sites: raw.sites ?? {},
    settings: sanitizeSettings(raw.settings),
    stats: raw.stats ?? {},
    quiet: raw.quiet ?? {},
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
    await chrome.storage.local.set({ schema: SCHEMA, sites, ...(opens ? { opens: forgetSite(opens, domain) } : {}) });
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
    await chrome.storage.local.remove(SUGGESTION_COUNTS);
    await chrome.storage.local.set({ schema: SCHEMA, ...data });
  });
}

export function clearStats() {
  return withLock(() => chrome.storage.local.set({ stats: {} }));
}

// --- Suggestions (opt-in, D-020) --------------------------------------------

/**
 * Turn suggestions on or off. Off deletes every count collected so far.
 * @param {boolean} on
 */
export function setSuggestions(on) {
  return withLock(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...sanitizeSettings(settings), suggestions: on } });
    if (!on) await chrome.storage.local.remove(SUGGESTION_COUNTS);
  });
}

/**
 * Never suggest this site (or its subdomains). Its counts are dropped.
 * @param {string} domain
 * @returns {Promise<boolean>} false if it was already there
 */
export function addQuiet(domain) {
  return withLock(async () => {
    const { quiet = {}, opens } = await chrome.storage.local.get(['quiet', 'opens']);
    if (quiet[domain]) return false;
    quiet[domain] = { added: Date.now() };
    await chrome.storage.local.set({ schema: SCHEMA, quiet, ...(opens ? { opens: forgetSite(opens, domain) } : {}) });
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
 * is on the list or the "don't ask again" list.
 * @param {string} site
 * @returns {Promise<boolean>} true if this open should show a suggestion
 */
export function recordImpulseOpen(site) {
  return withLock(async () => {
    const raw = await chrome.storage.local.get(['settings', 'sites', 'quiet', 'opens', 'suggestedOn']);
    if (!sanitizeSettings(raw.settings).suggestions) return false;
    if (isCovered(site, Object.keys(raw.sites ?? {})) || isCovered(site, Object.keys(raw.quiet ?? {}))) return false;
    const today = dayKey();
    const { opens, suggest } = recordOpen({ opens: raw.opens ?? {}, suggestedOn: raw.suggestedOn }, site, today);
    await chrome.storage.local.set({ opens, ...(suggest ? { suggestedOn: today } : {}) });
    return suggest;
  });
}

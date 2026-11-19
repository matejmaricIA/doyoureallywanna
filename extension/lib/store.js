// All reads and writes of chrome.storage.local go through here.
// Writes are read-modify-write, so they run under a Web Lock: two tabs
// recording a pause at the same moment can't overwrite each other.

import { SCHEMA } from './backup.js';
import { dayKey } from './dates.js';
import { sanitizeSettings } from './settings.js';
import { addEvent, pruneStats } from './stats.js';

/** @typedef {import('./backup.js').Data} Data */
/** @typedef {import('./settings.js').Settings} Settings */

const LOCK = 'dyrw-storage';

/** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
function withLock(fn) {
  return navigator.locks.request(LOCK, fn);
}

/** @returns {Promise<Data>} */
export async function load() {
  const raw = await chrome.storage.local.get(['sites', 'settings', 'stats']);
  return {
    sites: raw.sites ?? {},
    settings: sanitizeSettings(raw.settings),
    stats: raw.stats ?? {},
  };
}

/** @param {string} domain @returns {Promise<boolean>} false if it was already listed */
export function addSite(domain) {
  return withLock(async () => {
    const { sites = {} } = await chrome.storage.local.get('sites');
    if (sites[domain]) return false;
    sites[domain] = { added: Date.now() };
    await chrome.storage.local.set({ schema: SCHEMA, sites });
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
  return withLock(() => chrome.storage.local.set({ schema: SCHEMA, ...data }));
}

export function clearStats() {
  return withLock(() => chrome.storage.local.set({ stats: {} }));
}

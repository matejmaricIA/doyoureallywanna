// Export / import of everything the extension stores, as a plain JSON file
// the user saves and loads themselves. Import is strict: anything that
// doesn't look right is dropped or rejected, never trusted.

import { normalizeDomain } from './domains.js';
import { sanitizeSettings } from './settings.js';

export const BACKUP_APP = 'do-you-really-wanna';
export const SCHEMA = 1;

/** @typedef {import('./settings.js').Settings} Settings */
/** @typedef {import('./stats.js').Stats} Stats */
/** @typedef {Record<string, { added: number }>} Sites */
/** @typedef {{ sites: Sites, settings: Settings, stats: Stats }} Data */

/**
 * @param {Data} data
 * @param {string} version  extension version
 * @param {Date} [now]
 */
export function buildBackup(data, version, now = new Date()) {
  return {
    app: BACKUP_APP,
    schema: SCHEMA,
    version,
    exportedAt: now.toISOString(),
    sites: data.sites,
    settings: data.settings,
    stats: data.stats,
  };
}

/**
 * @param {string} text
 * @returns {{ ok: true, data: Data } | { ok: false, error: string }}
 */
export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (!raw || typeof raw !== 'object' || raw.app !== BACKUP_APP) {
    return { ok: false, error: "That file isn't a Do You Really Wanna? backup." };
  }
  if (raw.schema !== SCHEMA) {
    return { ok: false, error: 'That backup is from a newer version. Update the extension first.' };
  }

  /** @type {Sites} */
  const sites = {};
  if (raw.sites && typeof raw.sites === 'object') {
    for (const [key, value] of Object.entries(raw.sites)) {
      const domain = normalizeDomain(key);
      if (!domain) continue;
      const added = Number(value?.added);
      sites[domain] = { added: Number.isFinite(added) && added > 0 ? added : Date.now() };
    }
  }

  /** @type {Stats} */
  const stats = {};
  if (raw.stats && typeof raw.stats === 'object') {
    for (const [day, perSite] of Object.entries(raw.stats)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !perSite || typeof perSite !== 'object') continue;
      for (const [key, counts] of Object.entries(perSite)) {
        const domain = normalizeDomain(key);
        if (!domain || !Array.isArray(counts)) continue;
        const paused = toCount(counts[0]);
        const opened = Math.min(paused, toCount(counts[1]));
        if (paused === 0) continue;
        (stats[day] ??= {})[domain] = [paused, opened];
      }
    }
  }

  return { ok: true, data: { sites, settings: sanitizeSettings(raw.settings), stats } };
}

/** @param {unknown} value */
function toCount(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

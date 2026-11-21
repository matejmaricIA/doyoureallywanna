// Export / import of what the user set up and what the list counted, as a
// plain JSON file the user saves and loads themselves. Import is strict:
// anything that doesn't look right is dropped or rejected, never trusted.
//
// Schema 2 (v0.2) added the "don't ask again" list (`quiet`) and the
// suggestions switch (in `settings`). Schema 3 added the impulse-open
// stats (`impulse`, D-032). Older backups still import. The suggestion
// check's last 2 hours of opens is never in a backup (D-023).

import { normalizeDomain } from './domains.js';
import { sanitizeSettings } from './settings.js';

export const BACKUP_APP = 'do-you-really-wanna';
export const SCHEMA = 3;
const READABLE = [1, 2, 3];

/** @typedef {import('./settings.js').Settings} Settings */
/** @typedef {import('./stats.js').Stats} Stats */
/** @typedef {import('./impulse.js').Impulse} Impulse */
/** @typedef {Record<string, { added: number }>} Sites */
/** @typedef {{ sites: Sites, settings: Settings, stats: Stats, quiet: Sites, impulse: Impulse }} Data */

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
    quiet: data.quiet,
    impulse: data.impulse,
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
  if (!READABLE.includes(raw.schema)) {
    return typeof raw.schema === 'number' && raw.schema > SCHEMA
      ? { ok: false, error: 'That backup is from a newer version. Update the extension first.' }
      : { ok: false, error: "That file isn't a Do You Really Wanna? backup." };
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

  /** @type {Impulse} */
  const impulse = {};
  if (raw.impulse && typeof raw.impulse === 'object') {
    for (const [day, perSite] of Object.entries(raw.impulse)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !perSite || typeof perSite !== 'object') continue;
      for (const [key, count] of Object.entries(perSite)) {
        const domain = normalizeDomain(key);
        if (domain && toCount(count)) (impulse[day] ??= {})[domain] = toCount(count);
      }
    }
  }

  return {
    ok: true,
    data: { sites: toSites(raw.sites), settings: sanitizeSettings(raw.settings), stats, quiet: toSites(raw.quiet), impulse },
  };
}

/** A list of sites ("your list", "don't ask again"), cleaned. @param {unknown} value @returns {Sites} */
function toSites(value) {
  /** @type {Sites} */
  const sites = {};
  if (!value || typeof value !== 'object') return sites;
  for (const [key, entry] of Object.entries(value)) {
    const domain = normalizeDomain(key);
    if (!domain) continue;
    const added = Number(entry?.added);
    sites[domain] = { added: Number.isFinite(added) && added > 0 ? added : Date.now() };
  }
  return sites;
}

/** @param {unknown} value */
function toCount(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

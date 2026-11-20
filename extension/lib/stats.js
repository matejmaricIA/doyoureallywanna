// Stats are deliberately tiny and aggregated. Nothing here is a browsing
// history: no URLs, no titles, no timestamps of individual visits.
//
// Shape: { "2026-11-19": { "reddit.com": [paused, openedAnyway] } }
// "Turned back" is derived: paused - openedAnyway (closing the pause tab
// without answering counts as turning back, which is what it is).

import { dateOfKey, lastDays } from './dates.js';

/** Days of per-day detail we keep. Older days are dropped. */
export const KEEP_DAYS = 400;

/** @typedef {Record<string, Record<string, [number, number]>>} Stats */
/** @typedef {{ paused: number, opened: number, turnedBack: number }} Counts */

/**
 * Return a new stats object with one event added.
 * @param {Stats} stats
 * @param {string} domain
 * @param {'paused' | 'opened'} kind
 * @param {string} day
 * @returns {Stats}
 */
export function addEvent(stats, domain, kind, day) {
  const next = { ...stats, [day]: { ...(stats[day] ?? {}) } };
  const [paused, opened] = next[day][domain] ?? [0, 0];
  next[day][domain] = kind === 'paused' ? [paused + 1, opened] : [paused, opened + 1];
  return next;
}

/**
 * Drop days older than `keepDays` (counting today). Works for anything
 * keyed by day, so the suggestion counts use it too.
 * @template T
 * @param {Record<string, T>} stats
 * @param {string} today
 * @param {number} [keepDays]
 * @returns {Record<string, T>}
 */
export function pruneStats(stats, today, keepDays = KEEP_DAYS) {
  const oldest = lastDays(keepDays, dateOfKey(today)).at(-1) ?? today;
  /** @type {Record<string, T>} */
  const next = {};
  for (const [day, value] of Object.entries(stats)) {
    if (day >= oldest) next[day] = value;
  }
  return next;
}

/**
 * Sum counts over some days (or all days) for one site (or all sites).
 * @param {Stats} stats
 * @param {{ days?: string[] | null, domain?: string | null }} [filter]
 * @returns {Counts}
 */
export function sumCounts(stats, { days = null, domain = null } = {}) {
  let paused = 0;
  let opened = 0;
  const dayList = days ?? Object.keys(stats);
  for (const day of dayList) {
    const perSite = stats[day];
    if (!perSite) continue;
    for (const [site, [p, o]] of Object.entries(perSite)) {
      if (domain && site !== domain) continue;
      paused += p;
      opened += o;
    }
  }
  return { paused, opened, turnedBack: Math.max(0, paused - opened) };
}

/**
 * One mark per pause for drawing a tally, turned-back ones first. Past
 * `cap` the marks keep their proportions and the rest is counted in `more`.
 * @param {Counts} counts
 * @param {number} cap
 * @returns {{ marks: ('back' | 'opened')[], more: number }}
 */
export function tallyMarks({ paused, turnedBack }, cap) {
  const shown = Math.min(paused, cap);
  const back = paused > cap ? Math.round((turnedBack / paused) * cap) : turnedBack;
  return {
    marks: [...Array(back).fill('back'), ...Array(shown - back).fill('opened')],
    more: paused - shown,
  };
}

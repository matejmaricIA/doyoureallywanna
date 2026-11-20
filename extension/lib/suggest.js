// Smart suggestions (opt-in, D-020): notice sites that are *not* on the
// list but get opened on impulse a lot, and offer to add one.
// Pure: no `chrome.*` here, so it runs in unit tests as-is.
//
// What's kept, and only while suggestions are on:
//   opens:       { "2026-11-20": { "youtube.com": 9 } }   impulse opens per local day
//   suggestedOn: "2026-11-20"                             the last day a suggestion was shown
// No URLs, no page titles, no times of day.

import { dateOfKey, lastDays } from './dates.js';
import { hostMatches, hostOf, normalizeDomain } from './domains.js';
import { pruneStats } from './stats.js';

// The threshold, in one place: a site is suggested once it was opened at
// least OPENS_PER_DAY times a day on at least BUSY_DAYS of the last
// WINDOW_DAYS days (today included).
export const OPENS_PER_DAY = 8;
export const BUSY_DAYS = 3;
export const WINDOW_DAYS = 7;

/** Days of counts we keep: only the ones the check above reads. */
export const KEEP_DAYS = WINDOW_DAYS;

/** @typedef {Record<string, Record<string, number>>} Opens */

/**
 * The parts of `webNavigation.onCommitted` details we look at.
 * @typedef {object} Commit
 * @property {number} frameId
 * @property {string} url
 * @property {string} transitionType
 * @property {string[]} [transitionQualifiers]
 * @property {string} [documentLifecycle]
 */

/**
 * Was this page opened on impulse? Typed in the address bar (including
 * autocomplete), a bookmark, or a tile on the new tab page, which browsers
 * report as a bookmark. Not link clicks, reloads, back/forward, form
 * submits, searches, client-side redirects, prerenders or frames.
 * A server redirect (http → https, or to www.) is still the same open.
 * @param {Commit} commit
 */
export function isImpulseOpen({ frameId, url, transitionType, transitionQualifiers = [], documentLifecycle }) {
  if (frameId !== 0 || documentLifecycle === 'prerender' || !hostOf(url)) return false;
  if (transitionQualifiers.includes('forward_back') || transitionQualifiers.includes('client_redirect')) return false;
  if (transitionType === 'typed' || transitionType === 'auto_bookmark') return true;
  return transitionType === 'link' && transitionQualifiers.includes('from_address_bar');
}

/**
 * The site an open counts toward: its hostname, normalized like the list
 * ("www." dropped). Null for things that can't be listed (IP addresses,
 * localhost).
 * @param {string} url
 */
export function siteOfUrl(url) {
  const host = hostOf(url);
  return host ? normalizeDomain(host) : null;
}

/**
 * Is `site` on one of these lists, or a subdomain of something on them?
 * @param {string} site
 * @param {Iterable<string>} domains
 */
export function isCovered(site, domains) {
  for (const domain of domains) if (hostMatches(site, domain)) return true;
  return false;
}

/**
 * New counts with one open added.
 * @param {Opens} opens
 * @param {string} site
 * @param {string} day
 * @returns {Opens}
 */
export function countOpen(opens, site, day) {
  const perSite = { ...(opens[day] ?? {}) };
  perSite[site] = (perSite[site] ?? 0) + 1;
  return { ...opens, [day]: perSite };
}

/**
 * New counts without `domain` and its subdomains, on every day.
 * @param {Opens} opens
 * @param {string} domain
 * @returns {Opens}
 */
export function forgetSite(opens, domain) {
  /** @type {Opens} */
  const next = {};
  for (const [day, perSite] of Object.entries(opens)) {
    const kept = Object.entries(perSite).filter(([site]) => !hostMatches(site, domain));
    if (kept.length) next[day] = Object.fromEntries(kept);
  }
  return next;
}

/**
 * Does `site` open often enough to be worth a suggestion?
 * @param {Opens} opens
 * @param {string} site
 * @param {string} today
 */
export function qualifies(opens, site, today) {
  const busy = lastDays(WINDOW_DAYS, dateOfKey(today)).filter((day) => (opens[day]?.[site] ?? 0) >= OPENS_PER_DAY);
  return busy.length >= BUSY_DAYS;
}

/**
 * Count one impulse open of a site that isn't on either list, and decide
 * whether to show a suggestion now. At most one suggestion a day, for all
 * sites together. Showing one resets that site's counts, so it can only
 * come back once fresh opens qualify again (BUSY_DAYS days at the earliest).
 * @param {{ opens: Opens, suggestedOn?: string | null }} state
 * @param {string} site
 * @param {string} today
 * @returns {{ opens: Opens, suggest: boolean }}
 */
export function recordOpen({ opens, suggestedOn = null }, site, today) {
  const next = pruneStats(countOpen(opens, site, today), today, KEEP_DAYS);
  if (suggestedOn === today || !qualifies(next, site, today)) return { opens: next, suggest: false };
  return { opens: forgetSite(next, site), suggest: true };
}

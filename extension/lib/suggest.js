// Smart suggestions (opt-in, D-020): notice sites that are *not* on the
// list but get opened on impulse a lot, and offer to add one.
// Pure: no `chrome.*` here, so it runs in unit tests as-is.
//
// What's kept, and only while suggestions are on:
//   opens:       { "youtube.com": [1763650000000, ...] }  times of impulse opens, last 2 hours only
//   suggestedOn: "2026-11-20"                             the last day a suggestion was shown
// No URLs, no page titles, nothing older than 2 hours (D-031). Today's
// count per site comes from the impulse stats (D-032, lib/impulse.js).

import { hostMatches, hostOf, normalizeDomain } from './domains.js';

// The thresholds, in one place (D-037). A site is suggested on the open
// that makes it OPENS_PER_WINDOW opens within the last WINDOW_MINUTES
// minutes (a burst), or OPENS_PER_DAY opens today (checking it all day).
export const OPENS_PER_WINDOW = 6;
export const WINDOW_MINUTES = 120;
export const OPENS_PER_DAY = 8;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

/**
 * Why a suggestion is shown: which rule, and the count that met it.
 * @typedef {{ rule: 'window' | 'day', count: number }} Reason
 */

/**
 * The browser's own pages that happen to be websites. Edge's new tab page
 * lives on ntp.msn.com and reloads itself in a way Edge reports like a
 * bookmark open, so every new tab would count. These are never counted.
 * (Links clicked *on* the new tab page still count, for where they go.)
 */
export const BROWSER_PAGES = ['ntp.msn.com', 'ntp.msn.cn'];

/** @typedef {Record<string, number[]>} Opens  site -> times of its opens (ms) */

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
 * submits, searches, client-side redirects, prerenders, frames, or the
 * browser's own new tab page. A server redirect (http → https, or to
 * www.) is still the same open.
 * @param {Commit} commit
 */
export function isImpulseOpen({ frameId, url, transitionType, transitionQualifiers = [], documentLifecycle }) {
  if (frameId !== 0 || documentLifecycle === 'prerender') return false;
  const host = hostOf(url);
  if (!host || isCovered(host, BROWSER_PAGES)) return false;
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
 * Only the opens of the last WINDOW_MINUTES minutes (and nothing that isn't
 * a list of times, such as counts stored by an older version).
 * @param {unknown} opens
 * @param {number} now  ms
 * @returns {Opens}
 */
export function pruneOpens(opens, now) {
  /** @type {Opens} */
  const next = {};
  if (!opens || typeof opens !== 'object') return next;
  for (const [site, times] of Object.entries(opens)) {
    if (!Array.isArray(times)) continue;
    const recent = times.filter((t) => typeof t === 'number' && t > now - WINDOW_MS && t <= now);
    if (recent.length) next[site] = recent;
  }
  return next;
}

/**
 * New opens with one more open of `site` at `now`.
 * @param {Opens} opens
 * @param {string} site
 * @param {number} now  ms
 * @returns {Opens}
 */
export function countOpen(opens, site, now) {
  return { ...opens, [site]: [...(opens[site] ?? []), now] };
}

/**
 * New opens without `domain` and its subdomains.
 * @param {Opens} opens
 * @param {string} domain
 * @returns {Opens}
 */
export function forgetSite(opens, domain) {
  return Object.fromEntries(Object.entries(opens).filter(([site]) => !hostMatches(site, domain)));
}

/**
 * Was a site opened often enough to be worth a suggestion? A burst wins
 * when both rules are met: it's the more telling of the two.
 * @param {number} recent  its opens in the last WINDOW_MINUTES minutes
 * @param {number} today   its opens today
 * @returns {Reason | null}
 */
export function reasonFor(recent, today) {
  if (recent >= OPENS_PER_WINDOW) return { rule: 'window', count: recent };
  if (today >= OPENS_PER_DAY) return { rule: 'day', count: today };
  return null;
}

/**
 * Count one impulse open of a site that isn't on either list, and decide
 * whether to show a suggestion now. At most one suggestion a day, for all
 * sites together. Showing one resets that site's recent opens; today's
 * count starts over the next day, so the site can only come back once
 * fresh opens qualify again.
 * @param {{ opens: unknown, suggestedOn?: string | null }} state
 * @param {string} site
 * @param {number} now  ms
 * @param {string} today  the local day of `now`
 * @param {number} [todayCount]  the site's opens today, this one included
 * @returns {{ opens: Opens, suggest: Reason | null }}
 */
export function recordOpen({ opens, suggestedOn = null }, site, now, today, todayCount = 0) {
  const next = countOpen(pruneOpens(opens, now), site, now);
  const reason = suggestedOn === today ? null : reasonFor(next[site].length, todayCount);
  if (!reason) return { opens: next, suggest: null };
  return { opens: forgetSite(next, site), suggest: reason };
}

/**
 * The reason as the suggestion page's query string, and back. The page
 * isn't web-accessible (D-022), so only the extension can open it.
 * @param {Reason} reason
 */
export function reasonToQuery({ rule, count }) {
  return new URLSearchParams({ why: rule, n: String(count) }).toString();
}

/**
 * @param {string} query  e.g. location.search
 * @returns {Reason | null}
 */
export function reasonFromQuery(query) {
  const params = new URLSearchParams(query);
  const rule = params.get('why');
  const count = Number(params.get('n'));
  if ((rule !== 'window' && rule !== 'day') || !Number.isInteger(count) || count < 1) return null;
  return { rule, count };
}

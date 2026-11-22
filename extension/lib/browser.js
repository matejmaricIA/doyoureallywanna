// Thin wrappers around the browser APIs that do the actual pausing:
// declarativeNetRequest rules, the per-tab grace period, and site access.

import { hostMatches, originPatternFor } from './domains.js';
import { buildGraceRule, buildRedirectRules } from './rules.js';
import { reasonToQuery } from './suggest.js';
import { toolbarIconPaths } from './themes.js';

export const PAUSE_PAGE = 'pause/pause.html';
export const SUGGEST_PAGE = 'pause/suggestion.html';
export const GRACE_ALARM = 'grace';

/** What suggestions need: seeing which pages open (D-020). */
const SUGGEST_PERMISSION = { permissions: ['webNavigation'] };

/** The pause page's full URL. */
export function pauseUrl() {
  return chrome.runtime.getURL(PAUSE_PAGE);
}

/**
 * The suggestion page for an open of `url`. Unlike the pause page it isn't
 * web-accessible, so only the extension itself can open it. The query
 * says why it's shown (D-037); the site's URL goes after the "#".
 * @param {string} url
 * @param {import('./suggest.js').Reason} reason
 */
export function suggestUrl(url, reason) {
  return `${chrome.runtime.getURL(SUGGEST_PAGE)}?${reasonToQuery(reason)}#${url}`;
}

/**
 * If `url` is our own pause page, return the URL it is pausing.
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
export function unwrapPauseUrl(url) {
  const prefix = `${pauseUrl()}#`;
  return url?.startsWith(prefix) ? url.slice(prefix.length) : url;
}

/**
 * Make the redirect rules match the site list. Rules are rebuilt from
 * scratch in one atomic update, under a lock so two pages can't race.
 */
export function syncRules() {
  return navigator.locks.request('dyrw-rules', async () => {
    const { sites = {} } = await chrome.storage.local.get('sites');
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((rule) => rule.id),
      addRules: buildRedirectRules(Object.keys(sites), pauseUrl()),
    });
  });
}

/**
 * Color the toolbar icon to match the theme. Every page calls this when it
 * opens (ui/theme.js), so if the browser ever forgets the icon, it's back
 * the next time the extension does anything.
 * @param {string} theme
 */
export function setToolbarTheme(theme) {
  return chrome.action.setIcon({ path: toolbarIconPaths(theme) });
}

/**
 * After "Yes": let this tab through to `domain` for a few minutes.
 * Expiry times live in storage.session, which (like session rules) is
 * cleared when the browser restarts, so the two never disagree.
 * @param {number} tabId
 * @param {string} domain
 * @param {number} minutes
 */
export function allowTemporarily(tabId, domain, minutes) {
  return navigator.locks.request('dyrw-grace', async () => {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const id = rules.reduce((max, rule) => Math.max(max, rule.id), 0) + 1;
    await chrome.declarativeNetRequest.updateSessionRules({ addRules: [buildGraceRule(id, tabId, domain)] });

    const { grace = {} } = await chrome.storage.session.get('grace');
    grace[id] = Date.now() + minutes * 60_000;
    await chrome.storage.session.set({ grace });
    await scheduleGraceAlarm(grace);
  });
}

/**
 * Remove grace rules that have run out. Called by the alarm.
 * @param {number} [now]
 */
export function expireGrace(now = Date.now()) {
  return navigator.locks.request('dyrw-grace', async () => {
    /** @type {{ grace?: Record<string, number> }} */
    const { grace = {} } = await chrome.storage.session.get('grace');
    const due = Object.entries(grace)
      .filter(([, expiresAt]) => expiresAt <= now + 1000)
      .map(([id]) => Number(id));
    if (due.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: due });
    for (const id of due) delete grace[id];
    await chrome.storage.session.set({ grace });
    await scheduleGraceAlarm(grace);
  });
}

/** One alarm, set to the next expiry. @param {Record<string, number>} grace */
async function scheduleGraceAlarm(grace) {
  const next = Math.min(...Object.values(grace));
  if (Number.isFinite(next)) await chrome.alarms.create(GRACE_ALARM, { when: next });
  else await chrome.alarms.clear(GRACE_ALARM);
}

/** @param {string} domain */
export function hasAccess(domain) {
  return chrome.permissions.contains({ origins: [originPatternFor(domain)] });
}

/**
 * Ask the browser for access to these sites. Must be called from a click.
 * @param {string[]} domains
 */
export function requestAccess(domains) {
  return chrome.permissions.request({ origins: domains.map(originPatternFor) });
}

/**
 * Give back access to a site the user removed from the list, unless a
 * listed subdomain may still rely on it (adding "old.reddit.com" after
 * "reddit.com" doesn't grant anything new, it reuses reddit.com's access).
 * @param {string} domain
 * @param {Iterable<string>} stillListed
 */
export async function releaseAccess(domain, stillListed) {
  for (const other of stillListed) {
    if (other !== domain && hostMatches(other, domain)) return;
  }
  try {
    await chrome.permissions.remove({ origins: [originPatternFor(domain)] });
  } catch {
    // Not granted in the first place, or already gone. Nothing to give back.
  }
}

/** Can suggestions see which pages open? */
export function hasSuggestPermission() {
  return chrome.permissions.contains(SUGGEST_PERMISSION);
}

/** Ask for what suggestions need. Must be called from a click. */
export function requestSuggestPermission() {
  return chrome.permissions.request(SUGGEST_PERMISSION);
}

/** Give it back when suggestions are turned off. */
export async function releaseSuggestPermission() {
  try {
    await chrome.permissions.remove(SUGGEST_PERMISSION);
  } catch {
    // Not granted, or declared as required (the browser test's copy).
  }
}

// declarativeNetRequest rules, built as plain data so they can be unit tested.
//
// How the pause works:
// - One dynamic "redirect" rule per listed site sends top-level page loads
//   to our pause page, with the original URL after the "#".
// - Navigations started *from* the same site are excluded, so clicking around
//   inside a site you already chose to open never asks again. Only entering it
//   (typing it, a bookmark, a link from another site) does.
// - "Yes" adds a short-lived session "allow" rule for that one tab, with a
//   higher priority than the redirect.

export const REDIRECT_PRIORITY = 1;
export const GRACE_PRIORITY = 2;

/**
 * @param {Iterable<string>} domains
 * @param {string} pauseUrl  chrome-extension://<id>/pause/pause.html
 * @returns {chrome.declarativeNetRequest.Rule[]}
 */
export function buildRedirectRules(domains, pauseUrl) {
  return [...domains].sort().map((domain, index) => ({
    id: index + 1,
    priority: REDIRECT_PRIORITY,
    action: {
      type: /** @type {chrome.declarativeNetRequest.RuleActionType} */ ('redirect'),
      redirect: { regexSubstitution: `${pauseUrl}#\\0` },
    },
    condition: {
      regexFilter: '^.+$',
      requestDomains: [domain],
      excludedInitiatorDomains: [domain],
      resourceTypes: [/** @type {chrome.declarativeNetRequest.ResourceType} */ ('main_frame')],
    },
  }));
}

/**
 * @param {number} id
 * @param {number} tabId
 * @param {string} domain
 * @returns {chrome.declarativeNetRequest.Rule}
 */
export function buildGraceRule(id, tabId, domain) {
  return {
    id,
    priority: GRACE_PRIORITY,
    action: { type: /** @type {chrome.declarativeNetRequest.RuleActionType} */ ('allow') },
    condition: {
      tabIds: [tabId],
      requestDomains: [domain],
      resourceTypes: [/** @type {chrome.declarativeNetRequest.ResourceType} */ ('main_frame')],
    },
  };
}

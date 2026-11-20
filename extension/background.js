// The service worker does as little as possible, on purpose. The browser's
// own rule engine does the pausing, so for that it only wakes up when the
// extension is installed or updated (to set up the rules and the toolbar
// icon's color), when a "Yes" grace period runs out, and when you add a
// site from the toolbar popup (it saves it for the popup, D-030).
//
// Only if you turn on suggestions (opt-in, D-020) does it also wake when an
// http(s) page opens, to count opens of sites that aren't on your list.
// Anything that isn't an impulse open (a link, a reload, a frame) is dropped
// right away, without even reading storage. No polling, no timers.

import { GRACE_ALARM, expireGrace, setToolbarTheme, suggestUrl, syncRules } from './lib/browser.js';
import { normalizeDomain } from './lib/domains.js';
import { sanitizeSettings } from './lib/settings.js';
import { addSite, recordImpulseOpen } from './lib/store.js';
import { isImpulseOpen, siteOfUrl } from './lib/suggest.js';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncRules();
  const { settings } = await chrome.storage.local.get('settings');
  await setToolbarTheme(sanitizeSettings(settings).theme);
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === GRACE_ALARM) expireGrace();
});

// "Add" in the toolbar popup. The popup asks for access in the same moment
// as the click, and the browser's permission prompt may close it right
// after, so the saving happens here, where nothing closes (D-030).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const domain = sender.id === chrome.runtime.id ? normalizeDomain(message?.addSite) : null;
  if (!domain) return false;
  addSite(domain)
    .then(async (added) => {
      await syncRules();
      sendResponse({ added });
    })
    .catch((error) => {
      console.error('Could not add the site', error);
      sendResponse({ added: false });
    });
  return true; // the answer comes later
});

// --- Suggestions --------------------------------------------------------------

/** Only http(s) pages wake the worker. */
const PAGES = { url: [{ schemes: ['http', 'https'] }] };

/** @param {chrome.webNavigation.WebNavigationTransitionCallbackDetails} details */
async function onCommitted(details) {
  if (details.tabId < 0 || !isImpulseOpen(details)) return;
  const site = siteOfUrl(details.url);
  if (!site) return;
  try {
    // Never count private windows, even when the extension is allowed in them.
    const tab = await chrome.tabs.get(details.tabId);
    if (tab.incognito) return;
    // The page has already started to show; the suggestion replaces it (D-022).
    if (await recordImpulseOpen(site)) await chrome.tabs.update(details.tabId, { url: suggestUrl(details.url) });
  } catch {
    // The tab was closed in the meantime. Nothing to do.
  }
}

// chrome.webNavigation only exists while its permission is granted. Listen
// at the top level, so the browser can wake the worker for it, and again
// when the permission is granted while the worker is running. When it's
// taken away, the browser stops sending the event.
function listenForOpens() {
  const committed = chrome.webNavigation?.onCommitted;
  if (committed && !committed.hasListener(onCommitted)) committed.addListener(onCommitted, PAGES);
}
listenForOpens();
chrome.permissions.onAdded.addListener(listenForOpens);

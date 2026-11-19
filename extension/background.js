// The service worker does almost nothing, on purpose. The browser's own
// rule engine does the pausing, so this only wakes up when the extension
// is installed or updated, and when a "Yes" grace period runs out.
// No polling, no timers, no listeners on your browsing.

import { GRACE_ALARM, expireGrace, syncRules } from './lib/browser.js';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncRules();
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === GRACE_ALARM) expireGrace();
});

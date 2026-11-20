// The service worker does almost nothing, on purpose. The browser's own
// rule engine does the pausing, so this only wakes up when the extension
// is installed or updated (to set up the rules and the toolbar icon's
// color), and when a "Yes" grace period runs out.
// No polling, no timers, no listeners on your browsing.

import { GRACE_ALARM, expireGrace, setToolbarTheme, syncRules } from './lib/browser.js';
import { sanitizeSettings } from './lib/settings.js';

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

# How it works

A map of the code for anyone who wants to read it or change it. The *why*
behind each choice is in [DECISIONS.md](DECISIONS.md).

## Files

```
extension/                 ← load this folder in the browser; it's also what ships
  manifest.json
  background.js            service worker: install/update + grace-period alarm, nothing else
  pause/                   the page shown instead of a listed site
  popup/                   toolbar popup: add the current site / see today's numbers
  options/                 "Your list & stats": list, numbers, settings, backup
  ui/base.css              shared colors (light + dark), buttons, inputs
  icons/                   PNGs rendered from assets/icon.svg
  lib/
    domains.js     pure   normalize input, match URLs to listed sites
    rules.js       pure   build declarativeNetRequest rules
    stats.js       pure   add events, prune, sum counts, tally marks
    dates.js       pure   local day keys
    settings.js    pure   defaults, limits, sanitizing
    backup.js      pure   build / validate the JSON backup
    copy.js        pure   every question and message the extension shows,
                          and the summary sentence on "Your list & stats"
    store.js       chrome storage.local reads/writes, under a Web Lock
    browser.js     chrome rules sync, grace periods, site access
assets/icon.svg            the icon source
tests/unit/                node:test tests for the pure modules
tools/                     dev tooling (never shipped): e2e test, screenshots, icons, packaging
docs/                      decisions, roadmap, principles, this file, images
```

"Pure" modules don't touch `chrome.*`, so they run in Node unit tests
unchanged.

## What's stored

`chrome.storage.local`:

```js
{
  schema: 1,
  sites: { "reddit.com": { added: 1763548800000 } },        // when it was added
  settings: { graceMinutes: 5, countdownSeconds: 5 },
  stats: { "2026-11-19": { "reddit.com": [6, 2] } }        // [paused, openedAnyway] per local day
}
```

`chrome.storage.session` (gone when the browser restarts):

```js
{ grace: { "3": 1763549100000 } }                          // session rule id → expires at
```

## Flows

**Opening a listed site**

1. You type `reddit.com`. The browser matches the dynamic rule for
   `reddit.com` (`main_frame`, not initiated by reddit.com itself) and
   redirects to `pause/pause.html#https://www.reddit.com/`.
2. `pause.js` reads the URL after `#`, finds the listed site, records a
   "paused" event (unless this is a reload/back-forward/prerender), and
   shows the question with today's count.

**Yes**

1. `allowTemporarily(tabId, site, minutes)` adds a session `allow` rule for
   this tab and site (priority 2, above the redirect's 1), stores its expiry
   in `storage.session`, and points the `grace` alarm at the next expiry.
2. Records an "opened" event, then `location.replace(url)`.
3. When the alarm fires, `background.js` removes expired rules.

**No**

1. Shows a message and counts down from `countdownSeconds`.
2. Closes the tab. If it's the last tab of its window, opens a new tab
   first. "Go back instead" (when there's history) and "Close now" stop the
   countdown.

**Adding a site** (popup or settings page)

1. Normalize the input (`domains.js`), save it, rebuild all redirect rules
   (`syncRules`, one atomic update under a Web Lock).
2. Ask the browser for `*://*.<site>/*`. In the popup, if you say no, the
   site is removed again.

## Permissions

| Permission | Why | Install warning |
| --- | --- | --- |
| `declarativeNetRequestWithHostAccess` | the redirect and allow rules; only works on sites you granted | none |
| `storage` | your list, settings, stats | none |
| `alarms` | ending the "Yes" grace period | none |
| `activeTab` | the popup can see which site you're on when you click it | none |
| optional `*://*/*` | requested one site at a time (`*://*.reddit.com/*`) when you add it | per-site prompt |

## Testing

- `npm test`: unit tests for the pure modules.
- `npm run test:e2e`: loads a copy of `extension/` into a temporary headless
  Edge/Chrome profile over the DevTools protocol (`tools/lib/cdp.mjs`) and
  walks through every flow above against local fake sites. The copy
  pre-grants access to the fake site, because a test can't click the
  browser's permission prompt.
- `npm run check`: both.

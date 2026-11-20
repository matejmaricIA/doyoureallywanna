# How it works

A map of the code for anyone who wants to read it or change it. The *why*
behind each choice is in [DECISIONS.md](DECISIONS.md).

## Files

```
extension/                 ← load this folder in the browser; it's also what ships
  manifest.json
  background.js            service worker: install/update (rules, toolbar icon), grace-period
                           alarm, and (only with suggestions on) counting impulse opens
  pause/                   the page shown instead of a listed site (pause.html), and the
                           suggestion page (suggestion.html), sharing common.js and pause.css
  popup/                   toolbar popup: add the current site / see today's numbers
  options/                 "Your list & stats": list, numbers, settings, backup
  ui/base.css              shared colors (five themes, each light + dark), buttons, inputs
  ui/theme.js              loaded first by every page: applies the color theme, colors the toolbar icon
  icons/                   rendered by `npm run icons` from assets/:
                             icon-{16,32,48,128}.png  default theme (manifest, stores)
                             <theme>-{16,32}.png      toolbar + tab icon per theme
                             mark.svg                 the drawing, used as a CSS mask for the page logo
  lib/
    domains.js     pure   normalize input, match URLs to listed sites
    rules.js       pure   build declarativeNetRequest rules
    stats.js       pure   add events, prune, sum counts, tally marks
    dates.js       pure   local day keys
    settings.js    pure   defaults, limits, sanitizing
    suggest.js     pure   suggestions: which opens count, counting, the threshold
    themes.js      pure   the color themes, their toolbar icon colors and files
    backup.js      pure   build / validate the JSON backup
    copy.js        pure   every question and message the extension shows,
                          and the summary sentence on "Your list & stats"
    store.js       chrome storage.local reads/writes, under a Web Lock
    browser.js     chrome rules sync, grace periods, site access, suggestions' permission,
                          toolbar icon color
assets/icon.svg            the icon source (a fermata), for 32 px and up
assets/icon-small.svg      the same, redrawn on the 16 px grid
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
  schema: 2,
  sites: { "reddit.com": { added: 1763548800000 } },        // when it was added
  settings: { graceMinutes: 5, countdownSeconds: 5, theme: "tide", suggestions: false },
  stats: { "2026-11-19": { "reddit.com": [6, 2] } },       // [paused, openedAnyway] per local day
  quiet: { "github.com": { added: 1763635200000 } },        // "don't ask again": never suggested

  // Only while suggestions are on. Turning them off deletes both. Never in a backup.
  opens: { "2026-11-20": { "youtube.com": 9 } },            // impulse opens per local day, 7 days
  suggestedOn: "2026-11-20"                                // the day the last suggestion was shown
}
```

Schema 2 added `quiet`, `settings.suggestions`, `opens` and `suggestedOn`
(D-023). Nothing is migrated: missing keys mean empty / off.

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
   (`syncRules`, one atomic update under a Web Lock). Any suggestion counts
   for it are dropped.
2. Ask the browser for `*://*.<site>/*`. In the popup, if you say no, the
   site is removed again.

**Changing the color theme** (settings page)

1. The choice is saved to `settings.theme`.
2. `ui/theme.js` on every open page sees the storage change, sets
   `data-theme` on `<html>` (which switches the CSS tokens in `base.css`),
   points the tab icon at `icons/<theme>-32.png`, and calls
   `chrome.action.setIcon` with `icons/<theme>-{16,32}.png`.
3. Every page does step 2 when it opens too, and `background.js` does it on
   install/update, so the toolbar icon is right even if the browser forgets
   it after a restart. Nothing runs at browser start (D-025).

**Turning suggestions on and off** (settings page, D-020)

1. On: ask the browser for `webNavigation` (it warns "Read your browsing
   history"), then save `settings.suggestions = true`. If you say no, the
   switch goes back off.
2. Off: save `false`, delete `opens` and `suggestedOn`, give the
   permission back.

**Counting an open** (only while suggestions are on)

1. `background.js` listens to `webNavigation.onCommitted` for http(s)
   pages. The listener is added at the top level whenever the API exists,
   and on `permissions.onAdded`.
2. `isImpulseOpen` drops everything but the main frame opened by typing, a
   bookmark or the new tab page (no links, reloads, back/forward, searches,
   client redirects, prerenders, and never Edge's new tab page itself). No
   storage is read for those.
3. Private-window tabs are skipped (`tabs.get`). Then, under the storage
   lock, `recordImpulseOpen` skips sites covered by the list or the
   "don't ask again" list, adds one to today's count, drops days older
   than 7, and checks the threshold (D-021).

**A suggestion** (D-021, D-022)

1. The open that makes a site qualify (8+ opens on 3 of the last 7 days),
   if no suggestion was shown today: its counts are reset, `suggestedOn`
   is set to today, and the worker sends the tab to
   `pause/suggestion.html#<url>` with `tabs.update`. That page isn't
   web-accessible.
2. **Add it to my list**: ask for access to the site, add it like the popup,
   add a grace rule for this tab, go back to the site.
3. **It's fine, don't ask again**: add it to `quiet`, go back.
4. **Just let me in**: go back. Going back is never counted.

## Permissions

| Permission | Why | Install warning |
| --- | --- | --- |
| `declarativeNetRequestWithHostAccess` | the redirect and allow rules; only works on sites you granted | none |
| `storage` | your list, settings, stats | none |
| `alarms` | ending the "Yes" grace period | none |
| `activeTab` | the popup can see which site you're on when you click it | none |
| optional `*://*/*` | requested one site at a time (`*://*.reddit.com/*`) when you add it | per-site prompt |
| optional `webNavigation` | suggestions: seeing which sites you open by typing, bookmark or new tab page; requested when you turn them on | "Read your browsing history", at that moment |

## Testing

- `npm test`: unit tests for the pure modules.
- `npm run test:e2e`: loads a copy of `extension/` into a temporary headless
  Edge/Chrome profile over the DevTools protocol (`tools/lib/cdp.mjs`) and
  walks through every flow above against local fake sites. The copy
  pre-grants access to the fake sites and declares `webNavigation` up
  front, because a test can't click the browser's permission prompts.
  DevTools' `Page.navigate` takes a `transitionType`, which is how the
  test opens pages "by typing", "from a bookmark" or "from the address bar".
- `npm run check`: both.

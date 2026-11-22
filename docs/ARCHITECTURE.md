# How it works

A map of the code for anyone who wants to read it or change it. The *why*
behind each choice is in [DECISIONS.md](DECISIONS.md).

## Files

```
extension/                 ← load this folder in the browser; it's also what ships
  manifest.json
  background.js            service worker: install/update (rules, toolbar icon), grace-period
                           alarm, saving a site added from the popup, and (only with
                           suggestions on) counting impulse opens
  pause/                   the page shown instead of a listed site (pause.html), and the
                           suggestion page (suggestion.html), sharing common.js and pause.css
  popup/                   toolbar popup: add the current site / see today's numbers
  options/                 "Your list & stats": list, numbers, settings, backup
  ui/base.css              shared colors (five themes, light-dark() pairs), buttons, inputs
  ui/theme.js              loaded first by every page (render-blocking): applies the color theme
                           and light/dark, colors the toolbar icon
  icons/                   rendered by `npm run icons` from assets/:
                             icon-{16,32,48,128}.png  default theme (manifest, Chrome store icon)
                             <theme>-{16,32}.png      toolbar + tab icon per theme
                             mark.svg                 the drawing, used as a CSS mask for the page logo
  lib/
    domains.js     pure   normalize input, match URLs to listed sites
    rules.js       pure   build declarativeNetRequest rules
    stats.js       pure   add events, prune, sum counts, tally marks
    dates.js       pure   local day keys
    settings.js    pure   defaults, limits, sanitizing
    suggest.js     pure   suggestions: which opens count, the last 2 hours, the threshold
    impulse.js     pure   stats of impulse opens of sites not on the list: count, rows, delete
    themes.js      pure   the color themes, their toolbar icon colors and files
    backup.js      pure   build / validate the JSON backup
    copy.js        pure   every question and message the extension shows,
                          and the summary sentence on "Your list & stats"
    store.js       chrome storage.local reads/writes, under a Web Lock
    browser.js     chrome rules sync, grace periods, site access, suggestions' permission,
                          toolbar icon color
assets/icon.svg            the icon source (a fermata, drawn like a pen line), for 32 px and up
assets/icon-small.svg      the same, redrawn on the 16 px grid
tests/unit/                node:test tests for the pure modules
tools/                     dev tooling (never shipped): e2e tests (Edge/Chrome, Firefox), screenshots, icons, packaging
tools/lib/manifests.mjs    the Edge/Chrome store manifest: the repo's minus Firefox's keys (D-036)
docs/                      decisions, roadmap, principles, this file, images
store/LISTING.md           what to paste into the store forms (never shipped, D-035)
store/images/              store screenshots and promo tiles (`npm run screenshots`),
                           300 px logo (`npm run icons`)
```

"Pure" modules don't touch `chrome.*`, so they run in Node unit tests
unchanged.

## What's stored

`chrome.storage.local`:

```js
{
  schema: 3,
  sites: { "reddit.com": { added: 1763548800000 } },        // when it was added
  settings: { graceMinutes: 5, countdownSeconds: 5, yesWaitSeconds: 0, theme: "dusk", appearance: "browser", suggestions: false },
  stats: { "2026-11-19": { "reddit.com": [6, 2] } },       // [paused, openedAnyway] per local day
  quiet: { "github.com": { added: 1763635200000 } },        // "don't ask again": never suggested

  impulse: { "2026-11-21": { "youtube.com": 9 } },         // impulse opens of sites not on the list, per local day (D-032)

  // The suggestion check. Turning suggestions off deletes both. Never in a backup.
  opens: { "youtube.com": [1763672400000, …] },            // times of impulse opens in the last 2 hours (D-031)
  suggestedOn: "2026-11-20"                                // the day the last suggestion was shown
}
```

Schema 2 added `quiet`, `settings.suggestions`, `opens` and `suggestedOn`
(D-023). Schema 3 added `impulse` (D-032), which is in backups like
`stats` and pruned the same way (400 days); only "Delete all stats" or
"Delete" next to a site removes it. Nothing is migrated: missing keys
mean empty / off, and `opens` in the old per-day shape is dropped on the
next open.

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
3. If `yesWaitSeconds` is above 0 (opt-in, D-034), "Yes" is disabled and
   shows the seconds left, counting down only while the page is visible.

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

1. Normalize the input (`domains.js`). In the same moment as the click,
   ask the browser for `*://*.<site>/*` (Firefox only allows that during
   the click, D-030) and start saving: the settings page saves itself; the
   popup sends `{ addSite }` to `background.js`, which saves even if the
   permission prompt closes the popup.
2. Saving rebuilds all redirect rules (`syncRules`, one atomic update under
   a Web Lock). Any suggestion counts for the site are dropped.
3. In the popup, if you say no, the site is removed again.

**Changing the color theme or light/dark** (settings page)

1. The choice is saved to `settings.theme` or `settings.appearance`.
2. `ui/theme.js` on every open page sees the storage change. It sets
   `data-theme` on `<html>` (which switches the CSS tokens in `base.css`)
   and `data-appearance` (`light` / `dark`, or none to follow the
   browser), points the tab icon at `icons/<theme>-32.png`, and calls
   `chrome.action.setIcon` with `icons/<theme>-{16,32}.png`.
3. Every page does step 2 when it opens too, before its first paint
   (`blocking="render"` and a top-level `await`, D-027), and
   `background.js` does the toolbar icon on install/update, so it's right
   even if the browser forgets it after a restart. Nothing runs at browser
   start (D-025).

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
   lock, `recordImpulseOpen` skips sites covered by the list, adds one
   to today's number in `impulse` (D-032), and, unless the site is on the
   "don't ask again" list, drops opens older than 2 hours, adds this
   one's time to `opens` and checks the threshold (D-031).

**A suggestion** (D-021, D-022)

1. The open that makes a site qualify (6 opens within the last 2 hours, D-031),
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
- `npm run test:e2e:firefox`: the core pausing flow (pause, "Yes", grace,
  "No", links from other sites, counts) in a temporary headless Firefox,
  over WebDriver BiDi (`tools/lib/bidi.mjs`). Firefox runs the same
  `background.js` as a background page (`background.scripts`), not a
  service worker. BiDi can't open a page "by typing", so suggestions
  aren't covered there. Firefox needs `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`
  to let the test script `moz-extension://` pages; the launcher sets it.
- `npm run check`: unit tests and the Edge/Chrome test. The Firefox test
  is separate, since Firefox isn't a requirement.

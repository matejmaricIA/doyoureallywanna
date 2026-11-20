# Decision log

Every decision that shapes the product or the code, and why it was made.
Read this before changing how something works.

**Rules for this file**

- Newest at the bottom. Number them `D-001`, `D-002`, …
- Don't rewrite history. If a decision changes, add a new one and mark the
  old one *Superseded by D-0xx*.
- Status is one of: **Accepted**, **Provisional** (fine for now, revisit
  before a named milestone), **Superseded**.

---

## D-001 · Pause, never block

*2026-11-19 · Accepted*

**Context.** Blockers don't work for sites you actually need sometimes
(YouTube, Gmail, Reddit). Timers don't work either: they interrupt what
you're in the middle of and teach you to dismiss them.

**Decision.** The extension never makes a site unreachable. It inserts one
question at the moment of opening a listed site. "Yes" always works and is
always one click.

**Why.** The problem is opening things on autopilot, not the sites
themselves. A question turns a reflex into a choice. The same idea, a short
pause before opening an app, has worked on phones (e.g. the *one sec* app;
see Grüning et al., PNAS 2023).

**Consequences.** It's trivially "bypassable" (click Yes, or disable the
extension). That's by design. This is accountability, not enforcement.

## D-002 · Name: "Do You Really Wanna?", tagline "Give it a second thought."

*2026-11-19 · Provisional (final call before the first store submission)*

**Context.** Two favorites: "Do You Really Wanna?" and "Give It a Second
Thought".

**Decision.** Use both: **Do You Really Wanna?** as the name, **Give it a
second thought.** as the tagline (shown on every page and in the README).
Toolbar short name: "Really?".

**Why.** The name *is* the product: it's literally the question it asks.
Casual "wanna" sets the gentle, non-preachy tone. The tagline explains the
point in plain words.

**Consequences.** Store listings get searched for words like "focus" and
"site blocker", so the store title may need a suffix (e.g. "Do You Really
Wanna? – Mindful Site Pause"). To check before publishing: that nobody
already uses the name in the stores.

## D-003 · Chromium first: Edge and Chrome, Manifest V3

*2026-11-19 · Accepted*

**Decision.** One Manifest V3 codebase for Microsoft Edge and Google
Chrome. Firefox later (see roadmap).

**Why.** Edge is what the author uses; Chrome is the most used browser.
Both run the same MV3 extension unchanged.

## D-004 · The browser does the pausing (declarativeNetRequest), not our code

*2026-11-19 · Accepted · narrowed by D-020 for opt-in suggestions*

**Decision.** For each listed site there is one `declarativeNetRequest`
dynamic rule that redirects top-level page loads (`main_frame`) to our
pause page, with the original URL after the `#`
(`regexSubstitution: <pause page>#\0`). No content scripts. No
`webNavigation` / `tabs` listeners.

**Why.** Performance and privacy. Matching happens inside the browser's
network stack. Our JavaScript doesn't run on page loads at all, and none of
our code is ever injected into the sites you visit. The service worker only
wakes on install/update and when a grace period ends. Bonus: the listed
site doesn't load in the background, so no autoplaying video, no tracking.

**Consequences.**

- Only *page loads* are caught. Inside single-page apps (YouTube, Reddit)
  clicking around doesn't reload the page, so it never asks mid-session.
  That's what we want (see D-006).
- Redirecting needs access to the site (see D-005).
- The pause page must be web-accessible (see D-016).

## D-005 · Ask for access per site; no scary install warnings

*2026-11-19 · Accepted*

**Decision.** Permissions: `declarativeNetRequestWithHostAccess`, `storage`,
`alarms`, `activeTab`, plus `optional_host_permissions: ["*://*/*"]`. When
you add a site, we request `*://*.<site>/*` only. When you remove it, we
give it back.

**Why.** An extension about privacy shouldn't start by asking to "read and
change all your data on all websites". With the `WithHostAccess` variant,
the rules only work where you granted access, and the install prompt
doesn't ask for access to every site.

**Consequences.**

- Adding a site shows a browser prompt ("Allow access to reddit.com?").
- A site without access silently isn't paused, so the settings page and the
  popup show "Needs access" with an Allow button (e.g. after an import).
- Popup flow: save the site *first*, then ask for access, because the
  browser's permission prompt can close the popup on some systems.
- Removing a site doesn't give access back if a listed subdomain may still
  rely on it (e.g. removing `reddit.com` while `old.reddit.com` is listed).

## D-006 · Only *entering* a site asks

*2026-11-19 · Accepted*

**Decision.** Each redirect rule excludes navigations started by the same
site (`excludedInitiatorDomains: [site]`).

**Why.** The impulse happens when you *enter* a site: typing it, a bookmark,
a new tab, a link from somewhere else. Once you've said yes, opening five
Reddit threads in new tabs shouldn't mean five questions.

**Consequences.** A link from another site (e.g. Google results → Reddit)
does ask. Considered fine: that's entering it.

## D-007 · "Yes" lets that tab through for 5 minutes

*2026-11-19 · Accepted*

**Decision.** "Yes" adds a session `allow` rule (`tabIds: [tab]`,
`requestDomains: [site]`, priority above the redirect), then navigates with
`location.replace()` so Back skips the pause page. Default 5 minutes,
adjustable 1-120. Expiry times live in `chrome.storage.session`. One
`chrome.alarms` alarm is set to the next expiry, and expired rules are
removed when it fires.

**Why.** Per tab, as decided: other tabs still ask. `storage.session` and
session rules are both wiped on browser restart, so they can never
disagree. A single alarm means no timers running in the background.

**Consequences.** Grace doesn't follow you to a new tab. Combined with D-006
that's rarely noticeable.

## D-008 · "No": a kind word, "Okay, closing in 5…", close the tab

*2026-11-19 · Accepted*

**Decision.** After "No": a short rotating message ("Okay, no worries. Get
back to it, or step away from the screen for a bit."), then a visible
countdown "Okay, closing in 5…", then the tab closes. Default 5 seconds,
adjustable 0-30. "Go back instead" appears when the tab has a previous
page; "Close now" is always there. If it's the last tab in its window, we
open a new tab first, so the window (or the browser) never closes.

**Why.** Closing matches the intent ("I don't want this"). The countdown
gives you a moment to read the message and change your mind about *how* to
leave, not *whether*.

**Alternatives considered.** Always go back (leaves blank new-tab pages
lying around in the most common Ctrl+T → type → Enter case); detecting a
blank new tab behind us (impossible without more permissions).

## D-009 · Count opens, not time; keep stats tiny

*2026-11-19 · Accepted*

**Decision.** Stats are per day, per site, two numbers: `[paused,
openedAnyway]`. "Turned back" = paused − opened. Closing the pause tab
without answering counts as turning back. Reloading the pause page, going
back/forward to it, or the browser prerendering it doesn't count. Keep 400
days, then drop. No URLs, titles, or times of day are stored.

**Why.** How often you try to open a site is the honest signal for impulse
habits, and it's nearly free to record. Time tracking would need focus and
idle tracking running constantly, and it's a different product.

## D-010 · Your data stays on your computer

*2026-11-19 · Accepted*

**Decision.** Only `chrome.storage.local` (and `storage.session` for grace
periods). **Not** `chrome.storage.sync`, even though it's tempting: it goes
through Google's or Microsoft's servers. Moving to another computer = export
a JSON backup, import it there. The extension makes no network requests.

## D-011 · No build step, no dependencies

*2026-11-19 · Accepted*

**Decision.** Plain JavaScript ES modules with JSDoc types, plain HTML and
CSS. The `extension/` folder *is* the extension. No framework, no bundler,
no npm dependencies (dev tooling included: tests use `node:test`, the
browser tests speak the DevTools protocol over a pipe themselves, the zip
is written by hand).

**Why.** What you read on GitHub is byte for byte what runs in your browser,
which is the strongest privacy promise an open-source extension can make.
It also keeps the extension tiny (about 35 KB zipped), keeps store review
simple, and means nothing can break from a dependency update.

**Consequences.** If something ever truly needs a dependency, it gets its
own decision here first.

## D-012 · Open source under GPL-3.0-or-later, public from day one

*2026-11-19 · Accepted (license is easy to change while there are no outside contributors)*

**Decision.** Public GitHub repository from the first commit. License
GPL-3.0-or-later.

**Why.** The GPL keeps every copy open: nobody can take this, close it, and
turn it into the paid bloatware it exists to replace. MIT was the
alternative (simpler, more permissive).

## D-013 · How sites are matched

*2026-11-19 · Accepted*

**Decision.** A listed site is a hostname. `www.` is stripped, subdomains
are included (`youtube.com` covers `music.youtube.com`). When several listed
sites match, the most specific wins (`mail.google.com` over `google.com`).
Input is normalized: scheme, path, port and credentials are dropped, and
international names become punycode. IP addresses and single-word hosts are
rejected. The popup pre-fills the exact current host and lets you edit it,
instead of guessing the "main" domain (which needs the 200 KB Public Suffix
List to do right).

**Consequences.** Gmail users should add `mail.google.com`, not
`google.com`. The settings page says so.

## D-014 · Tone and button design

*2026-11-19 · Accepted*

**Decision.** Questions rotate between six phrasings, all answerable with
the same two buttons. "No, not now" is the filled button and has focus
(Enter = No); "Yes, open it" is right next to it, same size, one click.
Messages are kind and short, never guilt-tripping.

**Why.** Rotation fights "yes-fatigue" (clicking Yes on autopilot). Focus
on "No" adds a beat of friction to the reflex without hiding the choice.

## D-015 · Smart suggestions come next, opt-in

*2026-11-19 · Accepted · built in D-020 to D-023*

**Decision.** "I noticed you open imdb.com a lot. Is it a distraction?" is
planned for v0.2, and it will be **opt-in**, with its permission requested
only when you turn it on.

**Why.** Noticing patterns means seeing which sites you open, all of them.
The browser will (rightly) warn "read your browsing history". Users who
only want the list shouldn't have to grant that. Even when on, we'd store
only per-domain daily counts, never URLs.

## D-016 · The pause page is web-accessible

*2026-11-19 · Accepted*

**Decision.** `pause/pause.html` is in `web_accessible_resources` for all
sites, without `use_dynamic_url`.

**Why.** Navigating a tab from a web page into an extension page requires
it. `use_dynamic_url` would make the URL change every browser session,
which breaks the stored redirect rules.

**Consequences.** A website could detect that the extension is installed by
probing that URL. The pause page treats its `#` URL as untrusted: it only
ever navigates to `http(s)` URLs, and only does so automatically for sites
on your list.

## D-017 · Testing approach

*2026-11-19 · Accepted*

**Decision.** Pure logic (matching, rules, stats, settings, backups, copy)
lives in modules without `chrome.*` and is unit tested with `node:test`. A
browser test (`tools/e2e.mjs`) loads the real extension into a throwaway
headless Edge/Chrome profile and checks the whole flow against two local
fake sites (`*.test` mapped to 127.0.0.1). No internet needed.

**Consequences.** The browser's own permission prompt can't be clicked by a
test, so the test's copy of the extension declares access to the fake site
up front. The prompt itself is checked by hand.

## D-018 · Versioning and logs

*2026-11-19 · Accepted*

**Decision.** Semantic Versioning, starting at 0.1.0. `manifest.json` and
`package.json` versions must match (`npm run package` refuses otherwise).
Every change is logged in `CHANGELOG.md` under *Unreleased*; releases get a
`vX.Y.Z` tag. Decisions go here, plans and to-dos in `docs/ROADMAP.md`,
do's and don'ts in `docs/PRINCIPLES.md`. Commits use Conventional Commits
(`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## D-019 · "Your list & stats" looks like the pause page

*2026-11-19 · Accepted*

**Context.** The first settings page was built from stock parts: cream
background, rounded cards with soft shadows, three "big number" tiles and
a stats table that repeated the list. It looked generic and said
everything twice.

**Decision.** One column, no cards, the same type as the pause page.
Today's numbers lead as a sentence (`summaryLines` in `lib/copy.js`), with
a tally under it: one stroke per pause, in groups of five, turned back in
the accent color and opened anyway in grey (`tallyMarks` in
`lib/stats.js`). The list carries the per-site numbers (today with a small
tally, and the last 7 days), so there's no separate table. Settings are
sentences with the number as an inline blank. The light theme is white
instead of cream, for every page.

**Why.** The pause page is the part of the extension people see most, and
it works because it's one plain sentence. The settings page should sound
and look like the same thing. A tally is how people count by hand; it
shows the numbers without turning them into a score. It only ever shows
today, so there's nothing that looks like a streak.

**Consequences.** Per-site all-time numbers and rows for removed sites are
gone from the page; they still count in the totals and are in the backup.
The big tally draws itself once on load (off with reduced motion). Past
60 strokes (20 per site) the tally keeps its proportions and shows "+n".

## D-020 · Suggestions notice impulse opens with `webNavigation` (opt-in)

*2026-11-20 · Accepted*

**Context.** D-015 planned opt-in suggestions: "I noticed you open
youtube.com a lot." Noticing means seeing which sites open, including the
ones that aren't on the list. D-004 ruled out `webNavigation` listeners,
and PRINCIPLES.md said "Nothing runs unless the user is doing something
with a listed site".

**Decision.**

- A switch on "Your list & stats", off by default. Turning it on asks for
  the optional `webNavigation` permission. Turning it off deletes every
  count and gives the permission back.
- While it's on, the service worker listens to `webNavigation.onCommitted`
  with a URL filter for `http`/`https`. The listener is registered at the
  top level whenever the API exists (it only exists while the permission is
  granted), and again on `permissions.onAdded` for a worker that's already
  running.
- Only impulse opens count (`isImpulseOpen` in `lib/suggest.js`): typed in
  the address bar, including autocomplete (`typed`, or `link` with the
  `from_address_bar` qualifier), a bookmark or a tile on the new tab page
  (`auto_bookmark`). Not link clicks, reloads, form submits, searches
  (`generated`, `keyword`), start pages, back/forward (`forward_back`),
  client-side redirects (`client_redirect`), frames, prerenders, or Edge's
  own new tab page (`BROWSER_PAGES`: `ntp.msn.com`, `ntp.msn.cn`). A server
  redirect (http → https, or to www.) is one commit with the
  `server_redirect` qualifier: it's the same open, counted for the site it
  lands on.
- What's stored: `opens: { day: { host: count } }` for 7 days (the days the
  threshold reads; first drafted as 14, cut before release because the
  extra week was never read), plus
  `suggestedOn` (the day of the last suggestion, D-021). Hosts are
  normalized like the list (D-013): `www.` dropped, no Public Suffix List.
  Sites on the list, sites on the "don't ask again" list (both with their
  subdomains) and tabs in private windows are never counted.

What Edge 157 reported, measured with a throwaway extension over the
DevTools protocol:

| Opened by | `transitionType` | qualifiers |
| --- | --- | --- |
| typing (DevTools `typed`) | `typed` | |
| the address bar (DevTools `address_bar`) | `link` | `from_address_bar` |
| a bookmark | `auto_bookmark` | |
| a link clicked on Edge's new tab page (ntp.msn.com) | `auto_bookmark` | |
| a link | `link` | |
| a search / a keyword | `generated` / `keyword` | |
| a reload, a form submit | `reload`, `form_submit` | |
| back/forward | (the entry's own type) | `forward_back` |
| JavaScript `location.replace`, meta refresh | `link` | `client_redirect` |
| typing an address that redirects (302) | `typed` | `server_redirect` |
| startup (DevTools `auto_toplevel`) | `start_page` | |
| Edge's new tab page opening (`ntp.msn.com/edge/ntp`) | `link`, then `auto_bookmark` as it reloads itself | |

**Why.** The transition type is first known at `onCommitted`, and
`webNavigation` is the narrowest API that has it (`history` would also let
us read and delete the browser's history). Only impulse opens count
because they're the reflex the extension is about. A link is following
something; typing a site's name is reaching for it.

**Consequences.**

- The browser warns "Read your browsing history" when you turn it on. The
  settings page says so, and says what's actually kept.
- While it's on, the worker wakes for every http(s) page commit, iframes
  included (URL filters can't tell frames apart). Anything that isn't an
  impulse open is dropped before storage is touched.
- This narrows D-004 ("no `webNavigation` listeners") and the principle
  "Nothing runs unless the user is doing something with a listed site",
  for suggestions only, and only while they're on. PRINCIPLES.md is updated.
- Every link on Edge's new tab page is reported as a bookmark open,
  including the MSN news feed, so feed clicks count toward msn.com.
- Edge's new tab page is itself a web page and reloads itself in a way
  Edge also reports as a bookmark open, so without an exception every new
  tab would count toward `ntp.msn.com`. The browser test caught it. Its
  hosts are listed in `BROWSER_PAGES` and never counted; if Edge moves its
  new tab page, that list needs the new host.
- Subdomains count on their own: `music.youtube.com` and `youtube.com` are
  two sites.
- Chrome isn't checked yet (not installed where this was built). Chromium's
  new tab page opens tiles as `auto_bookmark` too; to be hand-tested.
- DevTools turns prerendering off, so it's unverified whether pressing Enter
  on an address the browser already prerendered fires `onCommitted`. If it
  doesn't, those opens just aren't counted.

## D-021 · When a site is suggested, and what each answer does

*2026-11-20 · Accepted*

**Decision.**

- A site qualifies at **8 or more opens on at least 3 of the last 7 days**
  (today included). The numbers are constants in `lib/suggest.js`. The
  open that makes it qualify shows the suggestion.
- **At most one suggestion a day**, across all sites (`suggestedOn`).
- **Showing a suggestion resets that site's counts.** So it can only come
  back if fresh opens qualify again: three days later at the earliest.
  Closing the tab without answering works the same as "Just let me in".
- The page asks "I noticed you open {site} a lot. Do you open it out of
  habit?", and says why: 8 or more times a day on 3 of the last 7 days.
  Three answers, stacked, all the same size:
  - **Add it to my list** asks for access to the site (the click is a user
    gesture on an extension page) and adds it the way the popup does. This
    one open goes through like a "Yes", with the normal grace period, and
    isn't counted in the stats; the list asks from the next time on. If
    access is refused, nothing is added and the page says so.
  - **It's fine, don't ask again** puts the site on the "don't ask again"
    list (it covers subdomains, like the list), drops its counts, and lets
    you in. The list is editable on the settings page.
  - **Just let me in** lets you in.
- "Add it to my list" is the filled button but nothing has focus, so a
  reflexive Enter doesn't add anything.

**Why.** Agreed with the author on 2026-11-20. Resetting on show needs no
snooze timer and no extra data: it asks again only if the habit carries on.
Asking "do you really wanna?" a second after someone agreed to add the
site would feel like a trick. One suggestion a day keeps it an occasional
offer, not a stream of questions.

## D-022 · Showing the suggestion without access to the site

*2026-11-20 · Accepted*

**Context.** Listed sites are paused by `declarativeNetRequest` redirects,
which only work on sites we have access to (D-005). We don't have access to
sites that aren't on the list, and the transition type isn't known before
the page commits anyway.

**Decision.**

- From `onCommitted`, the worker sends the tab to the suggestion page with
  `chrome.tabs.update`.
- The suggestion page is its own page, `pause/suggestion.html`, with the
  pause page's look (`pause.css`, shared helpers in `pause/common.js`). It
  is **not** web-accessible, unlike the pause page (D-016): only the
  extension can open it, so a website can't make the extension claim
  something about your habits.
- Every answer goes back (`history.back()`) to the page that already
  opened, which usually comes straight from the back/forward cache. If
  there's nothing to go back to, it loads the address instead. Back/forward
  is never counted (D-020), so this can't loop.

**Consequences.**

- The site starts to show before the suggestion replaces it: about
  70–100 ms in headless Edge on a local test site, with the worker awake or
  asleep. Only on the one open a day (at most) that shows a suggestion;
  every other open is just counted.
- The site has loaded in the background, so it may have started a video
  for a moment, and it's in the tab's history.
- The suggestion page stays in the tab's history as a forward entry.

## D-023 · Backup schema 2

*2026-11-20 · Accepted*

**Decision.** The backup's `schema` goes from 1 to 2. Schema 2 adds the
"don't ask again" list (`quiet`) and the suggestions switch
(`settings.suggestions`). The suggestion counts are never in a backup, and
importing a backup deletes the counts on this computer. Schema-1 backups
still import (suggestions off, empty "don't ask again" list); anything else
is rejected. Importing a backup with suggestions on can't grant the
permission by itself, so the settings page shows "Allow" until you click
it; importing one with suggestions off gives the permission back.

**Why.** The switch and the list are things you set up, so they should
move with you. The counts are a short-lived record of what you opened,
and a backup file may end up anywhere.

**Consequences.** `chrome.storage.local` also says `schema: 2` now. No
migration: the new keys are simply missing until they're used.

## D-024 · The icon is a fermata

*2026-11-20 · Accepted*

**Context.** The first icon was a white question mark on an orange
gradient rounded square. It looked like any help or FAQ icon, said nothing
about pausing, and read as a stock app tile.

**Decision.** The icon is a fermata: an arc over a dot, the musical sign for
a pause that lasts as long as the player likes. One flat color on a
transparent background, no tile. `assets/icon.svg` is the drawing for 32 px
and up. `assets/icon-small.svg` redraws it on the 16 px grid (a 2 px arc
with straight legs, a 4 px dot) so the toolbar icon stays sharp. Next to
the name on every page, the logo is the same drawing used as a CSS mask
(`icons/mark.svg`) filled with the page's accent, so it follows the theme
(D-025) and stays sharp on any screen.

**Why.** The directions tried were two tally strokes (the pause sign), a
raised eyebrow, a comma, and three takes on the pause. The fermata is the
one pause sign that leaves the length to you: hold, then carry on. That's
the extension: nothing is blocked and "Yes" always works. It also looks a
little like an eye under a raised brow, a friend asking "really?". A
question mark says "help"; stop signs, padlocks and hourglasses say
"blocked".

**Consequences.** Most people won't know the sign's name, and don't need
to. The toolbar icon has its own flat color per theme, not the page
accent, because one PNG has to read on light and dark toolbars alike.

## D-025 · Color themes, Tide by default

*2026-11-20 · Accepted; the default theme is superseded by D-026*

**Context.** The orange accent (`#d9480f`) read as a warning light, the
color of traffic cones and error messages. A pause that's meant to be kind
should feel calmer. Five palettes were compared on the real pages: the
orange, Clay, Sage, Tide and Dusk.

**Decision.** All five are themes, picked on the settings page ("Colors:
Tide, Sage, Clay, Dusk, Ember"). Tide, a grey blue-green, is the default.
Ember is the original orange, unchanged.

- Each theme is one set of tokens in `ui/base.css`
  (`[data-theme="<key>"]`), light and dark. Greys and the dark background
  carry a faint tint of the accent; light backgrounds stay white (D-019).
- The theme is a setting (`settings.theme`), so it's in the backup.
  `lib/themes.js` lists the themes, `lib/copy.js` names them.
- `ui/theme.js`, loaded first by every page, sets `data-theme` on
  `<html>`, swaps the tab icon, follows changes made in other tabs, and
  colors the toolbar icon with `chrome.action.setIcon`.
- Each theme has its own 16 and 32 px toolbar icons. The manifest's icons
  (extensions page, stores) are Tide.
- Contrast: page accents are 4.8:1 on white and 7:1 on the dark
  background (Ember keeps its 4.3:1, fine for the large text it colors).
  Toolbar icon colors are about 3.3:1 against both a white toolbar and
  Chrome's dark one (`#3c3c3c`).

**Why.** People find different colors calm, and a theme costs nothing at
runtime: a few CSS rules and ten small PNGs. Tide is the default because
it's calm without the "well done" feel green would give the tally.

The manifest can't declare per-theme icons, so the toolbar color is set
with `setIcon`. The service worker does *not* re-apply it when the browser
starts: that would run code while you aren't using the extension, which
PRINCIPLES.md and the README rule out. Instead every page re-applies it
when it opens, and so does install/update.

**Consequences.** If a browser forgets the `setIcon` color after a restart,
the toolbar shows Tide until the extension next runs (opening a listed
site, the popup or the settings page); to check by hand. With a theme
other than Tide, a page can show Tide's colors for a moment while it loads,
because the theme is read from storage asynchronously. The stores and the
extensions page always show the Tide icon. Adding a theme takes tokens in
`base.css`, a key and icon color in `themes.js`, a name in `copy.js` and
`npm run icons`; a unit test checks all of them are there.

## D-026 · Dusk is the default theme

*2026-11-20 · Accepted · Supersedes D-025's choice of default*

**Decision.** The default theme is Dusk, the soft blue-violet, instead of
Tide. It's what new installs get, and what settings or backups without a
theme mean. Dusk comes first in the settings page's list; the rest follow
from cool to warm: Tide, Sage, Clay, Ember. The manifest's icons
(extensions page, stores) are drawn in Dusk.

**Why.** Dusk is the calmest of the five: the sky just after sunset,
winding down. It's also the furthest from both the warning-light orange
and the "well done" green. Tide was never in a release, so no one sees the
default change twice.

**Consequences.** Dusk's toolbar icon color (`#8788cf`) is 3.25:1 on a
white toolbar and 3.39:1 on Chrome's dark one, like the others. Where
D-025 and the roadmap say a page or the toolbar falls back to Tide, it's
now Dusk.

## D-027 · Light or dark is a setting, and pages wait for their colors

*2026-11-20 · Accepted*

**Context.** Dark mode only followed the browser (`prefers-color-scheme`),
so someone with a light browser couldn't have dark pages. And pages
painted a frame or more in the default colors before `ui/theme.js` had
read the settings: measured, the theme landed 10 to 30 ms after the first
paint on most loads, up to about 380 ms on the settings page. That's the
flash D-025 lists as a consequence.

**Decision.**

- "Light or dark: Same as my browser / Light / Dark" on the settings page,
  stored as `settings.appearance` (`'browser'`, `'light'`, `'dark'`;
  default `'browser'`) and in the backup like the other settings.
- Every color token is a `light-dark()` pair, one block per theme. `:root`
  has `color-scheme: light dark`; `ui/theme.js` pins it by setting
  `data-appearance="light"` or `"dark"` on `<html>`. No more
  `prefers-color-scheme` media queries.
- Every page loads `ui/theme.js` with `blocking="render"`, and its first
  read of the settings is a top-level `await`, so the browser holds the
  first paint until the colors are right. Measured on 24 loads (Ember,
  forced dark, light browser): set before the first paint in 23, and the
  other within the paint timer's rounding.
- `minimum_chrome_version` goes from 110 to 123: `light-dark()` needs 123,
  and the logo's CSS mask (D-024) already needed 120.

**Why.** A switch is the only way to get dark pages without changing the
whole browser. Holding the first paint for one local read costs a few
milliseconds; painting first would flash white on every pause for anyone
who picked Dark. A synchronous copy of the setting in `localStorage` would
also have worked, but PRINCIPLES.md keeps data in `chrome.storage.local`
only.

**Consequences.** Edge and Chrome older than 123 (March 2024) can't install
it. Pages appear a few milliseconds later than before. If reading storage
ever fails, the page still shows, in the default theme and the browser's
light/dark. The toolbar icon doesn't change with light/dark; it's already
made to read on both.

## D-028 · The fermata is drawn like a pen line

*2026-11-20 · Accepted*

**Context.** The fermata (D-024) shipped as a clean, engraved arc, like
printed sheet music. Next to the plain type of the pages it looked exact
but impersonal. Three hand-drawn versions were compared with it on the
real pages and toolbars: brush (thick-thin, lifting off to a point), pen
(an even line) and ink (heavy and squat).

**Decision.** `assets/icon.svg` is the pen version: an even stroke with a
little pressure, slightly lopsided, and an oval dot. It's a
variable-width stroke turned into a filled outline, so it's still one flat
shape in `currentColor`. 16 px keeps `assets/icon-small.svg`, the
pixel-tuned drawing, because pen detail doesn't survive 16 pixels.

**Why.** It reads as made by a person, which suits a friend asking
"really?", while staying quiet next to the name. The brush version had
more character but pulled more attention; ink was the heaviest.

**Consequences.** The outline is about 3 KB of path data; it's edited as a
drawing, not by hand. Small sizes and the stores' icons change with it
when `npm run icons` runs.

## D-029 · Firefox from the same code and manifest

*2026-11-20 · Accepted · Replaces D-003's "Firefox later"*

**Context.** D-003 started with Edge and Chrome and left Firefox for later.
Firefox users are a big part of the privacy-minded audience this extension
is for. Firefox MV3 has every API we use (`declarativeNetRequest` with
session rules, `tabIds` and `excludedInitiatorDomains`, `storage.session`,
`alarms`, optional permissions, `webNavigation`) and accepts `chrome.*`
with promises, but it runs background *pages*, not service workers.

**Decision.** One `extension/` folder and one manifest for all three
browsers. The manifest names `background.js` twice: as `service_worker`
(Edge and Chrome use it, and ignore `scripts` from version 121) and in
`scripts` (Firefox uses it, and ignores `service_worker`). A
`browser_specific_settings.gecko` block gives the Firefox add-on ID
`do-you-really-wanna@matejmaricia.github.io`, requires Firefox 140, and
declares `data_collection_permissions: { required: ["none"] }`, which
Firefox Add-ons requires of new extensions and which is simply true here
(D-010). No code changes, no `browser.*` polyfill, no build step (D-011).
A separate Firefox browser test (`tools/e2e-firefox.mjs`) speaks WebDriver
BiDi over Node's built-in WebSocket, since Firefox has no DevTools protocol.

**Why.** The prototype ran unchanged: the redirect to the pause page
(`regexSubstitution` to a `moz-extension://` page), the per-tab grace
rule, and links from sites we have no access to all behave as in Chromium.
A second folder or a build step would only add ways for the two to drift.

**Consequences.** Naming both background keys needs Edge or Chrome 121
(January 2024); D-027 had already raised the minimum to 123. In developer
mode, Chromium may note the unknown gecko key on the extensions page; it's
harmless. Firefox 140 is the current ESR,
so older Firefoxes are out. The Firefox test covers the pausing flow, not
suggestions: BiDi navigations report `link`, so it can't open a page "by
typing". Suggestions in Firefox are to be checked by hand before they're
promised there. The gecko ID can't change after the first Firefox Add-ons
release.

# Changelog

All notable changes to this project are written down here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is 0.x, anything may still change between minor versions.

Every change goes under **Unreleased** first. A release moves those entries
under a new version heading and gets a `vX.Y.Z` git tag.

## [Unreleased]

### Added

- **Light or dark, your choice.** "Light or dark: Same as my browser /
  Light / Dark" on the settings page. Until now the pages could only follow
  the browser. Pages wait for your colors before they're drawn, so there's
  no flash of the wrong ones.
- **Firefox support, for testing.** The extension now also runs in
  Firefox 140 and newer, unchanged: the pause, "Yes", "No", the grace
  period and the counts all work the same. It isn't on Firefox Add-ons
  yet, and suggestions haven't been tried there.
- `npm run test:e2e:firefox`: an end-to-end test in headless Firefox over
  WebDriver BiDi (`tools/lib/bidi.mjs`), no dependencies. Set `FIREFOX=`
  to choose the binary.

### Changed

- **The fermata is drawn like a pen line**: an even stroke, a little
  lopsided, with an oval dot, instead of the clean engraved arc. The 16 px
  toolbar icon keeps its sharp small drawing.
- Needs Edge or Chrome 123 or newer (was 110): the light/dark colors use
  `light-dark()`, and one manifest now names a background script for
  Firefox next to the service worker.

## [0.3.0] - 2026-11-20

A new icon, the fermata, and five color themes to choose from.

### Added

- **Color themes.** Pick one on the settings page: Dusk (the default, a
  soft blue-violet), Tide, Sage, Clay, or Ember.
  Each comes in light and dark, and recolors every page, the tab icon and
  the toolbar icon. The theme is saved with your other settings and
  included in backups.

### Changed

- **New icon: a fermata**, the musical sign for a pause that lasts as long
  as you like, in place of the question mark on an orange tile. It's a
  flat mark on a transparent background, with its own drawing for the
  16 px toolbar size. Next to the name on every page it's drawn in the
  theme's accent.
- The default colors are calmer: Dusk, a soft blue-violet, instead of
  orange.
- The suggestion page (v0.2.0) uses the new icon and follows the theme too.

## [0.2.0] - 2026-11-20

Opt-in smart suggestions, and a "Your list & stats" page that looks like
the pause page.

### Added

- **Smart suggestions (opt-in).** A new "Suggestions" switch on "Your list
  & stats", off by default. Turning it on asks the browser for permission
  to see which pages open (the browser calls it "read your browsing
  history", and the page says so, along with what's actually kept). While
  it's on, the extension counts how often you open sites that aren't on
  your list by typing them, from a bookmark or from the new tab page: one
  number per site per day, kept for 7 days. Links, reloads, back/forward,
  searches, private windows and Edge's own new tab page are never counted.
- **The suggestion page.** When a site is opened 8 or more times a day on
  3 of the last 7 days, the next such open shows "I noticed you open
  facebook.com a lot. Do you open it out of habit?" with three answers of
  the same size: **Add it to my list** (asks for access and adds it; this
  one open goes through), **It's fine, don't ask again** and **Just let me
  in**. At most one suggestion a day, and a suggested site's counts start
  over.
- **"Don't ask again" list** on "Your list & stats": the sites that are
  never suggested. Add and remove them there.
- Turning suggestions off deletes every count right away and gives the
  permission back.
- Browser tests for suggestions (typed, bookmark and address-bar opens
  against links, reloads, back and searches; the three answers; the switch;
  the backup), and a screenshot of the suggestion page.

### Changed

- **Backups are schema 2.** They now include the suggestions switch and the
  "don't ask again" list, but never the suggestion counts. Schema-1
  backups still import. Importing a backup deletes the suggestion counts
  on this computer.
- Adding a site to the list drops any suggestion counts for it.
- The pause page's shared helpers moved to `pause/common.js`, used by both
  the pause page and the suggestion page.
- PRINCIPLES.md: "nothing runs unless…" and "no browsing history" now say
  what changes while suggestions are on (D-020).
- **"Your list & stats" redesigned.** It now looks like the pause page: one
  column, no cards. At the top, today's numbers as one sentence ("You turned
  back 9 of 14 times today.") with a tally of today's pauses, one stroke per
  pause, and the last 7 days and all time underneath. The list and the
  per-site stats table are merged: each site shows today's and the last
  7 days' numbers next to it. The settings read as sentences with the
  number inline. With an empty list the page opens with "What do you open
  on autopilot?".
- Light mode uses a white background instead of cream, on every page.
- README, screenshots and tests use everyday sites as examples (Instagram,
  Gmail, Facebook) instead of Letterboxd and IMDb.

### Removed

- The per-site breakdown no longer shows all-time numbers, or sites that
  were removed from the list. Both still count in the totals at the top.

## [0.1.0] - 2026-11-19

The first version: the core "pause, don't block" loop, for daily use.

### Added

- **Pause page.** Before a site on your list loads, you're asked whether you
  really wanna open it, with today's count ("That's the 6th time today").
  The question rotates between a few phrasings so it doesn't turn into
  wallpaper. The site itself doesn't load unless you say yes.
- **"Yes, open it"** opens the site right away and doesn't ask again in that
  tab for 5 minutes (adjustable, 1-120).
- **"No, not now"** shows a kind message and "Okay, closing in 5…", then
  closes the tab (adjustable, 0-30 seconds). It never closes the last tab of
  a window; a fresh new tab is left instead. "Go back instead" and "Close now"
  are there if you want them.
- **Only entering a site asks.** Clicking around inside a site, including
  opening its links in new tabs, never asks.
- **Toolbar popup.** Adds the current site to your list in one click, with
  the address editable first (e.g. `old.reddit.com` → `reddit.com`). On a
  listed site it shows today's numbers and lets you remove it.
- **Your list & stats page.** Add and remove sites; see how often you turned
  back today, in the last 7 days and all time, overall and per site; change
  the two settings.
- **Backup.** Export everything to a JSON file and import it on another
  computer. Imports are validated and cleaned, never trusted as-is.
- **Per-site access.** The browser asks for access to each site when you add
  it, and access is given back when you remove it.
- Light and dark mode, following the system.
- Icon (`assets/icon.svg`, rendered to PNG by `npm run icons`).
- Unit tests (`npm test`) and an end-to-end test that drives the real
  extension in headless Edge or Chrome (`npm run test:e2e`).
- `npm run screenshots` regenerates the README screenshots from the real pages.
- `npm run package` builds the store zip.
- Project docs: README, decision log, roadmap, principles, architecture,
  privacy policy.

[Unreleased]: https://github.com/matejmaricIA/doyoureallywanna/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/matejmaricIA/doyoureallywanna/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/matejmaricIA/doyoureallywanna/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/matejmaricIA/doyoureallywanna/releases/tag/v0.1.0

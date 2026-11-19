# Changelog

All notable changes to this project are written down here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is 0.x, anything may still change between minor versions.

Every change goes under **Unreleased** first. A release moves those entries
under a new version heading and gets a `vX.Y.Z` git tag.

## [Unreleased]

### Changed

- **"Your list & stats" redesigned.** It now looks like the pause page: one
  column, no cards. At the top, today's numbers as one sentence ("You turned
  back 9 of 14 times today.") with a tally of today's pauses, one stroke per
  pause, and the last 7 days and all time underneath. The list and the
  per-site stats table are merged: each site shows today's and the last
  7 days' numbers next to it. The settings read as sentences with the
  number inline. With an empty list the page opens with "What do you open
  on autopilot?".
- Light mode uses a white background instead of cream, on every page.

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

[Unreleased]: https://github.com/matejmaricIA/doyoureallywanna/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/matejmaricIA/doyoureallywanna/releases/tag/v0.1.0

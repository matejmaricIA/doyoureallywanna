# Roadmap and to-dos

What's done, what's next, and what's just an idea. Finished items move to
"Done" with the version they shipped in. The reasoning behind items lives
in [DECISIONS.md](DECISIONS.md); what actually changed lives in
[CHANGELOG.md](../CHANGELOG.md).

## Still to hand-test from v0.2

v0.2.0 was hand-tested in Edge on 2026-11-20: the permission prompts,
counting right after allowing and after the worker slept, the real address
bar, new tab page tiles and favorites, the three answers, InPrivate, and
importing a backup. Not checked yet:

- [ ] Opening a few new tabs in Edge (Ctrl+T) doesn't add `ntp.msn.com`
      to the counts (fixed just before the release; the browser test
      caught it).
- [ ] Prerender: type a site you visit a lot slowly, so the browser
      prerenders it, then press Enter. Does it count? (DevTools turns
      prerendering off, so the test can't tell, D-020.)
- [ ] Suggestions in Chrome, especially the new tab page tiles.

## Firefox (D-029)

The extension runs in Firefox 140+ and passes `npm run test:e2e:firefox`
(tested in Firefox 160 on 2026-11-20, and again for v0.4.0 on 2026-11-22),
including adding sites with a real click (D-030). Still to do:

- [ ] Hand-test in a real Firefox window: the per-site permission prompt
      (Firefox shows its own doorhanger), the popup, the toolbar icon's
      theme color, and "No" on the last tab of a window.
- [ ] Suggestions in Firefox: do typing, a bookmark or a new tab page
      tile report `typed` / `auto_bookmark` / `from_address_bar` the way
      `isImpulseOpen` expects? Firefox's new tab page is `about:newtab`,
      so it's never counted. If it doesn't fit, hide suggestions there.
- [ ] Firefox for Android: try it (DNR and popups work there).
- [ ] Publish to Firefox Add-ons (free). The gecko ID in the manifest is
      permanent once published. Run Mozilla's add-ons linter on the zip
      first (AMO runs it on upload anyway).
- [ ] Say "and Firefox" in the README and store links once it's listed.

## Before the first store release

- [ ] Final name check (D-002): search Chrome Web Store and Edge Add-ons.
- [ ] Store listing: title, short description (≤132 chars), long
      description, 1280×800 screenshots, 440×280 promo tile.
- [ ] Privacy policy URL (PRIVACY.md on GitHub works) and the stores'
      data-use forms ("does not collect or transmit user data").
- [ ] Hand-test the real permission prompt flow in Edge and Chrome (popup
      and settings page), on a fresh profile. Confirm the install dialog
      shows no permission warnings (ARCHITECTURE.md's table says none).
- [ ] Hand-test on a slow machine / many tabs to confirm there's no
      noticeable cost.
- [ ] Hand-test the toolbar icon's theme color after a browser restart, in
      Edge and Chrome (D-025). If it falls back to Dusk, decide whether
      that's acceptable.
- [ ] 440×280 promo tile with the fermata.
- [ ] Publish to Edge Add-ons (free) and Chrome Web Store ($5 one-time
      developer fee).
- [ ] Add `homepage_url` to the manifest and store links to the README.
- [ ] Donation link (GitHub Sponsors or Ko-fi) in the README and on the
      settings page footer.

## Later

- [ ] "Why?" one-tap reasons after "Yes" (optional): "need something
      specific" / "habit" / "bored". Stats like "you said bored 14 times
      this week".
- [ ] Per-site settings (e.g. a longer grace period for Gmail).
- [ ] Optional quiet hours: only ask during work hours / on weekdays.
- [ ] Small charts on the settings page (last 30 days, turned back vs
      opened).
- [ ] Import: choose between "replace" and "merge".
- [ ] Translations (strings already live in one place: `lib/copy.js`, plus
      the HTML).
- [ ] Keyboard shortcuts on the pause page (N / Y).
- [ ] CONTRIBUTING.md and issue templates once there are outside contributors.
- [ ] GitHub Actions: run `npm test` on every push (the e2e tests need a
      browser; Chrome and Firefox are available on the runners).

## Ideas, unsorted (not promises)

- A weekly "here's how it went" summary on the settings page.
- Let the user write their own questions / messages.
- "Snooze for today" for a site (no questions until midnight).
- Detect-ability mitigation for D-016 if it ever matters.

## Known limitations

- Only page loads are caught. A tab that's already open on a listed site
  stays open; clicking around inside it never asks (by design).
- Turning the extension off turns it off. It's accountability, not a lock.
- Not active in InPrivate/Incognito windows unless you allow it in the
  browser's extension settings.
- A site that's on the list but lacks access isn't paused. The settings
  page shows "Needs access" for those.
- Suggestions: the site starts to show for a moment (about 0.1 s) before
  the suggestion replaces it, because there's no access to sites that
  aren't on the list (D-022). It only happens on the open that shows a
  suggestion, at most once a day.
- Suggestions only notice bursts: a site opened often but spread out
  (once every couple of hours, all day) is never suggested (D-031). It
  still shows up in the stats of sites that aren't on the list (D-032).
- Suggestions count each subdomain on its own (`music.youtube.com` and
  `youtube.com` are two sites), because there's no Public Suffix List
  (D-013).
- Suggestions: every link on Edge's new tab page counts as an impulse open,
  including the MSN news feed (Edge reports them like bookmarks).
- Suggestions: Edge's new tab page itself is recognized by its host
  (`ntp.msn.com`, `ntp.msn.cn`). If Edge ever moves it, new tabs would
  start counting until the list is updated.
- Suggestions: address-bar opens of a page the browser had already
  prerendered may not be counted (unverified, D-020).
- The stores and the extensions page always show the Dusk icon; only the
  toolbar icon follows the theme.

## Done

- [x] v0.4.0: an optional wait before "Yes" works, 0 to 10
      seconds, off by default (D-034).
- [x] v0.4.0: suggestions look at the last 2 hours (6 opens within
      2 hours) instead of 3 of the last 7 days, so they can show up the
      same day (D-031). Stats for sites that aren't on the list on "Your
      list & stats", kept until you delete them, all at once or per site;
      backup schema 3 (D-032).
- [x] v0.4.0: Firefox 140+ from the same code (D-029); "Add" asks for
      access in the same moment as the click, so Firefox shows its prompt
      (D-030). The fermata drawn like a pen line (D-028). Light or dark
      as a setting, and no flash of the default colors on load (D-027).
- [x] v0.3.0: new icon, a fermata (D-024). Five color themes, picked
      on the settings page (D-025), Dusk by default (D-026).
- [x] v0.2.0: opt-in smart suggestions (D-020 to D-023): a
      switch on "Your list & stats" that asks for `webNavigation`;
      per-day counts of impulse opens (typed, bookmark, new tab page) of
      sites not on the list, kept 7 days; the suggestion page at 8+ opens
      on 3 of the last 7 days, at most once a day, with "Add it to my
      list" / "It's fine, don't ask again" / "Just let me in"; an editable
      "don't ask again" list; turning it off deletes the counts and gives
      the permission back; backup schema 2; browser tests, a screenshot,
      hand-tested in Edge.
- [x] v0.2.0: "Your list & stats" redesigned to match the pause page
      (today as a sentence, tallies, list and stats merged), white light
      theme (D-019).
- [x] v0.1.0: pause page, Yes with a 5-minute per-tab grace period, No with
      the "closing in 5…" countdown, same-site navigation never asks,
      popup, list & stats page, settings, JSON backup, per-site access,
      dark mode, icons, unit + browser tests, screenshots, packaging, docs.

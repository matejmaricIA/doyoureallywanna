# Roadmap and to-dos

What's done, what's next, and what's just an idea. Finished items move to
"Done" with the version they shipped in. The reasoning behind items lives
in [DECISIONS.md](DECISIONS.md); what actually changed lives in
[CHANGELOG.md](../CHANGELOG.md).

## Next: v0.2 · Smart suggestions (opt-in)

- [ ] "Suggestions" switch on the settings page, off by default. Turning it
      on asks for the `webNavigation` permission (optional permission).
- [ ] Count opens per domain per day for sites *not* on the list, only
      opens that look like impulse (typed, bookmark, new tab; not links).
      Domains and counts only, never URLs. Keep 14 days.
- [ ] When a domain crosses a threshold (e.g. 8+ opens on 3 of the last 7
      days), the next time it's opened show the pause page in "suggestion"
      mode: "I noticed you open facebook.com a lot. Do you open it out of habit?"
      → **Add it to my list** / **It's fine, don't ask again** / **Just let me in**.
- [ ] "Don't ask again" list, editable on the settings page.
- [ ] Turning suggestions off deletes the collected counts and gives the
      permission back.

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
- [ ] Firefox port (MV3 differences: `browser.*`, background scripts,
      `declarativeNetRequest` differences to check).
- [ ] Translations (strings already live in one place: `lib/copy.js`, plus
      the HTML).
- [ ] Keyboard shortcuts on the pause page (N / Y).
- [ ] CONTRIBUTING.md and issue templates once there are outside contributors.
- [ ] GitHub Actions: run `npm test` on every push (the e2e test needs a
      browser; Chrome is available on the runners).

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

## Done

- [x] Unreleased: "Your list & stats" redesigned to match the pause page
      (today as a sentence, tallies, list and stats merged), white light
      theme (D-019).
- [x] v0.1.0: pause page, Yes with a 5-minute per-tab grace period, No with
      the "closing in 5…" countdown, same-site navigation never asks,
      popup, list & stats page, settings, JSON backup, per-site access,
      dark mode, icons, unit + browser tests, screenshots, packaging, docs.

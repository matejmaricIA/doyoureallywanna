# Principles: do's and don'ts

The short list of what this project is and isn't. If a feature idea breaks
one of these, the idea loses. Changing a principle needs a decision in
[DECISIONS.md](DECISIONS.md).

## Do

- **Ask, don't block.** "Yes" always works, and always takes one click.
- **Keep it free.** Every feature, for everyone. Donations are the only
  money involved, and they never unlock anything.
- **Keep data on the user's computer.** `chrome.storage.local` only. Moving
  between computers is a file the user exports and imports.
- **Ask for as little access as possible**, as late as possible: per site,
  when the site is added. Give it back when it's removed.
- **Let the browser do the work.** Event-driven only. Nothing runs unless
  the user is doing something with a listed site, or has turned on
  suggestions: then the extension also wakes briefly when a page opens, to
  count it (D-020). Off by default, and off means off.
- **Be kind.** Talk like a friend who asks, not a parent who scolds.
- **Stay small and readable.** The code on GitHub is exactly the code that
  runs. Anyone should be able to read the whole thing in an afternoon.
- **Write it down.** Decisions in DECISIONS.md, changes in CHANGELOG.md,
  plans in ROADMAP.md.
- **Test it in a real browser** before calling it done (`npm run check`).

## Don't

- **No paid tiers, upsells, "pro" features, trials or ads.**
- **No accounts, no sign-in, no servers.**
- **No network requests. None.** Not for analytics, not for crash reports,
  not for "checking for updates" (the stores handle updates), not for fonts
  or remote config.
- **No telemetry of any kind**, even anonymous, even opt-in.
- **No `chrome.storage.sync`.** It goes through Google's/Microsoft's servers.
- **No browsing history.** Never store URLs, page titles or times of
  individual visits. Per-day counts per listed site, that's it. With
  suggestions on, also per-day counts of impulse opens per site, kept for
  14 days, never in a backup, and deleted when suggestions are turned off.
- **No content scripts on every site.** No code of ours inside the pages
  people visit.
- **No polling, intervals or timers in the background.**
- **No guilt-tripping, shaming, streak-anxiety or dark patterns.** "Yes"
  is never hidden, delayed, or made smaller than "No".
- **No interrupting what's already open.** We ask when a site is opened,
  never in the middle of using it.
- **No dependencies or build step** without a decision record.
- **No remote code.** Everything the extension runs ships inside it.

# Notes for AI assistants working on this repo

*Do You Really Wanna?* is a Manifest V3 browser extension for Edge and
Chrome that asks "do you really wanna?" before sites on the user's list
open. Read `docs/PRINCIPLES.md` first: it's the list of things this
project never does (no network requests, no paid features, no
dependencies, no background work, …).

## Keep the logs current: every change, every time

- `CHANGELOG.md`: add an entry under **Unreleased** for every user-visible
  change, fix or tooling change.
- `docs/DECISIONS.md`: any choice about behavior, permissions, data,
  architecture or tooling gets a new numbered decision (context, decision,
  why, consequences). Never rewrite an old one; supersede it.
- `docs/ROADMAP.md`: tick off finished to-dos (move them to Done with the
  version), add new ones, record known limitations.
- `docs/ARCHITECTURE.md`: update when files, stored data or flows change.

## Conventions

- No build step and no npm dependencies (D-011). `extension/` is shipped
  as-is. Plain ES modules with JSDoc types.
- Logic that doesn't need `chrome.*` goes in a pure module in
  `extension/lib/` with unit tests in `tests/unit/`.
- All user-facing wording lives in `extension/lib/copy.js` or the HTML.
  Tone: kind, short, never guilt-tripping.
- Versions: SemVer; `extension/manifest.json` and `package.json` must match.
  Releases get a `vX.Y.Z` tag and a CHANGELOG section.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Before calling something done

```
npm run check          # unit tests + end-to-end test in headless Edge/Chrome
npm run test:e2e:firefox  # if Firefox is installed (FIREFOX= to choose it)
npm run screenshots    # if any page's look changed (README images)
npm run package        # builds dist/do-you-really-wanna-<version>-{chromium,firefox}.zip
```

Node 22+ and Edge or Chrome are the only requirements. Set `BROWSER=` to
choose the browser binary.

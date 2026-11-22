# Store listings

Everything to paste into the Chrome Web Store, Edge Add-ons and Firefox
Add-ons forms, in one place (D-035). Images are in [`images/`](images);
`npm run screenshots` and `npm run icons` regenerate them. Keep this file
in step with the README and PRIVACY.md.

## Shared

| Field | Value |
| --- | --- |
| Name | Do You Really Wanna? |
| Summary (from the manifest, ≤132 chars) | A gentle pause before the sites you open on autopilot. Nothing is blocked, and nothing ever leaves your computer. |
| Category | Productivity |
| Language | English |
| Price | Free |
| Homepage | https://github.com/matejmaricIA/doyoureallywanna |
| Support | https://github.com/matejmaricIA/doyoureallywanna/issues |
| Privacy policy | https://github.com/matejmaricIA/doyoureallywanna/blob/main/PRIVACY.md |
| License | GPL-3.0-or-later |

The name stays plain, with no keyword suffix (D-035). Search words go in
the summary and the description.

## Description

Plain text: the stores don't render Markdown. Copy from the line below to
the end of the section.

```text
Give it a second thought.

You know the move. You're supposed to be doing something else, and your hands have already opened YouTube, Reddit, Instagram or Gmail. You're not looking for anything. You just scroll.

Do You Really Wanna? doesn't block anything. Right before a site on your list opens, it asks one question. If you need the site, "Yes" lets you straight in. If you were on autopilot, "No" closes the tab, kindly. Either way you had a second to think about why you were opening it.

WHAT IT DOES

• Asks before a listed site opens. The site doesn't load until you say yes, so no autoplaying video pulls you in while you decide.
• Shows you the number: "That's the 6th time today." Easy to wave away once, harder the sixth time.
• "Yes, open it" opens the site right away and won't ask again in that tab for 5 minutes (you choose how long).
• "No, not now" says something kind, counts down and closes the tab. It never closes your last tab.
• Only asks when you enter a site. Clicking around inside it never asks.
• Keeps score, gently: how often you turned back today, this week and all time.
• Changes the question now and then, so it doesn't fade into the background.
• An optional wait before "Yes" works, if you want more of a pause. Off by default.
• Suggestions, if you turn them on: it notices sites you keep opening by habit and offers, once, to add them. Off by default.
• Five calm color themes, each in light and dark.
• Backups as a file you export and import. No account, no cloud.

PRIVATE BY DESIGN

• Nothing leaves your computer. No network requests at all: no servers, no accounts, no analytics, no ads, no crash reports.
• No browsing history. It keeps your list, your settings and, per day and per site, a couple of numbers. No web addresses, no page titles, no times of day.
• Access one site at a time. It asks for access to a site only when you add it, and gives it back when you remove it. It never runs code inside the pages you visit.
• Light on your computer. Nothing runs in the background; the browser's own rule engine decides when to ask.

FREE, FOR GOOD

Every feature is free for everyone. No pro version, no trial, no ads. The code is open source (GPL-3.0) and what's on GitHub is exactly what runs:
https://github.com/matejmaricIA/doyoureallywanna
```

## Images

| File | Size | Used for |
| --- | --- | --- |
| `images/1-pause.png` | 1280×800 | screenshot 1: the question, with today's count |
| `images/2-turned-back.png` | 1280×800 | screenshot 2: after "No" |
| `images/3-stats.png` | 1280×800 | screenshot 3: Your list & stats |
| `images/4-suggestion.png` | 1280×800 | screenshot 4: a suggestion |
| `images/5-dark-tide.png` | 1280×800 | screenshot 5: dark mode, Tide theme |
| `images/promo-small-440x280.png` | 440×280 | small promo tile (Chrome, Edge) |
| `images/promo-marquee-1400x560.png` | 1400×560 | marquee / large promo tile (optional) |
| `images/logo-300.png` | 300×300 | Edge store logo |
| `../extension/icons/icon-128.png` | 128×128 | Chrome store icon |

## Chrome Web Store

Developer dashboard → new item → upload `dist/do-you-really-wanna-<version>-chromium.zip`.

**Store listing tab:** description above, category Productivity, language
English, the five screenshots, the small promo tile (and the marquee, if
you like), homepage and support URLs.

**Privacy tab:**

*Single purpose:*

```text
Shows a short question ("Do you really wanna open this site right now?") before a site on the user's own list opens, so they can choose to continue or close the tab.
```

*Permission justifications:*

| Permission | Justification |
| --- | --- |
| `declarativeNetRequestWithHostAccess` | Redirects a page load of a site on the user's list to the extension's own question page, and lets that one tab through after the user clicks "Yes". Rules only apply to sites the user has granted. |
| `storage` | Keeps the user's list of sites, their settings and daily counts (times asked, times opened) on their own computer, in local extension storage. |
| `alarms` | Ends the short "Yes" period after the minutes the user chose, so the question shows again in that tab. |
| `activeTab` | When the user clicks the toolbar icon, the popup reads the site of the current tab so it can offer to add it to the list. |
| Host permissions (optional, `*://*/*`) | Requested one site at a time (e.g. `*://*.reddit.com/*`) only when the user adds that site, and removed when they remove it. Needed so the redirect rule can apply to that site. Never requested for all sites at once. |
| `webNavigation` (optional) | Only if the user turns on suggestions. Tells the extension which site a new page belongs to and whether it was opened by typing, a bookmark or the new tab page, so it can count habit opens of sites not on the list (one number per site per day, stored locally) and offer to add them. Removed when suggestions are turned off. |

*Remote code:* **No**, I am not using remote code. Every script ships in
the package.

*Data usage:* tick **none** of the data types. The extension collects and
transmits no user data. Tick all three certifications (not sold, not used
for unrelated purposes, not used for creditworthiness).

*Privacy policy URL:* the one in the table above.

## Edge Add-ons

Partner Center → Microsoft Edge → create new extension → upload the same
`-chromium.zip`. (Edge refuses the manifest with Firefox's keys, D-036.)

**Availability:** public, all markets.

**Properties:** category Productivity; privacy policy required: yes, with
the URL above (the extension stores data locally, and the suggestions
permission reads which pages open); website and support URLs above;
mature content: no.

**Store listing (English):** description above; short description = the
summary; logo `logo-300.png`; small promo tile; screenshots 1-5; large
promo tile optional (the marquee).

*Search terms* (up to 7, 30 characters each, 21 words in total):

```text
mindful browsing
focus
distraction
pause before opening
habit
digital wellbeing
procrastination
```

**Notes for certification:**

```text
No account or setup needed. To test: open the extension's options page ("Your list & stats"), type youtube.com and click Add, then allow access when the browser asks. Now open https://www.youtube.com in a new tab: the question page shows instead. "Yes, open it" opens YouTube; "No, not now" closes the tab after a short countdown. The extension makes no network requests.
```

## Firefox Add-ons

Not yet: see ROADMAP.md (hand-testing in a real Firefox window first).
When it's time: same description and screenshots; summary ≤250 chars (the
manifest one fits); categories "Productivity" (or "Other"); license
GPL-3.0-or-later; the manifest already declares
`data_collection_permissions: none`. Upload the `-firefox.zip`. Run
Mozilla's add-ons linter on it before uploading.

## Before you press Submit

- [ ] `npm run check` passes, `npm run package` built the zips, versions match.
- [ ] The install dialog shows no permission warnings (fresh profile, load the zip).
- [ ] Hand-tests in ROADMAP.md "Before the first store release" are ticked.

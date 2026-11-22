# Privacy policy

*Do You Really Wanna?* · last updated 2026-11-22

**Short version: nothing you do with this extension ever leaves your
computer.**

## What the extension stores

Only in your browser's local extension storage, on your computer:

- **Your list**: the sites you added (e.g. `reddit.com`) and when you added them.
- **Your settings**: the two numbers, the color theme and light or dark
  on the settings page, and whether suggestions are on.
- **Your numbers**: for each day and each site on your list, how many times
  it asked and how many times you opened the site anyway. Kept for about
  400 days, then deleted automatically.
- **Temporarily**: which tabs are in a "Yes" grace period, until it ends or
  you restart the browser.
- **Your "don't ask again" list**: sites you never want suggested.

It does **not** store web addresses you visit, page titles, your browsing
history, or the time of day of any visit.

## Suggestions (off unless you turn them on)

Suggestions notice sites that aren't on your list but that you open a lot,
and offer to add them. They're off until you turn them on in "Your list &
stats". Then, and only then:

- The extension sees which pages open in your browser, so it can tell
  which ones you opened by typing the address, from a bookmark or from the
  new tab page. That's why your browser warns that it can "read your
  browsing history" when you turn this on.
- It keeps **one number per site per day**: how many times you opened a
  site that isn't on your list that way (for example `youtube.com: 9` for
  today). "Your list & stats" shows them. Not the address of the page,
  not its title. Links you click, reloads and searches aren't counted at
  all, and neither is anything in private (InPrivate / Incognito)
  windows. Sites on your list are never counted here; they have their own
  numbers.
- To decide when to ask, it looks at two things: how often you opened a
  site today (the number above), and how often in the last 2 hours. For
  that, it keeps the times of the last 2 hours' opens per site (not for
  sites on your "don't ask again" list). Anything older than 2 hours is
  dropped.
- The numbers are kept like the rest of your stats, and are in your
  backups. "Delete all stats" deletes them, and "Delete" next to a site
  deletes that site's numbers.

Turning suggestions off stops the counting, forgets those recent times and
gives the permission back to the browser. The numbers already counted
stay until you delete them.

## What the extension sends

Nothing. It makes no network requests at all: no servers, no accounts, no
analytics, no crash reports, no ads, no third parties. It doesn't use the
browser's sync storage either, because that goes through your browser
vendor's servers.

## Access to websites

The extension asks for access to a website only when you add that website
to your list, and gives it back when you remove it. It uses that access
only to show its question before the site opens. It never runs code
inside the websites you visit. Suggestions don't need access to any
website: they only see which pages open, and only while they're on.

## Backups

"Export backup" saves a JSON file to your computer: your list, settings,
numbers and "don't ask again" list, but never the suggestion counts.
Where it goes from there is up to you. "Import backup" reads a file you
choose. Nothing is uploaded anywhere.

## Deleting your data

"Delete all stats" on the settings page deletes your numbers. Turning
suggestions off deletes the suggestion counts. Removing the extension
deletes everything it stored.

## Changes

Any change to this policy will be in this file, with its history in the
public repository.

// Everything the extension says. Tone: a friend who asks, never a parent
// who scolds. Every prompt must be answerable with the two buttons
// ("No, not now" / "Yes, open it").

export const PROMPTS = [
  'Do you really wanna open {site} right now?',
  'Do you really need {site} right now?',
  'Are you opening {site} on purpose?',
  'Is {site} what you sat down to do?',
  'Quick check: do you actually need {site} right now?',
  'Is there something specific you need on {site}?',
];

export const TURNED_BACK = [
  { title: 'Good call.', body: 'Back to what you were doing.' },
  { title: 'Okay, no worries.', body: 'Get back to it, or step away from the screen for a bit.' },
  { title: 'Nice.', body: 'Maybe a good moment to stand up and stretch.' },
  { title: 'Alright.', body: 'Grab a glass of water, then back to it.' },
  { title: 'Second thoughts add up.', body: 'Back to what you were doing.' },
  { title: 'Okay.', body: 'Take a breath. Then back to it.' },
];

/**
 * @template T
 * @param {readonly T[]} list
 * @param {() => number} [random]
 * @returns {T}
 */
export function pick(list, random = Math.random) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/** @param {number} n */
export function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** @param {number} count  times paused today, including this one */
export function timesTodayLine(count) {
  return count <= 1 ? 'First time today.' : `That's the ${ordinal(count)} time today.`;
}

/** @param {number} n @param {string} one @param {string} [many] */
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** @typedef {import('./stats.js').Counts} Counts */

/** @param {Counts} counts */
const outOf = ({ turnedBack, paused }) => `${turnedBack} of ${paused}`;

/** @param {Counts} counts */
const outOfTimes = (counts) => `${outOf(counts)} ${counts.paused === 1 ? 'time' : 'times'}`;

/**
 * The big sentence at the top of "Your list & stats", and the line under it.
 * Counts nest: today is part of the last 7 days, which is part of all time.
 * @param {{ sites: number, today: Counts, week: Counts, all: Counts }} n
 * @returns {{ title: string, body: string }}
 */
export function summaryLines({ sites, today, week, all }) {
  if (all.paused === 0) {
    return sites === 0
      ? {
          title: 'What do you open on autopilot?',
          body: 'Add a site below and I\'ll ask before it opens. Nothing is blocked: "Yes" always lets you in.',
        }
      : { title: 'Nothing paused yet.', body: 'I\'ll ask the next time you open a site on your list.' };
  }
  const allTime = all.paused > week.paused ? `, and ${outOf(all)} all time.` : '.';
  if (today.paused > 0) {
    let body = "That's every pause so far.";
    if (all.paused > today.paused) {
      body = week.paused > today.paused ? `In the last 7 days it's ${outOf(week)}${allTime}` : `All time it's ${outOf(all)}.`;
    }
    return { title: `You turned back ${outOfTimes(today)} today.`, body };
  }
  return {
    title: 'No pauses yet today.',
    body: week.paused > 0
      ? `In the last 7 days you turned back ${outOfTimes(week)}${allTime}`
      : `All time, you turned back ${outOfTimes(all)}.`,
  };
}

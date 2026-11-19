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

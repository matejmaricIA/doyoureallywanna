// Day keys are local calendar dates ("2026-11-19"), because "today" should
// mean the user's today, not UTC's.

/**
 * @param {Date} [date]
 * @returns {string} YYYY-MM-DD in local time
 */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The local date a day key stands for (midnight).
 * @param {string} key  YYYY-MM-DD
 * @returns {Date}
 */
export function dateOfKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The last `n` day keys, today first.
 * @param {number} n
 * @param {Date} [from]
 * @returns {string[]}
 */
export function lastDays(n, from = new Date()) {
  const keys = [];
  for (let i = 0; i < n; i++) {
    keys.push(dayKey(new Date(from.getFullYear(), from.getMonth(), from.getDate() - i)));
  }
  return keys;
}

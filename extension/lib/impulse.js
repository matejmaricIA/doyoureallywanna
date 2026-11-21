// Stats of impulse opens (D-032): how many times a day you opened each
// site that isn't on your list by typing it, from a bookmark or from the
// new tab page. Counted while suggestions are on; kept like the list's
// stats, until you delete them.
// Pure: no `chrome.*` here, so it runs in unit tests as-is.
//
// Shape: { "2026-11-21": { "youtube.com": 9 } }

/** @typedef {Record<string, Record<string, number>>} Impulse */
/** @typedef {{ site: string, today: number, week: number, all: number }} ImpulseRow */

/**
 * New stats with one open of `site` added on `day`.
 * @param {Impulse} impulse
 * @param {string} site
 * @param {string} day
 * @returns {Impulse}
 */
export function addImpulse(impulse, site, day) {
  const perSite = { ...(impulse[day] ?? {}) };
  perSite[site] = (perSite[site] ?? 0) + 1;
  return { ...impulse, [day]: perSite };
}

/**
 * New stats without `site` (exactly that site, not its subdomains: each
 * one is a row of its own), dropping days left empty.
 * @param {Impulse} impulse
 * @param {string} site
 * @returns {Impulse}
 */
export function forgetImpulse(impulse, site) {
  /** @type {Impulse} */
  const next = {};
  for (const [day, perSite] of Object.entries(impulse)) {
    const { [site]: _, ...rest } = perSite;
    if (Object.keys(rest).length) next[day] = rest;
  }
  return next;
}

/**
 * One row per site: opens today, in the last 7 days and all time. Busiest
 * first (last 7 days, then all time), then by name. Sites in `skip` (the
 * list) are left out.
 * @param {Impulse} impulse
 * @param {{ today: string, week: string[], skip?: Iterable<string> }} days
 * @returns {ImpulseRow[]}
 */
export function impulseRows(impulse, { today, week, skip = [] }) {
  const skipped = new Set(skip);
  const inWeek = new Set(week);
  /** @type {Map<string, ImpulseRow>} */
  const rows = new Map();
  for (const [day, perSite] of Object.entries(impulse)) {
    for (const [site, count] of Object.entries(perSite)) {
      if (skipped.has(site)) continue;
      const row = rows.get(site) ?? { site, today: 0, week: 0, all: 0 };
      row.all += count;
      if (inWeek.has(day)) row.week += count;
      if (day === today) row.today += count;
      rows.set(site, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.week - a.week || b.all - a.all || a.site.localeCompare(b.site));
}

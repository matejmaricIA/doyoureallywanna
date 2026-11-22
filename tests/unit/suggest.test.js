import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OPENS_PER_DAY,
  OPENS_PER_WINDOW,
  WINDOW_MINUTES,
  countOpen,
  forgetSite,
  isCovered,
  isImpulseOpen,
  pruneOpens,
  reasonFor,
  reasonFromQuery,
  reasonToQuery,
  recordOpen,
  siteOfUrl,
} from '../../extension/lib/suggest.js';

/** @param {Partial<import('../../extension/lib/suggest.js').Commit>} [overrides] */
const commit = (overrides = {}) => ({
  frameId: 0,
  url: 'https://www.youtube.com/',
  transitionType: 'typed',
  transitionQualifiers: ['from_address_bar'],
  documentLifecycle: 'active',
  ...overrides,
});

describe('isImpulseOpen', () => {
  it('counts typing in the address bar, bookmarks and new tab page tiles', () => {
    assert.equal(isImpulseOpen(commit()), true);
    assert.equal(isImpulseOpen(commit({ transitionQualifiers: [] })), true);
    assert.equal(isImpulseOpen(commit({ transitionType: 'auto_bookmark', transitionQualifiers: [] })), true);
    assert.equal(isImpulseOpen(commit({ transitionType: 'link', transitionQualifiers: ['from_address_bar'] })), true);
  });
  it('counts a server redirect as the same open', () => {
    assert.equal(isImpulseOpen(commit({ transitionQualifiers: ['server_redirect', 'from_address_bar'] })), true);
  });
  it('ignores links, reloads, form submits, searches and browser start pages', () => {
    for (const transitionType of ['link', 'reload', 'form_submit', 'generated', 'keyword', 'keyword_generated', 'start_page', 'auto_toplevel', 'manual_subframe']) {
      assert.equal(isImpulseOpen(commit({ transitionType, transitionQualifiers: [] })), false, transitionType);
    }
    assert.equal(isImpulseOpen(commit({ transitionType: 'generated', transitionQualifiers: ['from_address_bar'] })), false);
    assert.equal(isImpulseOpen(commit({ transitionType: 'reload', transitionQualifiers: ['from_address_bar'] })), false);
  });
  it('ignores back/forward and client-side redirects', () => {
    assert.equal(isImpulseOpen(commit({ transitionQualifiers: ['forward_back'] })), false);
    assert.equal(isImpulseOpen(commit({ transitionType: 'link', transitionQualifiers: ['client_redirect'] })), false);
    assert.equal(isImpulseOpen(commit({ transitionQualifiers: ['client_redirect', 'from_address_bar'] })), false);
  });
  it("ignores Edge's new tab page loading itself, but not links clicked on it", () => {
    const ntp = 'https://ntp.msn.com/edge/ntp?locale=en-US&title=New+tab&dsp=1&sp=Bing';
    assert.equal(isImpulseOpen(commit({ url: ntp, transitionType: 'auto_bookmark', transitionQualifiers: [] })), false);
    assert.equal(isImpulseOpen(commit({ url: ntp })), false);
    assert.equal(isImpulseOpen(commit({ url: 'https://ntp.msn.cn/edge/ntp', transitionType: 'auto_bookmark' })), false);
    assert.equal(isImpulseOpen(commit({ url: 'https://www.msn.com/en-us/news/', transitionType: 'auto_bookmark' })), true);
  });
  it('ignores frames, prerenders and anything that is not http(s)', () => {
    assert.equal(isImpulseOpen(commit({ frameId: 3 })), false);
    assert.equal(isImpulseOpen(commit({ documentLifecycle: 'prerender' })), false);
    assert.equal(isImpulseOpen(commit({ url: 'edge://newtab/' })), false);
    assert.equal(isImpulseOpen(commit({ url: 'file:///C:/notes.txt' })), false);
  });
});

describe('siteOfUrl', () => {
  it('normalizes like the list, without guessing the main domain', () => {
    assert.equal(siteOfUrl('https://www.youtube.com/watch?v=1'), 'youtube.com');
    assert.equal(siteOfUrl('https://music.youtube.com/'), 'music.youtube.com');
    assert.equal(siteOfUrl('http://127.0.0.1:8080/'), null);
    assert.equal(siteOfUrl('http://localhost:3000/'), null);
  });
});

describe('isCovered', () => {
  it('matches the site itself and its subdomains', () => {
    assert.equal(isCovered('youtube.com', ['youtube.com']), true);
    assert.equal(isCovered('music.youtube.com', ['reddit.com', 'youtube.com']), true);
    assert.equal(isCovered('youtube.com', ['music.youtube.com']), false);
    assert.equal(isCovered('notyoutube.com', ['youtube.com']), false);
  });
});

const MIN = 60 * 1000;
const now = Date.UTC(2026, 10, 20, 21, 0);
/** n opens of `site`, one every `gap` minutes, the last one `endAgo` minutes ago */
const times = (n, gap = 5, endAgo = 0) => Array.from({ length: n }, (_, i) => now - (endAgo + (n - 1 - i) * gap) * MIN);

describe('countOpen and forgetSite', () => {
  it('keep the time of each open per site, without mutating the input', () => {
    const empty = {};
    let opens = countOpen(empty, 'youtube.com', now - MIN);
    opens = countOpen(opens, 'youtube.com', now);
    opens = countOpen(opens, 'facebook.com', now);
    assert.deepEqual(opens, { 'youtube.com': [now - MIN, now], 'facebook.com': [now] });
    assert.deepEqual(empty, {});
  });
  it('forget a site and its subdomains', () => {
    const opens = { 'youtube.com': [now], 'music.youtube.com': [now], 'facebook.com': [now] };
    assert.deepEqual(forgetSite(opens, 'youtube.com'), { 'facebook.com': [now] });
    assert.deepEqual(Object.keys(forgetSite(opens, 'music.youtube.com')), ['youtube.com', 'facebook.com']);
  });
});

describe('pruneOpens', () => {
  it(`keeps only the last ${WINDOW_MINUTES} minutes, dropping sites with nothing left`, () => {
    const opens = { 'a.com': [now - 121 * MIN, now - 119 * MIN], 'b.com': [now - 3 * 60 * MIN] };
    assert.deepEqual(pruneOpens(opens, now), { 'a.com': [now - 119 * MIN] });
  });
  it('drops anything that is not a list of times, like day counts from older versions', () => {
    assert.deepEqual(pruneOpens({ '2026-11-20': { 'youtube.com': 9 } }, now), {});
    assert.deepEqual(pruneOpens({ 'a.com': ['x', null, now] }, now), { 'a.com': [now] });
    assert.deepEqual(pruneOpens(undefined, now), {});
    assert.deepEqual(pruneOpens(null, now), {});
  });
  it('ignores times in the future (a clock that was set back)', () => {
    assert.deepEqual(pruneOpens({ 'a.com': [now + MIN] }, now), {});
  });
});

describe('reasonFor', () => {
  it(`needs ${OPENS_PER_WINDOW} opens within ${WINDOW_MINUTES} minutes, or ${OPENS_PER_DAY} today`, () => {
    assert.equal(OPENS_PER_WINDOW, 6);
    assert.equal(WINDOW_MINUTES, 120);
    assert.equal(OPENS_PER_DAY, 8);
    assert.deepEqual(reasonFor(6, 6), { rule: 'window', count: 6 });
    assert.deepEqual(reasonFor(2, 8), { rule: 'day', count: 8 });
    assert.equal(reasonFor(5, 7), null);
  });
  it('a burst wins when both are met', () => {
    assert.deepEqual(reasonFor(6, 9), { rule: 'window', count: 6 });
  });
});

describe('reason in the page URL', () => {
  it('goes there and back', () => {
    for (const reason of [{ rule: 'window', count: 6 }, { rule: 'day', count: 8 }]) {
      assert.deepEqual(reasonFromQuery(`?${reasonToQuery(/** @type {any} */ (reason))}`), reason);
    }
  });
  it('anything else is no reason', () => {
    for (const query of ['', '?why=day', '?why=week&n=3', '?why=day&n=0', '?why=day&n=2.5', '?why=day&n=x']) {
      assert.equal(reasonFromQuery(query), null, query);
    }
  });
});

describe('recordOpen', () => {
  const today = '2026-11-20';
  const site = 'youtube.com';

  it('counts and does not suggest below the threshold', () => {
    assert.deepEqual(recordOpen({ opens: {} }, site, now, today, 1), { opens: { [site]: [now] }, suggest: null });
    assert.deepEqual(recordOpen({ opens: undefined }, site, now, today), { opens: { [site]: [now] }, suggest: null });
  });
  it('suggests on the sixth open within 2 hours, and resets that site', () => {
    const result = recordOpen({ opens: { [site]: times(5, 29, 1), 'other.com': [now] } }, site, now, today, 6);
    assert.deepEqual(result.suggest, { rule: 'window', count: 6 });
    assert.deepEqual(result.opens, { 'other.com': [now] });
  });
  it('does not suggest when the opens are spread over more than 2 hours, below 8 today', () => {
    const result = recordOpen({ opens: { [site]: times(5, 30, 1) } }, site, now, today, 7);
    assert.equal(result.suggest, null);
    assert.equal(result.opens[site].length, 5, 'the oldest open has dropped out');
  });
  it('suggests on the eighth open of the day, however spread out, and resets that site', () => {
    const result = recordOpen({ opens: { [site]: times(1, 60, 1) } }, site, now, today, 8);
    assert.deepEqual(result.suggest, { rule: 'day', count: 8 });
    assert.deepEqual(result.opens, {});
  });
  it('shows at most one suggestion a day, but keeps counting', () => {
    const almost = { [site]: times(5) };
    const result = recordOpen({ opens: almost, suggestedOn: today }, site, now, today, 9);
    assert.equal(result.suggest, null);
    assert.equal(result.opens[site].length, 6);
    assert.equal(recordOpen({ opens: { 'a.com': [now] }, suggestedOn: today }, 'a.com', now, today, 12).suggest, null);
    assert.ok(recordOpen({ opens: almost, suggestedOn: '2026-11-19' }, site, now, today).suggest);
  });
  it('forgets opens of every site once they are older than 2 hours', () => {
    const result = recordOpen({ opens: { 'old.com': [now - 150 * MIN] } }, site, now, today);
    assert.deepEqual(result.opens, { [site]: [now] });
  });
});

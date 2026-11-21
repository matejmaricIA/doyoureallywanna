import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OPENS_PER_WINDOW,
  WINDOW_MINUTES,
  countOpen,
  forgetSite,
  isCovered,
  isImpulseOpen,
  pruneOpens,
  qualifies,
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

describe('qualifies', () => {
  it(`needs ${OPENS_PER_WINDOW} opens of the same site`, () => {
    assert.equal(OPENS_PER_WINDOW, 6);
    assert.equal(WINDOW_MINUTES, 120);
    assert.equal(qualifies({ 'a.com': times(6) }, 'a.com'), true);
    assert.equal(qualifies({ 'a.com': times(5), 'b.com': times(6) }, 'a.com'), false);
  });
});

describe('recordOpen', () => {
  const today = '2026-11-20';
  const site = 'youtube.com';

  it('counts and does not suggest below the threshold', () => {
    assert.deepEqual(recordOpen({ opens: {} }, site, now, today), { opens: { [site]: [now] }, suggest: false });
    assert.deepEqual(recordOpen({ opens: undefined }, site, now, today), { opens: { [site]: [now] }, suggest: false });
  });
  it('suggests on the sixth open within 2 hours, and resets that site', () => {
    const result = recordOpen({ opens: { [site]: times(5, 29, 1), 'other.com': [now] } }, site, now, today);
    assert.equal(result.suggest, true);
    assert.deepEqual(result.opens, { 'other.com': [now] });
  });
  it('does not suggest when the opens are spread over more than 2 hours', () => {
    const result = recordOpen({ opens: { [site]: times(5, 30, 1) } }, site, now, today);
    assert.equal(result.suggest, false);
    assert.equal(result.opens[site].length, 5, 'the oldest open has dropped out');
  });
  it('shows at most one suggestion a day, but keeps counting', () => {
    const almost = { [site]: times(5) };
    const result = recordOpen({ opens: almost, suggestedOn: today }, site, now, today);
    assert.equal(result.suggest, false);
    assert.equal(result.opens[site].length, 6);
    assert.equal(recordOpen({ opens: almost, suggestedOn: '2026-11-19' }, site, now, today).suggest, true);
  });
  it('forgets opens of every site once they are older than 2 hours', () => {
    const result = recordOpen({ opens: { 'old.com': [now - 150 * MIN] } }, site, now, today);
    assert.deepEqual(result.opens, { [site]: [now] });
  });
});

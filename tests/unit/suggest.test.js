import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUSY_DAYS,
  KEEP_DAYS,
  OPENS_PER_DAY,
  WINDOW_DAYS,
  countOpen,
  forgetSite,
  isCovered,
  isImpulseOpen,
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

describe('countOpen and forgetSite', () => {
  it('count per day and site without mutating the input', () => {
    const empty = {};
    let opens = countOpen(empty, 'youtube.com', '2026-11-20');
    opens = countOpen(opens, 'youtube.com', '2026-11-20');
    opens = countOpen(opens, 'facebook.com', '2026-11-19');
    assert.deepEqual(opens, { '2026-11-20': { 'youtube.com': 2 }, '2026-11-19': { 'facebook.com': 1 } });
    assert.deepEqual(empty, {});
  });
  it('forget a site and its subdomains everywhere, dropping empty days', () => {
    const opens = {
      '2026-11-20': { 'youtube.com': 2, 'music.youtube.com': 1, 'facebook.com': 4 },
      '2026-11-19': { 'youtube.com': 9 },
    };
    assert.deepEqual(forgetSite(opens, 'youtube.com'), { '2026-11-20': { 'facebook.com': 4 } });
    assert.deepEqual(forgetSite(opens, 'music.youtube.com'), {
      '2026-11-20': { 'youtube.com': 2, 'facebook.com': 4 },
      '2026-11-19': { 'youtube.com': 9 },
    });
  });
});

describe('qualifies', () => {
  const today = '2026-11-20';
  it(`needs ${OPENS_PER_DAY}+ opens on ${BUSY_DAYS} of the last ${WINDOW_DAYS} days`, () => {
    assert.equal(OPENS_PER_DAY, 8);
    assert.equal(BUSY_DAYS, 3);
    assert.equal(WINDOW_DAYS, 7);
    const site = 'youtube.com';
    assert.equal(qualifies({ '2026-11-20': { [site]: 8 }, '2026-11-18': { [site]: 8 }, '2026-11-14': { [site]: 20 } }, site, today), true);
    assert.equal(qualifies({ '2026-11-20': { [site]: 7 }, '2026-11-18': { [site]: 8 }, '2026-11-14': { [site]: 20 } }, site, today), false);
  });
  it('only looks at the last 7 days, today included', () => {
    const site = 'youtube.com';
    assert.equal(qualifies({ '2026-11-19': { [site]: 9 }, '2026-11-18': { [site]: 9 }, '2026-11-13': { [site]: 9 } }, site, today), false);
    assert.equal(qualifies({ '2026-11-19': { [site]: 9 }, '2026-11-18': { [site]: 9 }, '2026-11-14': { [site]: 9 } }, site, today), true);
  });
  it('counts each site on its own', () => {
    const opens = { '2026-11-20': { 'a.com': 8 }, '2026-11-19': { 'a.com': 8 }, '2026-11-18': { 'b.com': 8 } };
    assert.equal(qualifies(opens, 'a.com', today), false);
  });
});

describe('recordOpen', () => {
  const today = '2026-11-20';
  const site = 'youtube.com';
  const almost = { '2026-11-20': { [site]: 7 }, '2026-11-19': { [site]: 8 }, '2026-11-17': { [site]: 12, 'other.com': 1 } };

  it('counts and does not suggest below the threshold', () => {
    const result = recordOpen({ opens: {} }, site, today);
    assert.deepEqual(result, { opens: { [today]: { [site]: 1 } }, suggest: false });
  });
  it('suggests on the open that crosses the threshold, and resets that site', () => {
    const result = recordOpen({ opens: almost }, site, today);
    assert.equal(result.suggest, true);
    assert.deepEqual(result.opens, { '2026-11-17': { 'other.com': 1 } });
  });
  it('shows at most one suggestion a day, but keeps counting', () => {
    const result = recordOpen({ opens: almost, suggestedOn: today }, site, today);
    assert.equal(result.suggest, false);
    assert.equal(result.opens[today][site], 8);
    assert.equal(recordOpen({ opens: almost, suggestedOn: '2026-11-19' }, site, today).suggest, true);
  });
  it('keeps only the days the threshold reads', () => {
    assert.equal(KEEP_DAYS, WINDOW_DAYS);
    const old = { '2026-11-14': { [site]: 1 }, '2026-11-13': { [site]: 1 } };
    assert.deepEqual(Object.keys(recordOpen({ opens: old }, 'a.com', today).opens).sort(), ['2026-11-14', today]);
  });
});

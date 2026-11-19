import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  displayUrl,
  findSiteForUrl,
  hostMatches,
  hostOf,
  normalizeDomain,
  originPatternFor,
} from '../../extension/lib/domains.js';

describe('normalizeDomain', () => {
  const cases = [
    ['reddit.com', 'reddit.com'],
    ['  Reddit.COM  ', 'reddit.com'],
    ['https://www.youtube.com/watch?v=abc', 'youtube.com'],
    ['www.letterboxd.com/film/x/', 'letterboxd.com'],
    ['http://user:pass@imdb.com:8080/title', 'imdb.com'],
    ['mail.google.com', 'mail.google.com'],
    ['https://mail.google.com/mail/u/0/#inbox', 'mail.google.com'],
    ['*.reddit.com', 'reddit.com'],
    ['old.reddit.com.', 'old.reddit.com'],
    ['bbc.co.uk', 'bbc.co.uk'],
    ['müller.de', 'xn--mller-kva.de'],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => assert.equal(normalizeDomain(input), expected));
  }

  const rejected = [
    '',
    '   ',
    'reddit',
    'localhost',
    '192.168.1.1',
    '[::1]',
    'edge://settings',
    'file:///C:/x.html',
    'chrome-extension://abc/page.html',
    'you tube.com',
    '-bad-.com',
    'example.123',
    null,
    42,
  ];
  for (const input of rejected) {
    it(`rejects ${JSON.stringify(input)}`, () => assert.equal(normalizeDomain(input), null));
  }
});

describe('hostOf', () => {
  it('returns the hostname for http(s)', () => {
    assert.equal(hostOf('https://www.reddit.com/r/all'), 'www.reddit.com');
    assert.equal(hostOf('http://example.com:8080/'), 'example.com');
  });
  it('returns null for everything else', () => {
    assert.equal(hostOf('edge://newtab/'), null);
    assert.equal(hostOf('about:blank'), null);
    assert.equal(hostOf(undefined), null);
    assert.equal(hostOf('not a url'), null);
  });
});

describe('hostMatches', () => {
  it('matches the domain and its subdomains only', () => {
    assert.ok(hostMatches('youtube.com', 'youtube.com'));
    assert.ok(hostMatches('music.youtube.com', 'youtube.com'));
    assert.ok(!hostMatches('notyoutube.com', 'youtube.com'));
    assert.ok(!hostMatches('youtube.com.evil.io', 'youtube.com'));
  });
});

describe('findSiteForUrl', () => {
  const list = ['google.com', 'mail.google.com', 'reddit.com'];
  it('prefers the most specific listed site', () => {
    assert.equal(findSiteForUrl('https://mail.google.com/mail/u/0/', list), 'mail.google.com');
    assert.equal(findSiteForUrl('https://docs.google.com/', list), 'google.com');
  });
  it('matches through www and subdomains', () => {
    assert.equal(findSiteForUrl('https://www.reddit.com/r/all', list), 'reddit.com');
    assert.equal(findSiteForUrl('https://old.reddit.com/', list), 'reddit.com');
  });
  it('returns null when nothing matches', () => {
    assert.equal(findSiteForUrl('https://letterboxd.com/', list), null);
    assert.equal(findSiteForUrl('edge://newtab/', list), null);
  });
});

describe('originPatternFor', () => {
  it('covers the domain and its subdomains', () => {
    assert.equal(originPatternFor('reddit.com'), '*://*.reddit.com/*');
  });
});

describe('displayUrl', () => {
  it('drops scheme, www and the trailing slash', () => {
    assert.equal(displayUrl('https://www.reddit.com/'), 'reddit.com');
    assert.equal(displayUrl('https://www.reddit.com/r/all'), 'reddit.com/r/all');
  });
  it('truncates long URLs in the middle', () => {
    const shown = displayUrl(`https://example.com/${'a'.repeat(200)}/end`, 40);
    assert.equal(shown.length, 40);
    assert.ok(shown.startsWith('example.com/'));
    assert.ok(shown.endsWith('/end'));
    assert.ok(shown.includes('…'));
  });
});

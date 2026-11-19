import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayKey, lastDays } from '../../extension/lib/dates.js';
import { addEvent, pruneStats, sumCounts } from '../../extension/lib/stats.js';

describe('dates', () => {
  it('dayKey uses the local calendar date', () => {
    assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
    assert.equal(dayKey(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
  });
  it('lastDays counts back from today, across month and year ends', () => {
    assert.deepEqual(lastDays(3, new Date(2026, 0, 2)), ['2026-01-02', '2026-01-01', '2025-12-31']);
  });
});

describe('addEvent', () => {
  it('counts pauses and opens per day and site without mutating the input', () => {
    const empty = {};
    let stats = addEvent(empty, 'reddit.com', 'paused', '2026-11-19');
    stats = addEvent(stats, 'reddit.com', 'paused', '2026-11-19');
    stats = addEvent(stats, 'reddit.com', 'opened', '2026-11-19');
    stats = addEvent(stats, 'imdb.com', 'paused', '2026-11-19');
    assert.deepEqual(stats, { '2026-11-19': { 'reddit.com': [2, 1], 'imdb.com': [1, 0] } });
    assert.deepEqual(empty, {});
  });
});

describe('sumCounts', () => {
  const stats = {
    '2026-11-19': { 'reddit.com': [5, 1], 'imdb.com': [2, 2] },
    '2026-11-18': { 'reddit.com': [3, 0] },
    '2026-10-01': { 'reddit.com': [10, 4] },
  };
  it('sums one site over some days', () => {
    assert.deepEqual(sumCounts(stats, { days: ['2026-11-19', '2026-11-18'], domain: 'reddit.com' }), {
      paused: 8,
      opened: 1,
      turnedBack: 7,
    });
  });
  it('sums everything when no filter is given', () => {
    assert.deepEqual(sumCounts(stats), { paused: 20, opened: 7, turnedBack: 13 });
  });
  it('treats missing days as zero', () => {
    assert.deepEqual(sumCounts(stats, { days: ['2020-01-01'] }), { paused: 0, opened: 0, turnedBack: 0 });
  });
});

describe('pruneStats', () => {
  it('keeps exactly the last N days', () => {
    const stats = { '2026-11-19': {}, '2026-11-17': {}, '2026-11-16': {} };
    assert.deepEqual(Object.keys(pruneStats(stats, '2026-11-19', 4)).sort(), ['2026-11-16', '2026-11-17', '2026-11-19']);
    assert.deepEqual(Object.keys(pruneStats(stats, '2026-11-19', 3)).sort(), ['2026-11-17', '2026-11-19']);
  });
});

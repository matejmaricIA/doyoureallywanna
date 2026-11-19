import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayKey, lastDays } from '../../extension/lib/dates.js';
import { addEvent, pruneStats, sumCounts, tallyMarks } from '../../extension/lib/stats.js';

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
    stats = addEvent(stats, 'facebook.com', 'paused', '2026-11-19');
    assert.deepEqual(stats, { '2026-11-19': { 'reddit.com': [2, 1], 'facebook.com': [1, 0] } });
    assert.deepEqual(empty, {});
  });
});

describe('sumCounts', () => {
  const stats = {
    '2026-11-19': { 'reddit.com': [5, 1], 'facebook.com': [2, 2] },
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

describe('tallyMarks', () => {
  it('draws one mark per pause, turned-back ones first', () => {
    assert.deepEqual(tallyMarks({ paused: 3, opened: 1, turnedBack: 2 }, 10), {
      marks: ['back', 'back', 'opened'],
      more: 0,
    });
    assert.deepEqual(tallyMarks({ paused: 0, opened: 0, turnedBack: 0 }, 10), { marks: [], more: 0 });
  });
  it('keeps the proportions past the cap and counts the rest', () => {
    const { marks, more } = tallyMarks({ paused: 40, opened: 10, turnedBack: 30 }, 20);
    assert.equal(marks.length, 20);
    assert.equal(marks.filter((m) => m === 'back').length, 15);
    assert.equal(more, 20);
  });
});

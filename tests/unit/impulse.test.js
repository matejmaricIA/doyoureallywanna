import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addImpulse, forgetImpulse, impulseRows } from '../../extension/lib/impulse.js';

describe('addImpulse', () => {
  it('counts per day and site without mutating the input', () => {
    const empty = {};
    let impulse = addImpulse(empty, 'youtube.com', '2026-11-21');
    impulse = addImpulse(impulse, 'youtube.com', '2026-11-21');
    impulse = addImpulse(impulse, 'imdb.com', '2026-11-20');
    assert.deepEqual(impulse, { '2026-11-21': { 'youtube.com': 2 }, '2026-11-20': { 'imdb.com': 1 } });
    assert.deepEqual(empty, {});
  });
});

describe('forgetImpulse', () => {
  it('drops exactly that site on every day, and days left empty', () => {
    const impulse = {
      '2026-11-21': { 'youtube.com': 2, 'music.youtube.com': 1 },
      '2026-11-20': { 'youtube.com': 9 },
    };
    assert.deepEqual(forgetImpulse(impulse, 'youtube.com'), { '2026-11-21': { 'music.youtube.com': 1 } });
    assert.deepEqual(forgetImpulse(impulse, 'nothing.com'), impulse);
  });
});

describe('impulseRows', () => {
  const today = '2026-11-21';
  const week = ['2026-11-21', '2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17', '2026-11-16', '2026-11-15'];
  const impulse = {
    '2026-11-21': { 'youtube.com': 3, 'imdb.com': 1 },
    '2026-11-18': { 'youtube.com': 5, 'github.com': 4 },
    '2026-10-01': { 'imdb.com': 40, 'reddit.com': 7 },
  };

  it('sums today, the last 7 days and all time per site, busiest this week first', () => {
    assert.deepEqual(impulseRows(impulse, { today, week }), [
      { site: 'youtube.com', today: 3, week: 8, all: 8 },
      { site: 'github.com', today: 0, week: 4, all: 4 },
      { site: 'imdb.com', today: 1, week: 1, all: 41 },
      { site: 'reddit.com', today: 0, week: 0, all: 7 },
    ]);
  });
  it('leaves out sites on the list', () => {
    assert.deepEqual(
      impulseRows(impulse, { today, week, skip: ['youtube.com', 'reddit.com'] }).map((row) => row.site),
      ['github.com', 'imdb.com'],
    );
  });
  it('is empty with nothing counted', () => {
    assert.deepEqual(impulseRows({}, { today, week }), []);
  });
});

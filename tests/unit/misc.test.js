import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BACKUP_APP, SCHEMA, buildBackup, parseBackup } from '../../extension/lib/backup.js';
import { PROMPTS, TURNED_BACK, ordinal, pick, plural, summaryLines, timesTodayLine } from '../../extension/lib/copy.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../extension/lib/settings.js';

describe('settings', () => {
  it('fills in defaults', () => {
    assert.deepEqual(sanitizeSettings(undefined), DEFAULT_SETTINGS);
    assert.deepEqual(sanitizeSettings({}), { graceMinutes: 5, countdownSeconds: 5 });
  });
  it('clamps and rounds', () => {
    assert.deepEqual(sanitizeSettings({ graceMinutes: 0, countdownSeconds: 99 }), { graceMinutes: 1, countdownSeconds: 30 });
    assert.deepEqual(sanitizeSettings({ graceMinutes: '12', countdownSeconds: 2.6 }), { graceMinutes: 12, countdownSeconds: 3 });
  });
  it('ignores junk', () => {
    assert.deepEqual(sanitizeSettings({ graceMinutes: 'soon', countdownSeconds: null }), DEFAULT_SETTINGS);
  });
});

describe('copy', () => {
  it('every prompt names the site exactly once', () => {
    for (const prompt of PROMPTS) assert.equal(prompt.split('{site}').length, 2, prompt);
  });
  it('every turned-back message has a title and body', () => {
    for (const message of TURNED_BACK) assert.ok(message.title && message.body);
  });
  it('pick stays in range', () => {
    assert.equal(pick(['a', 'b'], () => 0), 'a');
    assert.equal(pick(['a', 'b'], () => 0.9999), 'b');
    assert.equal(pick(['a', 'b'], () => 1), 'b');
  });
  it('ordinals', () => {
    const expected = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th', 21: '21st', 102: '102nd', 111: '111th' };
    for (const [n, text] of Object.entries(expected)) assert.equal(ordinal(Number(n)), text);
  });
  it('times-today line', () => {
    assert.equal(timesTodayLine(1), 'First time today.');
    assert.equal(timesTodayLine(6), "That's the 6th time today.");
  });
  it('plural', () => {
    assert.equal(plural(1, 'site'), '1 site');
    assert.equal(plural(3, 'site'), '3 sites');
  });
});

describe('backup', () => {
  const data = {
    sites: { 'reddit.com': { added: 1700000000000 } },
    settings: { graceMinutes: 10, countdownSeconds: 3 },
    stats: { '2026-11-19': { 'reddit.com': [4, 1] } },
  };

  it('round-trips', () => {
    const backup = buildBackup(data, '0.1.0', new Date('2026-11-19T10:00:00Z'));
    assert.equal(backup.app, BACKUP_APP);
    assert.equal(backup.schema, SCHEMA);
    assert.equal(backup.exportedAt, '2026-11-19T10:00:00.000Z');
    const parsed = parseBackup(JSON.stringify(backup));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data, data);
  });

  it('rejects files that are not ours', () => {
    assert.equal(parseBackup('not json').ok, false);
    assert.equal(parseBackup('{"hello":"world"}').ok, false);
    assert.equal(parseBackup(JSON.stringify({ app: BACKUP_APP, schema: 99 })).ok, false);
  });

  it('cleans up anything suspicious instead of trusting it', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        schema: SCHEMA,
        sites: { 'https://www.YouTube.com/': { added: 5 }, 'javascript:alert(1)': {}, localhost: {} },
        settings: { graceMinutes: 9999 },
        stats: {
          '2026-11-19': { 'youtube.com': [3, 7], 'bad host': [1, 0], 'imdb.com': [-1, 0] },
          yesterday: { 'reddit.com': [1, 0] },
        },
      }),
    );
    assert.ok(parsed.ok);
    assert.deepEqual(Object.keys(parsed.data.sites), ['youtube.com']);
    assert.equal(parsed.data.settings.graceMinutes, 120);
    assert.deepEqual(parsed.data.stats, { '2026-11-19': { 'youtube.com': [3, 3] } });
  });
});

describe('summaryLines', () => {
  /** @param {number} paused @param {number} turnedBack */
  const c = (paused, turnedBack) => ({ paused, opened: paused - turnedBack, turnedBack });
  const none = c(0, 0);

  it('invites you to add a site when there is nothing yet', () => {
    assert.equal(summaryLines({ sites: 0, today: none, week: none, all: none }).title, 'What do you open on autopilot?');
    assert.equal(summaryLines({ sites: 2, today: none, week: none, all: none }).title, 'Nothing paused yet.');
  });
  it('leads with today, then the last 7 days and all time', () => {
    assert.deepEqual(summaryLines({ sites: 4, today: c(14, 9), week: c(132, 83), all: c(580, 362) }), {
      title: 'You turned back 9 of 14 times today.',
      body: "In the last 7 days it's 83 of 132, and 362 of 580 all time.",
    });
    assert.equal(summaryLines({ sites: 1, today: c(1, 0), week: c(1, 0), all: c(1, 0) }).title, 'You turned back 0 of 1 time today.');
  });
  it('never repeats the same numbers', () => {
    assert.equal(summaryLines({ sites: 1, today: c(3, 2), week: c(3, 2), all: c(3, 2) }).body, "That's every pause so far.");
    assert.equal(summaryLines({ sites: 1, today: c(3, 2), week: c(9, 5), all: c(9, 5) }).body, "In the last 7 days it's 5 of 9.");
    assert.equal(summaryLines({ sites: 1, today: c(3, 2), week: c(3, 2), all: c(9, 5) }).body, "All time it's 5 of 9.");
  });
  it('still shows the week and all time on a day without pauses', () => {
    assert.deepEqual(summaryLines({ sites: 1, today: none, week: c(8, 6), all: c(20, 11) }), {
      title: 'No pauses yet today.',
      body: 'In the last 7 days you turned back 6 of 8 times, and 11 of 20 all time.',
    });
    assert.equal(summaryLines({ sites: 1, today: none, week: none, all: c(20, 11) }).body, 'All time, you turned back 11 of 20 times.');
  });
});

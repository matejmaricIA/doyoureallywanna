import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BACKUP_APP, SCHEMA, buildBackup, parseBackup } from '../../extension/lib/backup.js';
import { PROMPTS, SUGGESTION, TURNED_BACK, ordinal, pick, plural, summaryLines, timesTodayLine } from '../../extension/lib/copy.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../extension/lib/settings.js';

describe('settings', () => {
  it('fills in defaults', () => {
    assert.deepEqual(sanitizeSettings(undefined), DEFAULT_SETTINGS);
    assert.deepEqual(sanitizeSettings({}), { graceMinutes: 5, countdownSeconds: 5, yesWaitSeconds: 0, theme: 'dusk', appearance: 'browser', suggestions: false });
  });
  it('clamps and rounds', () => {
    assert.deepEqual(sanitizeSettings({ graceMinutes: 0, countdownSeconds: 99 }), { graceMinutes: 1, countdownSeconds: 30, yesWaitSeconds: 0, theme: 'dusk', appearance: 'browser', suggestions: false });
    assert.deepEqual(sanitizeSettings({ graceMinutes: '12', countdownSeconds: 2.6 }), { graceMinutes: 12, countdownSeconds: 3, yesWaitSeconds: 0, theme: 'dusk', appearance: 'browser', suggestions: false });
  });
  it('ignores junk', () => {
    assert.deepEqual(sanitizeSettings({ graceMinutes: 'soon', countdownSeconds: null, theme: 'neon' }), DEFAULT_SETTINGS);
    assert.equal(sanitizeSettings({ theme: { key: 'sage' } }).theme, 'dusk');
  });
  it('keeps a known theme', () => {
    assert.equal(sanitizeSettings({ theme: 'dusk' }).theme, 'dusk');
  });
  it('keeps light or dark, and follows the browser otherwise', () => {
    assert.equal(sanitizeSettings({ appearance: 'dark' }).appearance, 'dark');
    assert.equal(sanitizeSettings({ appearance: 'light' }).appearance, 'light');
    assert.equal(sanitizeSettings({ appearance: 'Dark' }).appearance, 'browser');
    assert.equal(sanitizeSettings({ appearance: ['dark'] }).appearance, 'browser');
  });
  it('"Yes" works straight away unless a wait is chosen, and never waits long', () => {
    assert.equal(DEFAULT_SETTINGS.yesWaitSeconds, 0);
    assert.equal(sanitizeSettings({ yesWaitSeconds: 3 }).yesWaitSeconds, 3);
    assert.equal(sanitizeSettings({ yesWaitSeconds: 60 }).yesWaitSeconds, 10);
    assert.equal(sanitizeSettings({ yesWaitSeconds: -5 }).yesWaitSeconds, 0);
    assert.equal(sanitizeSettings({ yesWaitSeconds: 'later' }).yesWaitSeconds, 0);
  });
  it('suggestions are off unless explicitly on', () => {
    assert.equal(DEFAULT_SETTINGS.suggestions, false);
    assert.equal(sanitizeSettings({ suggestions: true }).suggestions, true);
    assert.equal(sanitizeSettings({ suggestions: 'yes' }).suggestions, false);
    assert.equal(sanitizeSettings({ suggestions: 1 }).suggestions, false);
  });
});

describe('copy', () => {
  it('every prompt names the site exactly once', () => {
    for (const prompt of PROMPTS) assert.equal(prompt.split('{site}').length, 2, prompt);
  });
  it('the suggestion names the site once, and says why with the real window', () => {
    for (const key of ['title', 'noticed', 'noAccess']) assert.equal(SUGGESTION[key].split('{site}').length, 2, key);
    assert.equal(SUGGESTION.whyWindow, 'You opened it {n} times in the last 2 hours.');
    assert.equal(SUGGESTION.whyDay, 'You opened it {n} times today.');
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
    settings: { graceMinutes: 10, countdownSeconds: 3, yesWaitSeconds: 4, theme: 'sage', appearance: 'dark', suggestions: true },
    stats: { '2026-11-19': { 'reddit.com': [4, 1] } },
    quiet: { 'github.com': { added: 1700000000001 } },
    impulse: { '2026-11-19': { 'youtube.com': 9, 'github.com': 3 } },
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

  it("includes the impulse stats, never the suggestion check's recent opens", () => {
    const backup = buildBackup({ ...data, opens: { 'youtube.com': [1763672400000] }, suggestedOn: '2026-11-19' }, '0.4.0');
    assert.deepEqual(Object.keys(backup).sort(), ['app', 'exportedAt', 'impulse', 'quiet', 'schema', 'settings', 'sites', 'stats', 'version']);
  });

  it('still imports schema 2 backups (no impulse stats)', () => {
    const { impulse: _, ...older } = buildBackup(data, '0.3.0');
    const parsed = parseBackup(JSON.stringify({ ...older, schema: 2 }));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data, { ...data, impulse: {} });
  });

  it('still imports schema 1 backups (no "don\'t ask again" list, suggestions off)', () => {
    assert.equal(SCHEMA, 3);
    const parsed = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        schema: 1,
        version: '0.1.0',
        sites: { 'reddit.com': { added: 1700000000000 } },
        settings: { graceMinutes: 10, countdownSeconds: 3 },
        stats: { '2026-11-19': { 'reddit.com': [4, 1] } },
      }),
    );
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data, { ...data, settings: { ...data.settings, yesWaitSeconds: 0, theme: 'dusk', appearance: 'browser', suggestions: false }, quiet: {}, impulse: {} });
  });

  it('rejects files that are not ours', () => {
    assert.equal(parseBackup('not json').ok, false);
    assert.equal(parseBackup('{"hello":"world"}').ok, false);
    assert.equal(parseBackup(JSON.stringify({ app: BACKUP_APP })).ok, false);
    assert.equal(parseBackup(JSON.stringify({ app: BACKUP_APP, schema: 0 })).ok, false);
    const newer = parseBackup(JSON.stringify({ app: BACKUP_APP, schema: 99 }));
    assert.equal(newer.ok, false);
    assert.match(newer.ok ? '' : newer.error, /newer version/);
  });

  it('cleans up anything suspicious instead of trusting it', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        schema: SCHEMA,
        sites: { 'https://www.YouTube.com/': { added: 5 }, 'javascript:alert(1)': {}, localhost: {} },
        settings: { graceMinutes: 9999, suggestions: 'yes' },
        quiet: { 'https://www.GitHub.com/x': { added: 'soon' }, 'not a site': {} },
        stats: {
          '2026-11-19': { 'youtube.com': [3, 7], 'bad host': [1, 0], 'facebook.com': [-1, 0] },
          yesterday: { 'reddit.com': [1, 0] },
        },
        impulse: {
          '2026-11-19': { 'https://www.YouTube.com/': 4, 'bad host': 2, 'reddit.com': -3, 'imdb.com': 1.5, 'x.com': '7' },
          soon: { 'reddit.com': 1 },
        },
      }),
    );
    assert.ok(parsed.ok);
    assert.deepEqual(Object.keys(parsed.data.sites), ['youtube.com']);
    assert.equal(parsed.data.settings.graceMinutes, 120);
    assert.equal(parsed.data.settings.suggestions, false);
    assert.deepEqual(Object.keys(parsed.data.quiet), ['github.com']);
    assert.ok(parsed.data.quiet['github.com'].added > 0);
    assert.deepEqual(parsed.data.stats, { '2026-11-19': { 'youtube.com': [3, 3] } });
    assert.deepEqual(parsed.data.impulse, { '2026-11-19': { 'youtube.com': 4 } });
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

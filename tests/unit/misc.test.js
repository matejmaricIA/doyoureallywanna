import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BACKUP_APP, SCHEMA, buildBackup, parseBackup } from '../../extension/lib/backup.js';
import { PROMPTS, TURNED_BACK, ordinal, pick, plural, timesTodayLine } from '../../extension/lib/copy.js';
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

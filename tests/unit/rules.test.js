import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GRACE_PRIORITY, REDIRECT_PRIORITY, buildGraceRule, buildRedirectRules } from '../../extension/lib/rules.js';

const PAUSE = 'chrome-extension://abc/pause/pause.html';

describe('buildRedirectRules', () => {
  const rules = buildRedirectRules(['youtube.com', 'reddit.com'], PAUSE);

  it('makes one rule per site with stable, unique ids', () => {
    assert.equal(rules.length, 2);
    assert.deepEqual(
      rules.map((rule) => [rule.id, rule.condition.requestDomains?.[0]]),
      [
        [1, 'reddit.com'],
        [2, 'youtube.com'],
      ],
    );
  });

  it('redirects only top-level page loads, carrying the original URL', () => {
    const [rule] = rules;
    assert.equal(rule.action.type, 'redirect');
    assert.equal(rule.action.redirect?.regexSubstitution, `${PAUSE}#\\0`);
    assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
    assert.equal(rule.condition.regexFilter, '^.+$');
  });

  it("doesn't pause navigation that starts from the same site", () => {
    for (const rule of rules) {
      assert.deepEqual(rule.condition.excludedInitiatorDomains, rule.condition.requestDomains);
    }
  });

  it('returns no rules for an empty list', () => {
    assert.deepEqual(buildRedirectRules([], PAUSE), []);
  });
});

describe('buildGraceRule', () => {
  it('allows one tab through to one site, above the redirect', () => {
    const rule = buildGraceRule(7, 42, 'reddit.com');
    assert.equal(rule.id, 7);
    assert.equal(rule.action.type, 'allow');
    assert.deepEqual(rule.condition.tabIds, [42]);
    assert.deepEqual(rule.condition.requestDomains, ['reddit.com']);
    assert.ok(GRACE_PRIORITY > REDIRECT_PRIORITY);
    assert.equal(rule.priority, GRACE_PRIORITY);
  });
});

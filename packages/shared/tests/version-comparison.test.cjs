const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions } = require('../dist');
test('updates require a newer remote semver, not merely a different version', () => {
  for (const [remote, expected] of [['2.0.1', -1], ['2.0.2', 0], ['2.0.3', 1], ['2.0.2+build.2', 0]]) assert.equal(compareVersions(remote, '2.0.2'), expected);
  assert.equal(compareVersions('2.0.2-rc.10', '2.0.2-rc.2'), 1);
  assert.equal(compareVersions('2.0.2', '2.0.2-rc.10'), 1);
  assert.equal(compareVersions('2.0.2-1', '2.0.2-beta'), -1);
});

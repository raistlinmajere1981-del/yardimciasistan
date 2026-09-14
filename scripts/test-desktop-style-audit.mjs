import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { cssRules, desktopStyleAudit } from './lib/desktop-style-audit.mjs';

test('CSS scanner retains scope and ignores braces inside strings/comments', () => {
  const rules = cssRules('/* { } */ .panel { content: "}"; color: var(--color-text); } @media (max-width: 760px) { .panel { padding: 0; } }');
  assert.equal(rules.length, 2);
  assert.equal(rules[0].selector, '.panel');
  assert.equal(rules[0].scope, '');
  assert.match(rules[1].scope, /@media/);
});

test('shared ownership regressions are detected without treating complementary rules as duplicates', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'desktop-style-audit-'));
  try {
    const fixture = {
      'styles/index.css': '@import "./components/panels.css" layer(components); @import "./pages/feature.css" layer(pages); @import "./tokens/primitives.css" layer(tokens); @import "./friendly-ux.css" layer(pages);',
      'styles/tokens/primitives.css': ':root { --neutral-0: #fff; }',
      'styles/components/panels.css': '.surface, .panel { background: var(--color-bg-panel); } .panel { padding: var(--panel-padding); } @media (max-width: 760px) { .panel { padding: 0; } }',
      'styles/pages/feature.css': '.sidebar { width: 100px !important; } .panel { background: #fff; margin: var(--override-space-13); }'
    };
    const files = Object.entries(fixture).map(([name, text]) => {
      const file = path.join(root, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
      return file;
    });
    const report = desktopStyleAudit(files);
    assert.equal(report.totals.rawColor, 1);
    assert.equal(report.totals.override, 1);
    for (const kind of ['important', 'override', 'rawColor', 'shellOutsideLayout', 'featureShellSelector', 'legacyImport', 'duplicateSharedPrimitive']) {
      assert(report.violations.some(issue => issue.kind === kind), kind);
    }
    assert.equal(report.violations.filter(issue => issue.kind === 'duplicateSharedPrimitive').length, 1);
    assert(!report.violations.some(issue => issue.file.endsWith('/components/panels.css')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

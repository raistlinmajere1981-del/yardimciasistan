import assert from 'node:assert/strict';
import {cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest, inventory, safeFile, templateRoot} from '../web-site-template/tools/manifest.mjs';

const demoPath = path => path === 'public/index.php' ? 'entry.php' : path.startsWith('public/assets/') ? path.slice(7) : path.startsWith('core/') ? path : null;

// Explicit source maintenance only; builds and verification are read-only.
export function checkDemoTemplate(root = resolve('test-site/landing'), write = false) {
  const installed = join(root, 'deneme');
  const manifest = JSON.parse(readFileSync(join(templateRoot, 'template-manifest.json'), 'utf8'));
  assert.deepEqual(inventory(templateRoot), manifest.common, 'Template release manifest is stale');
  const baseline = join(installed, 'template-manifest.json');
  const previous = existsSync(baseline) ? JSON.parse(readFileSync(baseline, 'utf8')) : {common:{}};
  // Validate every destination before any writes. Local core edits must be reviewed first.
  for (const path of new Set([...Object.keys(previous.common), ...Object.keys(manifest.common)])) {
    safeFile(templateRoot, path);
    const mapped = demoPath(path);
    if (!mapped) continue;
    let target = installed;
    for (const part of mapped.split('/')) {
      assert.ok(!existsSync(target) || !lstatSync(target).isSymbolicLink(), 'Demo symlink is not supported');
      target = join(target, part);
    }
    assert.ok(!existsSync(target) || !lstatSync(target).isSymbolicLink(), 'Demo symlink is not supported');
    const current = existsSync(target) ? digest(target) : null;
    if (write) assert.ok(current === (previous.common[path] ?? null) || current === (manifest.common[path] ?? null), `Local demo core conflict: ${mapped}`);
  }
  if (write) for (const path of Object.keys(previous.common)) {
    const mapped = demoPath(path);
    if (mapped && !(path in manifest.common)) rmSync(join(installed, mapped), {force:true});
  }
  for (const [path, hash] of Object.entries(manifest.common)) {
    const mapped = demoPath(path);
    if (!mapped) continue;
    const target = join(installed, mapped);
    if (write) { mkdirSync(dirname(target), {recursive:true}); cpSync(join(templateRoot, path), target); }
    assert.ok(existsSync(target), `Demo template file missing: ${mapped}`);
    assert.equal(digest(target), hash, `Demo core fork: ${mapped}; update via scripts/sync-demo-template.mjs --write`);
  }
  const catalog = readFileSync(join(root, 'locales/tr.json'));
  if (write) writeFileSync(join(installed, 'locales/tr.json'), catalog);
  assert.deepEqual(readFileSync(join(installed, 'locales/tr.json')), catalog, 'Demo layers must share one source catalog');
  if (write) cpSync(join(templateRoot, 'template-manifest.json'), baseline);
  assert.deepEqual(JSON.parse(readFileSync(baseline, 'utf8')), manifest, 'Demo installed template baseline is stale');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.slice(2).every(arg => ['--write','--check'].includes(arg)), 'Use --check or --write');
  checkDemoTemplate(undefined, process.argv.includes('--write'));
  console.log('demo-template-integrity-ok');
}

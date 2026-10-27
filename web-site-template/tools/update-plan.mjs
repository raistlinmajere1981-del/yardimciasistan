import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {digest, inventory, safeFile} from './manifest.mjs';

// Read-only three-way plan: release baseline, installed files, incoming release.
const [incomingArg, installedArg] = process.argv.slice(2);
if (!incomingArg || !installedArg || process.argv.length !== 4) throw new Error('Usage: node tools/update-plan.mjs <incoming-template> <installed-template>');
const incoming = resolve(incomingArg), installed = resolve(installedArg);
const next = JSON.parse(readFileSync(join(incoming, 'template-manifest.json'), 'utf8'));
const previous = JSON.parse(readFileSync(join(installed, 'template-manifest.json'), 'utf8'));
if (next.format !== 1 || previous.format !== 1) throw new Error('Unsupported manifest format');
if (JSON.stringify(inventory(incoming)) !== JSON.stringify(next.common)) throw new Error('Incoming release integrity check failed');
const changes = [], conflicts = [];
for (const path of [...new Set([...Object.keys(previous.common), ...Object.keys(next.common)])].sort()) {
  const file = safeFile(installed, path);
  const current = existsSync(file) ? digest(file) : null;
  const old = previous.common[path] ?? null, replacement = next.common[path] ?? null;
  if (current !== old && current !== replacement) { conflicts.push(path); continue; }
  if (current !== replacement) changes.push({path, action: replacement === null ? 'remove' : old === null ? 'add' : 'replace'});
}
const sourceCatalog = JSON.parse(readFileSync(join(incoming, 'locales/tr.json'), 'utf8'));
const installedCatalog = JSON.parse(readFileSync(join(installed, 'locales/tr.json'), 'utf8'));
console.log(JSON.stringify({from: previous.template_version, to: next.template_version, changes, conflicts,
  catalogKeysToMerge: Object.keys(sourceCatalog).filter(key => !(key in installedCatalog)),
  protected: next.site_owned, writes: false}, null, 2));
if (conflicts.length) process.exitCode = 1;

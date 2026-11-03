import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const templateRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const commonPath = path => ['README.md', 'public/index.php'].includes(path)
  || ['core/', 'public/assets/core/', 'public/assets/vendor/effect-engine/', 'tools/'].some(prefix => path.startsWith(prefix));
export const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');

export function safeFile(root, path) {
  if (!commonPath(path) || !/^[A-Za-z0-9_./-]+$/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid common file path');
  let current = root;
  if (lstatSync(root).isSymbolicLink()) throw new Error('Root symlink is not supported');
  for (const part of path.split('/')) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Symlink is not supported');
  }
  return current;
}

export function inventory(root) {
  const files = {};
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name;
      // Site-owned runtime modules may be symlinks (e.g. /yardimci-asistan).
      // Never traverse them, and still reject symlinks in managed common paths.
      if (entry.isSymbolicLink()) {
        if (commonPath(path) || commonPath(path + '/')) throw new Error('Common symlink is not supported');
        continue;
      }
      if (entry.isDirectory()) visit(join(directory, entry.name), path + '/');
      else if (entry.isFile() && commonPath(path)) files[path] = digest(join(root, path));
    }
  }
  visit(root);
  return files;
}

// Explicit release-authoring command only. Verification never rewrites the manifest.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = join(templateRoot, 'template-manifest.json');
  if (process.argv[2] === '--write') {
    writeFileSync(path, JSON.stringify({format: 1, template_version: '0.6.1',
      site_owned: ['site/', 'locales/', 'public/assets/site/'], common: inventory(templateRoot)}, null, 2) + '\n');
    console.log('template-manifest-written');
  } else {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    const actual = inventory(templateRoot);
    if (JSON.stringify(actual) !== JSON.stringify(manifest.common)) throw new Error('Common files differ from the release manifest');
    console.log(`template-manifest-ok: ${Object.keys(actual).length} common files`);
  }
}

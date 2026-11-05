import {existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join, parse, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const templateRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const vendorRoot = join(templateRoot, 'public/assets/vendor/effect-engine');
const parts = ['model', 'registry', 'runtime'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

// Check every ancestor too: resolving a lexical path must not hide a symlink.
export function safePath(path) {
  path = resolve(path);
  let current = parse(path).root;
  for (const part of path.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    let entry;
    try { entry = lstatSync(current); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    if (entry.isSymbolicLink()) throw new Error('Symlink is not supported: ' + current);
  }
  return path;
}

export function moduleInventory(root, strict = false) {
  safePath(root);
  const files = {};
  function visit(directory, prefix) {
    const entries = readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    if (!entries.length) throw new Error('Unexpected empty module directory: ' + prefix);
    for (const entry of entries) {
      const path = join(directory, entry.name), relative = prefix + '/' + entry.name;
      if (!/^[A-Za-z0-9_-]+(?:\.mjs)?$/.test(entry.name) || entry.isSymbolicLink()) throw new Error('Unexpected source entry: ' + relative);
      if (entry.isDirectory() && /^[A-Za-z0-9_-]+$/.test(entry.name)) visit(path, relative);
      else if (entry.isFile() && entry.name.endsWith('.mjs')) files[relative] = hash(readFileSync(path));
      else throw new Error('Unexpected source entry: ' + relative);
    }
  }
  if (strict) {
    for (const entry of readdirSync(root)) if (!['src', 'provenance.json'].includes(entry)) throw new Error('Unexpected vendor entry: ' + entry);
    for (const entry of readdirSync(join(root, 'src'))) if (!parts.includes(entry)) throw new Error('Unexpected vendor source tree: ' + entry);
    safePath(join(root, 'provenance.json'));
  }
  for (const part of parts) {
    safePath(join(root, 'src', part));
    visit(join(root, 'src', part), 'src/' + part);
  }
  return files;
}

export async function canonicalProvenance(source) {
  source = safePath(source);
  const files = moduleInventory(source);
  // Browser engine modules may only import other inventoried engine modules.
  for (const path of Object.keys(files)) {
    const code = readFileSync(join(source, path), 'utf8');
    for (const match of code.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)) {
      const dependency = match[1];
      if (!dependency.startsWith('.') || !Object.keys(files).some(file => resolve(source, file) === resolve(source, dirname(path), dependency))) {
        throw new Error('Unexpected engine dependency: ' + path + ' -> ' + dependency);
      }
    }
  }
  const fingerprint = hash(Object.entries(files).map(([path, sha]) => `${path}:${sha}\n`).join(''));
  const engine = await import(pathToFileURL(join(source, 'src/runtime/index.mjs')).href + '?sha256=' + fingerprint);
  const model = await import(pathToFileURL(join(source, 'src/model/project.mjs')).href + '?sha256=' + fingerprint);
  // Supported semantic major plus actual API/schema capabilities; version is never identity.
  if (!/^1\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(engine.ENGINE_VERSION)
    || ['compileScene', 'createOverlay', 'compileObjectScene', 'createObjectOverlay', 'bindObjectScene', 'defaultParams', 'defaultObjectParams'].some(name => typeof engine[name] !== 'function')
    || model.FORMAT !== 'efekt-atolyesi' || model.SCHEMA_VERSION !== 1 || model.OBJECT_SCENE_VERSION !== 2 || model.OBJECT_SCENE_KIND !== 'objectScene'
    || ['importProject', 'validateProject'].some(name => typeof model[name] !== 'function')
    || ['sunlight', 'shimmer', 'offshore'].some(name => typeof engine.effectRegistry?.[name]?.create !== 'function')
    || ['flame', 'glow', 'smoke'].some(name => typeof engine.objectEffectRegistry?.[name]?.create !== 'function'
      || !engine.objectEffectRegistry[name].targetKinds.includes('sceneObject'))) throw new Error('Incompatible engine API, semantic major or scene schema');
  if (JSON.stringify(moduleInventory(source)) !== JSON.stringify(files)) throw new Error('Canonical source changed during validation');
  return {format: 2, source: 'EfektAtolyesi', version: engine.ENGINE_VERSION, compatibility: {engine_major: 1, photo_scene: 1, object_scene: 2, object_kind: 'objectScene'}, algorithm: 'sha256', fingerprint, files};
}

export function checkCopy(destination, provenance, {strict = true, provenancePath = join(destination, 'provenance.json')} = {}) {
  const actual = moduleInventory(destination, strict);
  if (JSON.stringify(actual) !== JSON.stringify(provenance.files)) throw new Error('Engine module inventory differs: ' + destination);
  safePath(provenancePath);
  if (readFileSync(provenancePath, 'utf8') !== json(provenance)) throw new Error('Engine provenance differs: ' + provenancePath);
}

// Same-filesystem staged replacement. Keep the original until the new tree validates;
// restore it if publication fails. This is rollback-safe, not a crash-atomic exchange.
export async function syncEngine(source, destination = vendorRoot) {
  const provenance = await canonicalProvenance(source);
  safePath(destination);
  mkdirSync(dirname(destination), {recursive: true});
  const work = mkdtempSync(destination + '.stage-'), stage = join(work, 'next'), backup = join(work, 'previous');
  let moved = false;
  try {
    for (const [path, expected] of Object.entries(provenance.files)) {
      const bytes = readFileSync(join(source, path));
      if (hash(bytes) !== expected) throw new Error('Canonical source changed during sync');
      mkdirSync(dirname(join(stage, path)), {recursive: true});
      writeFileSync(join(stage, path), bytes);
    }
    writeFileSync(join(stage, 'provenance.json'), json(provenance));
    checkCopy(stage, provenance);
    if (existsSync(destination)) { renameSync(destination, backup); moved = true; }
    try { renameSync(stage, destination); } catch (error) { if (moved) { renameSync(backup, destination); moved = false; } throw error; }
    return provenance;
  } finally {
    // Never remove the last good copy if rollback itself failed.
    if (!moved || existsSync(destination)) rmSync(work, {recursive: true, force: true});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), check = args[0] === '--check';
  const source = args[check ? 1 : 0];
  if (!source || args.length !== (check ? 2 : 1) || source.startsWith('--')) throw new Error('Usage: sync-effect-engine.mjs [--check] /path/to/EfektAtolyesi');
  const provenance = check ? await canonicalProvenance(resolve(source)) : await syncEngine(resolve(source));
  if (check) checkCopy(vendorRoot, provenance);
  console.log(`effect-engine-${check ? 'check' : 'sync'}-ok: ${provenance.version}, ${Object.keys(provenance.files).length} modules, ${provenance.fingerprint}`);
}

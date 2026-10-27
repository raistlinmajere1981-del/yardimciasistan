import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2] ? resolve(process.argv[2]) : '';
if (!source || !existsSync(join(source, 'src/runtime/index.mjs'))) throw new Error('Pass the canonical EfektAtolyesi directory');
const {ENGINE_VERSION} = await import(pathToFileURL(join(source, 'src/runtime/index.mjs')));
if (ENGINE_VERSION !== '1.1.0') throw new Error('Expected canonical engine 1.1.0');
const destination = join(root, 'public/assets/vendor/effect-engine');
const stage = destination + '.stage';
if (existsSync(stage)) throw new Error('Staging directory already exists');
const files = {};
function inventory(directory, prefix) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name), relative = prefix + '/' + entry.name;
    if (entry.isDirectory()) inventory(path, relative);
    else if (entry.isFile() && entry.name.endsWith('.mjs')) files[relative] = createHash('sha256').update(readFileSync(path)).digest('hex');
    else throw new Error('Unexpected canonical source entry');
  }
}
try {
  mkdirSync(stage, {recursive: true});
  for (const part of ['runtime', 'registry', 'model']) {
    inventory(join(source, 'src', part), 'src/' + part);
    cpSync(join(source, 'src', part), join(stage, 'src', part), {recursive: true});
  }
  writeFileSync(join(stage, 'provenance.json'), JSON.stringify({source: 'EfektAtolyesi', version: ENGINE_VERSION, files}, null, 2) + '\n');
  rmSync(destination, {recursive: true, force: true});
  renameSync(stage, destination);
  console.log(`effect-engine-sync-ok: ${ENGINE_VERSION}, ${Object.keys(files).length} unchanged modules`);
} finally { rmSync(stage, {recursive: true, force: true}); }

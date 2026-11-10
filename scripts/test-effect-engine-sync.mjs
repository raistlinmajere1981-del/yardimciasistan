import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {canonicalProvenance, checkCopy, moduleInventory, syncEngine, vendorRoot, canonicalEngineRoot} from '../web-site-template/tools/sync-effect-engine.mjs';
import {compileObjectScene, defaultObjectParams} from '../web-site-template/public/assets/vendor/effect-engine/src/runtime/index.mjs';
import {importProject} from '../web-site-template/public/assets/vendor/effect-engine/src/model/project.mjs';
import {seededRandom} from '../web-site-template/public/assets/vendor/effect-engine/src/runtime/random.mjs';
import {mountEffects} from '../web-site-template/public/assets/core/effects.mjs';

const source = canonicalEngineRoot;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'engine-sync-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const canonical = join(root, 'canonical'), destination = join(root, 'vendor');
  for (const part of ['runtime', 'registry', 'model']) cpSync(join(source, 'src', part), join(canonical, 'src', part), {recursive: true});
  return {root, canonical, destination};
}

test('sync publishes deterministic exact bytes, removes stale files and check never heals', {timeout: 120000}, async t => {
  const {canonical, destination} = fixture(t);
  const first = await syncEngine(canonical, destination);
  const bytes = readFileSync(join(destination, 'provenance.json'), 'utf8');
  assert.equal(first.format, 2);
  assert.equal(first.fingerprint.length, 64);
  assert.equal(Object.keys(first.files).length, 24);
  checkCopy(destination, await canonicalProvenance(canonical));
  const random = join(destination, 'src/runtime/random.mjs');
  writeFileSync(random, readFileSync(random, 'utf8') + '\n// same version, different bytes\n');
  assert.throws(() => checkCopy(destination, first), /inventory differs/);
  assert.match(readFileSync(random, 'utf8'), /different bytes/);
  await syncEngine(canonical, destination);
  rmSync(join(destination, 'src/runtime/object-scene.mjs'));
  assert.throws(() => checkCopy(destination, first), /inventory differs/);
  writeFileSync(join(destination, 'src/runtime/stale.mjs'), 'export const obsolete = true;\n');
  assert.throws(() => checkCopy(destination, first), /inventory differs/);
  await syncEngine(canonical, destination);
  assert.equal(readFileSync(join(destination, 'provenance.json'), 'utf8'), bytes);
  assert.deepEqual(moduleInventory(destination, true), first.files);
  assert.deepEqual(readdirSync(resolve(destination, '..')), ['canonical', 'vendor']);
  writeFileSync(join(destination, 'extra.txt'), 'unexpected');
  assert.throws(() => checkCopy(destination, first), /Unexpected vendor/);
});

test('reject unsafe paths, unexpected source/dependencies and incompatible API without replacing target', {timeout: 120000}, async t => {
  const {root, canonical, destination} = fixture(t);
  await syncEngine(canonical, destination);
  const before = readFileSync(join(destination, 'provenance.json'), 'utf8');
  symlinkSync(canonical, join(root, 'alias'));
  await assert.rejects(canonicalProvenance(join(root, 'alias')), /Symlink/);
  const module = join(canonical, 'src/runtime/bad.mjs');
  symlinkSync(join(canonical, 'src/runtime/index.mjs'), module);
  await assert.rejects(syncEngine(canonical, destination), /Unexpected source/);
  rmSync(module);
  writeFileSync(join(canonical, 'src/runtime/notes.txt'), 'unexpected');
  await assert.rejects(syncEngine(canonical, destination), /Unexpected source/);
  rmSync(join(canonical, 'src/runtime/notes.txt'));
  writeFileSync(module, "import '../../../../external.mjs';\n");
  await assert.rejects(syncEngine(canonical, destination), /Unexpected engine dependency/);
  rmSync(module);
  const index = join(canonical, 'src/runtime/index.mjs');
  writeFileSync(index, readFileSync(index, 'utf8').replace("ENGINE_VERSION='1.1.0'", "ENGINE_VERSION='2.0.0'"));
  await assert.rejects(syncEngine(canonical, destination), /Incompatible engine/);
  assert.equal(readFileSync(join(destination, 'provenance.json'), 'utf8'), before);
  assert.deepEqual(readdirSync(root).sort(), ['alias', 'canonical', 'vendor']);
});

test('canonical, template and Admin CI checks are read only and share provenance', {timeout: 120000}, async () => {
  const provenance = await canonicalProvenance(source);
  checkCopy(vendorRoot, provenance);
  const admin = resolve('apps/admin-control-center');
  const editorBefore = readFileSync(join(admin, 'public/effect-studio/index.html'));
  checkCopy(join(admin, 'public/effect-studio'), provenance, {strict: false, provenancePath: join(admin, 'effect-engine-provenance.json')});
  assert.deepEqual(readFileSync(join(admin, 'public/effect-studio/index.html')), editorBefore);
});

function objectScene() {
  return {format: 'efekt-atolyesi', version: 2, kind: 'objectScene', name: 'Minimal object', seed: 'chunk3', sceneId: 'minimal', viewport: {width: 400, height: 300},
    objects: [{id: 'candle', name: 'Candle', visible: true, pose: {x: .1, y: .1, width: .4, height: .6, rotation: 0, depth: 0}, anchors: [{id: 'wick', x: .5, y: .2}]}],
    effects: ['flame', 'glow', 'smoke'].map(type => ({id: type, type, enabled: true, seed: 'fixed', params: defaultObjectParams(type), target: {kind: 'sceneObject', objectId: 'candle', anchorId: 'wick', offset: {x: 0, y: 0}, scale: 1, depth: 0}}))};
}

test('vendored minimal sceneObject compiles and draws flame, glow and smoke', {timeout: 120000}, () => {
  const compiled = compileObjectScene(importProject(JSON.stringify(objectScene())));
  assert.equal(compiled.effects.length, 3);
  let draws = 0;
  const gradient = {addColorStop() {}};
  const ctx = {canvas: {width: 120, height: 180}, save() {}, restore() {}, beginPath() {}, moveTo() {}, bezierCurveTo() {}, closePath() {}, translate() {}, scale() {}, arc() {},
    fill() {draws++;}, fillRect() {draws++;}, createRadialGradient() {return gradient;}};
  for (const layer of compiled.effects) {
    assert.equal(layer.objectId, 'candle');
    const instance = layer.create({params: layer.params, random: seededRandom(layer.seed)});
    const before = draws;
    for (let i = 0; i < 10; i++) {instance.update(.1); instance.render(ctx, {width: 120, height: 180});}
    assert.ok(draws > before, layer.id + ' draws');
    assert.ok(instance.inspect().active > 0, layer.id + ' active');
    instance.destroy();
  }
  const bad = objectScene(); bad.effects[0].target.objectId = 'missing';
  assert.throws(() => importProject(JSON.stringify(bad)));
});

test('site adapter keeps original static image for malformed or invalid scenes and reduced motion', {timeout: 120000}, async t => {
  const names = ['document', 'window', 'navigator', 'location', 'matchMedia', 'fetch'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.after(() => {for (const [name, descriptor] of previous) {if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];}});
  const events = {addEventListener() {}, removeEventListener() {}};
  let requests = 0, reduced = false, payload = '{invalid json';
  const image = {...events, dataset: {}, complete: true, naturalWidth: 400, naturalHeight: 300, isConnected: true, matches: selector => selector === 'img', getAttribute: () => '/assets/site/media/hero.png'};
  const root = {...events, querySelectorAll: () => [image]};
  const globals = {document: {...events, baseURI: 'https://local.test/'}, window: events, location: {origin: 'https://local.test'}, navigator: {},
    matchMedia: () => ({...events, matches: reduced}), fetch: async () => {requests++; return {ok: true, text: async () => payload};}};
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, {value, configurable: true});
  const binding = [{slot: 'hero', source: '/assets/site/media/hero.png', url: '/scene.json'}];
  // A visible active v1 layer passes the cheap gate, then fails canonical validation.
  const invalid = {photo: {width: 400, height: 300}, zones: [{id: 'zone', visible: true}], effects: [{enabled: true, zoneId: 'zone', type: 'unknown'}]};
  for (const value of ['{invalid json', JSON.stringify(invalid), JSON.stringify(objectScene())]) {
    payload = value;
    const dispose = mountEffects(binding, root);
    await new Promise(done => setTimeout(done, 30));
    assert.equal(image.dataset.effectState, 'static');
    assert.equal(image.getAttribute('src'), '/assets/site/media/hero.png');
    dispose();
  }
  const before = requests; reduced = true;
  const dispose = mountEffects(binding, root);
  await new Promise(done => setTimeout(done, 10));
  assert.equal(requests, before);
  dispose();
});

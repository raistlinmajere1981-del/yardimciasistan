import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import {join} from 'node:path';
import {createPackage} from '@electron/asar';
import {createRequire} from 'node:module';
import {validatePe} from './lib/windows-native-image.mjs';
import {verifyWindowsInstallerPayload} from './lib/windows-installer-native.mjs';

for (const arch of ['x64', 'ia32']) {
  const file = `apps/desktop-app/resources/native-image/image.win32-${arch}-msvc.node`;
  const bytes = readFileSync(file);
  assert.doesNotThrow(() => validatePe(bytes, arch));
  assert.throws(() => validatePe(bytes, arch === 'x64' ? 'ia32' : 'x64'));
  assert.throws(() => validatePe(Buffer.from('ELF'), arch));
}
const result = spawnSync(process.execPath, ['scripts/prepare-desktop-windows-native-image.mjs', '--check'], {encoding:'utf8'});
assert.equal(result.status, 0, result.stderr);
const boot = ts.transpileModule(readFileSync('apps/desktop-app/electron/windows-native-bootstrap.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
for (const [platform, packaged, arch, expected] of [
  ['win32', true, 'x64', '/resources/native-image/image.win32-x64-msvc.node'],
  ['win32', true, 'ia32', '/resources/native-image/image.win32-ia32-msvc.node'],
  ['linux', true, 'x64', 'external'], ['win32', false, 'x64', 'external']
]) {
  const env = {NAPI_RS_NATIVE_LIBRARY_PATH:'external'};
  let loaded = false;
  vm.runInNewContext(boot, {exports:{}, process:{platform, arch, resourcesPath:'/resources', env}, require(id) {
    if (id === 'electron') return {app:{isPackaged:packaged}};
    if (id === 'node:path') return {join:(...parts) => parts.join('/')};
    if (id === './main-entry') { assert.equal(env.NAPI_RS_NATIVE_LIBRARY_PATH, expected); loaded = true; return {}; }
    throw Error(id);
  }});
  assert.ok(loaded);
}
const temporary = mkdtempSync('/tmp/opencode/native-image-test-');
try {
  const source = join(temporary, 'source');
  const resources = join(temporary, 'out/resources');
  mkdirSync(join(source, 'node_modules/@napi-rs/image'), {recursive:true});
  mkdirSync(join(source, 'dist-electron'), {recursive:true});
  mkdirSync(join(resources, 'native-image'), {recursive:true});
  writeFileSync(join(source, 'node_modules/@napi-rs/image/package.json'), JSON.stringify({version:'1.15.0'}));
  writeFileSync(join(source, 'node_modules/@napi-rs/image/index.js'), 'module.exports = {};');
  writeFileSync(join(source, 'package.json'), JSON.stringify({main:'dist-electron/windows-native-bootstrap.js', version:'2.1.0'}));
  writeFileSync(join(source, 'dist-electron/windows-native-bootstrap.js'), 'test');
  await createPackage(source, join(resources, 'app.asar'));
  const verify = createRequire(import.meta.url)('./verify-desktop-windows-native-after-pack.cjs');
  const context = {electronPlatformName:'win32', arch:1, appOutDir:join(temporary, 'out')};
  await assert.rejects(verify(context));
  copyFileSync('apps/desktop-app/resources/native-image/image.win32-x64-msvc.node', join(resources, 'native-image/image.win32-x64-msvc.node'));
  await verify(context);
  writeFileSync(join(resources, 'native-image/image.win32-x64-msvc.node'), 'ELF');
  await assert.rejects(verify(context));
  const x86 = {...context, arch:0};
  await assert.rejects(verify(x86));
  copyFileSync('apps/desktop-app/resources/native-image/image.win32-ia32-msvc.node', join(resources, 'native-image/image.win32-ia32-msvc.node'));
  await verify(x86);
  // The release gate must inspect the payload archive itself, not a stale unpacked directory.
  const archive = join(temporary, 'payload.7z');
  const tool = await createRequire(import.meta.url)('app-builder-lib/out/toolsets/7zip').getPath7za();
  const pack = () => {
    rmSync(archive, {force:true});
    const result = spawnSync(tool, ['a', '-t7z', archive, 'resources'], {cwd:join(temporary, 'out'), encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
  };
  const expected = readFileSync('apps/desktop-app/resources/native-image/image.win32-x64-msvc.node');
  const options = {tool, expected, imageVersion:'1.15.0', appVersion:'2.1.0', payloadArchive:true};
  copyFileSync('apps/desktop-app/resources/native-image/image.win32-x64-msvc.node', join(resources, 'native-image/image.win32-x64-msvc.node'));
  pack();
  await verifyWindowsInstallerPayload(archive, 'x64', options);
  rmSync(join(resources, 'native-image/image.win32-x64-msvc.node'));
  pack();
  await assert.rejects(verifyWindowsInstallerPayload(archive, 'x64', options));
  copyFileSync('apps/desktop-app/resources/native-image/image.win32-ia32-msvc.node', join(resources, 'native-image/image.win32-x64-msvc.node'));
  pack();
  await assert.rejects(verifyWindowsInstallerPayload(archive, 'x64', options));
} finally { rmSync(temporary, {recursive:true, force:true}); }
console.log('windows-native-image-ok');

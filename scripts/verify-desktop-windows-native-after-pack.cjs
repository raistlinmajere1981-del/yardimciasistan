const {spawnSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const {join, resolve} = require('node:path');
const {extractFile} = require('@electron/asar');

module.exports = async function verifyWindowsNativeAfterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const root = resolve(__dirname, '..');
  const check = spawnSync(process.execPath, [join(root, 'scripts/prepare-desktop-windows-native-image.mjs'), '--check'], {encoding:'utf8'});
  if (check.status !== 0) throw Error(`Windows native image staging doğrulanamadı: ${check.stderr}`);
  const arch = {0:'ia32', 1:'x64'}[context.arch];
  if (!arch) throw Error(`Desteklenmeyen Windows paket mimarisi: ${context.arch}`);
  const file = `image.win32-${arch}-msvc.node`;
  const expected = readFileSync(join(root, 'apps/desktop-app/resources/native-image', file));
  const actual = readFileSync(join(context.appOutDir, 'resources/native-image', file));
  if (!actual.equals(expected)) throw Error('Paketlenmiş Windows native image doğrulanamadı.');
  const asar = join(context.appOutDir, 'resources/app.asar');
  const packageJson = JSON.parse(extractFile(asar, 'node_modules/@napi-rs/image/package.json').toString());
  const appJson = JSON.parse(extractFile(asar, 'package.json').toString());
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  if (packageJson.version !== lock.packages['node_modules/@napi-rs/image'].version) throw Error('Paketlenmiş @napi-rs/image sürümü lockfile ile uyuşmuyor.');
  if (appJson.main !== 'dist-electron/windows-native-bootstrap.js') throw Error('Paketlenmiş Electron giriş noktası geçersiz.');
  extractFile(asar, 'dist-electron/windows-native-bootstrap.js');
  extractFile(asar, 'node_modules/@napi-rs/image/index.js');
  console.log(`Windows native image afterPack verified: ${arch} ${packageJson.version}`);
};

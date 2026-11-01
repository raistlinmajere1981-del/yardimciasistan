import {spawnSync} from 'node:child_process';
import {closeSync, mkdtempSync, openSync, readFileSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {extractFile} from '@electron/asar';
import {extractVerifiedImage, validatePe} from './windows-native-image.mjs';

const require = createRequire(import.meta.url);

// Extract exact archive members to private temporary files; never trust an old win-unpacked directory.
export async function verifyWindowsInstallerPayload(installer, arch, {tool, expected, imageVersion, appVersion, payloadArchive = false} = {}) {
  if (!['x64', 'ia32'].includes(arch)) throw Error('Geçersiz Windows mimarisi.');
  const builderRequire = createRequire(require.resolve('electron-builder/package.json'));
  tool ??= await builderRequire('app-builder-lib/out/toolsets/7zip').getPath7za();
  const temp = mkdtempSync(join(tmpdir(), 'ya-windows-native-'));
  try {
    const extract = (archive, member, destination, limit, type) => {
      const fd = openSync(destination, 'wx');
      try {
        const result = spawnSync(tool, ['x', '-so', '-bd', `-t${type}`, archive, member], {stdio:['ignore', fd, 'pipe'], maxBuffer:1024 * 1024});
        if (result.status !== 0 || result.error) throw Error(`Windows kurucu içeriği okunamadı: ${member}`);
      } finally { closeSync(fd); }
      const size = statSync(destination).size;
      if (size < 1 || size > limit) throw Error(`Windows kurucu içeriği eksik veya çok büyük: ${member}`);
    };
    let payload = installer;
    if (!payloadArchive) {
      payload = join(temp, 'payload.7z');
      extract(installer, `$PLUGINSDIR/app-${arch === 'x64' ? '64' : '32'}.7z`, payload, 1024 * 1024 * 1024, 'NSIS');
    }
    const native = join(temp, 'image.node');
    extract(payload, `resources/native-image/image.win32-${arch}-msvc.node`, native, 64 * 1024 * 1024, '7z');
    const bytes = readFileSync(native);
    validatePe(bytes, arch);
    if (!expected || !bytes.equals(expected)) throw Error('Windows kurucu native image lockfile ile uyuşmuyor.');
    const asar = join(temp, 'app.asar');
    extract(payload, 'resources/app.asar', asar, 512 * 1024 * 1024, '7z');
    const app = JSON.parse(extractFile(asar, 'package.json'));
    const image = JSON.parse(extractFile(asar, 'node_modules/@napi-rs/image/package.json'));
    if (app.main !== 'dist-electron/windows-native-bootstrap.js' || app.version !== appVersion || image.version !== imageVersion) throw Error('Windows kurucu uygulama giriş noktası veya sürümü uyuşmuyor.');
    if (!extractFile(asar, 'dist-electron/windows-native-bootstrap.js').length || !extractFile(asar, 'node_modules/@napi-rs/image/index.js').length) throw Error('Windows kurucu başlangıç dosyası eksik.');
  } finally { rmSync(temp, {recursive:true, force:true}); }
}

export async function verifyWindowsReleaseNative(root, installer, arch, appVersion) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const main = lock.packages['node_modules/@napi-rs/image'];
  const name = `image-win32-${arch}-msvc`;
  const entry = lock.packages[`node_modules/@napi-rs/${name}`];
  if (!main?.version || entry?.version !== main.version || main.optionalDependencies?.[`@napi-rs/${name}`] !== main.version) throw Error('Windows native image lockfile sürümü uyuşmuyor.');
  const tarball = readFileSync(join(root, 'apps/desktop-app/resources/native-image', `${name}-${main.version}.tgz`));
  const expected = extractVerifiedImage(tarball, entry, arch, main.version);
  await verifyWindowsInstallerPayload(installer, arch, {expected, imageVersion:main.version, appVersion});
}

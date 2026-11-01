import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {extractVerifiedImage} from './lib/windows-native-image.mjs';

const root = resolve(import.meta.dirname, '..');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const main = lock.packages['node_modules/@napi-rs/image'];
const installed = JSON.parse(readFileSync(join(root, 'node_modules/@napi-rs/image/package.json'), 'utf8'));
if (!main?.version || installed.version !== main.version) throw Error('@napi-rs/image kurulu sürümü lockfile ile uyuşmuyor.');
const dir = join(root, 'apps/desktop-app/resources/native-image');
const check = process.argv.includes('--check');
if (!check) mkdirSync(dir, {recursive:true});
for (const arch of ['x64', 'ia32']) {
  const name = `image-win32-${arch}-msvc`;
  const entry = lock.packages[`node_modules/@napi-rs/${name}`];
  if (!entry || entry.version !== main.version || main.optionalDependencies?.[`@napi-rs/${name}`] !== main.version || entry.resolved !== `https://registry.npmjs.org/@napi-rs/${name}/-/${name}-${main.version}.tgz`) throw Error(`Native image lockfile girdisi geçersiz: ${arch}`);
  const archive = join(dir, `${name}-${main.version}.tgz`);
  if (!existsSync(archive)) {
    if (check) throw Error(`Native image önbelleği eksik: ${arch}`);
    const response = await fetch(entry.resolved, {signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw Error(`Native image indirilemedi: ${response.status}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 64 * 1024 * 1024) throw Error('Native image tarball çok büyük.');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    extractVerifiedImage(bytes, entry, arch, main.version);
    writeFileSync(archive, bytes);
  }
  const bytes = extractVerifiedImage(readFileSync(archive), entry, arch, main.version);
  const target = join(dir, `image.win32-${arch}-msvc.node`);
  if (check) {
    if (!existsSync(target) || !readFileSync(target).equals(bytes)) throw Error(`Native image hazırlanan dosya uyuşmuyor: ${arch}`);
  } else if (!existsSync(target) || !readFileSync(target).equals(bytes)) writeFileSync(target, bytes);
  console.log(`native-image ${arch} ${main.version} verified`);
}

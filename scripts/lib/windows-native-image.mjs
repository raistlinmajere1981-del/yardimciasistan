import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

export function validatePe(bytes, arch) {
  const machine = {x64: 0x8664, ia32: 0x14c}[arch];
  if (!machine || bytes.length < 1024 || bytes.length > 64 * 1024 * 1024 || bytes.toString('ascii', 0, 2) !== 'MZ') throw Error('Native image PE boyutu veya DOS imzası geçersiz.');
  const offset = bytes.readUInt32LE(60);
  if (offset > bytes.length - 24 || bytes.readUInt32LE(offset) !== 0x4550 || bytes.readUInt16LE(offset + 4) !== machine) throw Error(`Native image PE mimarisi geçersiz: ${arch}`);
}

export function extractVerifiedImage(tarball, entry, arch, version) {
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity) || `sha512-${createHash('sha512').update(tarball).digest('base64')}` !== entry.integrity) throw Error(`Native image tarball SHA512 uyuşmazlığı: ${arch}`);
  const extract = path => {
    const result = spawnSync('tar', ['-xzOf', '-', path], {input:tarball, maxBuffer:64 * 1024 * 1024});
    if (result.status !== 0 || result.error) throw Error(`Native image tarball okunamadı: ${path}`);
    return result.stdout;
  };
  const manifest = JSON.parse(extract('package/package.json').toString('utf8'));
  if (manifest.name !== `@napi-rs/image-win32-${arch}-msvc` || manifest.version !== version) throw Error('Native image paket kimliği veya sürümü uyuşmuyor.');
  const bytes = extract(`package/image.win32-${arch}-msvc.node`);
  validatePe(bytes, arch);
  return bytes;
}

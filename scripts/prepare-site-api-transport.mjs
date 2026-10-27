#!/usr/bin/env node
// Bind a staged canonical business site to its explicit installation target.
// Site data, public page gates and the API implementation remain unchanged.
import {existsSync, readFileSync, writeFileSync, renameSync, lstatSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';

const args = process.argv.slice(2);
const mode = args.includes('--write') ? 'write' : 'check';
const installationIdx = args.indexOf('--installation');
const rootIdx = args.indexOf('--root');
if (installationIdx < 0 || rootIdx < 0 || !args[installationIdx+1] || !args[rootIdx+1]) {
  console.error('Usage: node scripts/prepare-site-api-transport.mjs --installation market-pilot|teknikel|gundogdu --root /site/stage [--write]');
  process.exit(2);
}
const id = args[installationIdx+1];
if (!['market-pilot','teknikel','gundogdu'].includes(id)) throw Error('Unsupported target');
const registry = JSON.parse(readFileSync(new URL('../config/installations.json', import.meta.url), 'utf8'));
const installation = registry.installations?.[id];
if (!installation) throw Error('Missing installation');
const origin = installation.siteUrl;
const destination = installation.deploy?.remoteRoot;
const host = installation.deploy?.host;
if (!/^https:\/\/[a-z0-9.-]+\.alwaysdata\.net$/.test(origin)
  || !/^[a-z0-9-]+@ssh-[a-z0-9-]+\.alwaysdata\.net$/.test(host)
  || destination !== `/home/${host.split('@')[0]}/www/yardimci-asistan`
  || installation.webModuleUrl !== origin + '/yardimci-asistan') {
  throw Error('Installation site/API/hosting contract does not match');
}
const stage = resolve(args[rootIdx+1]);
const configFile = join(stage, 'site/config.php');
if (!existsSync(join(stage, 'template-manifest.json')) || !existsSync(configFile) || lstatSync(configFile).isSymbolicLink()) {
  throw Error('Not a valid canonical site stage');
}
let content = readFileSync(configFile, 'utf8');
if (!content.includes("'api_base_path' => '/yardimci-asistan'")) throw Error('Unexpected API base path');
const replaceExactlyOne = (source, pattern, value, label) => {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))];
  if (matches.length !== 1) throw Error('Expected one '+label+', found '+matches.length);
  return source.replace(pattern, value);
};
content = replaceExactlyOne(content,
  /^[ \t]*'public_origin'\s*=>\s*getenv\('YA_SITE_PUBLIC_ORIGIN'\)\s*\?:\s*'[^']*',/m,
  `    'public_origin' => getenv('YA_SITE_PUBLIC_ORIGIN') ?: '${origin}',`, 'public origin');
content = replaceExactlyOne(content,
  /^[ \t]*'api_origin'\s*=>\s*getenv\('YA_SITE_API_ORIGIN'\)\s*\?:\s*'[^']*',/m,
  `    'api_origin' => getenv('YA_SITE_API_ORIGIN') ?: '${origin}',`, 'API origin');
// Remove only the existing, site-owned transport declarations before writing
// canonical versions. Repeat writes must be byte-for-byte idempotent.
content = content.replace(/^[ \t]*\/\/ Same-host (?:public API|published API)[^\n]*\n/gm, '');
content = content.replace(/^[ \t]*\/\/ Calls only the canonical read-only public endpoints via PHP CLI\.\n/gm, '');
content = content.replace(/^[ \t]*'local_api_root'\s*=>[^\n]*\n/gm, '');
content = content.replace(/^[ \t]*'php_cli_binary'\s*=>[^\n]*\n/gm, '');
content = replaceExactlyOne(content,
  /^([ \t]*'api_base_path'\s*=>\s*'\/yardimci-asistan',)/m,
  `$1\n    // Same-host public API transport on restricted/one-worker PHP hosting.\n    'local_api_root' => '${destination}',\n    'php_cli_binary' => '/usr/bin/php',`, 'API base path');
if (mode === 'check') {
  if (content !== readFileSync(configFile, 'utf8')) throw Error('Site transport configuration is stale for '+id);
  console.log('site-api-transport-ok:',id,origin);
} else {
  const tmp = configFile + '.staged';
  writeFileSync(tmp, content);
  const syntax = spawnSync('php',['-l',tmp],{encoding:'utf8'});
  if (syntax.status !== 0) {
    throw Error('Generated PHP syntax is invalid: '+syntax.stderr);
  }
  renameSync(tmp, configFile);
  console.log('site-api-transport-written:',id,origin);
}

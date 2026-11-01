import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createReadStream,existsSync,readFileSync,readdirSync,statSync,lstatSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {checkProductVersion} from '../product-version.mjs';
import {readWindowsInstallerVersion} from './windows-installer-version.mjs';
import {verifyWindowsReleaseNative} from './windows-installer-native.mjs';

export async function fileDigest(path) {
  if(!existsSync(path)||!lstatSync(path).isFile()||statSync(path).size<1)throw Error(`Release dosyası eksik veya boş: ${path}`);
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path))hash.update(chunk);
  return {size:statSync(path).size,sha256:hash.digest('hex')};
}

function androidTools() {
  const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||join(homedir(),'Android','Sdk');
  const root=join(sdk,'build-tools');
  const versions=existsSync(root)?readdirSync(root).filter(value=>/^\d+(?:\.\d+)+$/.test(value)).sort((a,b)=>b.localeCompare(a,'en',{numeric:true})):[];
  const tools=versions.map(version=>join(root,version)).find(path=>existsSync(join(path,'aapt2'))&&existsSync(join(path,'apksigner')));
  if(!tools)throw Error('Android SDK Build Tools (aapt2 ve apksigner) bulunamadı. ANDROID_HOME ayarını kontrol edin.');
  return {aapt2:join(tools,'aapt2'),apksigner:join(tools,'apksigner')};
}

export function refreshReleaseCertificate(root) {
  const result=spawnSync(process.execPath,[join(root,'scripts/run-android-gradle.mjs'),'--offline','writeReleaseSigningMetadata'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
  // Never forward tool output: a tool failure must not disclose keystore configuration.
  if(result.status!==0)throw Error('Kalıcı Android release imzası doğrulanamadı. validateReleaseSigning görevini ve harici keystore ayarlarını kontrol edin.');
  const metadata=JSON.parse(readFileSync(join(root,'apps/android-app/build/release-signing/certificate.json'),'utf8'));
  if(!/^[a-f0-9]{64}$/.test(metadata.sha256))throw Error('Release imza doğrulama girdisi geçersiz.');
  return metadata.sha256;
}

export function verifyAndroidRelease(path,metadataPath,{applicationId,version,versionCode,certificateSha256},tools=androidTools()) {
  const metadata=JSON.parse(readFileSync(metadataPath,'utf8')),entry=metadata.elements?.[0];
  if(metadata.applicationId!==applicationId||metadata.variantName!=='release'||metadata.elements?.length!==1||entry?.versionCode!==versionCode||entry?.versionName!==version||entry?.outputFile!==basename(path))throw Error(`${applicationId}: Gradle release metadata kimliği/sürümü uyuşmuyor.`);
  const badging=spawnSync(tools.aapt2,['dump','badging',path],{encoding:'utf8',maxBuffer:2*1024*1024});
  const identity=badging.stdout?.match(/^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/m);
  if(badging.status!==0||!identity||identity[1]!==applicationId||Number(identity[2])!==versionCode||identity[3]!==version||/^application-debuggable\b/m.test(badging.stdout))throw Error(`${applicationId}: APK içindeki sürüm, kimlik veya release niteliği geçersiz.`);
  const signature=spawnSync(tools.apksigner,['verify','--verbose','--print-certs',path],{encoding:'utf8',maxBuffer:2*1024*1024});
  // Build Tools 35/36 report 'Signer #1', while 37 reports 'V2 Signer:'.
  // Both must contain exactly one verified signer with our release certificate.
  const output=signature.stdout||'';
  const signerCount=output.match(/^Number of signers: (\d+)\s*$/m);
  const certificates=[...output.matchAll(/^(?:Signer #\d+|V\d+(?:\.\d+)? Signer:) certificate SHA-256 digest: ([a-fA-F0-9]{64})\s*$/gm)].map(match=>match[1].toLowerCase());
  if(signature.status!==0||!signerCount||Number(signerCount[1])!==1||certificates.length!==1||certificates[0]!==certificateSha256)throw Error(`${applicationId}: APK imzası geçersiz veya kalıcı release anahtarıyla eşleşmiyor.`);
  return {signatureVerified:true,applicationId,versionCode};
}

/** Existing landing deployment and Admin use this one artifact verification owner. */
export async function createReleaseArtifacts(root,{certificateProvider=refreshReleaseCertificate,verifyAndroid=verifyAndroidRelease,verifyWindowsNative=verifyWindowsReleaseNative}={}) {
  root=resolve(root);
  const product=checkProductVersion(root),version=product.version;
  const android=join(root,'apps/android-app/build/outputs/apk/release');
  const dealer=join(root,'apps/dealer-android-app/build/outputs/apk/release');
  const artifacts=[
    {label:'Windows x64',source:join(root,'dist/desktop',`YardimciAsistan-Setup-${version}.exe`),name:`YardimciAsistan-Setup-${version}.exe`,arch:'x64'},
    {label:'Windows x86',source:join(root,'dist/desktop',`YardimciAsistan-Setup-${version}-x86.exe`),name:`YardimciAsistan-Setup-${version}-x86.exe`,arch:'ia32'},
    {label:'Android Companion',source:join(android,'yardimci-asistan-release.apk'),name:`YardimciAsistan-Android-${version}.apk`,applicationId:'com.yardimciasistan.android',metadataPath:join(android,'output-metadata.json')},
    {label:'Bayi Android',source:join(dealer,'yardimci-asistan-bayi-release.apk'),name:`YardimciAsistan-Bayi-Android-${version}.apk`,applicationId:'com.yardimciasistan.dealer',metadataPath:join(dealer,'output-metadata.json')}
  ];
  // Missing artifacts fail before Gradle/signing tool invocation.
  for(const artifact of artifacts)Object.assign(artifact,await fileDigest(artifact.source));
  for(const artifact of artifacts.filter(item=>item.arch))await verifyWindowsNative(root,artifact.source,artifact.arch,version);
  const certificateSha256=certificateProvider(root);
  for(const artifact of artifacts) {
    if(artifact.applicationId)Object.assign(artifact,verifyAndroid(artifact.source,artifact.metadataPath,{applicationId:artifact.applicationId,version,versionCode:product.androidVersionCode,certificateSha256}));
    else {
      const actual=readWindowsInstallerVersion(artifact.source);
      if(actual.fileVersion!==`${version}.0`||actual.productVersion!==`${version}.0`)throw Error(`${artifact.label}: EXE içindeki ürün/dosya sürümü uyuşmuyor.`);
    }
  }
  return {product,artifacts};
}

export function createWindowsUpdateManifests(product,artifacts,notes=[],publishedAt=new Date().toISOString()) {
  return artifacts.filter(artifact=>artifact.arch).map(artifact=>({
    label:artifact.label,platformDir:artifact.arch==='ia32'?'win-x86':'win-x64',version:product.version,sha256:artifact.sha256,
    value:{format:'yardimci-asistan-update',version:1,channel:'stable',appVersion:product.version,publishedAt,platform:'win32',arch:artifact.arch,notes,
      artifact:{file:artifact.name,url:`../../../downloads/${artifact.name}`,size:artifact.size,sha256:artifact.sha256}}
  }));
}

/**
 * Android stable feeds share the already verified release APK authority.
 * Never derive update details from arbitrary upload names or debug artifacts.
 */
export function createAndroidUpdateManifests(product,artifacts,notes=[],publishedAt=new Date().toISOString()) {
  if(!product || !/^\d+\.\d+\.\d+$/.test(product.version) || !Number.isSafeInteger(product.androidVersionCode) || product.androidVersionCode<1)throw Error('Android update: ürün sürümü geçersiz.');
  const channels=[
    {label:'Android Companion',platformDir:'android-companion',applicationId:'com.yardimciasistan.android',file:`YardimciAsistan-Android-${product.version}.apk`},
    {label:'Bayi Android',platformDir:'android-dealer',applicationId:'com.yardimciasistan.dealer',file:`YardimciAsistan-Bayi-Android-${product.version}.apk`}
  ];
  return channels.map(channel=>{
    const matches=artifacts.filter(entry=>entry.applicationId===channel.applicationId);
    if(matches.length!==1)throw Error(`Android update: ${channel.applicationId} için tek doğrulanmış release APK gerekli.`);
    const artifact=matches[0];
    if(artifact.signatureVerified!==true || artifact.versionCode!==product.androidVersionCode || artifact.name!==channel.file
       || !Number.isSafeInteger(artifact.size) || artifact.size<1 || !/^[a-f0-9]{64}$/.test(artifact.sha256)
       || !artifact.source)throw Error(`Android update: ${channel.applicationId} APK doğrulaması eksik.`);
    return {label:channel.label,platformDir:channel.platformDir,version:product.version,versionCode:product.androidVersionCode,
      applicationId:channel.applicationId,file:artifact.name,sha256:artifact.sha256,
      value:{format:'yardimci-asistan-update',version:1,channel:'stable',platform:'android',
        applicationId:channel.applicationId,appVersion:product.version,versionName:product.version,
        versionCode:product.androidVersionCode,publishedAt,notes,
        artifact:{file:artifact.name,url:`../../../downloads/${artifact.name}`,size:artifact.size,sha256:artifact.sha256}}
    };
  });
}

/** Non-secret destination identity, kept outside the public API package. */
export function createWebModuleTarget({installationId = '', moduleUrl, siteOrigin, allowedOrigins}) {
  const invalid = () => { throw Error('Web modülü yayın hedefi geçersiz.'); };
  const url = value => {
    let parsed;
    try { parsed = new URL(value); } catch { return invalid(); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) invalid();
    return parsed;
  };
  if (typeof installationId !== 'string' || (installationId && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(installationId))) invalid();
  if (allowedOrigins !== undefined && !Array.isArray(allowedOrigins)) invalid();
  const module = url(moduleUrl), site = url(siteOrigin ?? module.origin);
  if (site.pathname !== '/') invalid();
  const origins = [...new Set((allowedOrigins ?? [site.origin]).map(value => {
    const origin = url(value);
    if (origin.pathname !== '/') invalid();
    return origin.origin;
  }))].sort();
  if (!origins.length || !origins.includes(site.origin)) invalid();
  return {version:1, installation_id:installationId, module_url:module.href.replace(/\/+$/, ''), site_origin:site.origin, allowed_origins:origins};
}

export function validateWebModuleTarget(candidate, expected, business) {
  if (!candidate || candidate.version !== 1 || typeof candidate.installation_id !== 'string' || typeof candidate.module_url !== 'string' || typeof candidate.site_origin !== 'string' || !Array.isArray(candidate.allowed_origins)) throw Error('Hazırlanmış web modülünün yayın hedefi eksik; hedef için yeniden hazırlayın.');
  const target = createWebModuleTarget({installationId:candidate.installation_id, moduleUrl:candidate.module_url, siteOrigin:candidate.site_origin, allowedOrigins:candidate.allowed_origins});
  if (expected) {
    const destination = createWebModuleTarget(expected);
    if (target.installation_id !== destination.installation_id || target.module_url !== destination.module_url || target.site_origin !== destination.site_origin
        || (expected.allowedOrigins !== undefined && JSON.stringify(target.allowed_origins) !== JSON.stringify(destination.allowed_origins))) throw Error('Hazırlanmış web modülü beklenen yayın hedefiyle eşleşmiyor; hedef için yeniden hazırlayın.');
  }
  if (business) {
    const configTarget = createWebModuleTarget({installationId:target.installation_id, moduleUrl:target.module_url, siteOrigin:business.website, allowedOrigins:business.allowed_origins});
    if (JSON.stringify(configTarget) !== JSON.stringify(target)) throw Error('Web modülü config ve yayın hedefi eşleşmiyor.');
  }
  return target;
}

export async function validatePreparedWebModule(root, {target, requireSecret = true} = {}) {
  const product=checkProductVersion(root),output=join(root,'artifacts/web-module-deploy'),packageRoot=join(output,'yardimci-asistan');
  const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));
  if(manifest.product_version!==product.version||manifest.web_module_version!==product.webModuleVersion||!Array.isArray(manifest.files)||manifest.file_count!==manifest.files.length)throw Error('Hazırlanmış web modülü manifesti sürümle eşleşmiyor; pack:release çalıştırın.');
  const paths=new Set(manifest.files.map(entry=>entry.path));
  if(manifest.package_name!=='yardimci-asistan'||paths.size!==manifest.files.length||['api/sync.php','api/version.php','lib/storage.php','config/version.json','config/business.json','data/.htaccess'].some(path=>!paths.has(path)))throw Error('Web modülü paketi zorunlu API/config/güvenlik dosyalarını içermiyor.');
  const version=JSON.parse(readFileSync(join(packageRoot,'config/version.json'),'utf8'));
  if(version.product_version!==product.version||version.web_module_version!==product.webModuleVersion)throw Error('Web modülü paket sürümü eşleşmiyor.');
  const business=JSON.parse(readFileSync(join(packageRoot,'config/business.json'),'utf8'));
  if(requireSecret && (typeof business.sync_secret!=='string'||business.sync_secret.length<32))throw Error('Temiz web kurulumu yapılandırılmamış. prepare:web-install --installation ya --no-print-secret çalıştırın.');
  if (target || manifest.deployment_target) validateWebModuleTarget(manifest.deployment_target, target, business);
  for(const entry of manifest.files) {
    const path=resolve(packageRoot,entry.path);
    if(!path.startsWith(packageRoot+'/'))throw Error('Web modülü manifest yolu geçersiz.');
    const actual=await fileDigest(path);
    if(actual.sha256!==entry.sha256||actual.size!==entry.bytes)throw Error(`Web modülü paket hash/boyut uyuşmazlığı: ${entry.path}`);
  }
  for(const archive of manifest.archives ?? []) {
    if(archive.status!=='created')continue;
    const path=resolve(root,archive.path);
    if(!path.startsWith(output+'/'))throw Error('Web modülü arşiv yolu geçersiz.');
    const actual=await fileDigest(path);
    if(actual.sha256!==archive.sha256||actual.size!==archive.bytes)throw Error('Web modülü arşiv SHA-256/boyut doğrulaması başarısız.');
  }
  return {productVersion:product.version,webModuleVersion:product.webModuleVersion,fileCount:manifest.files.length};
}

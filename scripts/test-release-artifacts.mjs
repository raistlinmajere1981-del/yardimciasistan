import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createReleaseArtifacts,createWindowsUpdateManifests,createAndroidUpdateManifests,createWebModuleTarget,validateWebModuleTarget,validatePreparedWebModule,verifyAndroidRelease,fileDigest} from './lib/release-artifacts.mjs';
import {readWindowsInstallerVersion} from './lib/windows-installer-version.mjs';
import {readHtmlInputValue} from './lib/demo-deployment.mjs';
import {getInstallation} from './lib/installation-registry.mjs';

const version='2.0.11',code=15,certificate='a'.repeat(64);
function write(path,value){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));}
function peFixture(productVersion=version){
  const data=Buffer.alloc(1024),pe=128,optional=pe+24,section=optional+224,resource=512;
  data.write('MZ');data.writeUInt32LE(pe,60);data.writeUInt32LE(0x4550,pe);data.writeUInt16LE(1,pe+6);data.writeUInt16LE(224,pe+20);data.writeUInt16LE(0x10b,optional);
  data.writeUInt32LE(0x1000,optional+112);data.writeUInt32LE(180,optional+116);data.writeUInt32LE(0x1000,section+12);data.writeUInt32LE(512,section+16);data.writeUInt32LE(resource,section+20);
  for(const [offset,id,child] of [[0,16,0x80000018],[24,1,0x80000030],[48,1033,72]]){data.writeUInt16LE(1,resource+offset+14);data.writeUInt32LE(id,resource+offset+16);data.writeUInt32LE(child,resource+offset+20);}
  data.writeUInt32LE(0x1058,resource+72);data.writeUInt32LE(92,resource+76);
  const value=resource+88;data.writeUInt16LE(92,value);data.writeUInt16LE(52,value+2);Buffer.from('VS_VERSION_INFO\0','utf16le').copy(data,value+6);
  data.writeUInt32LE(0xfeef04bd,value+40);
  const [major,minor,patch]=productVersion.split('.').map(Number);
  for(const offset of [48,56]){data.writeUInt32LE(major*65536+minor,value+offset);data.writeUInt32LE(patch*65536,value+offset+4);}
  return data;
}
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'ya-release-tools-'));
  write(join(root,'product-version.json'),{version,androidVersionCode:code,webModuleVersion:version});
  for(const name of ['desktop-app','android-app'])write(join(root,'apps',name,'package.json'),{version});
  write(join(root,'package-lock.json'),{packages:{'apps/desktop-app':{version},'apps/android-app':{version}}});
  write(join(root,'firm-template/web-module/config/version.json'),{product_version:version,web_module_version:version});
  write(join(root,'test-site/landing/release.json'),{desktopVersion:version,androidVersion:version,dealerAndroidVersion:version});
  for(const suffix of ['', '-x86'])write(join(root,`dist/desktop/YardimciAsistan-Setup-${version}${suffix}.exe`),peFixture());
  const paths=[];
  for(const [app,id,name] of [['android-app','com.yardimciasistan.android','yardimci-asistan-release.apk'],['dealer-android-app','com.yardimciasistan.dealer','yardimci-asistan-bayi-release.apk']]){
    const directory=join(root,'apps',app,'build/outputs/apk/release'),path=join(directory,name);
    write(path,{id,version,code,certificate,valid:true});
    write(join(directory,'output-metadata.json'),{applicationId:id,variantName:'release',elements:[{versionName:version,versionCode:code,outputFile:name}]});paths.push(path);
  }
  const bin=join(root,'sdk/build-tools/37.0.0');
  write(join(bin,'aapt2'),`#!${process.execPath}\nconst p=JSON.parse(require('fs').readFileSync(process.argv.at(-1)));console.log(\`package: name='\${p.id}' versionCode='\${p.code}' versionName='\${p.version}'\`);if(p.debuggable)console.log('application-debuggable');`);
  write(join(bin,'apksigner'),`#!${process.execPath}\nconst p=JSON.parse(require('fs').readFileSync(process.argv.at(-1)));console.log('Number of signers: '+(p.extraSigner?2:1));console.log((p.legacy?'Signer #1':'V2 Signer:')+' certificate SHA-256 digest: '+p.certificate);if(p.extraSigner)console.log('V2 Signer: certificate SHA-256 digest: '+p.certificate);if(!p.valid)process.exit(1);`);
  for(const tool of ['aapt2','apksigner'])chmodSync(join(bin,tool),0o755);
  const options={verifyWindowsNative:async()=>{},certificateProvider:()=>certificate,verifyAndroid:(path,metadata,expectation)=>verifyAndroidRelease(path,metadata,expectation,{aapt2:join(bin,'aapt2'),apksigner:join(bin,'apksigner')})};
  return {root,paths,options,dispose:()=>rmSync(root,{recursive:true,force:true})};
}

test('deployment reads demo secret input regardless of CSS classes or attribute order',()=>{
  const secret='verify-only-placeholder-123';
  for (const input of [
    `<input id="demo-sync-secret" readonly value="${secret}">`,
    `<input id="demo-sync-secret" class="secret-input" readonly value="${secret}">`,
    `<input type="text" value="${secret}" readonly class="secret-input" id='demo-sync-secret'>`
  ]) {
    assert.equal(readHtmlInputValue(`<html><body>${input}</body></html>`,'demo-sync-secret'),secret);
  }
  assert.equal(readHtmlInputValue('<input id="other" value="wrong">','demo-sync-secret'),null);
  assert.equal(readHtmlInputValue('<input id="demo-sync-secret" readonly>','demo-sync-secret'),null);
  assert.equal(readHtmlInputValue('<input id="demo-sync-secret" value="a&amp;b&quot;c&#039;d">','demo-sync-secret'),'a&b"c\'d');
});

test('release verifies real PE resources, APK identities, Gradle versions and signing, then hashes four canonical outputs',async()=>{
  const f=fixture();try{
    const {product,artifacts}=await createReleaseArtifacts(f.root,f.options);
    assert.equal(product.version,version);assert.equal(artifacts.length,4);
    assert.equal(artifacts[3].name,`YardimciAsistan-Bayi-Android-${version}.apk`);
    for(const artifact of artifacts)assert.deepEqual(await fileDigest(artifact.source),{size:artifact.size,sha256:artifact.sha256});
    const feeds=createWindowsUpdateManifests(product,artifacts,['Release ready'],'2026-10-25T00:00:00Z');
    assert.deepEqual(feeds.map(feed=>feed.value.arch),['x64','ia32']);
    for(const feed of feeds){const artifact=artifacts.find(a=>a.sha256===feed.sha256);assert.equal(feed.value.artifact.sha256,artifact.sha256);assert.equal(feed.value.appVersion,version);}
  }finally{f.dispose();}
});

test('Android stable feeds bind exact package, versionCode, signed APK hash and same-origin download',async()=> {
  const f=fixture();try{
    const {product,artifacts}=await createReleaseArtifacts(f.root,f.options);
    const feeds=createAndroidUpdateManifests(product,artifacts,['Özet'],'2026-11-01T00:00:00.000Z');
    assert.deepEqual(feeds.map(feed=>feed.platformDir),['android-companion','android-dealer']);
    assert.deepEqual(feeds.map(feed=>feed.applicationId),['com.yardimciasistan.android','com.yardimciasistan.dealer']);
    assert.equal(feeds.length,2);
    for(const feed of feeds){
      const apk=artifacts.find(artifact=>artifact.applicationId===feed.applicationId);
      assert.ok(apk?.signatureVerified);
      assert.equal(feed.value.format,'yardimci-asistan-update');
      assert.equal(feed.value.version,1);
      assert.equal(feed.value.channel,'stable');
      assert.equal(feed.value.platform,'android');
      assert.equal(feed.value.appVersion,version);
      assert.equal(feed.value.versionName,version);
      assert.equal(feed.value.versionCode,code);
      assert.equal(feed.value.artifact.file,apk.name);
      assert.equal(feed.value.artifact.sha256,apk.sha256);
      assert.equal(feed.value.artifact.size,apk.size);
      assert.deepEqual(feed.value.notes,['Özet']);
      const base=`https://example.org/updates/stable/${feed.platformDir}/release.json`;
      const url=new URL(feed.value.artifact.url,base);
      assert.equal(url.origin,'https://example.org');
      assert.equal(url.pathname,`/downloads/${apk.name}`);
      assert.equal(url.protocol,'https:');
    }
    const windows=createWindowsUpdateManifests(product,artifacts);
    assert.deepEqual(windows.map(item=>item.platformDir),['win-x64','win-x86']);
  }finally{f.dispose();}
});

test('Android stable feeds fail closed for missing or mismatched trusted release metadata',async()=> {
  const f=fixture();try{
    const {product,artifacts}=await createReleaseArtifacts(f.root,f.options);
    for(const mutate of [
      entries=>entries.filter(a=>a.applicationId!=='com.yardimciasistan.dealer'),
      entries=>entries.map(a=>a.applicationId==='com.yardimciasistan.dealer'?{...a,signatureVerified:false}:a),
      entries=>entries.map(a=>a.applicationId==='com.yardimciasistan.dealer'?{...a,versionCode:code-1}:a),
      entries=>entries.map(a=>a.applicationId==='com.yardimciasistan.dealer'?{...a,name:'../../bad.apk'}:a),
      entries=>entries.map(a=>a.applicationId==='com.yardimciasistan.dealer'?{...a,sha256:'incorrect'}:a),
      entries=>entries.concat(entries.find(a=>a.applicationId==='com.yardimciasistan.dealer')),
    ])assert.throws(()=>createAndroidUpdateManifests(product,mutate(artifacts)),/Android update:/);
    assert.throws(()=>createAndroidUpdateManifests({...product,androidVersionCode:code-1},artifacts),/Android update:/);
  }finally{f.dispose();}
});

test('native installer preflight runs for both architectures and blocks release on failure',async()=>{
  const f=fixture();try{
    const seen=[];
    await createReleaseArtifacts(f.root,{...f.options,verifyWindowsNative:async(_root,_path,arch)=>{seen.push(arch);}});
    assert.deepEqual(seen,['x64','ia32']);
    await assert.rejects(createReleaseArtifacts(f.root,{...f.options,verifyWindowsNative:async()=>{throw Error('native payload missing');}}),/native payload missing/);
  }finally{f.dispose();}
});

test('APK signing accepts Build Tools 36 and 37 certificate labels but not two signers',async()=>{
  const f=fixture();
  try {
    for(const path of f.paths){
      const payload=JSON.parse(readFileSync(path));
      payload.legacy=true;
      write(path,payload);
    }
    const result=await createReleaseArtifacts(f.root,f.options);
    assert.equal(result.artifacts.filter(artifact=>artifact.signatureVerified).length,2);
  }finally{f.dispose();}
});

test('renamed old EXE, unsigned/wrong-key/debug APK and stale Gradle metadata all fail closed',async()=>{
  const mutations=[
    f=>write(join(f.root,`dist/desktop/YardimciAsistan-Setup-${version}.exe`),peFixture('2.0.10')),
    f=>{const path=f.paths[1],p=JSON.parse(readFileSync(path));p.valid=false;write(path,p);},
    f=>{const path=f.paths[1],p=JSON.parse(readFileSync(path));p.certificate='b'.repeat(64);write(path,p);},
    f=>{const path=f.paths[1],p=JSON.parse(readFileSync(path));p.extraSigner=true;write(path,p);},
    f=>{const path=f.paths[1],p=JSON.parse(readFileSync(path));p.debuggable=true;write(path,p);},
    f=>{const path=f.paths[1],p=JSON.parse(readFileSync(path));p.code=14;write(path,p);},
    f=>{const path=join(dirname(f.paths[1]),'output-metadata.json'),p=JSON.parse(readFileSync(path));p.variantName='debug';write(path,p);},
    f=>{const path=join(dirname(f.paths[1]),'output-metadata.json'),p=JSON.parse(readFileSync(path));p.elements[0].versionName+='-pilot';write(path,p);}
  ];
  for(const mutate of mutations){const f=fixture();try{mutate(f);await assert.rejects(createReleaseArtifacts(f.root,f.options));}finally{f.dispose();}}
});

test('missing and malformed files stop before signing; a missing key never becomes a successful release',async()=>{
  const f=fixture();try{
    let called=false;rmSync(f.paths[0]);
    await assert.rejects(createReleaseArtifacts(f.root,{...f.options,certificateProvider:()=>{called=true;return certificate;}}),/eksik veya boş/);assert.equal(called,false);
    write(f.paths[0],'');await assert.rejects(fileDigest(f.paths[0]),/boş/);
    write(join(f.root,'bad.exe'),'renamed text');assert.throws(()=>readWindowsInstallerVersion(join(f.root,'bad.exe')));
  }finally{f.dispose();}
  const key=fixture();try{await assert.rejects(createReleaseArtifacts(key.root,{...key.options,certificateProvider:()=>{throw Error('missing signing configuration');}}),/missing signing/);}finally{key.dispose();}
});

async function webFixture(root,{target,business={}}={}){
  const directory=join(root,'artifacts/web-module-deploy/yardimci-asistan');
  write(join(directory,'config/version.json'),{product_version:version,web_module_version:version});
  write(join(directory,'config/business.json'),{sync_secret:'fixture-key-not-a-live-secret-'.repeat(2),...(target?{website:target.siteOrigin,allowed_origins:target.allowedOrigins??[target.siteOrigin]}:{}),...business});
  for(const path of ['api/version.php','api/sync.php','lib/storage.php','data/.htaccess'])write(join(directory,path),'fixture');
  const files=[];
  for(const path of ['config/version.json','config/business.json','api/version.php','api/sync.php','lib/storage.php','data/.htaccess']){const actual=await fileDigest(join(directory,path));files.push({path,bytes:actual.size,sha256:actual.sha256});}
  write(join(root,'artifacts/web-module-deploy/manifest.json'),{package_name:'yardimci-asistan',product_version:version,web_module_version:version,file_count:files.length,files,...(target?{deployment_target:createWebModuleTarget(target)}:{})});
}

test('web module target normalizes public destination identity and rejects ambiguous URLs',()=>{
  const target=createWebModuleTarget({installationId:'fixture-demo',moduleUrl:'https://demo.example/yardimci-asistan/',siteOrigin:'https://demo.example/'});
  assert.deepEqual(target,{version:1,installation_id:'fixture-demo',module_url:'https://demo.example/yardimci-asistan',site_origin:'https://demo.example',allowed_origins:['https://demo.example']});
  for(const moduleUrl of ['https://user:password@demo.example/yardimci-asistan','https://demo.example/yardimci-asistan?target=x','https://demo.example/yardimci-asistan#fragment','file:///tmp/module'])assert.throws(()=>createWebModuleTarget({moduleUrl}),/hedefi geçersiz/);
  assert.throws(()=>createWebModuleTarget({moduleUrl:'https://demo.example/yardimci-asistan',siteOrigin:'https://demo.example/private'}),/hedefi geçersiz/);
  assert.throws(()=>createWebModuleTarget({moduleUrl:'https://demo.example/yardimci-asistan',siteOrigin:'https://demo.example',allowedOrigins:['https://other.example']}),/hedefi geçersiz/);
  assert.throws(()=>createWebModuleTarget({moduleUrl:'https://demo.example/yardimci-asistan',allowedOrigins:'https://demo.example'}),/hedefi geçersiz/);
  assert.throws(()=>validateWebModuleTarget({...target,site_origin:undefined}),/yayın hedefi eksik/);
  const multiple={installationId:'fixture-demo',moduleUrl:target.module_url,siteOrigin:target.site_origin,allowedOrigins:['https://extra.example','https://demo.example']};
  assert.equal(validateWebModuleTarget(createWebModuleTarget(multiple),{installationId:multiple.installationId,moduleUrl:multiple.moduleUrl,siteOrigin:multiple.siteOrigin}).allowed_origins.length,2,'Explicit secondary origins remain supported when the destination does not restrict them');
  assert.throws(()=>validateWebModuleTarget(createWebModuleTarget(multiple),{...multiple,allowedOrigins:['https://demo.example']}),/beklenen yayın hedefiyle eşleşmiyor/);
});

test('prepared package target binds the same verified bytes to demo or BlackSea before deployment',async()=>{
  const targets=[{installationId:'fixture-demo',moduleUrl:'https://demo.example/yardimci-asistan',siteOrigin:'https://demo.example'},
    {installationId:'fixture-blacksea',moduleUrl:'https://blacksea.example/yardimci-asistan',siteOrigin:'https://blacksea.example'}];
  for(const [index,target] of targets.entries()) {
    const f=fixture();try{
      await webFixture(f.root,{target});
      const checked=await validatePreparedWebModule(f.root,{target});
      assert.equal(checked.webModuleVersion,version);
      await assert.rejects(validatePreparedWebModule(f.root,{target:targets[1-index]}),/beklenen yayın hedefiyle eşleşmiyor/);
      for(const change of [{installationId:'wrong-installation'},{moduleUrl:target.moduleUrl+'-other'},{siteOrigin:'https://wrong.example'}])await assert.rejects(validatePreparedWebModule(f.root,{target:{...target,...change}}),/beklenen yayın hedefiyle eşleşmiyor/);
      assert.ok(!JSON.stringify(checked).includes('fixture-key'));
    }finally{f.dispose();}
  }
});

test('prepared package target rejects missing identity and config metadata disagreement without leaking secrets',async()=>{
  const target={installationId:'fixture-demo',moduleUrl:'https://demo.example/yardimci-asistan',siteOrigin:'https://demo.example'};
  const f=fixture();try{
    await webFixture(f.root);
    await assert.rejects(validatePreparedWebModule(f.root,{target}),/yayın hedefi eksik/);
    await webFixture(f.root,{target,business:{website:'https://wrong.example',allowed_origins:['https://wrong.example']}});
    await assert.rejects(validatePreparedWebModule(f.root,{target}),error=>/config ve yayın hedefi eşleşmiyor/.test(error.message)&&!error.message.includes('fixture-key'));
    await webFixture(f.root,{target,business:{allowed_origins:['https://demo.example','https://unexpected.example']}});
    await assert.rejects(validatePreparedWebModule(f.root,{target}),/config ve yayın hedefi eşleşmiyor/);
    assert.throws(()=>validateWebModuleTarget({...createWebModuleTarget(target),module_url:'https://other.example/yardimci-asistan'},target),/beklenen yayın hedefiyle eşleşmiyor/);
  }finally{f.dispose();}
});

test('prepared fresh web package verifies canonical versions and every packaged byte without leaking its key',async()=>{
  const f=fixture();try{
    await webFixture(f.root);const checked=await validatePreparedWebModule(f.root);
    assert.equal(checked.webModuleVersion,version);assert.equal(JSON.stringify(checked).includes('fixture-key'),false);
    write(join(f.root,'artifacts/web-module-deploy/yardimci-asistan/api/version.php'),'changed');
    await assert.rejects(validatePreparedWebModule(f.root),/hash\/boyut/);
  }finally{f.dispose();}
});

test('combined deploy dry-run uses the same prepared artifacts and only read-only mocked transports',async()=>{
  const f=fixture();try{
    const repository=process.cwd();
    cpSync(join(repository,'test-site/landing'),join(f.root,'test-site/landing'),{recursive:true});
    cpSync(join(repository,'web-site-template'),join(f.root,'web-site-template'),{recursive:true});
    // The copied landing site belongs to the current release; normalize its
    // release metadata to this isolated fixture's deliberately older version.
    write(join(f.root,'test-site/landing/release.json'),{desktopVersion:version,androidVersion:version,dealerAndroidVersion:version});
    for(const path of ['scripts/sync-demo-template.mjs','scripts/product-version.mjs','scripts/lib/demo-deployment.mjs','scripts/lib/installation-registry.mjs','scripts/lib/release-artifacts.mjs','scripts/lib/windows-installer-version.mjs','config/installations.json']){mkdirSync(dirname(join(f.root,path)),{recursive:true});cpSync(join(repository,path),join(f.root,path));}
    // This transport-only fixture has synthetic PE files, not NSIS installers.
    write(join(f.root,'scripts/lib/windows-installer-native.mjs'),'export async function verifyWindowsReleaseNative() {}');
    write(join(f.root,'package.json'),{private:true,scripts:{'build:demo':'node -e "process.exit(0)"'}});
    const moduleUrl=getInstallation('ya',f.root).webModuleUrl;
    await webFixture(f.root,{target:{installationId:'ya',moduleUrl,siteOrigin:new URL(getInstallation('landing',f.root).siteUrl).origin}});
    write(join(f.root,'scripts/run-android-gradle.mjs'),`import{mkdirSync,writeFileSync}from'node:fs';mkdirSync('apps/android-app/build/release-signing',{recursive:true});writeFileSync('apps/android-app/build/release-signing/certificate.json',JSON.stringify({sha256:'${certificate}'}));`);
    const log=join(f.root,'calls.jsonl'),bin=join(f.root,'bin');
    for(const name of ['ssh','scp','rsync']){
      write(join(bin,name),`#!${process.execPath}\nconst fs=require('fs'),args=process.argv.slice(2);fs.appendFileSync(process.env.TEST_CALLS,JSON.stringify({tool:'${name}',args})+'\\n');if('${name}'==='scp')process.exit(9);if('${name}'==='rsync'&&!args.includes('-azn'))process.exit(9);if('${name}'==='ssh'&&args.at(-1).includes('cat '))console.log('__MISSING__');if('${name}'==='ssh'&&args.at(-1).includes('hash_file'))console.log('__MISSING__');`);chmodSync(join(bin,name),0o755);
    }
    write(join(f.root,'scripts/deploy-web.sh'),'#!/bin/sh\nprintf "%s\\n" "$*" > "$TEST_WEB_CALL"\ncase "$*" in *--dry-run*) exit 0;; *) exit 9;; esac\n');
    const result=spawnSync(process.execPath,[join(f.root,'test-site/landing/scripts/deploy.mjs'),'--with-downloads','--fresh-web-module','--activate-updates','--dry-run'],{cwd:f.root,env:{...process.env,PATH:bin+':'+process.env.PATH,ANDROID_HOME:join(f.root,'sdk'),TEST_CALLS:log,TEST_WEB_CALL:join(f.root,'web-call.txt')},encoding:'utf8',maxBuffer:4*1024*1024});
    assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
    assert.match(result.stdout,/Dry-run tamamlandi/);assert.ok(!result.stdout.includes('fixture-key'));
    for(const feed of ['win-x64','win-x86','android-companion','android-dealer'])
      assert.match(result.stdout,new RegExp(`/updates/stable/${feed}/release\\.json`));
    assert.match(readFileSync(join(f.root,'web-call.txt'),'utf8'),/--fresh --skip-pack --dry-run/);
    const calls=readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(calls.some(call=>call.tool==='scp'),false);
    for(const call of calls.filter(call=>call.tool==='ssh'))assert.ok(!/\b(?:mv|mkdir|rm|cp)\b/.test(call.args.at(-1)));
    for(const call of calls.filter(call=>call.tool==='rsync'))assert.ok(call.args.includes('-azn'));
  }finally{f.dispose();}
});

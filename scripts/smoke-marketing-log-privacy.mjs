import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, rmSync, readdirSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

// Execute the real diagnostics boundary, without Electron startup or live services.
const root=mkdtempSync(join(tmpdir(),'marketing-log-privacy-')),cache=new Map(),terminal=[];
const testConsole={warn:(...args)=>terminal.push(args),error:(...args)=>terminal.push(args)};
let supportBody='';
const electron={ipcMain:{handle:()=>{}},app:{getVersion:()=> 'fixture',isPackaged:false},net:{fetch:async(_url,init)=>{supportBody=gunzipSync(Buffer.from(init.body)).toString('utf8');return Response.json({ok:true,report_id:'fixture_report'});}}};
function load(file) {
  file=resolve(file);if(cache.has(file))return cache.get(file);
  const exports={},localRequire=createRequire(file);cache.set(file,exports);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  runInNewContext(code,{exports,Buffer,Error,URL,AbortController,console:testConsole,setTimeout,clearTimeout,
    process:{platform:process.platform,arch:process.arch,versions:process.versions,on:()=>{}},
    require:name=>name==='electron'?electron:name.startsWith('./')?load(join(dirname(file),name.replace(/\.js$/,'')+'.ts')):localRequire(name)});
  return exports;
}
try {
  const privacy=load('apps/desktop-app/electron/marketing-diagnostic-redaction.ts');
  const token='ab'.repeat(32),url=`https://fixture.invalid/module/api/instagram-media.php/${token}.jpg?signature=QUERY_CANARY`;
  const targets=[url,encodeURIComponent(url),encodeURIComponent(encodeURIComponent(url)),url.replaceAll('/','\\/'),`/module/api/instagram-media.php?token=${token}`,`/data/instagram-staging/1234567890.${token}.jpg`,`/api//instagram-media.php/${token}.jpg`,`/api/other/../instagram-media.php/${token}.jpg`,`/api/instagram-media.php%00/${token}.jpg`];
  for(const target of targets) {
    const scrubbed=privacy.redactMarketingDiagnosticText(`failed ${target}`);assert.equal(scrubbed,'failed [instagram-staging:redacted]');
  }
  const hostingLog=join(root,'hosting-error.log'),hostingInput=targets.map(target=>`[warn] request_fixture ${target}\n`).join('')+'[error] unrelated storage unavailable\n';
  const pipe=spawnSync('php',['infrastructure/hosting/instagram-staging-log-filter.php',hostingLog],{input:hostingInput,encoding:'utf8'});assert.equal(pipe.status,0,pipe.stderr);
  const hostingOutput=readFileSync(hostingLog,'utf8');assert.equal(hostingOutput.includes(token),false);assert.equal(hostingOutput.includes('QUERY_CANARY'),false);assert.equal((hostingOutput.match(/\[instagram-staging:redacted\]/g)??[]).length,targets.length);assert.ok(hostingOutput.includes('[error] unrelated storage unavailable'));
  assert.equal(privacy.redactMarketingDiagnosticText('GET https://fixture.invalid/api/catalog.php'), 'GET https://fixture.invalid/api/catalog.php');
  const logger=load('apps/desktop-app/electron/desktop-logger.ts');
  logger.initializeDesktopLogging({dataRoot:root,appVersion:'fixture',packaged:false});
  const privateKeys=['key','hash','api_hash','apiHash','accessToken','recipient','recipients','receipents','caption','smsText','body','requestBody','responseBody','rawProviderResponse','image_url','stagePath','queryString'];
  const meta=Object.fromEntries(privateKeys.map((key,i)=>[key,`META_CANARY_${i}`]));
  meta.nested=[{authentication:{key:'KEY_CANARY',hash:'HASH_CANARY'},message:{text:'BODY_CANARY',receipents:{number:['905550001122']}}}];
  meta.providerId='iletimerkezi';meta.category='iys_rejected';meta.captionLength=12;
  logger.desktopLog.error({scope:'sms',event:'sms.provider.send.failed',operationId:'outbox_fixture',message:'SMS gönderimi tamamlanamadı.',meta,
    error:new Error(`network ${url}\nhash=HASH_CANARY\ncaption=CAPTION_CANARY\n${JSON.stringify({key:'KEY_CANARY',text:'BODY_CANARY',recipient:'905550001122'})}`)});
  logger.writeRendererDiagnostic({level:'WARN',scope:'instagram',event:'instagram.publish.failed',operationId:'publication_fixture',message:`failed ${url}`,meta:{rawResponse:'RAW_CANARY',status:503}});
  testConsole.error({apiHash:'HASH_CANARY',caption:'CAPTION_CANARY',url},`recipient=905550001122`);
  const result=logger.readDiagnosticSession({limit:100});
  assert.ok(result.events.some(e=>e.scope==='sms'&&e.event==='sms.provider.send.failed'&&e.level==='ERROR'&&e.operationId==='outbox_fixture'));
  const sms=result.events.find(e=>e.scope==='sms');assert.equal(sms.meta.providerId,'iletimerkezi');assert.equal(sms.meta.category,'iys_rejected');assert.equal(sms.meta.captionLength,12);assert.equal(sms.error.name,'Error');assert.ok(sms.error.stack);
  const session=join(root,'logs/sessions',result.session.sessionId),disk=readdirSync(session).filter(name=>name.endsWith('.jsonl')).map(name=>readFileSync(join(session,name),'utf8')).join('');
  for(const output of [disk,JSON.stringify(result.events),JSON.stringify(terminal)])for(const secret of [token,'QUERY_CANARY','KEY_CANARY','HASH_CANARY','BODY_CANARY','CAPTION_CANARY','RAW_CANARY','905550001122',...privateKeys.map((_,i)=>`META_CANARY_${i}`)])assert.equal(output.includes(secret),false,'private data leaked into diagnostic/terminal output');
  // Old log chunks are not rewritten; the real support export re-scrubs them before mock transport.
  appendFileSync(join(session,'events-001.jsonl'),JSON.stringify({sequence:999,level:'ERROR',scope:'instagram',event:'instagram.publish.failed',message:`old ${url}`,meta:{apiHash:'OLD_HASH_CANARY',caption:'OLD_CAPTION_CANARY',rawResponse:'OLD_RESPONSE_CANARY'},error:{message:`caption=OLD_CAPTION_CANARY`,stack:`old ${url}`}})+'\n');
  const support=load('apps/desktop-app/electron/support-report-service.ts');assert.equal((await support.sendSupportReport(root,{note:`failed ${url}`})).ok,true);
  for(const secret of [token,'QUERY_CANARY','OLD_HASH_CANARY','OLD_CAPTION_CANARY','OLD_RESPONSE_CANARY'])assert.equal(supportBody.includes(secret),false,'old-session private data leaked into support export');
  assert.ok(supportBody.includes('instagram.publish.failed'));logger.finalizeDesktopLogging('test');
  console.log('Marketing log privacy: main/renderer JSONL, recursive metadata, error stacks, console output and encoded staging paths passed; safe event fields retained.');
} finally {rmSync(root,{recursive:true,force:true});}

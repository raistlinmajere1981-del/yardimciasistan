import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,cpSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import tls from 'node:tls';
import {createRequire} from 'node:module';
import {createTemporaryDesktopDatabase} from './desktop-database.mjs';
const require = createRequire(import.meta.url);
const {BUSINESS_CAPABILITIES:C} = require('../../packages/shared/dist/index.js');
const {PhpHostingSyncTransport} = require('../../packages/sync-core/dist/index.js');
const {publishDesktopProjection} = require('../../apps/desktop-app/dist-electron/desktop-publication-service.js');
export const accountPassword = 'Account-fixture-Password-249!';
export async function accountFixture({smtp = true, siteSource, providers = false} = {}) {
  const root = mkdtempSync(join(tmpdir(),'ya-customer-account-'));
  if (siteSource) cpSync(siteSource,root,{recursive:true,filter:path=>!/(\/\.git|\/node_modules|\/\.test-artifacts|\/yardimci-asistan)(\/|$)/.test(path)});
  const hosting = join(root,'yardimci-asistan');
  cpSync('firm-template/web-module',hosting,{recursive:true,filter:path=>!/(\/data|\/vendor)(\/|$)/.test(path)});
  mkdirSync(join(hosting,'data'),{recursive:true});
  const secret = 'isolated-customer-account-test-secret';
  writeFileSync(join(hosting,'config/business.json'),JSON.stringify({name:'Account Fixture',sync_secret:secret}));
  const emails = []; let smtpServer;
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('YA_ACCOUNT_')) delete env[key];
  if (smtp) {
    const cert = join(root,'smtp.pem'), key = join(root,'smtp.key');
    const openssl = spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{encoding:'utf8'});
    assert.equal(openssl.status,0,openssl.stderr);
    smtpServer = tls.createServer({key:readFileSync(key),cert:readFileSync(cert)},socket=>{
      socket.write('220 fixture ESMTP\r\n'); let buffer='',data=false,body='',auth=0;
      socket.on('error',()=>{});
      socket.on('data',chunk=>{
        buffer+=chunk.toString();
        while(buffer.includes('\r\n')) {
          const end=buffer.indexOf('\r\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+2);
          if(data){ if(line==='.') {emails.push(Buffer.from(body.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString());data=false;socket.write('250 accepted\r\n');} else body+=line+'\r\n';continue; }
          if(auth){auth--;socket.write(auth ? '334 password\r\n':'235 authenticated\r\n');}
          else if(line.startsWith('EHLO')) socket.write('250-fixture\r\n250 AUTH LOGIN\r\n');
          else if(line==='AUTH LOGIN'){auth=2;socket.write('334 username\r\n');}
          else if(line==='DATA'){data=true;body='';socket.write('354 data\r\n');}
          else if(line==='QUIT'){socket.end('221 bye\r\n');}
          else socket.write('250 ok\r\n');
        }
      });
    });
    await new Promise(resolve=>smtpServer.listen(0,'127.0.0.1',resolve));
    Object.assign(env,{YA_ACCOUNT_SMTP_HOST:'127.0.0.1',YA_ACCOUNT_SMTP_PORT:String(smtpServer.address().port),YA_ACCOUNT_SMTP_TLS:'implicit',YA_ACCOUNT_SMTP_USER:'fixture-user',YA_ACCOUNT_SMTP_PASSWORD:'fixture-password',YA_ACCOUNT_MAIL_FROM:'accounts@example.test',SSL_CERT_FILE:cert});
  }
  const port = await new Promise(resolve=>{const server=http.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
  const siteUrl=`http://127.0.0.1:${port}`, baseUrl=siteUrl+'/yardimci-asistan';
  Object.assign(env,{YA_ACCOUNT_SITE_URL:siteUrl+'/hesabim/',YA_ACCOUNT_MODULE_URL:baseUrl});
  if(providers) Object.assign(env,{YA_ACCOUNT_GOOGLE_CLIENT_ID:'fixture-google-id',YA_ACCOUNT_GOOGLE_CLIENT_SECRET:'fixture-google-secret',YA_ACCOUNT_FACEBOOK_CLIENT_ID:'fixture-facebook-id',YA_ACCOUNT_FACEBOOK_CLIENT_SECRET:'fixture-facebook-secret',YA_ACCOUNT_FACEBOOK_VERSION:'v24.0'});
  const server=spawn('php',['-S',`127.0.0.1:${port}`,'-t',root],{env,stdio:['ignore','pipe','pipe']});
  let logs=''; for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{logs+=chunk;});
  for(let i=0;;i++){try{if((await fetch(baseUrl+'/api/account/config.php')).ok)break;}catch{}if(i>100)throw new Error(logs);await new Promise(resolve=>setTimeout(resolve,30));}
  const desktop=createTemporaryDesktopDatabase('ya-account-desktop-'),{database}=desktop;
  database.initialize();
  const setup=database.saveInitialSetup({businessName:'Account Fixture',profileId:'market',profileOptions:[C.WHOLESALE,C.ONLINE_SALES],dealerPortalEnabled:true,
    onlineSalesDeliveryEnabled:true,onlineSalesDelivery:{pickupEnabled:true,shippingEnabled:false},phone:'',whatsapp:'',email:'',address:'',webModuleUrl:'https://example.test/yardimci-asistan',syncSecret:secret,autoSyncEnabled:false,aiEnabled:false,aiProvider:'openai_compatible',aiService:'openai',aiProjectName:'',aiModel:'',aiModelOptions:[],aiBaseUrl:'https://api.openai.com/v1',aiTimeoutSeconds:30,aiApiKey:'',clearAiApiKey:false,servicePreferences:{whatsapp:false,android:false},initialCounts:{rooms:0,tables:0},tableCategories:[]});
  assert.equal(setup.ok,true,setup.message);
  const transport=new PhpHostingSyncTransport({baseUrl,syncSecret:secret,clientId:database.getSyncRuntimeStatus().clientId,sourceEpoch:1});
  const publish=async(expectSuccess=true)=>{const value=database.createDealerAccessProjection();const result=await publishDesktopProjection(database,{baseUrl,syncSecret:secret},'dealer_access_publish',value,(identity,value)=>transport.publishDealerAccess({sourceRevision:identity.sourceRevision,idempotencyKey:identity.idempotencyKey,value}));if(expectSuccess)assert.equal(result?.ok,true,result?.message);return result;};
  function storage(code,args=[]){const result=spawnSync('php',['-r',`require $argv[1]; $_SERVER['SCRIPT_NAME']='/yardimci-asistan/api/account/callback.php'; $db=ya_storage_open(); ${code}`,join(hosting,'lib/customer-account-oauth.php'),...args],{encoding:'utf8',env:{...env,YA_ACCOUNT_SITE_URL:'https://fixture.example/hesabim/',YA_ACCOUNT_MODULE_URL:'https://fixture.example/yardimci-asistan/'}});assert.equal(result.status,0,result.stderr);return result.stdout?JSON.parse(result.stdout):null;}
  async function call(endpoint,body,cookie='',headers={}){const response=await fetch(`${baseUrl}/api/${endpoint}.php`,{method:body===undefined?'GET':'POST',headers:{Accept:'application/json',...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json','X-YA-Account':'1','X-YA-Dealer':'1'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});let value;const text=await response.text();try{value=JSON.parse(text);}catch{value=text;}return {status:response.status,body:value,cookie:response.headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>/ya_account_(session|refresh)=/.test(x)).sort().reverse().join('; '),headers:response.headers};}
  const login=async(email,client='web')=>{const result=await call('account/login',{email,password:accountPassword},'',{'X-YA-Client':client});assert.equal(result.status,200,JSON.stringify(result.body));assert.match(result.cookie,/ya_account_session=/);return result.cookie;};
  async function register(email,name='Account Fixture'){const result=await call('account/register',{email,fullName:name});assert.equal(result.status,200,JSON.stringify(result.body));const token=new URL(emails.at(-1).match(/https?:\/\/[^\s]+/)[0]).hash.slice(7);assert.equal((await call('account/verify',{token,password:accountPassword})).status,200);return storage('echo json_encode($db->query("SELECT id FROM customer_accounts WHERE email = " . $db->quote($argv[2]))->fetchColumn());',[email]);}
  return {root,hosting,siteUrl,baseUrl,secret,database,transport,storage,call,login,register,publish,emails,logs:()=>logs,
    async cleanup(){server.kill();if(smtpServer)await new Promise(resolve=>smtpServer.close(resolve));desktop.cleanup();rmSync(root,{recursive:true,force:true});}};
}

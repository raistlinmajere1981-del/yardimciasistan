import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {accountFixture,accountPassword} from './test-helpers/customer-accounts.mjs';
const require=createRequire(import.meta.url);
const {BUSINESS_CAPABILITIES:C}=require('../packages/shared/dist/index.js');
const {WebSyncIngress}=require('../apps/desktop-app/dist-electron/web-sync-ingress.js');
const f=await accountFixture({providers:true});
const {database,call,storage,transport}=f;
let raw;
const token=async()=>{await f.runCommerceMail();return new URL(f.emails.at(-1).match(/https?:\/\/[^\s]+/)[0]).hash.slice(7);};
const stage=text=>console.log('PASS',text);
try {
  assert.deepEqual((await call('account/config')).body,{ok:true,enabled:false,passwordRegistration:false,site_url:"",providers:[]});
  assert.equal((await call('account/login',{email:'a@example.test',password:accountPassword})).status,403);
  await f.publish();
  assert.equal((await call('account/config')).body.enabled,true);
  assert.equal((await call('dealer/claim',{invite_token:'a'.repeat(43)})).status,404);
  const registered=await call('account/register',{email:'new@example.test',fullName:'New Customer',password:'Attacker-preregister-123'});
  assert.equal(registered.status,200,JSON.stringify(registered.body));assert.equal(JSON.stringify(registered.body).includes(await token()),false);
  assert.equal(storage('echo json_encode($db->query("SELECT password_hash FROM customer_accounts WHERE email=\'new@example.test\'")->fetchColumn());'),'','unverified account must never store a preregistration password');
  assert.equal((await call('account/login',{email:'new@example.test',password:'Attacker-preregister-123'})).body.code,'invalid_credentials');
  const verifyToken=await token();
  assert.equal((await call('account/verify',{token:verifyToken,password:accountPassword})).status,200);
  assert.equal((await call('account/verify',{token:verifyToken,password:accountPassword})).status,400);
  assert.equal((await call('account/login',{email:'new@example.test',password:'Attacker-preregister-123'})).status,401,'verification must choose its own password, preventing preregistration takeover');
  const queued=storage("echo json_encode($db->query(\"SELECT body FROM commerce_mail_outbox WHERE message_kind='account_token' LIMIT 1\")->fetchColumn());");
  assert.equal(queued.includes(verifyToken),false,'verification bearer never appears in durable plaintext');
  assert.equal(queued.includes('https://'),false,'token URL is sealed at rest');
  const web=await f.login('new@example.test'),android=await f.login('new@example.test','android');assert.notEqual(web,android);
  const profile=(await call('account/session',undefined,web)).body.account;assert.equal(profile.email,'new@example.test');assert.equal(profile.dealer,null);
  const stored=storage('echo json_encode($db->query("SELECT password_hash FROM customer_accounts LIMIT 1")->fetchColumn());');assert.match(stored,/^\$argon2id\$/);assert.equal(stored.includes(accountPassword),false);
  stage('real local TLS SMTP, registration, mailbox proof, password hashing and independent web/Android sessions');
  storage(`require dirname($argv[1]) . '/commerce-mail.php'; ya_commerce_mail_enqueue($db, 'tls-order-event', 'new@example.test', 'Order fixture', 'Durable order fixture');`);
  assert.equal((await f.runCommerceMail()).sent, 1);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(f.emails.at(-1).includes('Durable order fixture'), 'durable commerce mail uses the same verified TLS SMTP transport as account mail');
  stage('durable commerce outbox delivered through real local TLS SMTP');

  const ingress=new WebSyncIngress({database},()=>'',()=>{});
  let pulled=await ingress.pullCustomerAccountPages(transport);assert.equal(pulled.error,'');assert.equal(pulled.count,1);
  assert.equal((await ingress.pullCustomerAccountPages(transport)).count,0);
  const fresh=database.listCustomers({}).items.find(x=>x.email==='new@example.test');assert.ok(fresh);assert.equal(fresh.source,'web-account');
  assert.equal(database.getDealerWebAccess(fresh.id).accountId,profile.id);
  const existing=database.saveCustomer({fullName:'Existing Customer',email:'existing@example.test',phone:'',notes:'PRIVATE_ACCOUNT_NOTE'});assert.equal(existing.ok,true,existing.message);
  const existingId=await f.register('existing@example.test','Existing Web');
  pulled=await ingress.pullCustomerAccountPages(transport);assert.equal(pulled.count,1);assert.equal(pulled.error,'');
  assert.equal(database.getDealerWebAccess(existing.savedId).accountId,'','email alone cannot transfer a customer');
  assert.equal(database.getDealerWebAccess(existing.savedId).linkCandidates[0].accountId,existingId);
  assert.throws(()=>database.changeDealerWebAccess(fresh.id,{type:'link',accountId:existingId}),/çakış/);
  database.changeDealerWebAccess(existing.savedId,{type:'link',accountId:existingId});
  assert.equal(database.getDealerWebAccess(existing.savedId).accountId,existingId);
  assert.throws(()=>database.changeDealerWebAccess(existing.savedId,{type:'link',accountId:profile.id}),/çakış/);
  await f.publish();assert.equal(JSON.stringify(database.createDealerAccessProjection()).includes('PRIVATE_ACCOUNT_NOTE'),false);
  stage('offline Desktop intake, durable cursor, canonical customer creation and explicit conflict-safe existing-customer linking');

  assert.equal((await call('dealer/catalog',undefined,web)).status,403,'ordinary customer cannot access dealer data');
  assert.equal((await call('account/profile',{fullName:'Updated Name'},web,{Origin:'https://attacker.example'})).status,403);
  assert.equal((await call('account/profile',{fullName:'Updated Name'},web,{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await call('account/profile',{fullName:'Updated Name'},web)).status,200);
  const refreshed=await call('account/refresh',{},web);assert.equal(refreshed.status,200);assert.notEqual(refreshed.cookie,web);
  assert.equal((await call('account/session',undefined,web)).status,401);
  assert.equal((await call('account/refresh',{},web)).status,401,'old refresh cannot replay');
  assert.equal((await call('account/session',undefined,android)).status,200);
  assert.equal((await call('account/logout',{},android)).status,200);assert.equal((await call('account/session',undefined,android)).status,401);
  const recovery=await call('account/recover',{email:'new@example.test'});assert.equal(recovery.status,200);
  const resetToken=await token();assert.equal((await call('account/reset',{token:resetToken,password:accountPassword})).status,200);
  assert.equal((await call('account/session',undefined,refreshed.cookie)).status,401);
  assert.equal((await call('account/reset',{token:resetToken,password:accountPassword})).status,400);
  stage('CSRF rejection, profile allowlist, session/refresh rotation, independent logout and single-use password recovery');

  await call('account/recover',{email:'new@example.test'});
  await call('account/recover',{email:'new@example.test'});
  const replacementMail=await f.runCommerceMail();assert.equal(replacementMail.sent,1);assert.equal(replacementMail.cancelled,1,'superseded token mail is cancelled before SMTP');
  await call('account/recover',{email:'new@example.test'});
  storage("$db->exec('UPDATE customer_account_tokens SET expires_at=0 WHERE consumed_at=0');");
  const expiredMail=await f.runCommerceMail();assert.equal(expiredMail.sent,0);assert.equal(expiredMail.cancelled,1,'expired token mail is never sent');
  stage('sealed durable token mail, token replacement and expiry cancellation');

  // Full OAuth state/PKCE flow with an injected provider transport at the service boundary.
  // HTTP start and state rejection are real; Google/Facebook responses below are explicit test doubles.
  const google=await call('account/oauth',{provider:'google'});assert.equal(google.status,200);
  const googleUrl=new URL(google.body.url);assert.equal(googleUrl.origin,'https://accounts.google.com');assert.equal(googleUrl.searchParams.get('code_challenge_method'),'S256');
  const oauthCookie=google.headers.getSetCookie().find(x=>x.startsWith('ya_account_oauth=')).split(';')[0].split('=')[1];
  const state=googleUrl.searchParams.get('state');
  const bad=await fetch(f.baseUrl+'/api/account/callback.php?state='+state+'&code=fixture',{redirect:'manual'});assert.equal(bad.status,303);assert.equal(new URL(bad.headers.get('location')).searchParams.get('account_error'),'invalid_oauth_state');
  storage(`$_COOKIE['ya_account_oauth']=$argv[2]; $query=['state'=>$argv[3],'code'=>'provider-code'];
    $url=ya_account_oauth_callback($query,static function($url,$fields,$bearer='') {
      return str_contains($url,'/token') ? ['access_token'=>'fixture-provider-access'] : ['sub'=>'google-subject-1','email'=>'social@example.test','email_verified'=>true,'name'=>'Social Fixture'];
    }); echo json_encode($url);`,[oauthCookie,state]);
  assert.equal(storage(`try { $_COOKIE['ya_account_oauth']=$argv[2]; ya_account_oauth_callback(['state'=>$argv[3],'code'=>'same']); } catch (YaAccountError $e) { echo json_encode($e->reason); }`,[oauthCookie,state]),'invalid_oauth_state');
  const socialId=storage('echo json_encode($db->query("SELECT id FROM customer_accounts WHERE email=\'social@example.test\'")->fetchColumn());');
  assert.ok(socialId);
  assert.equal(storage(`try { ya_account_complete_identity($db,'google',['sub'=>'other-sub','email'=>'new@example.test','email_verified'=>true,'name'=>'Other']); } catch(YaAccountError $e) { echo json_encode($e->reason); }`),'account_exists_link_required');
  assert.equal(storage(`echo json_encode(ya_account_complete_identity($db,'facebook',['id'=>'facebook-1','email'=>'unverified@example.test','name'=>'Facebook Fixture'],$argv[2]));`,[socialId]),socialId);
  assert.equal(storage(`try { ya_account_complete_identity($db,'facebook',['id'=>'facebook-1'],$argv[2]); } catch(YaAccountError $e) { echo json_encode($e->reason); }`,[profile.id]),'identity_conflict');
  const linkCookie=await f.login('new@example.test');
  const linkStart=await call('account/oauth',{provider:'google',link:true},linkCookie);assert.equal(linkStart.status,200);
  const linkState=new URL(linkStart.body.url).searchParams.get('state');
  const linkBrowser=linkStart.headers.getSetCookie().find(x=>x.startsWith('ya_account_oauth=')).split(';')[0].split('=')[1];
  storage(`$_COOKIE['ya_account_session']=$argv[2]; $_COOKIE['ya_account_oauth']=$argv[3]; echo json_encode(ya_account_oauth_callback(['state'=>$argv[4],'code'=>'link-provider-code'],static function($url,$fields,$bearer='') {return $bearer === '' ? ['access_token'=>'fixture-link-access'] : ['sub'=>'linked-existing-account','email'=>'different@example.test','email_verified'=>false];}));`,[linkCookie.split(';')[0].split('=')[1],linkBrowser,linkState]);
  assert.deepEqual((await call('account/session',undefined,linkCookie)).body.account.methods,['password','google']);
  assert.equal(storage(`try{ya_account_complete_identity($db,'google',['sub'=>'linked-existing-account'],$argv[2]);}catch(YaAccountError $e){echo json_encode($e->reason);}`,[socialId]),'identity_conflict');
  const facebook=await call('account/oauth',{provider:'facebook'});assert.equal(new URL(facebook.body.url).origin,'https://www.facebook.com');
  const verifier='a'.repeat(43),challenge=createHash('sha256').update(verifier).digest('base64url');
  const nativeStart=await call('account/oauth',{provider:'google',nativeChallenge:challenge});
  assert.equal(new URL(nativeStart.body.url).origin,f.siteUrl);
  const browserStart=await fetch(nativeStart.body.url,{redirect:'manual'});assert.equal(browserStart.status,303);
  const nativeState=new URL(browserStart.headers.get('location')).searchParams.get('state');
  const nativeBrowserCookie=browserStart.headers.getSetCookie().find(x=>x.startsWith('ya_account_oauth=')).split(';')[0].split('=')[1];
  assert.equal((await fetch(nativeStart.body.url,{redirect:'manual'})).status,303,'consumed browser ticket redirects to a visible account error');
  const nativeRedirect=storage(`$_COOKIE['ya_account_oauth']=$argv[2]; echo json_encode(ya_account_oauth_callback(['state'=>$argv[3],'code'=>'native-provider-code'],static function($url,$fields,$bearer='') {return $bearer === '' ? ['access_token'=>'fixture-native-access'] : ['sub'=>'google-subject-1'];}));`,[nativeBrowserCookie,nativeState]);
  const nativeResult=await call('account/exchange',{code:new URL(nativeRedirect).searchParams.get('code'),verifier});assert.equal(nativeResult.status,200);assert.equal((await call('account/session',undefined,nativeResult.cookie)).body.account.id,socialId);
  const handoff=storage('echo json_encode(ya_account_handoff($db,$argv[2],$argv[3]));',[profile.id,challenge]);const handoffCode=new URL(handoff).searchParams.get('code');
  assert.equal((await call('account/exchange',{code:handoffCode,verifier:'b'.repeat(43)})).status,400);
  const exchanged=await call('account/exchange',{code:handoffCode,verifier});assert.equal(exchanged.status,200);assert.equal((await call('account/session',undefined,exchanged.cookie)).body.account.id,profile.id);
  assert.equal((await call('account/exchange',{code:handoffCode,verifier})).status,400);
  stage('OAuth state/browser binding and Google PKCE; provider test doubles, explicit multi-method linking, identity collision and native one-time PKCE handoff');

  let current=await f.login('new@example.test');
  const revokedHandoff=storage('echo json_encode(ya_account_handoff($db,$argv[2],$argv[3]));',[profile.id,challenge]);
  raw=new DatabaseSync(database.databasePath);
  raw.prepare("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id=?").run(C.ONLINE_SALES);
  const pending=database.getPendingSyncJobs().find(x=>x.jobKey==='dealer_access');assert.ok(pending);
  assert.equal(database.createDealerAccessProjection().online_sales_enabled,false);
  // Failing transport retains the durable intent and visible failure; old remote state cannot be called updated.
  const configPath=join(f.hosting,'config/business.json'),serverConfig=readFileSync(configPath,'utf8');
  try {
    writeFileSync(configPath,JSON.stringify({sync_secret:'fixture-rejected-publication'}));
    const failed=await f.publish(false);assert.equal(failed.ok,false);
    assert.ok(database.getPendingSyncJobs('9999-12-31T00:00:00.000Z').find(x=>x.jobKey==='dealer_access').lastError);
    database.failSyncJob(pending.jobKey,pending.sourceRevision,failed.message,new Date().toISOString());
    assert.equal((await call('account/session',undefined,current)).status,200,'a failed publication must not claim the remote feature was disabled');
  } finally {writeFileSync(configPath,serverConfig);}

  await f.publish();
  assert.equal((await call('account/config')).body.enabled,false);
  for(const [endpoint,body] of [['account/session',undefined],['account/orders',undefined],['account/register',{email:'off@example.test',fullName:'Off'}],['account/login',{email:'new@example.test',password:accountPassword}],['account/recover',{email:'new@example.test'}],['account/reset',{token:'x'.repeat(43),password:accountPassword}],['account/verify',{token:'x'.repeat(43),password:accountPassword}],['account/refresh',{}],['account/profile',{fullName:'Off'}],['account/oauth',{provider:'google'}],['account/exchange',{code:'x'.repeat(43),verifier}],['dealer/session',undefined],['dealer/catalog',undefined],['dealer/orders',undefined],['dealer/order',{}],['dealer/receipt',{idempotencyKey:randomUUID()}]]){
    const result=await call(endpoint,body,current);assert.equal(result.status,403,endpoint+': '+JSON.stringify(result.body));
  }
  assert.equal((await call('account/logout-all',{},current)).status,200);
  assert.equal((await call('account/logout',{},current)).status,200);
  raw.prepare("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id=?").run(C.ONLINE_SALES);await f.publish();
  current=await f.login('new@example.test');assert.equal((await call('account/session',undefined,current)).body.account.id,profile.id);
  assert.equal((await call('account/exchange',{code:new URL(revokedHandoff).searchParams.get('code'),verifier})).status,400,'logout-all also fences pending native handoffs');
  database.changeDealerWebAccess(fresh.id,'revoke_sessions');await f.publish();assert.equal((await call('account/session',undefined,current)).status,401);
  stage('Online Sales server-wide denial, logout while disabled, visible failed publication, reactivation preserving accounts and Desktop session revocation');

  for(let i=0;i<10;i++)assert.equal((await call('account/login',{email:'missing@example.test',password:accountPassword})).status,401);
  assert.equal((await call('account/login',{email:'missing@example.test',password:accountPassword})).status,429);
  stage('bounded login attempts and generic credential failures');
  const unconfigured=await accountFixture({smtp:false});
  try {
    await unconfigured.publish();assert.equal((await unconfigured.call('account/config')).body.passwordRegistration,false);
    assert.deepEqual((await unconfigured.call('account/config')).body.providers,[]);
    assert.equal((await unconfigured.call('account/register',{email:'missing@example.test',fullName:'No SMTP',password:accountPassword})).body.code,'mail_unconfigured');
    assert.equal((await unconfigured.call('account/recover',{email:'missing@example.test'})).body.code,'mail_unconfigured');
    assert.equal(unconfigured.storage('echo json_encode($db->query("SELECT COUNT(*) FROM customer_accounts")->fetchColumn());'),0);
  } finally { await unconfigured.cleanup(); }
  const keyless=await accountFixture({smtp:true,tokenKey:false});
  try {
    await keyless.publish();
    assert.equal((await keyless.call('account/config')).body.passwordRegistration,false,'configured SMTP cannot bypass the missing token encryption key');
    assert.equal((await keyless.call('account/register',{email:'keyless@example.test',fullName:'Keyless'})).body.code,'mail_unconfigured');
    assert.equal(keyless.storage("echo $db->query('SELECT COUNT(*) FROM customer_accounts')->fetchColumn();"),0);
  }finally{await keyless.cleanup();}
  stage('missing SMTP/provider configuration has no fake registration, delivery or social sign-in fallback');
  console.log('customer-accounts-ok');
} catch(error){console.error(f.logs().slice(-1800));throw error;}
finally{raw?.close();await f.cleanup();}

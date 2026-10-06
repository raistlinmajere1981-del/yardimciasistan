import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { marketingFixture, editorialInput } from './marketing-fixtures.mjs';
import { createCustomer, preference } from './messaging-campaign-fixtures.mjs';
export function multichannelFixture() {
  const f=marketingFixture(), cache=new Map(), logs=[], calls=[];
  const state={sms:'success',instagram:'success',containerStatus:'FINISHED',invalidProfile:false,profileType:'BUSINESS',allowed:true,hook:null,cleanupFail:false,secureStorage:true,storageBackend:'gnome_libsecret'};
  let smsSequence=0,containerSequence=0,mediaSequence=0;
  const fetchImpl=async(url,init)=>{
    const parsed=new URL(url);let body;
    if(init.body instanceof FormData)body=Object.fromEntries(init.body.entries());
    else if(init.body)body=parsed.hostname==='api.iletimerkezi.com'?JSON.parse(init.body):Object.fromEntries(new URLSearchParams(init.body));
    calls.push({url:String(url),method:init.method,body,headers:init.headers});
    if(parsed.hostname==='api.iletimerkezi.com') {
      if(parsed.pathname.includes('get-balance'))return Response.json({response:{status:{code:state.sms==='invalid'?401:200},balance:{amount:10,sms:50}}});
      if(parsed.pathname.includes('get-sender'))return Response.json({response:{status:{code:200},senders:{sender:['FIXTURE']}}});
      if(parsed.pathname.includes('get-report'))return Response.json({response:{status:{code:200},order:{id:body.request.order.id,total:1,status:114,delivered:1,undelivered:0}}});
      if(state.sms==='lost')throw new Error('PRIVATE_KEY PHONE_PRIVATE SMS_PRIVATE');
      if(state.sms==='malformed')return new Response('invalid',{status:503});
      const code=state.sms==='transient'?503:state.sms==='rate'?429:state.sms==='permanent'?450:state.sms==='iys'?470:state.sms==='duplicate'?451:200;
      return Response.json({response:{status:{code,...(code!==200?{message:'PRIVATE_KEY SMS_PRIVATE'}:{})},...(code===200?{order:{id:String(++smsSequence)}}:{})}},{status:code===503?503:200});
    }
    if(parsed.hostname==='graph.instagram.com') {
      if(parsed.pathname.endsWith('/me'))return state.invalidProfile?Response.json({error:{code:190,message:'PRIVATE_TOKEN'}},{status:401}):Response.json({id:'9001',user_id:'9001',username:'fixture_account',account_type:state.profileType});
      if(init.method==='POST') {
        if(state.hook)await state.hook(parsed.pathname);
        if(state.instagram==='lost-create'&&parsed.pathname.endsWith('/media')||state.instagram==='lost-publish'&&parsed.pathname.endsWith('/media_publish'))throw new Error('PRIVATE_TOKEN CAPTION_PRIVATE');
        if(state.instagram==='transient'||state.instagram==='transient-publish'&&parsed.pathname.endsWith('/media_publish'))return Response.json({error:{code:2,is_transient:true}},{status:503});
        return Response.json({id:parsed.pathname.endsWith('/media_publish')?String(20000+ ++mediaSequence):String(10000+ ++containerSequence)});
      }
      if(parsed.searchParams.get('fields')==='permalink')return Response.json({permalink:'https://www.instagram.com/p/fixture_post/'});
      return Response.json({status_code:state.containerStatus});
    }
    if(parsed.pathname.endsWith('instagram-media.php'))return Response.json({ok:!(state.cleanupFail&&body.operation==='delete')},{status:state.cleanupFail&&body.operation==='delete'?503:200});
    throw new Error('Unexpected route');
  };
  function load(file) {
    if(cache.has(file))return cache.get(file);
    const path=new URL(`../../apps/desktop-app/dist-electron/${file}.js`,import.meta.url),localRequire=createRequire(path),exports={};cache.set(file,exports);
    const folder=file.slice(0,file.lastIndexOf('/'));
    runInNewContext(readFileSync(path,'utf8'),{exports,Buffer,process,Date,Error,URL,URLSearchParams,FormData,Blob,Response,AbortController,Uint8Array,setTimeout,clearTimeout,fetch:fetchImpl,
      require:name=>name==='electron'?{safeStorage:{isEncryptionAvailable:()=>state.secureStorage,getSelectedStorageBackend:()=>state.storageBackend,encryptString:v=>Buffer.from([...v].reverse().join(''))}}
      :name.endsWith('desktop-logger')?{desktopLog:{info:v=>logs.push(v),warn:v=>logs.push(v),error:v=>logs.push(v)}}
      :name.endsWith('business-messaging/secret-service')||name==='./secret-service'?f.secrets
      :name.startsWith('./')?load(`${folder}/${name.slice(2)}`)
      :localRequire(name)});
    return exports;
  }
  const smsInput={enabled:true,senderId:'FIXTURE',iysList:'BIREYSEL',apiKey:'PRIVATE_KEY',apiHash:'PRIVATE_HASH'};
  const instagramInput={enabled:true,accountId:'9001',accessToken:'PRIVATE_TOKEN'};
  const writes=load('marketing/provider-secrets').createMarketingProviderSecretWrites(smsInput,instagramInput);
  const saved=f.db.saveInitialSetup({...f.setup,profileOptions:f.db.getSetupData().profileOptions,sms:{...smsInput,apiKey:'',apiHash:''},instagram:{...instagramInput,accessToken:''}},undefined,undefined,undefined,undefined,writes);
  if(!saved.ok)throw new Error(saved.message);
  const sms=new (load('business-messaging/sms-service').SmsMessagingService)(()=>f.db,{fetchImpl});
  const instagram=new (load('marketing/instagram-publication-service').InstagramPublicationService)(()=>f.db,{instagramJpeg:()=>Buffer.from('FIXTURE_JPEG')},{fetchImpl,allowed:()=>state.allowed});
  const campaigns=new (load('messaging-campaigns/service').MessagingCampaignService)(()=>f.db,{
    assertAvailable:(channel,provider)=>{if(channel==='sms'&&provider==='iletimerkezi'&&sms.getConfiguration().configured)return;f.catalog.assertAvailable(channel,provider);},
    listTemplates:()=>f.single.listTemplates()
  });
  let timestamp=Date.parse('2030-01-01T00:00:00Z');const now=()=>new Date(timestamp);
  const worker=new (load('messaging-campaigns/dispatch-service').CampaignDispatchService)(()=>f.db,sms,{allowed:()=>state.allowed,now,policy:{minimumIntervalMs:1,batchSize:20,transientBackoffMs:10,rateLimitBackoffMs:20}});
  const tick=async()=>{worker.start();await worker.runOnce();await worker.suspendAndDrain();};
  const smsCustomers=[];
  async function smsCampaign(status='opted_in') {
    for(const id of smsCustomers)campaigns.savePreference(preference(id,'opted_out','sms'));
    const customer=createCustomer(f.db,'CUSTOMER_PRIVATE');smsCustomers.push(customer);campaigns.savePreference(preference(customer,status,'sms'));
    const segment=campaigns.saveSegment({name:'All SMS',filterDefinition:{version:1,rules:[]}});
    const content=f.service.saveContent(editorialInput({variants:[{channel:'sms',text:'SMS_PRIVATE',metadata:{version:1}}]}));
    const campaign=campaigns.createCampaign({name:'SMS Fixture',purpose:'marketing',channel:'sms',providerId:'iletimerkezi',segmentId:segment.id,templateName:'',templateLanguage:'',bindings:[],text:'SMS_PRIVATE',contentId:content.content.id,contentRevision:content.content.revision});
    await campaigns.prepareCampaign(campaign.id);return {campaign,customer,content};
  }
  function publication() {const asset=f.media.importBytes(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=','base64'),'upload');const content=f.service.saveContent(editorialInput());return f.db.saveMarketingPublication({contentId:content.content.id,channel:'instagram',placement:'homepage_feature',title:'IG Fixture',text:'CAPTION_PRIVATE',mediaAssetIds:[asset.id]});}
  return {...f,get db(){return f.db;},load,loadMarketing:file=>load(`marketing/${file}`),sms,instagram,campaigns,state,calls,logs,tick,smsCampaign,publication,advance:ms=>{timestamp+=ms;},dispose:async()=>{await worker.suspendAndDrain();await instagram.drain();f.dispose();}};
}

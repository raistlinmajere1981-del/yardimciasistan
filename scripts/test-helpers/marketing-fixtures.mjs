import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';
import { campaignFixture, C } from './messaging-campaign-fixtures.mjs';
const base = new URL('../../apps/desktop-app/dist-electron/marketing/', import.meta.url);
const require = createRequire(base);
const aiCore = require('@yardimci-asistan/ai-core');
export const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64');
export const editorialInput = (changes = {}) => ({ title: 'Yeni sezon', purpose: 'promotion', masterText: 'Yeni sezon duyurusu', status: 'draft',
  variants: [{channel:'website',title:'Web başlığı',text:'Website metni',metadata:{version:1,adaptation:'manual'}},{channel:'whatsapp',text:'WhatsApp metni',metadata:{version:1}}],mediaAssetIds:[],...changes });
export function marketingFixture({ enabled = true, ai = false } = {}) {
  const foundation = campaignFixture(), logs = [], calls = [], cache = new Map();
  const current = foundation.db.getSetupData();
  const saved = foundation.db.saveInitialSetup({ ...foundation.setup, ...current,
    profileOptions: enabled ? [C.MESSAGING_CAMPAIGNS, C.WHOLESALE] : [C.WHOLESALE],
    aiEnabled: ai, aiModel: ai ? 'fixture-chat' : '',
    aiApiKey: ai ? 'fixture-ai-key' : '', clearAiApiKey: false,
    whatsappCloud: { ...current.whatsappCloud, accessToken: '' } },
    ai ? { mode: 'replace', encryptedValue: 'safe-storage:v1:fixture-ai-key' } : undefined);
  if (!saved.ok) throw new Error(saved.message);
  const state = { webUrl:null, selected:[], unavailable:false, response:'AI aday metni', fail:false, selectedAiService:'openai', aiProfiles:null };
  const fetchImpl = async (url,init) => {calls.push({url:String(url),body:JSON.parse(init.body)});
    if(state.fail)return Response.json({error:{message:'PRIVATE_PROVIDER_ERROR'}},{status:500});
    if (String(url).endsWith(':generateContent')) return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:imageBytes.toString('base64')}}]}}]});
    return String(url).endsWith('/images/generations') ? Response.json({data:[{b64_json:imageBytes.toString('base64')}]}) : Response.json({choices:[{message:{content:state.response}}]}); };
  const fakeImage = bytes => ({ isEmpty:()=>!Buffer.from(bytes).subarray(0,8).equals(imageBytes.subarray(0,8)),getSize:()=>({width:1,height:1}),toPNG:()=>Buffer.from(bytes),
    resize(){return this;},toDataURL:()=>`data:image/png;base64,${Buffer.from(bytes).toString('base64')}` });
  function load(file) {
    if(cache.has(file))return cache.get(file);
    const compiled=new URL(file,base), localRequire=createRequire(compiled), exports={};cache.set(file,exports);
    runInNewContext(readFileSync(compiled,'utf8'),{exports,Buffer,Error,URL,process,setTimeout,clearTimeout,Uint8Array,AbortController,fetch:fetchImpl,
      require:(name)=>name==='electron'?{nativeImage:{createFromBuffer:fakeImage,createFromPath:file=>fakeImage(readFileSync(file))},dialog:{showOpenDialog:async()=>({canceled:!state.selected.length,filePaths:state.selected})}}
        :name==='../desktop-logger'?{desktopLog:{info:event=>logs.push(event),warn:event=>logs.push(event),error:event=>logs.push(event)}}
        :name==='../ai-secret-service'?{getEffectiveAiApiKey:()=>state.unavailable?'':'fixture_key'}
        :name==='@yardimci-asistan/ai-core'?{...aiCore,generateConfiguredChat:(config)=>aiCore.generateConfiguredChat(config,fetchImpl),generateConfiguredImage:(...args)=>aiCore.generateConfiguredImage(...args,fetchImpl)}
        :name.startsWith('./')?load(name.slice(2)+'.js'):localRequire(name)});
    return exports;
  }
  // Fixture provides an encrypted test key when AI is enabled; providers remain mocked.
  const originalSetup=foundation.db.getSetupData.bind(foundation.db);
  foundation.db.getSetupData=()=>({...originalSetup(),...(state.webUrl?{webModuleUrl:state.webUrl}:{}),aiService:state.selectedAiService,aiProfiles:state.aiProfiles??[{service:'openai',baseUrl:'https://api.openai.com/v1',model:'fixture-chat',modelOptions:[],timeoutSeconds:30,apiKeyConfigured:ai}]});
  const media=new (load('media-service.js').MarketingMediaService)(()=>foundation.db,()=>foundation.db.userDataPath);
  let schedules=0;
  const service=new (load('service.js').MarketingStudioService)(()=>foundation.db,media,()=>{schedules++;});
  const publisher=new (load('website-publication.js').MarketingWebsitePublicationService)(()=>foundation.db,media);
  const uploadPath=join(foundation.db.userDataPath,'upload.png');writeFileSync(uploadPath,imageBytes);
  return {...foundation,campaigns:foundation.service,loadMarketing:file=>load(file+".js"),get db(){return foundation.db;},service,media,publisher,logs,calls,state,load,uploadPath,get schedules(){return schedules;}};
}

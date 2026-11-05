const assert = require("node:assert/strict");
const test = require("node:test");
const { listCloudflareAiModels, isCloudflareTextModelId, generateConfiguredChat } = require("../dist");
const { cloudflareAiBaseUrl } = require("@yardimci-asistan/shared");
const baseUrl = cloudflareAiBaseUrl("a".repeat(32));
const apiKey = "fixture-cloudflare-token";
const config = { enabled: true, provider: "openai_compatible", service: "cloudflare", baseUrl,
  model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", apiKey };
const response = (value,status=200) => new Response(JSON.stringify(value),{status});

test("Cloudflare model discovery uses official HTTPS account catalog and no test inference", async () => {
 const result = await listCloudflareAiModels({baseUrl,apiKey},async(url,init)=>{
  assert.equal(url,"https://api.cloudflare.com/client/v4/accounts/"+"a".repeat(32)+"/ai/models/search?hide_experimental=true&per_page=100");
  assert.equal(init.redirect,"error");
  assert.equal(init.headers.Authorization,"Bearer "+apiKey);
  return response({success:true,result:[
   {name:config.model,task:{name:"text-generation"}},
   {name:"@cf/example/vision-model",task:"image-to-text"},
   {name:"@cf/example/whisper",task:"automatic-speech-recognition"},
   {name:"@cf/bad/../evil",task:"text-generation"},
   {name:config.model,task:"text-generation"},
   {name:"@cf/example/image",task:"text-to-image"}]});
 });
 assert.equal(result.ok,true);
 assert.deepEqual(result.models.map(x=>x.task),["image","vision","stt","text"].sort((a,b)=>["@cf/example/image","@cf/example/vision-model","@cf/example/whisper",config.model].indexOf(a)-["@cf/example/image","@cf/example/vision-model","@cf/example/whisper",config.model].indexOf(b)));
 assert.equal(result.models.length,4);
 assert.equal(JSON.stringify(result).includes(apiKey),false);
});
test("Cloudflare discovery classifies read token permission failure without leaking provider body",async()=>{
 const result=await listCloudflareAiModels({baseUrl,apiKey},async()=>response({success:false,errors:[{code:5018,message:"fixture-cloudflare-token private"}]},403));
 assert.deepEqual({ok:result.ok,reason:result.reason},{ok:false,reason:"permission"});
 assert.equal(JSON.stringify(result).includes(apiKey),false);
});
test("Cloudflare discovery rejects unsafe base URL and model traversal",async()=>{
 assert.equal(isCloudflareTextModelId("@cf/vendor/text-model"),true);
 for(const model of ["../evil","@cf/meta/../text","@cf/meta/text?token=x","@cf/meta/text#bad"])assert.equal(isCloudflareTextModelId(model),false);
 const result=await listCloudflareAiModels({baseUrl:baseUrl+"?evil",apiKey},()=>{throw new Error("MUST NOT FETCH")});
 assert.equal(result.reason,"configuration");
});
test("Cloudflare listed text models can be tested through secured adapter",async()=>{
 const result=await generateConfiguredChat({...config,messages:[{role:"user",content:"Merhaba"}]},async(url)=>{
  assert.equal(url,baseUrl+"/run/"+config.model);
  return response({success:true,result:{response:"Merhaba"}});
 });
 assert.equal(result.ok,true);
});

test("Cloudflare live catalog task labels and pagination never inject hardcoded models", async()=>{
  const requested=[];
  const first=Array.from({length:100},(_,i)=>({name:`@cf/fixture/model${i}`,task:{name:"Text Generation"}}));
  first[0]={name:"@cf/fixture/model0",task:{name:"Image-to-Text"}};
  first[1]={name:"@cf/fixture/model1",task:{name:"Text-to-Image"}};
  first[2]={name:"@cf/fixture/model2",task:{name:"Automatic Speech Recognition"}};
  const second=[{name:"@cf/fixture/model100",task:{name:"Text Generation"}}];
  const result=await listCloudflareAiModels({baseUrl,apiKey},async (url)=>{
    requested.push(String(url));
    return response({success:true,result:requested.length===1?first:second,
      result_info:{page:requested.length,count:requested.length===1?100:1,total_count:101,per_page:100}});
  });
  assert.equal(result.ok,true);
  assert.equal(result.models.length,101);
  assert.deepEqual(result.models.filter(m=>m.task==="vision").map(m=>m.id),["@cf/fixture/model0"]);
  assert.deepEqual(result.models.filter(m=>m.task==="image").map(m=>m.id),["@cf/fixture/model1"]);
  assert.deepEqual(result.models.filter(m=>m.task==="stt").map(m=>m.id),["@cf/fixture/model2"]);
  assert.equal(result.models.filter(m=>m.task==="text").length,98);
  assert.equal(requested.length,2);
  assert.ok(requested[1].endsWith("&page=2"));
  assert.equal(result.models.some(m=>m.id==="@cf/zai-org/glm-4.7-flash"),false);
});

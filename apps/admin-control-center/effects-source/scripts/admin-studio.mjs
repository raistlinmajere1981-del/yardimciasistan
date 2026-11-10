import {readFile,writeFile,rename,mkdir,stat,chmod} from "node:fs/promises";
import {existsSync,readFileSync} from "node:fs";
import {dirname,resolve,join,sep,basename} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID,createHash} from "node:crypto";
import {spawn,execFileSync} from "node:child_process";
import {importProject,exportProject,validateProject,MAX_FILE_BYTES} from "../../public/effect-studio/src/model/project.mjs";
import {compileScene} from "../../public/effect-studio/src/runtime/index.mjs";
import {discoverSiteProjects} from "./site-projects.mjs";

const studioRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const workspace=process.env.EFEKT_STUDIO_WORKSPACE ? resolve(process.env.EFEKT_STUDIO_WORKSPACE) : resolve(studioRoot,"../../../..");
const registryFile=process.env.EFEKT_STUDIO_PROJECTS_FILE ? resolve(process.env.EFEKT_STUDIO_PROJECTS_FILE) : join(studioRoot,"config/projects.json");
const draftsRoot=process.env.EFEKT_STUDIO_DRAFTS_DIR ? resolve(process.env.EFEKT_STUDIO_DRAFTS_DIR) : join(studioRoot,".studio-drafts");
const publishedRoot=process.env.EFEKT_STUDIO_PUBLISHED_DIR ? resolve(process.env.EFEKT_STUDIO_PUBLISHED_DIR) : join(studioRoot,".studio-published");
const within=(base,path)=>{const full=resolve(base,path);if(full!==base&&!full.startsWith(base+sep))throw Error("Proje yolu dışına çıkılamaz.");return full;};
const fileFor=(project,path)=>within(within(workspace,project.directory),path);
const idOf=(p,i)=>p.id+":"+i.id;
const safeId=(id)=>/^[a-z0-9_-]+:[a-z0-9_-]+$/.test(id);
const safePart=(value)=>/^[a-z0-9_-]+$/.test(value);

async function projects(){
 // Test fixture/custom explicit registry remains supported. Normal Admin sessions
 // use the canonical installation inventory; projects.json only supplies site
 // specific scene/binding hints and cannot invent additional installations.
 if(process.env.EFEKT_STUDIO_PROJECTS_FILE){
  const reg=JSON.parse(await readFile(registryFile,"utf8"));
  if(reg.version!==1||!Array.isArray(reg.projects))throw Error("Proje kaydı geçersiz.");
  return reg.projects;
 }
 const repo=join(workspace,"YardimciAsistan");
 const resolved=discoverSiteProjects({
  workspace, legacyFile:registryFile, registryFile:join(repo,"config/installations.json")
 });
 const projects=resolved.map(p=>({...p,images:p.images.map(i=>({
  ...i.__source, sourceHash:i.sourceHash,sourcePath:i.sourcePath,
  bindingStatus:i.bindingStatus, note:i.note
 }))}));
 return projects;
}
async function selected(id) {
 if(!safeId(id))throw Error("Geçersiz hedef.");
 for(const project of await projects())for(const image of project.images??[])
   if(idOf(project,image)===id)return {project,image,id};
 throw Error("Kayıtlı hedef bulunamadı.");
}
function draftPath(id){if(!safeId(id))throw Error("Geçersiz hedef.");return join(draftsRoot,id.replace(":","__")+".scene.json");}
function draftHashPath(id){return draftPath(id)+".source.sha256";}
function sameSource(id,image){
 if(!image.sourceHash)return true; // explicit test fixture has no source revision
 const file=draftHashPath(id);
 return !existsSync(file) || String(readFileSync(file,"utf8")).trim()===image.sourceHash;
}

/**
 * A first-time static photo binding is staged locally. Deployment to the
 * registered site remains a separate, explicit Admin operation.
 * Gallery/product/room/API images are ineligible regardless of their filename.
 */
function staticSiteSource(photo) {
 const match=photo?.match(/^(?:canonical\/)?(?:public\/)?assets\/(site\/(?:img|media)\/[a-zA-Z0-9_/-]+\.(?:jpe?g|png|webp|avif))$/);
 return match?.[1] ?? null;
}
function stagedManifest(project,image) {
 // The Gündoğdu/Teknikel canonical source tree does not imply that its
 // existing site-only deploy script publishes this folder. No false promise:
 // enable one-click preparation only for the active site source tree.
 if(image.photo?.startsWith("canonical/"))return null;
 const source=staticSiteSource(image.photo);
 if(!source||!image.scene?.match(/^(?:canonical\/)?(?:public\/)?assets\/site\/scenes\/[a-z0-9_-]+\.scene\.json$/))return null;
 const path=fileFor(project,image.scene);
 return {source, path, manifest:join(dirname(path),"effects-manifest.json")};
}
function hasStagedBinding(project,image) {
 const paths=stagedManifest(project,image);
 if(!paths||!existsSync(paths.manifest)||!sameSource(idOf(project,image),image))return false;
 try{
  const data=JSON.parse(readFileSync(paths.manifest,"utf8"));
  return data.version===1&&Array.isArray(data.bindings)&&data.bindings.some(b=>
   b.source===paths.source&&b.slot===image.id&&b.scene===basename(paths.path));
 }catch{return false;}
}
// Site deploys are deliberately explicit: a web-module-only target cannot
// activate an image. Use the same existing site root and credentials as the
// reviewed publication adapters, not an inferred URL or installation title.
export function sitePublishRoute(project,image) {
 const path=image.scene;
 if(!/^(?:public\/)?assets\/site\/scenes\/[a-z0-9_-]+\.scene\.json$/.test(path))return null;
 const url=project.siteUrl?.replace(/\/+$/,"");
 if(!url?.startsWith("https://"))return null;
 if(process.env.EFEKT_STUDIO_PROJECTS_FILE)return null; // fixtures do not inherit live credentials
 if(project.id==="landing" && path.startsWith("assets/")) {
  const file=join(workspace,"YardimciAsistan/config/installations.json");
  const deploy=JSON.parse(readFileSync(file,"utf8")).installations?.landing?.deploy;
  if(deploy?.type!=="ssh-rsync"||!deploy.host||!deploy.remoteRoot)return null;
  return {upload:{type:"ssh-rsync",host:deploy.host,remote:deploy.remoteRoot.replace(/\/+$/,"")+"/deneme/"+path},
   publicSceneUrl:url+"/deneme/"+path};
 }
 const registry=JSON.parse(readFileSync(registryFile,"utf8"));
 const legacy=registry.projects?.find(p=>p.id===project.id);
 if(project.id==="blacksea" && path.startsWith("public/")) {
  const prior=legacy?.images?.find(i=>i.upload?.type==="natro-ftp");
  if(!prior?.upload?.credentialId)return null;
  return {upload:{type:"natro-ftp",credentialId:prior.upload.credentialId,remote:path},
   publicSceneUrl:url+"/"+path.slice("public/".length)};
 }
 if(project.id==="gundogdu" && path.startsWith("assets/")) {
  const prior=legacy?.images?.find(i=>i.upload?.type==="ssh-rsync"&&
   i.upload.remote?.endsWith("/"+i.scene));
  if(!prior?.upload?.host)return null;
  const root=prior.upload.remote.slice(0,-prior.scene.length).replace(/\/+$/,"");
  if(!root.endsWith("/www"))return null;
  return {upload:{type:"ssh-rsync",host:prior.upload.host,remote:root+"/"+path},
   publicSceneUrl:url+"/"+path};
 }
 return null;
}
function publishedPath(id){return join(publishedRoot,id.replace(":","__")+".json");}
function publishedBinding(id,project,image){
 if(image.upload||!existsSync(publishedPath(id))||!hasStagedBinding(project,image))return null;
 const route=sitePublishRoute(project,image);
 if(!route)return null;
 try {
  const record=JSON.parse(readFileSync(publishedPath(id),"utf8"));
  if(record.version!==1||record.scene!==image.scene||record.siteUrl!==project.siteUrl||
     record.sourceHash!==(image.sourceHash??"")||record.publicSceneUrl!==route.publicSceneUrl)return null;
  return route;
 } catch{return null;}
}
async function httpJson(url){
 const separator=url.includes("?")?"&":"?";
 const output=await execute("curl",["--fail","--silent","--show-error","--location","--connect-timeout","8","--max-time","18",
  url+separator+"studio="+randomUUID()]);
 if(Buffer.byteLength(output)>MAX_FILE_BYTES)throw Error("Canlı efekt dosyası çok büyük.");
 return JSON.parse(output);
}
// Called exclusively after the reviewed site-only Admin deployment succeeded.
// A local staged manifest is not proof that a site was actually published.
async function activate(id){
 const found=await selected(id);
 const {project,image}=found,route=sitePublishRoute(project,image);
 if(image.upload)throw Error("Görselin yayın yolu zaten tanımlı.");
 if(!route||!hasStagedBinding(project,image))throw Error("İlk yayın için doğrulanabilir sabit görsel bağlantısı yok.");
 const paths=stagedManifest(project,image);
 if(!paths||!existsSync(paths.path))throw Error("Hazırlanmış sahne bulunamadı.");
 const contents=await readFile(paths.path,"utf8");
 const scene=importProject(contents);
 checkScene(scene,image);
 const onlineScene=await httpJson(route.publicSceneUrl);
 if(exportProject(importProject(JSON.stringify(onlineScene)))!==exportProject(scene))
  throw Error("Site deploy tamamlandı fakat canlı efekt sahnesi yerelle eşleşmiyor.");
 const manifestUrl=route.publicSceneUrl.replace(/[^/]+$/,"effects-manifest.json");
 const onlineManifest=await httpJson(manifestUrl);
 const expected={source:paths.source,slot:image.id,scene:basename(paths.path)};
 if(onlineManifest?.version!==1||!Array.isArray(onlineManifest.bindings)||
    !onlineManifest.bindings.some(b=>b.source===expected.source&&b.slot===expected.slot&&b.scene===expected.scene))
  throw Error("Canlı efekt manifesti doğrulanamadı; bağlantı etkinleştirilmedi.");
 await saveAtomic(publishedPath(id),JSON.stringify({version:1,scene:image.scene,siteUrl:project.siteUrl,
  sourceHash:image.sourceHash??"",publicSceneUrl:route.publicSceneUrl,verifiedAt:new Date().toISOString()},null,2)+"\n");
 return {ok:true,message:"İlk site yayını ve canlı sahne/manifest doğrulandı. Sonraki yayınlar yalnız efekt sahnesini aktaracak.",
  siteUrl:project.siteUrl};
}
async function prepare(id) {
 const found=await selected(id);
 const {project,image}=found;
 if(image.upload&&image.upload.type!=="disabled")throw Error("Bu görselin mevcut yayın bağlantısı zaten var.");
 const paths=stagedManifest(project,image);
 if(!paths)throw Error("Yalnız sabit site tasarım fotoğraflarına efekt bağlantısı hazırlanabilir.");
 if(!existsSync(draftPath(id)))throw Error("Önce efekt taslağını kaydedin.");
 if(!sameSource(id,image))throw Error("Kaynak fotoğraf değişmiş. Güncel fotoğrafta yeni taslak oluşturun.");
 const scene=importProject(await readFile(draftPath(id),"utf8"));
 checkScene(scene,image);
 const zones=new Set(scene.zones.filter(z=>z.visible).map(z=>z.id));
 if(!scene.effects.some(e=>e.enabled&&zones.has(e.zoneId)))
  throw Error("Site bağlantısı için görünür etkin bir efekt gerekli.");
 let data={version:1,bindings:[]};
 if(existsSync(paths.manifest)) {
  const raw=await readFile(paths.manifest,"utf8");
  if(Buffer.byteLength(raw)>16*1024)throw Error("Site efekt manifesti çok büyük.");
  data=JSON.parse(raw);
  if(data.version!==1||!Array.isArray(data.bindings)||data.bindings.length>32)
   throw Error("Site efekt manifesti geçersiz.");
 }
 // Preserve existing site-owned effects, but do not publish a manifest
 // that the canonical site renderer would reject as invalid or ambiguous.
 const sourceSeen=new Set(),slotSeen=new Set();
 const assetPrefix=image.photo.startsWith("canonical/")?"canonical/public/assets/":
   image.photo.startsWith("assets/site/")?"assets/":"public/assets/";
 for(const b of data.bindings) {
  if(!b||typeof b!=="object"||Object.keys(b).sort().join(",")!=="scene,slot,source"||
      typeof b.source!=="string"||!/^site\/(?:img|media)\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:jpe?g|png|webp|avif)$/.test(b.source)||
      typeof b.slot!=="string"||!(/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,99}$/.test(b.slot))||
      typeof b.scene!=="string"||!(/^[a-zA-Z0-9_-]{1,64}\.scene\.json$/.test(b.scene))||
      sourceSeen.has(b.source)||slotSeen.has(b.slot)||
      !existsSync(fileFor(project,assetPrefix+b.source)))
    throw Error("Mevcut site efekt manifesti geçersiz; güvenli biçimde güncellenemedi.");
  sourceSeen.add(b.source);slotSeen.add(b.slot);
 }
 const incoming={source:paths.source,slot:image.id,scene:basename(paths.path)};
 const before=data.bindings.filter(b=>b.source!==paths.source&&b.slot!==image.id);
 if(before.length!==data.bindings.length &&
    data.bindings.some(b=>(b.source===paths.source||b.slot===image.id)&&
      (b.source!==incoming.source||b.slot!==incoming.slot||b.scene!==incoming.scene)))
   throw Error("Aynı görsel veya sahne başka bir efekt hedefine bağlı.");
 data.bindings=[...before,incoming];
 if(Buffer.byteLength(JSON.stringify(data))>16*1024)throw Error("Site efekt manifesti sınırı aşıldı.");
 // Manifest is last: the site never points at a scene that wasn't written.
 await saveAtomic(paths.path,exportProject(scene));
 await saveAtomic(paths.manifest,JSON.stringify(data,null,2)+"\n");
 return {ok:true,message:"Site kaynaklarında sabit görsel sahnesi hazırlandı. Canlıya almak için site deploy'u gerekir.",
  siteUrl:project.siteUrl,scenePath:image.scene};
}
function checkScene(scene,im) {
 scene.photo={...scene.photo,src:im.photoRef,width:im.width,height:im.height};
 validateProject(scene);
 compileScene(scene);
 return scene;
}
async function saveAtomic(path,contents){
 await mkdir(dirname(path),{recursive:true});
 const temp=path+"."+randomUUID()+".tmp";
 try{await writeFile(temp,contents,{mode:0o600});await rename(temp,path);}
 finally{const {unlink}=await import("node:fs/promises");await unlink(temp).catch(()=>{});}
}
async function inspect(id){
 const found=await selected(id);
 const {project,image}=found;
 const linked=image.upload?.type!=="disabled"&&Boolean(image.upload);
 return {siteId:project.id,canPublish:linked||Boolean(publishedBinding(id,project,image)),
  canPrepare:!image.upload&&sameSource(id,image)&&Boolean(stagedManifest(project,image))};
}
async function list(){
 return Promise.all((await projects()).map(async project=>{
 const images=await Promise.all((project.images??[]).map(async image=>{
 const id=idOf(project,image);
 const photo=fileFor(project,image.photo),scene=fileFor(project,image.scene);
 const staged=hasStagedBinding(project,image);
  const verified=publishedBinding(id,project,image);
  const linked=image.upload?.type!=="disabled"&&Boolean(image.upload);
 return {id,name:image.name,available:existsSync(photo),hasDraft:existsSync(draftPath(id)),hasScene:existsSync(scene),
  canPublish:linked||Boolean(verified),
  // A staged scene stays editable before site deployment; preparing again
  // overwrites only its local scene and idempotently keeps the manifest entry.
  canPrepare:!image.upload&&sameSource(id,image)&&Boolean(stagedManifest(project,image)),
  note:verified?"Canlı siteyle doğrulanmış sahne bağlantısı.":staged?"Site kaynaklarında hazır. İlk site yayını gerekiyor.":image.note??image.upload?.note??"",
  bindingStatus:linked||verified?"linked":staged?"staged":image.bindingStatus??"needs-setup",
  sourceHash:image.sourceHash??"",sourcePath:image.sourcePath??image.photo,
  width:image.width,height:image.height};
 }));
 return {id:project.id,name:project.name,siteUrl:project.siteUrl,note:project.note??"",images};
 }));
}
async function load(id) {
 const found=await selected(id);
 const {project,image}=found;
 const photoFile=fileFor(project,image.photo);
 const mime=photoFile.match(/\.(png|jpe?g|webp|avif)$/i)?.[1].toLowerCase();
 if(!mime)throw Error("Desteklenmeyen görsel.");
 const bytes=await readFile(photoFile);
 if(bytes.length>MAX_FILE_BYTES*0.7)throw Error("Fotoğraf önizleme sınırını aşıyor.");
 const preview="data:image/"+(mime==="jpg"?"jpeg":mime)+";base64,"+bytes.toString("base64");
 if(existsSync(draftPath(id))&&!sameSource(id,image))
   throw Error("Kaynak görsel değişmiş; eski taslağın koordinatları otomatik uygulanmadı.");
 const sceneFile=existsSync(draftPath(id))?draftPath(id):fileFor(project,image.scene);
 let scene;
 if(existsSync(sceneFile)){
   scene=importProject(await readFile(sceneFile,"utf8"));
   if(scene.photo.width!==image.width||scene.photo.height!==image.height)throw Error("Sahne ile görsel boyutları uyuşmuyor.");
 } else {
   scene={format:"efekt-atolyesi",version:1,name:project.name+" · "+image.name,seed:id,zones:[],effects:[],
     photo:{src:image.photoRef,width:image.width,height:image.height,name:image.name,credit:""}};
 }
 checkScene(scene,image);
 scene.photo.src=preview;
 return {scene,source:existsSync(draftPath(id))?"draft":existsSync(fileFor(project,image.scene))?"installed":"new"};
}
async function save(id,input,sourceHash){
 const found=await selected(id);
 const {image}=found;
 if(typeof input!=="object"||!input)throw Error("Sahne bulunamadı.");
 const scene=structuredClone(input);
 checkScene(scene,image);
 const contents=exportProject(scene);
 if(Buffer.byteLength(contents)>MAX_FILE_BYTES)throw Error("Sahne sınırı aşıldı.");
 await saveAtomic(draftPath(id),contents);
 if(image.sourceHash)await saveAtomic(draftHashPath(id),image.sourceHash+"\n");
 return {ok:true,message:"Yerel taslak kaydedildi.",effectCount:scene.effects.length};
}
function execute(command,args,{input,env,cwd}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env:env??process.env,stdio:["pipe","pipe","pipe"],shell:false});
  let output="",error="";
  child.stdout.on("data",b=>{output+=b.toString();if(output.length>80000)child.kill();});
  child.stderr.on("data",b=>{error+=b.toString();if(error.length>80000)child.kill();});
  child.on("error",reject);
  child.stdin.on("error",()=>{}); // Short-lived rsync/ssh can close stdin before .end().
  child.on("close",code=>code===0?resolve(output.trim()):reject(Error(error.trim()||("Komut başarısız: "+command+" "+code))));
  child.stdin.end(input??"");
 });
}

// The current Gündoğdu canonical site reads a manifest from canonical/public,
// while browsers load the mirrored /assets/site/scenes URL. The legacy
// assets/effects/hero.scene.json route does neither. Only this approved hero
// route publishes both mirrors; other project routes remain unchanged.
async function publishGundogduHero(project,image,contents) {
 const source="site/img/gideros-1-1818.webp";
 const host="yardimciasistangunduodu@ssh-yardimciasistangunduodu.alwaysdata.net";
 const root="/home/yardimciasistangunduodu/www";
 if(image.photo!=="assets/"+source||image.scene!=="assets/site/scenes/hero.scene.json"||
   image.upload?.type!=="ssh-rsync"||image.upload.host!==host||
   image.upload.remote!==root+"/assets/site/scenes/hero.scene.json")
   throw Error("Gündoğdu'nun kanonik hero yayın sözleşmesi değişmiş.");
 const paths=["canonical/public/assets/site/scenes/hero.scene.json",
   "assets/site/scenes/hero.scene.json",
   "canonical/public/assets/site/scenes/effects-manifest.json",
   "assets/site/scenes/effects-manifest.json"];
 const canonicalManifest=fileFor(project,paths[2]);
 let manifest={version:1,bindings:[]};
 if(existsSync(canonicalManifest)){
   const raw=await readFile(canonicalManifest,"utf8");
   if(Buffer.byteLength(raw)>16*1024)throw Error("Efekt manifesti çok büyük.");
   manifest=JSON.parse(raw);
 }
 if(manifest.version!==1||!Array.isArray(manifest.bindings)||manifest.bindings.length>32)
   throw Error("Kanonik site efekt manifesti geçersiz.");
 for(const b of manifest.bindings){
   if(!b||Object.keys(b).sort().join(",")!=="scene,slot,source"||
     !/^site\/(?:img|media)\/[a-zA-Z0-9_/-]+\.(?:jpe?g|webp|png|avif)$/.test(b.source)||
     !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,99}$/.test(b.slot)||
     !/^[a-z0-9_-]{1,64}\.scene\.json$/.test(b.scene))
     throw Error("Mevcut efekt manifestinde geçersiz bağlantı var.");
 }
 manifest.bindings=manifest.bindings.filter(b=>b.source!==source&&b.slot!=="hero");
 manifest.bindings.push({source,slot:"hero",scene:"hero.scene.json"});
 const manifestText=JSON.stringify(manifest,null,2)+"\n";
 if(Buffer.byteLength(manifestText)>16*1024)throw Error("Kanonik efekt manifesti boyut sınırını aştı.");
 // The local site release must retain the same four site-owned assets.
 for(const path of paths){
   const destination=fileFor(project,path);
   await saveAtomic(destination,path.endsWith("effects-manifest.json")?manifestText:contents);
   await chmod(destination,0o644); // Public site assets must stay readable after a future full-site release.
 }
 const sshArgs=["-o","BatchMode=yes","-o","ConnectTimeout=12","-o","StrictHostKeyChecking=yes",host];
 const preflight="set -Eeuo pipefail; "+
   "test -f "+root+"/canonical/core/render.php; "+
   "test -d "+root+"/canonical/public/assets/site/scenes; "+
   "test -d "+root+"/assets/site/scenes; "+
   "test -f "+root+"/assets/site/img/gideros-1-1818.webp";
 await execute("ssh",[...sshArgs,preflight]);
 const transport="ssh -o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes";
 // Scene files first; only then the renderer's manifest. No legacy paths or web module changes.
 for(const path of paths)await execute("rsync",[
   "-az","--chmod=F644","-e",transport,fileFor(project,path),host+":"+root+"/"+path
 ]);
 const url="https://yardimciasistangunduodu.alwaysdata.net/assets/site/scenes/";
 const onlineScene=await httpJson(url+"hero.scene.json");
 if(exportProject(importProject(JSON.stringify(onlineScene)))!==contents)
   throw Error("Gündoğdu canlı efekt sahnesi yerel sürümle uyuşmuyor.");
 const onlineManifest=await httpJson(url+"effects-manifest.json");
 if(onlineManifest.version!==1||!Array.isArray(onlineManifest.bindings)||
   !onlineManifest.bindings.some(b=>b.source===source&&b.slot==="hero"&&b.scene==="hero.scene.json"))
   throw Error("Gündoğdu canlı efekt manifesti doğrulanamadı.");
 return {ok:true,message:"Gündoğdu ana sayfa efekti ve kanonik manifest canlıda doğrulandı.",siteUrl:project.siteUrl};
}

async function publish(id){
 const found=await selected(id);
 const {project,image}=found;
 const route=publishedBinding(id,project,image);
 const upload=image.upload?.type!=="disabled"&&image.upload ? image.upload : route?.upload;
 const publicSceneUrl=image.publicSceneUrl??route?.publicSceneUrl;
 if(!upload)throw Error(image.upload?.note||"Bu görsel için doğrulanmış canlı yayın bağlantısı yok.");
 const source=draftPath(id);
 if(!existsSync(source))throw Error("Önce taslağı kaydedin.");
 if(!sameSource(id,image))throw Error("Görsel taslaktan sonra değişmiş; önce güncel fotoğrafı açın.");
 const scene=importProject(await readFile(source,"utf8"));
 checkScene(scene,image);
 const target=fileFor(project,image.scene);
 const contents=exportProject(scene);
 if(!process.env.EFEKT_STUDIO_PROJECTS_FILE&&project.id==="gundogdu"&&image.id==="hero")
   return publishGundogduHero(project,image,contents);
 // Local source update is kept if the network fails, so retry does not lose work.
 await saveAtomic(target,contents);
 if(upload.type==="natro-ftp"){
   const credentialFile=join(workspace,"YardimciAsistan/config/credentials.local.json");
   const extractor=join(workspace,"YardimciAsistan/scripts/read-local-credentials.mjs");
   const data=execFileSync("node",[extractor,credentialFile,upload.credentialId,
     "ftpProtocol","ftpHost","ftpPort","ftpUser","ftpPassword","ftpRemoteRoot","ftpTlsMode"]);
   const fields=data.toString("utf8").split("\0");
   const [protocol,host,port,user,password,remoteRoot,tlsMode]=fields;
   if(!host||!user||!password)throw Error("Kayıtlı BlackSea FTP bağlantısı okunamadı.");
   const safePath=x=>/^[a-zA-Z0-9_./-]+$/.test(x)&&!x.includes("..");
   const destination=(remoteRoot||"/httpdocs").replace(/\/$/,"")+"/"+upload.remote;
   if(!safePath(destination)||!safePath(host)||!safePath(port||"21"))throw Error("Geçersiz FTP hedefi.");
   const secure=tlsMode==="required"||tlsMode==="insecure-ftps"
     ?"set ftp:ssl-force true; set ftp:ssl-protect-data true; ":"set ftp:ssl-allow false; ";
   const verify=tlsMode==="insecure-ftps"?"set ssl:verify-certificate false; ":"";
   const url=(protocol||"ftp")+"://"+host+":"+(port||"21");
   const cmd="set cmd:fail-exit yes; set net:max-retries 2; set net:timeout 20; "+
     secure+verify+"put "+target+" -o "+destination+"; bye";
   await execute("lftp",["-u",user+","+password,url,"-e",cmd]);
 } else if(upload.type==="ssh-rsync"){
   const host=upload.host,remote=upload.remote;
   if(!/^[\w.@-]+$/.test(host)||!/^\/[\w./-]+$/.test(remote)||remote.includes(".."))throw Error("Geçersiz SSH hedefi.");
   await execute("rsync",["-az","--chmod=F644","-e","ssh -o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes",target,host+":"+remote]);
 } else throw Error("Bilinmeyen yayın yöntemi.");
 if(publicSceneUrl) {
   const separator=publicSceneUrl.includes("?")?"&":"?";
   const remoteText=await execute("curl",["--fail","--silent","--show-error","--location","--connect-timeout","8","--max-time","18",
     publicSceneUrl+separator+"studio="+randomUUID()]);
   const remote=importProject(remoteText);
   if(exportProject(remote)!==contents)throw Error("Aktarım yapıldı ancak canlı sahne doğrulanamadı.");
 }
 return {ok:true,message:"Sahne yüklendi ve doğrulandı.",siteUrl:project.siteUrl};
}
export async function dispatch(action,args={}){
 if(action==="list")return list();
 if(action==="inspect")return inspect(args.id);
 if(action==="load")return load(args.id);
 if(action==="save")return save(args.id,args.scene,args.sourceHash);
 if(action==="prepare")return prepare(args.id);
 if(action==="activate")return activate(args.id);
 if(action==="publish")return publish(args.id);
 throw Error("Bilinmeyen işlem.");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let body="";
 process.stdin.setEncoding("utf8");
 for await(const chunk of process.stdin){body+=chunk;if(body.length>35*1024*1024)throw Error("İstek çok büyük.");}
 try{const result=await dispatch(process.argv[2],body?JSON.parse(body):{});process.stdout.write(JSON.stringify({ok:true,result}));}
 catch(error){process.stdout.write(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
}

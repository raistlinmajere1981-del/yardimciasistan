import {effectRegistry,objectEffectRegistry,defaultParams,effectTrigger,allowedEffectTriggers} from '../registry/effects.mjs';
import {isSimplePolygon} from './geometry.mjs';
export const FORMAT='efekt-atolyesi';
export const SCHEMA_VERSION=1;
export const OBJECT_SCENE_VERSION=2;
export const OBJECT_SCENE_KIND='objectScene';
export const MAX_FILE_BYTES=25*1024*1024;
const fail = message => {throw new Error(message);};
const object = value => value!==null && typeof value==='object' && !Array.isArray(value);
const string = (value,label,max=160) => {if(typeof value!=='string'||!value.trim()||value.length>max) fail(`${label}: 1–${max} karakter gerekli.`);};
const num = (value,min,max,label) => {if(!Number.isFinite(value)||value<min||value>max) fail(`${label}: ${min}–${max} aralığında sayı gerekli.`);};
const integer = (value,min,max,label) => {num(value,min,max,label);if(!Number.isInteger(value)) fail(`${label}: tam sayı gerekli.`);};
const bool = (value,label) => {if(typeof value!=='boolean') fail(`${label}: doğru/yanlış değeri gerekli.`);};
function keys(value,allowed,label) { if(!object(value)) fail(`${label}: nesne gerekli.`); for(const key of Object.keys(value)) if(!allowed.includes(key)) fail(`${label}: bilinmeyen alan “${key}”.`); }

function validateV1(scene) {
  keys(scene,['format','version','name','seed','photo','zones','effects'],'Proje');
  if(scene.format!==FORMAT) fail('Bu dosya bir Efekt Atölyesi projesi değil.');
  if(scene.version!==SCHEMA_VERSION) fail(`Sahne sürümü ${scene.version} desteklenmiyor. v1 gerekli; dosya değiştirilmedi.`);
  string(scene.name,'Proje adı'); string(scene.seed,'Sahne tohumu',120);
  keys(scene.photo,['src','width','height','name','credit'],'Fotoğraf');
  const p=scene.photo; string(p.name,'Fotoğraf adı'); string(p.src,'Fotoğraf kaynağı',MAX_FILE_BYTES);
  if(!/^data:image\/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(p.src) && !/^(?:\.\/)?assets\/[A-Za-z0-9_/-]+\.(?:webp|png|jpe?g|avif|gif)$/.test(p.src)) fail('Fotoğraf gömülü bir raster veri URL’si veya assets/ altındaki yerel bir dosya olmalı.');
  num(p.width,1,20000,'Fotoğraf genişliği'); num(p.height,1,20000,'Fotoğraf yüksekliği');
  if(!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width*p.height>80000000) fail('Fotoğraf boyutu geçersiz veya 80 megapiksel sınırını aşıyor.');
  if(p.credit!==undefined && (typeof p.credit!=='string'||p.credit.length>2000)) fail('Fotoğraf kredisi en fazla 2000 karakter olabilir.');
  if(!Array.isArray(scene.zones)||!Array.isArray(scene.effects)) fail('Bölgeler ve efektler birer liste olmalı.');
  const ids=new Set();
  const unique = id => {string(id,'Kimlik',120); if(ids.has(id)) fail(`Tekrarlanan kimlik: ${id}`); ids.add(id);};
  for(const zone of scene.zones) {
    keys(zone,['id','name','visible','points'],'Bölge'); unique(zone.id); string(zone.name,'Bölge adı'); bool(zone.visible,'Bölge görünürlüğü');
    if(!Array.isArray(zone.points)||zone.points.length<3||zone.points.length>200) fail(`${zone.name}: 3–200 köşe gerekli.`);
    for(const point of zone.points) {if(!Array.isArray(point)||point.length!==2) fail('Köşe [x,y] biçiminde olmalı.');num(point[0],0,p.width,'Köşe X');num(point[1],0,p.height,'Köşe Y');}
    if(!isSimplePolygon(zone.points)) fail(`${zone.name}: çokgen kendi üzerinden geçemez, sıfır alanlı veya üst üste köşeli olamaz.`);
  }
  const zones=new Set(scene.zones.map(z=>z.id));
  for(const effect of scene.effects) {
    keys(effect,['id','type','zoneId','enabled','seed','params'],'Efekt'); unique(effect.id);
    if(!Object.hasOwn(effectRegistry,effect.type)) fail(`Bilinmeyen efekt türü: ${effect.type}. Desteklenenler: ${Object.keys(effectRegistry).join(', ')}. Mevcut proje korundu.`);
    if(!zones.has(effect.zoneId)) fail(`Efektin bölgesi bulunamadı: ${effect.zoneId}`);
    bool(effect.enabled,'Efekt etkinliği'); string(effect.seed,'Efekt tohumu',120);
    const controls=effectRegistry[effect.type].controls;
    keys(effect.params,controls.map(c=>c.key),'Efekt parametreleri');
    for(const c of controls) {
      if(c.kind==='boolean') bool(effect.params[c.key],c.label);
      else {num(effect.params[c.key],c.min,c.max,c.label);if(c.key==='count'&&!Number.isInteger(effect.params[c.key])) fail('Parçacık sayısı tam sayı olmalı.');}
    }
  }
  return scene;
}

function validateObjectScene(scene) {
  keys(scene,['format','version','kind','name','seed','sceneId','viewport','objects','effects'],'Proje');
  if(scene.format!==FORMAT) fail('Bu dosya bir Efekt Atölyesi projesi değil.');
  if(scene.version!==OBJECT_SCENE_VERSION) fail(`Nesne sahnesi sürümü ${scene.version} desteklenmiyor. version 2 gerekli; dosya değiştirilmedi.`);
  if(scene.kind!==OBJECT_SCENE_KIND) fail(`Sahne türü “${scene.kind}” desteklenmiyor. kind “${OBJECT_SCENE_KIND}” gerekli.`);
  string(scene.name,'Proje adı'); string(scene.seed,'Sahne tohumu',120); string(scene.sceneId,'Sahne kimliği',120);
  keys(scene.viewport,['width','height'],'Görünüm');
  integer(scene.viewport.width,1,20000,'Görünüm genişliği');
  integer(scene.viewport.height,1,20000,'Görünüm yüksekliği');
  if(scene.viewport.width*scene.viewport.height>80000000) fail('Görünüm boyutu 80 megapiksel sınırını aşıyor.');
  if(!Array.isArray(scene.objects)||!Array.isArray(scene.effects)) fail('Nesneler ve efektler birer liste olmalı.');
  if(scene.objects.length>200) fail('En fazla 200 nesne desteklenir.');
  if(scene.effects.length>500) fail('En fazla 500 efekt desteklenir.');
  const ids=new Set();
  const unique = id => {string(id,'Kimlik',120); if(ids.has(id)) fail(`Tekrarlanan kimlik: ${id}`); ids.add(id);};
  const objects=new Map();
  for(const item of scene.objects) {
    keys(item,['id','name','visible','pose','anchors','motionLayers'],'Nesne'); unique(item.id); string(item.name,'Nesne adı'); bool(item.visible,'Nesne görünürlüğü');
    keys(item.pose,['x','y','width','height','rotation','depth'],'Nesne konumu');
    const pose=item.pose;
    num(pose.x,0,1,'Nesne X'); num(pose.y,0,1,'Nesne Y');
    num(pose.width,.001,1,'Nesne genişliği'); num(pose.height,.001,1,'Nesne yüksekliği');
    if(pose.x+pose.width>1.000000001) fail(`${item.name}: nesne sahnenin yatay sınırını aşıyor.`);
    if(pose.y+pose.height>1.000000001) fail(`${item.name}: nesne sahnenin dikey sınırını aşıyor.`);
    num(pose.rotation,-360,360,'Nesne dönüşü (derece)'); num(pose.depth,-100,100,'Nesne derinliği');
    if(!Array.isArray(item.anchors)||item.anchors.length>100) fail(`${item.name}: en fazla 100 bağlantı noktası desteklenir.`);
    const anchors=new Set();
    for(const anchor of item.anchors) {
      keys(anchor,['id','x','y'],'Bağlantı noktası'); string(anchor.id,'Bağlantı kimliği',120);
      if(anchors.has(anchor.id)) fail(`Tekrarlanan bağlantı kimliği: ${anchor.id}`); anchors.add(anchor.id);
      num(anchor.x,0,1,'Bağlantı X'); num(anchor.y,0,1,'Bağlantı Y');
    }
    if(item.motionLayers!==undefined){
      if(!Array.isArray(item.motionLayers)||item.motionLayers.length>20||new Set(item.motionLayers).size!==item.motionLayers.length)fail('Geçersiz hareket katmanları.');
      for(const id of item.motionLayers)if(typeof id!=='string'||! /^[a-z][a-z0-9-]{0,79}$/.test(id))fail('Geçersiz hareket katmanı kimliği.');
    }
    objects.set(item.id,{...item,anchorIds:anchors});
  }
  for(const effect of scene.effects) {
    keys(effect,['id','type','target','enabled','seed','params','trigger','interaction'],'Efekt'); unique(effect.id);
    if(!Object.hasOwn(objectEffectRegistry,effect.type)) fail(`Bilinmeyen nesne efekti türü: ${effect.type}. Desteklenenler: ${Object.keys(objectEffectRegistry).join(', ')}. Mevcut proje korundu.`);
    if(effect.trigger!==undefined&&!allowedEffectTriggers(effect.type).includes(effectTrigger(effect)))fail('Bu efekt türünde tetikleme desteklenmiyor.');
    if(effect.interaction!==undefined){
      if(!['hover','click'].includes(effectTrigger(effect)))fail('Etkileşim süresi yalnız Hover veya Click için kullanılabilir.');
      keys(effect.interaction,['enterMs','leaveMs'],'Etkileşim süresi');
      integer(effect.interaction.enterMs,80,2000,'Efekt ileri süresi (ms)');
      integer(effect.interaction.leaveMs,80,2000,'Efekt geri süresi (ms)');
    }
    keys(effect.target,['kind','objectId','anchorId','offset','scale','depth','layerId'],'Efekt hedefi');
    if(effect.target.kind!=='sceneObject') fail('Nesne efektleri yalnızca kind “sceneObject” hedefleyebilir.');
    const targetObject=objects.get(effect.target.objectId);
    if(!targetObject) fail(`Efektin nesnesi bulunamadı: ${effect.target.objectId}`);
    if(!targetObject.anchorIds.has(effect.target.anchorId)) fail(`Efektin bağlantı noktası bulunamadı: ${effect.target.anchorId}`);
    if(objectEffectRegistry[effect.type].output==='motion'){
      if(!targetObject.motionLayers?.includes(effect.target.layerId))fail('Hareket hedef katmanı nesnede tanımlı olmalı.');
    }else if(effect.target.layerId!==undefined)fail('Yalnız hareket efekti alt katman hedefleyebilir.');
    keys(effect.target.offset,['x','y'],'Efekt kaydırması');
    num(effect.target.offset.x,-5,5,'Efekt kaydırma X'); num(effect.target.offset.y,-5,5,'Efekt kaydırma Y');
    num(effect.target.scale,.01,10,'Efekt ölçeği'); num(effect.target.depth,-100,100,'Efekt derinliği');
    bool(effect.enabled,'Efekt etkinliği'); string(effect.seed,'Efekt tohumu',120);
    const controls=objectEffectRegistry[effect.type].controls;
    keys(effect.params,controls.map(c=>c.key),'Efekt parametreleri');
    for(const c of controls) {
      if(c.kind==='boolean') bool(effect.params[c.key],c.label);
      else {num(effect.params[c.key],c.min,c.max,c.label);if(c.step===1&&!Number.isInteger(effect.params[c.key])) fail(`${c.label}: tam sayı gerekli.`);}
    }
  }
  const motionSlots=new Set();
  for(const effect of scene.effects.filter(e=>e.enabled&&objectEffectRegistry[e.type].output==='motion')){
    const key=JSON.stringify([effect.target.objectId,effect.target.layerId]);
    if(motionSlots.has(key))fail('Bir hareket katmanına yalnız bir etkin efekt bağlanabilir.');
    motionSlots.add(key);
  }
  return scene;
}

// v1 is the first public format. No implicit/losing migration: reject other versions.
// A future version must have an explicit, tested migration before it can be opened.
export function validateProject(scene) {
  if(object(scene)&&(scene.version===OBJECT_SCENE_VERSION||scene.kind===OBJECT_SCENE_KIND)) return validateObjectScene(scene);
  return validateV1(scene);
}
export function importProject(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_FILE_BYTES) fail('Proje dosyası 25 MB sınırını aşıyor.');
  let value;try{value=JSON.parse(text);}catch{fail('JSON okunamadı. Geçerli bir .scene.json dosyası seçin.');}
  return structuredClone(validateProject(value));
}
export const exportProject = scene => JSON.stringify(validateProject(scene),null,2)+'\n';
export const createEffect = (type,zoneId,id) => ({id,type,zoneId,enabled:true,seed:'1',params:defaultParams(type)});
export function deleteZone(scene,id) {
  return {...scene,zones:scene.zones.filter(z=>z.id!==id),effects:scene.effects.filter(e=>e.zoneId!==id)};
}

import {effectRegistry,defaultParams} from '../registry/effects.mjs';
import {isSimplePolygon} from './geometry.mjs';
export const FORMAT='efekt-atolyesi';
export const SCHEMA_VERSION=1;
export const MAX_FILE_BYTES=25*1024*1024;
const fail = message => {throw new Error(message);};
const object = value => value!==null && typeof value==='object' && !Array.isArray(value);
const string = (value,label,max=160) => {if(typeof value!=='string'||!value.trim()||value.length>max) fail(`${label}: 1–${max} karakter gerekli.`);};
const num = (value,min,max,label) => {if(!Number.isFinite(value)||value<min||value>max) fail(`${label}: ${min}–${max} aralığında sayı gerekli.`);};
const bool = (value,label) => {if(typeof value!=='boolean') fail(`${label}: doğru/yanlış değeri gerekli.`);};
function keys(value,allowed,label) { if(!object(value)) fail(`${label}: nesne gerekli.`); for(const key of Object.keys(value)) if(!allowed.includes(key)) fail(`${label}: bilinmeyen alan “${key}”.`); }
export function validateProject(scene) {
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
// v1 is the first public format. No implicit/losing migration: reject other versions.
// A future version must have an explicit, tested migration before it can be opened.
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

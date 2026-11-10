import {createSunlight} from '../runtime/effects/sunlight.mjs';
import {createOffshore} from '../runtime/effects/offshore.mjs';
import {createShimmer} from '../runtime/effects/shimmer.mjs';
import {createFlame} from '../runtime/effects/flame.mjs';
import {createGlow} from '../runtime/effects/glow.mjs';
import {createMetalGlint} from '../runtime/effects/metal-glint.mjs';
import {createWaterRipple} from '../runtime/effects/water-ripple.mjs';
import {createPendulumSway} from '../runtime/effects/pendulum-sway.mjs';
import {createSmoke} from '../runtime/effects/smoke.mjs';
import {polygonBounds} from '../model/geometry.mjs';

const number = (key,label,value,min,max,step=1) => ({key,label,default:value,min,max,step,kind:'number'});
const toggle = (key,label,value) => ({key,label,default:value,kind:'boolean'});
const common = [number('count','Yoğunluk / parçacık',155,0,800), number('speed','Hız',2.85,0,5,.05), number('opacity','Opaklık',1.15,0,2,.05)];
// Normalized anchors extracted from the original 1818×1228 Gideros sun polygon.
// Every coordinate and band size is relative to its zone bounding box, never the photo.
const reference={x:760,y:615,width:740,height:390};
const bandGroups=[
  {id:'core',gain:1,share:.46,bands:[[1450,646,96,25,1],[1416,677,140,32,.96],[1367,710,180,35,.86],[1330,739,195,37,.78]]},
  {id:'middle',gain:.76,share:.38,bands:[[1310,753,212,39,1],[1248,787,245,44,.97],[1180,824,255,45,.9],[1114,856,270,48,.82],[1060,887,265,49,.7]]},
  {id:'tail',gain:.4,share:.16,bands:[[1060,873,245,46,.9],[1000,905,260,46,.8],[935,936,245,48,.62],[860,965,210,42,.4],[817,987,130,30,.15]]},
].map(layer=>({...layer,bands:layer.bands.map(([x,y,w,h,f])=>[(x-reference.x)/reference.width,(y-reference.y)/reference.height,w/reference.width,h/reference.height,f])}));

export const effectRegistry = Object.freeze({
  offshore: {
    label:'Yüzey dalgacıkları', description:'Hafif ilerleyen dalga tepeleri ve küçük kırılmalar.', create:createOffshore, targetKinds:['image'],
    controls:[...common,number('length','Dalga boyutu',1,.15,3,.05),number('travel','İlerleme mesafesi',1,0,3,.05),number('breakProbability','Kırılma olasılığı',.06,0,1,.01),toggle('crestLines','Dalga tepeleri',true),toggle('breaking','Küçük köpükler',true)],
    compile(zone,p) {
      const bounds=polygonBounds(zone.points), unit=bounds.width/635;
      return {enabled:true,count:p.count,opacity:p.opacity,speedScale:p.speed,breaking:p.breaking,crestLines:p.crestLines,breakProbability:p.breakProbability,distribution:'even',
        bounds,areas:[zone.points],horizon:bounds.y-60/328*bounds.height,depthSpan:450/328*bounds.height,
        length:[48,92].map(n=>n*unit*p.length),travel:[47,83].map(n=>n*unit*p.travel),direction:[-1,.18],life:[3,5.2],wait:[.15,1.4]};
    },
  },
  sunlight: {
    label:'İnce güneş parıltıları', description:'Su yüzeyinde bağımsız, ince ve hareketli ışık çizgileri.', create:createSunlight, targetKinds:['image'],
    controls:[number('count','Yoğunluk / parçacık',110,0,500),number('opacity','Opaklık',1.1,0,2,.05),number('drift','Sürüklenme',1,0,3,.05),number('length','Parıltı boyutu',1,.15,3,.05)],
    compile(zone,p) {
      const b=polygonBounds(zone.points), unit=Math.min(b.width/600,b.height/240);
      return {enabled:true,count:p.count,opacity:p.opacity,waterArea:zone.points,color:'#fff5d6',life:[1.8,4.2],drift:[4,18].map(n=>n*unit*p.drift),
        regions:[{weight:1,center:[b.x+b.width/2,b.y+b.height/2],radius:[b.width/Math.SQRT2,b.height/Math.SQRT2],length:[5,18].map(n=>n*unit*p.length),width:[.7,1.7].map(n=>n*unit)}]};
    },
  },
  shimmer: {
    label:'Güneş yansıması', description:'Bölgeyle birlikte taşınan ışık şeridi ve parıltılar.', create:createShimmer, targetKinds:['image'],
    controls:[number('count','Yoğunluk / parçacık',140,0,800),number('speed','Hız',1.45,0,5,.05),number('opacity','Opaklık',1.15,0,2,.05),number('bandOpacity','Işık şeridi',.69,0,2,.01),number('length','Parıltı boyutu',1,.15,3,.05),number('drift','Sürüklenme',1,0,3,.05)],
    compile(zone,p) {
      const b=polygonBounds(zone.points), unit=b.width/740;
      return {area:zone.points,count:p.count,opacity:p.opacity,speedScale:p.speed,bandOpacity:p.bandOpacity*p.opacity/1.15,
        length:[8,24].map(n=>n*unit*p.length),height:[1.7,3].map(n=>n*b.height/390*p.length),life:[2.4,4.8],wait:[.15,.85],drift:[18,33].map(n=>n*unit*p.drift),
        layers:bandGroups.map(layer=>({...layer,bands:layer.bands.map(([x,y,w,h,f])=>[b.x+x*b.width,b.y+y*b.height,w*b.width,h*b.height,f])}))};
    },
  },
});
export const defaultParams = type => Object.fromEntries(effectRegistry[type].controls.map(c=>[c.key,c.default]));

// Object-scene effects never share the image/zone registry above. Validation and
// compilation select the registry from the explicit document version, so a v1
// file cannot name flame/glow/smoke and a v2 file cannot name v1 photo effects.
const objectCommon = [
  number('width','Genişlik',.12,.01,.9,.01),
  number('height','Yükseklik',.3,.01,1,.01),
  number('opacity','Opaklık',.95,0,1,.01),
  number('speed','Hız',1,.05,3,.05),
];
export const objectEffectRegistry = Object.freeze({
  'pendulum-sway': {
    label:'Sarkaç Salınımı', description:'Sabit askıdan başlayan, giderek sönen açısal hareket.',
    create:createPendulumSway, targetKinds:['sceneObject'], placement:'center', trigger:'pulse', output:'motion',
    controls:[number('amplitude','Açı (derece)',3,.1,15,.1),number('frequency','Frekans (Hz)',2,.2,5,.1),number('damping','Sönümleme (s⁻¹)',2.7,.5,8,.1),number('duration','Süre (s)',1.8,.5,5,.1),number('speed','Hız',1,.25,3,.05)],
    presets:{Sakin:{amplitude:1.5,frequency:1.6,damping:3.2,duration:1.5,speed:1},Doğal:{amplitude:3,frequency:2,damping:2.7,duration:1.8,speed:1},Canlı:{amplitude:5,frequency:2.2,damping:2.2,duration:2.4,speed:1}},
    compile(object,target,params){return {...params,amplitude:params.amplitude*target.scale};},
  },
  'metal-glint': {
    label:'Metal ağzı yansıması', description:'Bıçak maskesinde tek, dar ve sıcak ışık geçişi.', create:createMetalGlint,
    targetKinds:['sceneObject'], placement:'center', trigger:'pulse',
    controls:[number('width','Yol genişliği',.2,.01,1,.01),number('height','Yol boyu',.84,.01,1,.01),number('opacity','Şiddet',.38,0,1,.01),number('speed','Hız',1,.8,1.2,.05),number('duration','Süre (s)',1.2,1.1,1.2,.05),number('angle','Bıçak yönü (derece)',0,-180,180,1),number('bladeWidth','Bıçak eni',.12,.02,.5,.01),number('band','Işık bandı',.22,.1,.4,.01)],
    presets:{Sakin:{opacity:.25,speed:1,band:.18},Doğal:{opacity:.38,speed:1,band:.22},Canlı:{opacity:.55,speed:1,band:.28}},
    compile(object,target,params){return {...params,width:params.width*target.scale,height:params.height*target.scale};},
  },
  'water-ripple': {
    label:'Su halkası', description:'Eliptik su yüzeyinde merkezden yayılan iki ince halka.', create:createWaterRipple,
    targetKinds:['sceneObject'], placement:'center', trigger:'pulse',
    controls:[number('width','Yüzey genişliği',.94,.01,1,.01),number('height','Yüzey yüksekliği',.5,.01,1,.01),number('opacity','Şiddet',.32,0,1,.01),number('speed','Hız',1,.8,1.2,.05),number('duration','Süre (s)',1.2,1.1,1.2,.05),number('angle','Yüzey dönüşü (derece)',0,-30,30,1),number('spread','Yayılım',.92,.5,1,.01)],
    presets:{Sakin:{opacity:.2,speed:1,spread:.85},Doğal:{opacity:.32,speed:1,spread:.92},Canlı:{opacity:.46,speed:1,spread:1}},
    compile(object,target,params){return {...params,width:params.width*target.scale,height:params.height*target.scale};},
  },

  flame: {
    label:'Alev', description:'Nesneye bağlı, hareketli ve sivri alev silueti.', create:createFlame,
    targetKinds:['sceneObject'], placement:'bottom',
    controls:[...objectCommon,number('sway','Salınım',.35,0,1,.01)],
    presets:{
      Sakin:{width:.08,height:.22,opacity:.8,speed:.7,sway:.2},
      Doğal:{width:.12,height:.3,opacity:.95,speed:1,sway:.35},
      Canlı:{width:.16,height:.4,opacity:1,speed:1.4,sway:.55},
    },
    compile(object,target,params) {
      return {...params,width:params.width*target.scale,height:params.height*target.scale};
    },
  },
  glow: {
    label:'Işık halesi', description:'Nesne çevresinde yumuşak, nabız atan sıcak ışık.', create:createGlow,
    targetKinds:['sceneObject'], placement:'center', allowedTriggers:['ambient','hover','click'],
    controls:[...objectCommon,number('pulse','Nabız',.2,0,1,.01)],
    presets:{
      Sakin:{width:.28,height:.28,opacity:.4,speed:.4,pulse:.1},
      Doğal:{width:.35,height:.35,opacity:.55,speed:.6,pulse:.2},
      Canlı:{width:.45,height:.45,opacity:.7,speed:.9,pulse:.35},
    },
    compile(object,target,params) {
      return {...params,width:params.width*target.scale,height:params.height*target.scale};
    },
  },
  smoke: {
    label:'Duman', description:'Yukarı süzülen, seyrek ve yumuşak duman parçacıkları.', create:createSmoke,
    targetKinds:['sceneObject'], placement:'bottom',
    controls:[...objectCommon,number('count','Parçacık',36,0,120),number('spread','Yayılım',.35,0,1,.01)],
    presets:{
      Sakin:{width:.14,height:.4,opacity:.35,speed:.5,count:24,spread:.2},
      Doğal:{width:.18,height:.5,opacity:.5,speed:.8,count:36,spread:.35},
      Canlı:{width:.22,height:.65,opacity:.68,speed:1.1,count:64,spread:.55},
    },
    compile(object,target,params) {
      return {...params,width:params.width*target.scale,height:params.height*target.scale};
    },
  },
});
export const defaultObjectParams = type => Object.fromEntries(objectEffectRegistry[type].controls.map(c=>[c.key,c.default]));

// Existing documents have no trigger field. Their implicit default must remain
// unchanged; only reversible glow currently supports interactive trigger choices.
export const effectTrigger = effect => effect?.trigger??(
  objectEffectRegistry[effect?.type]?.trigger==='pulse'?'click':'ambient'
);
export const allowedEffectTriggers = type => objectEffectRegistry[type]?.allowedTriggers??[
  objectEffectRegistry[type]?.trigger==='pulse'?'click':'ambient'
];

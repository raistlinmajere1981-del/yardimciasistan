import {objectEffectRegistry} from '../registry/effects.mjs';

// UI labels alias the canonical presets; never derive values from current state.
export const sceneProfiles = Object.freeze([
  {label:'Hafif',key:'Sakin'}, {label:'Doğal',key:'Doğal'}, {label:'Belirgin',key:'Canlı'},
]);
export function profileForEffect(effect) {
  return sceneProfiles.find(profile => {
    const preset=objectEffectRegistry[effect.type].presets[profile.key];
    return Object.keys(preset).every(key=>effect.params[key]===preset[key]);
  })?.label??'Özel';
}
export function applySceneProfile(effect,key) {
  const preset=objectEffectRegistry[effect.type]?.presets[key];
  if(!preset)throw new Error('Bilinmeyen efekt profili.');
  effect.params={...effect.params,...preset};
}
export function basicControls(type) {
  const keys={'pendulum-sway':['amplitude','frequency','damping','duration','speed'],flame:['opacity','speed','sway'],glow:['opacity','speed','pulse','width'],smoke:['opacity','speed','spread'],'metal-glint':['opacity','speed','band','duration'],'water-ripple':['opacity','speed','spread','duration']}[type];
  return keys.map(key=>{
    const control=objectEffectRegistry[type].controls.find(item=>item.key===key);
    return {...control,label:key==='opacity'?'Şiddet':key==='width'?'Yayılım (genişlik)':control.label};
  });
}
// The editor cannot create new publishable slots or move the source photograph.
// The authoritative mounted-site validation remains in birdesengor-site.mjs.
export function assertSiteStructure(next,source) {
  const objects=scene=>scene.objects.map(({id,pose,visible,anchors,motionLayers})=>({id,pose,visible,anchors,motionLayers}));
  const slots=scene=>scene.effects.map(({id,type,target})=>({id,type,objectId:target.objectId,anchorId:target.anchorId,layerId:target.layerId})).sort((a,b)=>a.id.localeCompare(b.id));
  if(next.sceneId!==source.sceneId||JSON.stringify(next.viewport)!==JSON.stringify(source.viewport)
    ||JSON.stringify(objects(next))!==JSON.stringify(objects(source)))
    throw new Error('Nesne yerleşimi, görünürlüğü ve bağlantıları site kaynağına aittir.');
  if(JSON.stringify(slots(next))!==JSON.stringify(slots(source)))
    throw new Error('Site kaynağında yalnız mevcut efekt yuvaları düzenlenebilir. Yeni tür ve bağlantı için site motoru entegrasyonu gerekir.');
}

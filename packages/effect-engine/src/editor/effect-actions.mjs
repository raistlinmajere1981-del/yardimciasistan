import {effectRegistry} from '../registry/effects.mjs';
import {button,el} from './dom.mjs';

export const presets = Object.freeze({
  offshore:{Sakin:{count:75,speed:1,opacity:.65,length:.7,travel:.6,breakProbability:.02},Doğal:{count:155,speed:2.85,opacity:1.15,length:1,travel:1,breakProbability:.06},Canlı:{count:230,speed:3.5,opacity:1.4,length:1.25,travel:1.3,breakProbability:.12}},
  shimmer:{Sakin:{count:65,speed:.7,opacity:.65,bandOpacity:.35,length:.7,drift:.5},Doğal:{count:140,speed:1.45,opacity:1.15,bandOpacity:.69,length:1,drift:1},Canlı:{count:220,speed:2,opacity:1.4,bandOpacity:.9,length:1.3,drift:1.5}},
  sunlight:{Sakin:{count:55,opacity:.65,length:.7,drift:.5},Doğal:{count:110,opacity:1.1,length:1,drift:1},Canlı:{count:180,opacity:1.5,length:1.3,drift:1.5}},
});
// Mutate only the draft supplied by the editor's validated history transaction.
export function reorderEffect(scene,id,direction) {
  const i=scene.effects.findIndex(e=>e.id===id),j=i+direction;
  if(![-1,1].includes(direction)||i<0||j<0||j>=scene.effects.length)return false;
  [scene.effects[i],scene.effects[j]]=[scene.effects[j],scene.effects[i]];return true;
}
export function applyPreset(scene,id,name) {
  const effect=scene.effects.find(e=>e.id===id),values=presets[effect?.type]?.[name];
  if(!values)return false;
  for(const c of effectRegistry[effect.type].controls)if(c.kind==='number'&&Object.hasOwn(values,c.key))
    effect.params[c.key]=Math.max(c.min,Math.min(c.max,values[c.key]));
  return true;
}
// Preview projection never writes enabled flags or changes the persisted project.
export const previewScene=(scene,id)=>id?{...scene,effects:scene.effects.filter(e=>e.id===id)}:scene;
export function effectActionRow(scene,effect,soloId,{mutate,setSolo}) {
  const i=scene.effects.findIndex(e=>e.id===effect.id);
  return el('div',{class:'effect-actions'},
    el('div',{class:'button-row'},
      button('↑ Yukarı',()=>mutate(s=>reorderEffect(s,effect.id,-1)),{id:'effect-up',disabled:i===0}),
      button('↓ Aşağı',()=>mutate(s=>reorderEffect(s,effect.id,1)),{id:'effect-down',disabled:i===scene.effects.length-1})),
    button(soloId===effect.id?'Tüm efektleri göster':'Yalnız bu efekt',()=>setSolo(soloId===effect.id?null:effect.id),{id:'effect-solo',class:'full','aria-pressed':String(soloId===effect.id)}),
    el('div',{class:'button-row','aria-label':'Efekt hazır ayarları'},...Object.keys(presets[effect.type]).map(name=>button(name,()=>mutate(s=>applyPreset(s,effect.id,name)),{'data-preset':name}))));
}

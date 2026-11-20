import {effectActionRow} from './effect-actions.mjs';
import {el,button,field} from './dom.mjs';
import {createPreview} from './preview.mjs';
import {History} from './history.mjs';
import {validateProject,importProject,createEffect,deleteZone} from '../model/project.mjs';
import {insertPoint,clamp} from './geometry.mjs';
import {effectRegistry,defaultParams} from '../registry/effects.mjs';
export function mountPhotoEditor(root,{onChange}={}) {
if(!(root instanceof HTMLElement))throw Error('Efekt editörü bağlanacak yüzey bulunamadı.');
const $=selector=>root.querySelector(selector);
let disposed=false;
let soloId=null;
let scene,zoneId,effectId,vertex=0,playing=true,compare=false,loading=0;
const embedded=true;
const notify=type=>{if(type==='studio:dirty'&&!disposed)onChange?.();};
const changed=()=>notify("studio:dirty");
const inspect=(part)=>{
 if(!embedded)return;
 root.dataset.inspector=part;
 root.querySelector('#inspect-zone')?.setAttribute('aria-pressed',String(part==='zone'));
 root.querySelector('#inspect-effect')?.setAttribute('aria-pressed',String(part==='effect'));
};


const history=new History();
const status=(message,error=false)=>{ $('#status').textContent=message;$('#status').classList.toggle('error',error);$('#status').title=message; };
const error=e=>status(e.message||String(e),true);
const preview=createPreview({host:$('#preview-host'),image:$('#photo'),svg:$('#guides-svg'),stats:$('#stats'),onError:error});
const zone=()=>scene?.zones.find(z=>z.id===zoneId);
const effect=()=>scene?.effects.find(e=>e.id===effectId);
const uid=()=>crypto.randomUUID();
function mutate(action,key=null,render=true){
  if(!scene)return false;
  try {const next=structuredClone(scene);action(next);validateProject(next);history.record(scene,key);scene=next;preview.update(scene);if(render)draw();else{guides();historyButtons();}status(embedded?'Değişiklik yapıldı.':'Değişiklik uygulandı. JSON dışa aktararak kaydedin.');changed();return true;}catch(e){if(render)draw();error(e);return false;}
}
function historyButtons(){
  $('#undo').disabled=!history.past.length;$('#redo').disabled=!history.future.length;
  $('#undo').title=history.past.length?'Geri al (Ctrl/⌘ Z)':'Geri alınacak değişiklik yok.';
  $('#redo').title=history.future.length?'Yinele (Ctrl/⌘ Shift Z)':'Yinelenecek değişiklik yok.';
}
function input(label,value,change,attrs={}){return field(label,el('input',{value,...attrs,onchange:e=>change(e.target.type==='checkbox'?e.target.checked:e.target.type==='number'?e.target.valueAsNumber:e.target.value)}));}
function draw(){
  if(!scene)return;
  if(!zone())zoneId=scene.zones[0]?.id;
  if(!effect()||(embedded&&effect().zoneId!==zoneId))effectId=scene.effects.find(e=>e.zoneId===zoneId)?.id;
  if(soloId&&!scene.effects.some(e=>e.id===soloId)){soloId=null;preview.setSolo(null);}
  $('#solo-status').hidden=!soloId;
  $('#solo-status').textContent=soloId?'YALNIZ · '+effectRegistry[scene.effects.find(e=>e.id===soloId).type].label:'';
  $('#solo-status').title=$('#solo-status').textContent;
  $('#scene-name').value=scene.name;$('#scene-seed').value=scene.seed;
  $('#photo').alt=scene.photo.name;$('#gideros-license').hidden=scene.photo.src!=='assets/gideros-1-1818.webp';$('#photo-name').textContent=scene.photo.name;$('#dimensions').textContent=`${scene.photo.width} × ${scene.photo.height} · Orijinal koordinatlar`;
  $('#credit-text').textContent=scene.photo.credit||'Kullanıcı tarafından açılan fotoğraf. Kullanım hakkını ve kaynak bilgisini kendiniz koruyun.';
  const visibleEffects=embedded?scene.effects.filter(e=>e.zoneId===zoneId):scene.effects;
  $('#zone-count').textContent=scene.zones.length;$('#effect-count').textContent=visibleEffects.length;
  $('#zones').replaceChildren(...scene.zones.map(z=>{
    const linked=scene.effects.filter(e=>e.zoneId===z.id);
    return el('div',{class:'zone-group','data-zone-id':z.id},
      el('div',{class:'list-row '+(z.id===zoneId?'selected':'')},button(z.name,()=>{
        zoneId=z.id;effectId=linked[0]?.id;vertex=0;inspect('zone');draw();
      },{class:'row-select',title:z.name,'aria-pressed':String(z.id===zoneId)}),
        el('input',{type:'checkbox',checked:z.visible,'aria-label':z.name+' görünür',onchange:e=>mutate(s=>{s.zones.find(x=>x.id===z.id).visible=e.target.checked;})})),
      el('div',{class:'zone-linked-effects'},...linked.map(e=>button('↳ '+effectRegistry[e.type].label,()=>{
        zoneId=z.id;effectId=e.id;vertex=0;inspect('effect');draw();
      },{'data-effect-id':e.id,class:'zone-effect-link',title:effectRegistry[e.type].label,'aria-pressed':String(e.id===effectId)}))));
  }));
  $('#effects').replaceChildren(...visibleEffects.map(e=>el('div',{class:`list-row ${e.id===effectId?'selected':''}`,'data-effect-id':e.id},button(effectRegistry[e.type].label,()=>{effectId=e.id;zoneId=e.zoneId;vertex=0;inspect("effect");draw();},{class:'row-select',title:effectRegistry[e.type].label,'aria-pressed':String(e.id===effectId)}),el('input',{type:'checkbox',checked:e.enabled,'aria-label':`${effectRegistry[e.type].label} etkin`,onchange:event=>mutate(s=>{s.effects.find(x=>x.id===e.id).enabled=event.target.checked;})}))));
  if(embedded&&!visibleEffects.length)$('#effects').append(el('p',{class:'empty',role:'status',text:zone()?'Bu alanda efekt yok.':'Önce bir alan ekleyin.'}));
  $('#add-effect').disabled=!zone();
  $('#add-effect').title=zone()?'Seçili alana efekt ekle':'Önce bir alan ekleyin.';
  const z=zone(),zi=$('#zone-inspector');zi.replaceChildren(el('h2',{text:embedded?'Alan':'Bölge'}));
  if(z){
    vertex=clamp(vertex,0,z.points.length-1);
    zi.append(input(embedded?'Alan adı':'Bölge adı',z.name,value=>mutate(s=>{s.zones.find(x=>x.id===zoneId).name=value;}),{maxlength:160}),el('p',{class:'help',text:`${z.points.length} köşe · Seçili köşe: ${vertex+1}` }));
    const choices=el('select',{'aria-label':'Köşe seç',onchange:e=>{vertex=Number(e.target.value);draw();}},...z.points.map((p,i)=>el('option',{value:i,text:`${i+1}: ${p[0]}, ${p[1]}`,selected:i===vertex})));
    zi.append(field('Köşe',choices));
    for(const [i,label] of ['X','Y'].entries())zi.append(input(label,z.points[vertex][i],value=>mutate(s=>{s.zones.find(x=>x.id===zoneId).points[vertex][i]=value;}),{type:'number',min:0,max:i?scene.photo.height:scene.photo.width,step:.01}));
    zi.append(el('div',{class:'button-row'},button('Köşe ekle',()=>mutate(s=>{const target=s.zones.find(x=>x.id===zoneId);target.points=insertPoint(target.points,vertex);vertex++;}),{disabled:z.points.length>=200,title:z.points.length>=200?'Bir alanda en fazla 200 köşe olabilir.':'Seçili köşeden sonra köşe ekle'}),button('Köşe sil',removeVertex,{disabled:z.points.length<=3,title:z.points.length<=3?'Bir alanın en az 3 köşesi olmalı.':'Seçili köşeyi sil'})),button(embedded?'Alanı sil':'Bölgeyi sil',()=>mutate(s=>Object.assign(s,deleteZone(s,zoneId))),{class:'danger full'}));
  }else zi.append(el('p',{class:'empty',text:embedded?'Bir alan ekleyin.':'Bir bölge ekleyin.'}));
  const e=effect(),ei=$('#effect-inspector');ei.replaceChildren(el('h2',{text:'Efekt'}));
  if(e){
    ei.append(effectActionRow(scene,e,soloId,{mutate,setSolo:id=>{soloId=id;preview.setSolo(id);draw();}}));
    $('#effect-up').title=scene.effects[0].id===e.id?'Efekt zaten ilk sırada.':'Efekti çizim sırasında yukarı taşı';
    $('#effect-down').title=scene.effects.at(-1).id===e.id?'Efekt zaten son sırada.':'Efekti çizim sırasında aşağı taşı';
    const change=(key,value)=>mutate(s=>{s.effects.find(x=>x.id===effectId)[key]=value;});
    ei.append(field('Tür',el('select',{onchange:event=>mutate(s=>{const target=s.effects.find(x=>x.id===effectId);target.type=event.target.value;target.params=defaultParams(target.type);})},...Object.entries(effectRegistry).map(([type,info])=>el('option',{value:type,text:info.label,selected:type===e.type})))),field(embedded?'Alan':'Bölge',el('select',{onchange:event=>{zoneId=event.target.value;change('zoneId',zoneId);}},...scene.zones.map(z=>el('option',{value:z.id,text:z.name,selected:z.id===e.zoneId})))),input('Efekt tohumu',e.seed,value=>change('seed',value),{maxlength:120}));
    for(const c of effectRegistry[e.type].controls){
      const set=value=>mutate(s=>{s.effects.find(x=>x.id===e.id).params[c.key]=value;},`param:${e.id}:${c.key}`,false);
      if(c.kind==='boolean')ei.append(field(c.label,el('input',{type:'checkbox',checked:e.params[c.key],onchange:event=>set(event.target.checked)})));
      else {
        const number=el('input',{type:'number',value:e.params[c.key],min:c.min,max:c.max,step:c.step,'aria-label':c.label});
        const range=el('input',{type:'range',value:e.params[c.key],min:c.min,max:c.max,step:c.step,'aria-label':`${c.label} sürgü`});
        number.addEventListener('change',()=>{if(set(number.valueAsNumber))range.value=number.value;else number.value=effect().params[c.key];});
        range.addEventListener('input',()=>{if(set(range.valueAsNumber))number.value=range.value;});
        ei.append(el('div',{class:'param'},el('div',{class:'param-line'},el('label',{text:c.label}),number),range));
      }
    }
    ei.append(el('div',{class:'button-row'},button('Kopyala',()=>mutate(s=>{const copy=structuredClone(e);copy.id=uid();s.effects.push(copy);effectId=copy.id;})),button(e.enabled?'Devre dışı':'Etkinleştir',()=>change('enabled',!e.enabled)),button('Sil',()=>mutate(s=>{s.effects=s.effects.filter(x=>x.id!==effectId);effectId=null;}),{class:'danger'})));
  }else ei.append(el('p',{class:'empty',text:'Bir efekt seçin veya ekleyin.'}));
  guides();historyButtons();
}
function removeVertex(){if(zone()?.points.length>3)mutate(s=>{s.zones.find(x=>x.id===zoneId).points.splice(vertex,1);});}
const ns='http://www.w3.org/2000/svg';
function svgNode(tag,attrs){const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);return node;}
let drag=null;
function guides(){
  const svg=$('#guides-svg');svg.style.display=$('#guides').checked?'':'none';svg.replaceChildren();if(!scene)return;
  for(const z of scene.zones){if(!z.visible)continue;
    const polygon=svgNode('polygon',{points:z.points.map(p=>preview.project(p).join(',')).join(' '),class:`zone-polygon ${z.id===zoneId?'is-selected':''}`});
    polygon.addEventListener('click',()=>{zoneId=z.id;effectId=scene.effects.find(e=>e.zoneId===z.id)?.id;vertex=0;inspect('zone');draw();});svg.append(polygon);
  }
  const z=zone();if(!z?.visible)return;
  z.points.forEach((p,i)=>{const [cx,cy]=preview.project(p);const circle=svgNode('circle',{cx,cy,r:6,class:`vertex ${i===vertex?'selected':''}`,tabindex:0,role:'button','aria-label':`Köşe ${i+1}`});
    circle.addEventListener('pointerdown',event=>{event.preventDefault();vertex=i;drag={id:event.pointerId,before:structuredClone(scene),changed:false};$('#preview-host').setPointerCapture(event.pointerId);guides();});
    circle.addEventListener('focus',()=>{vertex=i;});
    circle.addEventListener('keydown',event=>{if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeVertex();return;}const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!moves[event.key])return;event.preventDefault();const delta=moves[event.key],step=event.shiftKey?10:1;mutate(s=>{const point=s.zones.find(x=>x.id===zoneId).points[i];point[0]=clamp(point[0]+delta[0]*step,0,s.photo.width);point[1]=clamp(point[1]+delta[1]*step,0,s.photo.height);},`vertex:${zoneId}:${i}`,false);$('#guides-svg').querySelectorAll('.vertex')[i]?.focus();});svg.append(circle);
  });
}
const onPointerMove=event=>{if(!drag||event.pointerId!==drag.id||disposed)return;const next=structuredClone(scene);next.zones.find(z=>z.id===zoneId).points[vertex]=preview.point(event);try{validateProject(next);scene=next;drag.changed=true;preview.update(scene);guides();}catch(e){error(e);}};
$('#preview-host').addEventListener('pointermove',onPointerMove);
function endDrag(event){if(!drag||event.pointerId!==drag.id)return;if(drag.changed){history.record(drag.before);changed();status('Köşe fotoğraf koordinatlarında taşındı.');}drag=null;draw();}
$('#preview-host').addEventListener('pointerup',endDrag);$('#preview-host').addEventListener('pointercancel',endDrag);
const sizeObserver=new ResizeObserver(guides);sizeObserver.observe($('#preview-host'));
$('#photo').addEventListener('load',guides);
async function install(next,message){const token=++loading;await preview.loadPhoto(next.photo);if(token!==loading||disposed)return;if(scene)history.record(scene);scene=next;soloId=null;preview.setSolo(null);zoneId=next.zones[0]?.id;effectId=embedded?next.effects.find(e=>e.zoneId===zoneId)?.id:next.effects[0]?.id;vertex=0;inspect('effect');preview.update(scene,{immediate:true});draw();status(message);}
for(const [type,info]of Object.entries(effectRegistry))$('#effect-type').append(el('option',{value:type,text:info.label}));
$('#add-zone').onclick=()=>mutate(s=>{const w=s.photo.width,h=s.photo.height;const z={id:uid(),name:`${embedded?'Alan':'Bölge'} ${s.zones.length+1}`,visible:true,points:[[w*.3,h*.3],[w*.7,h*.3],[w*.7,h*.7],[w*.3,h*.7]]};s.zones.push(z);zoneId=z.id;effectId=null;vertex=0;inspect('zone');});
$('#add-effect').onclick=()=>{if(zone())mutate(s=>{const e=createEffect($('#effect-type').value,zoneId,uid());s.effects.push(e);effectId=e.id;inspect('effect');});};
$('#scene-name').onchange=e=>mutate(s=>{s.name=e.target.value;});$('#scene-seed').onchange=e=>mutate(s=>{s.seed=e.target.value;});
function travel(direction){if(!scene)return;scene=history[direction](scene);preview.update(scene,{immediate:true});draw();status(direction==='undo'?'Geri alındı.':'Yinelendi.');changed();}
$('#undo').onclick=()=>travel('undo');$('#redo').onclick=()=>travel('redo');
const onKeyDown=e=>{if(e.key==='Escape')closeContextMenu();if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z'||e.target.matches('input,select,textarea'))return;e.preventDefault();travel(e.shiftKey?'redo':'undo');};
root.addEventListener('keydown',onKeyDown);
$('#play').onclick=()=>{playing=!playing;preview.setPlaying(playing);$('#play').textContent=playing?'Ⅱ Duraklat':'▶ Oynat';$('#play').setAttribute('aria-pressed',String(playing));};
$('#compare').onclick=()=>{compare=!compare;preview.setCompare(compare);$('#compare').setAttribute('aria-pressed',String(compare));$('#comparison-badge').hidden=!compare;};
$('#guides').onchange=guides;$('#fit').onchange=e=>{preview.setFit(e.target.value);guides();};
$('#restart').onclick=()=>{preview.rebuild();status('Önizleme aynı tohumla başlatıldı.');};

let contextMenu=null;
function closeContextMenu(){contextMenu?.remove();contextMenu=null;}
const onContextMenu=event=>{
  if(disposed||!scene||!(event.target instanceof Element))return;
  const effectRow=event.target.closest('[data-effect-id]');
  const zoneRow=event.target.closest('[data-zone-id]');
  const canvas=event.target.closest('#preview-host');
  if(!effectRow&&!zoneRow&&!canvas)return;
  event.preventDefault();
  closeContextMenu();
  const actions=[];
  if(effectRow){
    const id=effectRow.dataset.effectId;
    const e=scene.effects.find(e=>e.id===id);
    if(!e)return;
    actions.push(['Efekti düzenle',()=>{zoneId=e.zoneId;effectId=id;inspect('effect');draw();}]);
    actions.push(['Yalnız önizle',()=>{soloId=soloId===id?null:id;preview.setSolo(soloId);draw();}]);
    actions.push(['Efekti sil',()=>mutate(s=>{s.effects=s.effects.filter(e=>e.id!==id);effectId=null;})]);
  }else if(zoneRow){
    const id=zoneRow.dataset.zoneId;
    const z=scene.zones.find(z=>z.id===id);
    if(!z)return;
    actions.push(['Alanı düzenle',()=>{zoneId=id;effectId=scene.effects.find(e=>e.zoneId===id)?.id;inspect('zone');draw();}]);
    actions.push([z.visible?'Alanı gizle':'Alanı göster',()=>mutate(s=>{s.zones.find(z=>z.id===id).visible=!z.visible;})]);
    actions.push(['Alanı sil',()=>mutate(s=>Object.assign(s,deleteZone(s,id)))]);
  }else if(canvas){
    actions.push(['Yeni alan',()=>$('#add-zone').click()]);
    if(zone())actions.push(['Seçili alana efekt ekle',()=>$('#add-effect').click()]);
  }
  const menu=el('div',{class:'editor-context-menu',role:'menu'},...actions.map(([label,action])=>button(label,()=>{
    closeContextMenu();action();
  },{role:'menuitem'})));
  root.append(menu);contextMenu=menu;
  menu.querySelector('button')?.focus();
  const bounds=root.getBoundingClientRect();
  menu.style.left=Math.max(0,Math.min(event.clientX-bounds.left,root.clientWidth-menu.offsetWidth-6))+'px';
  menu.style.top=Math.max(0,Math.min(event.clientY-bounds.top,root.clientHeight-menu.offsetHeight-6))+'px';
};
const dismissMenu=event=>{if(contextMenu&&!contextMenu.contains(event.target))closeContextMenu();};
root.addEventListener('contextmenu',onContextMenu);
root.addEventListener('pointerdown',dismissMenu);
inspect('effect');
$('#inspect-effect').onclick=()=>inspect('effect');
$('#inspect-zone').onclick=()=>inspect('zone');
$('#inspect-scene').onclick=()=>inspect('scene');
return {
  async load(value) {
    if(disposed)throw Error('Efekt atölyesi kapandı.');
    const next=importProject(JSON.stringify(value));
    await install(next,'Sahne hazır.');
    if(disposed)throw Error('Efekt atölyesi kapandı.');
    history.past.length=0;history.future.length=0;historyButtons();
  },
  snapshot() {
    if(disposed||!scene)throw Error('Düzenlenecek sahne bulunamadı.');
    return structuredClone(scene);
  },
  destroy() {
    if(disposed)return;
    disposed=true;loading++;
    closeContextMenu();root.removeEventListener('contextmenu',onContextMenu);
    root.removeEventListener('pointerdown',dismissMenu);
    sizeObserver.disconnect();
    root.removeEventListener('keydown',onKeyDown);
    $('#preview-host').removeEventListener('pointermove',onPointerMove);
    $('#preview-host').removeEventListener('pointerup',endDrag);
    $('#preview-host').removeEventListener('pointercancel',endDrag);
    $('#photo').removeEventListener('load',guides);
    preview.destroy();drag=null;scene=null;
  }
};
}

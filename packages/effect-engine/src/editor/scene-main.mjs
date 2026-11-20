import {$,el,button,field,download,readFile} from './dom.mjs';
import {sceneProfiles,profileForEffect,applySceneProfile,basicControls,assertSiteStructure} from './scene-ux.mjs';
import {History} from './history.mjs';
import {validateProject,importProject,exportProject,MAX_FILE_BYTES} from '../model/project.mjs';
import {objectEffectRegistry,defaultObjectParams,effectTrigger,allowedEffectTriggers} from '../registry/effects.mjs';
import {anchorScenePoint,effectScenePoint} from '../runtime/object-scene.mjs';
import {bindObjectScene} from '../runtime/object-overlay.mjs';

let scene=null,objectId=null,effectId=null,anchorId=null,playing=true;
let previewHandle=null,previewFrame=null;
let previewObjects=new Map();
let siteSource=false,sourceScene=null,showPhoto=true,showEffects=true,objectFilter='all';
const objectElements=new Map(),markerElements=new Map();
const history=new History();
const embedded=new URLSearchParams(location.search).get('embedded')==='1';
const notify=(type,extra={})=>{if(embedded)window.parent.postMessage({type,...extra},'*');};
const changed=()=>notify('studio:dirty');
const status=(message,isError=false)=>{const node=$('#status');node.textContent=message;node.classList.toggle('error',isError);};
const error=e=>{const message=e?.message||String(e);status(message,true);};
const object=()=>scene?.objects.find(item=>item.id===objectId);
const effect=()=>scene?.effects.find(item=>item.id===effectId);
const anchor=()=>object()?.anchors.find(item=>item.id===anchorId);
const effectsForObject=()=>scene?.effects.filter(item=>item.target.objectId===objectId)??[];
const uid=()=>crypto.randomUUID();
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const round=value=>Math.round(value*1e4)/1e4;
const isObjectScene=value=>value?.version===2&&value?.kind==='objectScene';

function validateScene(next){
  validateProject(next);
  if(!isObjectScene(next))throw new Error('Bu düzenleyici yalnız version 2 objectScene sahnelerini açar.');
  if(siteSource&&sourceScene)assertSiteStructure(next,sourceScene);
  return next;
}

function uniqueEffectId(type){
  for(let i=0;i<100;i++){
    const id=`${type}-${uid().slice(0,8)}`;
    if(!scene.objects.some(item=>item.id===id)&&!scene.effects.some(item=>item.id===id))return id;
  }
  throw new Error('Benzersiz efekt kimliği üretilemedi.');
}
function selectObject(id){
  if(id===objectId){draw();return;}
  objectId=id;
  const target=object();
  anchorId=target?.anchors[0]?.id??null;
  effectId=scene.effects.find(item=>item.target.objectId===id)?.id??null;
  draw();
}
function selectEffect(id){
  const next=scene.effects.find(item=>item.id===id);
  if(!next)return;
  effectId=next.id;objectId=next.target.objectId;anchorId=next.target.anchorId;
  draw();
}
function selectForDrag(next){
  effectId=next.id;objectId=next.target.objectId;anchorId=next.target.anchorId;
  renderLists();renderObjectInspector();renderEffectInspector();renderStageSelection();
}
function mutate(action,key=null){
  if(!scene)return false;
  try{
    const next=structuredClone(scene);
    action(next);
    validateScene(next);
    history.record(scene,key);
    scene=next;
    draw();
    status(embedded?'Değişiklik yapıldı.':'Değişiklik uygulandı. JSON dışa aktararak kaydedin.');
    changed();
    return true;
  }catch(e){error(e);draw();return false;}
}
function numberInput(label,value,change,attrs={}){
  const input=el('input',{type:'number',value,onchange:event=>change(event.target.valueAsNumber),...attrs});
  return field(label,input);
}
function checkField(label,checked,change,attrs={}){
  return field(label,el('input',{type:'checkbox',checked,onchange:event=>change(event.target.checked),...attrs}));
}

function renderLists(){
  if(!scene)return;
  $('#object-count').textContent=String(scene.objects.length);
  const rows=scene.objects.filter(item=>objectFilter==='all'||scene.effects.some(entry=>entry.target.objectId===item.id)).map(item=>{
    const effects=scene.effects.filter(entry=>entry.target.objectId===item.id),enabled=effects.filter(entry=>entry.enabled).length;
    const state=effects.length?`${effects.length} efekt · ${enabled?`${enabled} açık`:'kapalı'}`:'Efekt yok';
    return el('div',{class:`scene-list-row ${item.id===objectId?'selected':''}`},
      el('button',{type:'button',id:`object-select-${item.id}`,class:'scene-row-select','aria-pressed':String(item.id===objectId),onclick:()=>selectObject(item.id)},
        el('span',{text:item.name}),el('span',{class:'scene-row-meta',text:`${state}${item.visible?'':' · gizli'}`})));
  });
  $('#object-list').replaceChildren(...(rows.length?rows:[el('p',{class:'scene-empty',text:'Filtreye uygun nesne yok.'})]));
  const effects=effectsForObject();
  $('#effect-count').textContent=String(effects.length);
  $('#selected-object-name').textContent=object()?.name??'Bir nesne seçin';
  const effectRows=effects.map(item=>el('div',{class:`scene-list-row ${item.id===effectId?'selected':''}`},
    button(objectEffectRegistry[item.type].label,()=>selectEffect(item.id),{id:`effect-select-${item.id}`,class:'scene-row-select','aria-pressed':String(item.id===effectId)}),
    el('label',{class:'scene-row-check',title:`${objectEffectRegistry[item.type].label} etkin`},
      el('input',{type:'checkbox',id:`effect-list-enabled-${item.id}`,checked:item.enabled,'aria-label':`${objectEffectRegistry[item.type].label} etkin`,onchange:event=>mutate(s=>{s.effects.find(entry=>entry.id===item.id).enabled=event.target.checked;})}))
  ));
  $('#effect-list').replaceChildren(...(effectRows.length?effectRows:[el('p',{class:'scene-empty',text:siteSource?'Bu nesneye bağlı site efekti yok.':'Bu nesnede efekt yok; desteklenen bir tür ekleyin.'})]));
  $('#add-effect-controls').hidden=siteSource;
  $('#add-effect').disabled=!object()?.anchors.length;
  $('#source-note').textContent=siteSource?'Nesne yerleşimi ve görünürlüğü site kaynağına aittir. Mevcut efektleri düzenleyebilirsiniz.':'Yerel sahne: görünürlük ve yerleşim İnce ayarlar bölümündedir.';
  $('#site-effects-note').hidden=!siteSource;
  document.querySelector('.scene-local-badge').textContent=siteSource?'Site kaynağı':'Yerel';
}
function renderObjectInspector(){
  const host=$('#object-inspector');const item=object();
  host.replaceChildren(el('h3',{text:'Nesne ve bağlantı'}));
  if(!item)return;
  if(siteSource){
    host.append(el('p',{class:'scene-help',text:'Nesne konumu, görünürlüğü ve bağlantıları site kaynağında sabittir. Hizalamayı efekt kaydırmasıyla yapın.'}));return;
  }
  host.append(
    field('Nesne adı',el('input',{value:item.name,maxlength:160,onchange:event=>mutate(s=>{s.objects.find(entry=>entry.id===item.id).name=event.target.value;},`object:${item.id}:name`)})),
    checkField('Görünür',item.visible,value=>mutate(s=>{s.objects.find(entry=>entry.id===item.id).visible=value;},`object:${item.id}:visible`))
  );
  for(const [key,label,min,max,step] of [['x','X',0,1,.001],['y','Y',0,1,.001],['width','Genişlik',.001,1,.001],['height','Yükseklik',.001,1,.001],['rotation','Dönüş (derece)',-360,360,1],['depth','Derinlik',-100,100,1]]){
    host.append(numberInput(label,item.pose[key],value=>mutate(s=>{s.objects.find(entry=>entry.id===item.id).pose[key]=value;},`object:${item.id}:${key}`),{min,max,step}));
  }
  if(!siteSource)host.append(field('Hareketli katman kimlikleri',el('input',{value:(item.motionLayers??[]).join(','),'aria-label':'Hareketli katman kimlikleri',onchange:event=>mutate(s=>{s.objects.find(o=>o.id===item.id).motionLayers=event.target.value.split(',').map(v=>v.trim()).filter(Boolean);})})));
  if(!item.anchors.length)return;
  host.append(field('Bağlantı noktası',el('select',{'aria-label':'Adlandırılmış bağlantı noktası',onchange:event=>{anchorId=event.target.value;renderObjectInspector();}},
    ...item.anchors.map(entry=>el('option',{value:entry.id,text:entry.id,selected:entry.id===anchorId})))));
  const current=anchor();
  if(current){
    for(const key of ['x','y'])host.append(numberInput(`Bağlantı ${key.toUpperCase()}`,current[key],value=>mutate(s=>{s.objects.find(entry=>entry.id===item.id).anchors.find(entry=>entry.id===current.id)[key]=value;},`anchor:${item.id}:${current.id}:${key}`),{min:0,max:1,step:.001}));
    const point=anchorScenePoint(item,current.id);
    host.append(el('p',{class:'scene-location',text:`Görsel konum: ${Math.round(point.x*scene.viewport.width)} × ${Math.round(point.y*scene.viewport.height)} px (${scene.viewport.width} × ${scene.viewport.height})`}));
  }
}
function renderEffectInspector(){
  const host=$('#effect-inspector'),advanced=$('#effect-advanced'),item=effect();
  host.replaceChildren(el('h2',{text:'Efekt'}));advanced.replaceChildren();
  if(!item){host.append(el('p',{class:'scene-empty',text:siteSource?'Bu nesnenin siteye bağlı efekti bulunmuyor. Bu kaynakta yeni efekt ekleme desteklenmiyor.':'Bir efekt seçin veya ekleyin.'}));return;}
  const info=objectEffectRegistry[item.type];
  host.append(el('p',{class:'scene-effect-title',text:info.label}),
    checkField('Etkin',item.enabled,value=>mutate(s=>{s.effects.find(entry=>entry.id===item.id).enabled=value;},`effect:${item.id}:enabled`),{id:'effect-enabled'}),
    el('p',{class:'scene-help',text:info.description}),
    el('div',{class:'scene-section-title'},el('h3',{text:'Parametre profili'}),el('span',{id:'effect-profile',class:'scene-profile-state',text:profileForEffect(item)})),
    el('div',{class:'scene-profiles'},...sceneProfiles.map(profile=>button(profile.label,()=>mutate(s=>applySceneProfile(s.effects.find(entry=>entry.id===item.id),profile.key)),{id:`profile-${profile.key}`,'aria-pressed':String(profileForEffect(item)===profile.label)})))
  );
  const selectedTrigger=effectTrigger(item);
  const availableTriggers=allowedEffectTriggers(item.type);
  const labels={ambient:'Sürekli',click:'OnClick · Tıklama',hover:'OnHover · Üzerine gelme'};
  host.append(field('Tetikleme',el('select',{
    id:'effect-trigger','aria-label':'Tetikleme',disabled:availableTriggers.length===1,
    onchange:event=>mutate(s=>{
      const target=s.effects.find(entry=>entry.id===item.id);
      target.trigger=event.target.value;
      if(event.target.value==='ambient')delete target.interaction;
    }),
  },...availableTriggers.map(trigger=>el('option',{value:trigger,text:labels[trigger],selected:trigger===selectedTrigger})))));
  if(['hover','click'].includes(selectedTrigger)&&item.type==='glow'){
    host.append(el('p',{class:'scene-help',text:selectedTrigger==='hover'
      ?'Nesneye gelince 0→1, ayrılınca bulunduğu noktadan 1→0. Klavye odağı da çalışır.'
      :'Tıklanınca 0→1→0; mevcut nesne tıklamasını engellemez.'}));
    for(const [key,label,fallback] of [['enterMs','İleri hareket (ms)',240],['leaveMs','Geri hareket (ms)',190]]){
      host.append(numberInput(label,item.interaction?.[key]??fallback,value=>mutate(s=>{
        const target=s.effects.find(entry=>entry.id===item.id);
        target.interaction={enterMs:240,leaveMs:190,...target.interaction,[key]:value};
      }),{id:'interaction-'+key,min:80,max:2000,step:10}));
    }
  }
  for(const control of basicControls(item.type)){
    const id=`basic-${control.key}`,value=item.params[control.key];
    const format=value=>control.key==='amplitude'?`${Number(value).toFixed(1)}°`:control.key==='frequency'?`${Number(value).toFixed(1)} Hz`:control.key==='damping'?`${Number(value).toFixed(1)} s⁻¹`:control.key==='duration'?`${Number(value).toFixed(2)} s`:control.key==='speed'?`${Number(value).toFixed(2)} ×`:`${Math.round(Number(value)*100)} %`;
    const output=el('output',{htmlFor:id,text:format(value)});
    const input=el('input',{id,type:'range',min:control.min,max:control.max,step:control.step,value,'aria-label':control.label,
      oninput:event=>{output.textContent=format(event.target.value);},
      onchange:event=>mutate(s=>{s.effects.find(entry=>entry.id===item.id).params[control.key]=event.target.valueAsNumber;})});
    host.append(el('div',{class:'scene-slider'},el('div',{class:'scene-slider-title'},el('label',{htmlFor:id,text:control.label}),output),input));
  }
  if(info.trigger==='pulse')host.append(el('p',{class:'scene-help',text:'Tıklayınca · kısa süreli efekt'}),button('Efekti dene',()=>bindPreview(item.id),{id:'preview-pulse',disabled:!item.enabled}));
  if(item.type==='glow'&&selectedTrigger==='click')host.append(button('Efekti dene',()=>previewHandle?.triggerEffect(item.id),{id:'preview-interaction-click',disabled:!item.enabled}));
  if(item.type==='glow'&&selectedTrigger==='hover')host.append(el('p',{class:'scene-help',text:'Önizleme: Görselde nesneye gelin ve ayrılın.'}));
  if(!item.enabled)host.append(el('p',{class:'scene-help',text:'Efekt kapalı. Önizlemede görmek için Etkin seçeneğini açın.'}));
  if(!siteSource){
    advanced.append(field('Tür',el('select',{'aria-label':'Efekt türü',onchange:event=>mutate(s=>{const target=s.effects.find(entry=>entry.id===item.id);target.type=event.target.value;target.params=defaultObjectParams(target.type);if(objectEffectRegistry[target.type].output==='motion'){target.target.layerId=object().motionLayers?.[0];}else delete target.target.layerId;})},
      ...Object.entries(objectEffectRegistry).map(([type,entry])=>el('option',{value:type,text:entry.label,selected:type===item.type})))),
      field('Hedef bağlantı',el('select',{'aria-label':'Efekt hedef bağlantısı',onchange:event=>mutate(s=>{s.effects.find(entry=>entry.id===item.id).target.anchorId=event.target.value;})},
      ...object().anchors.map(entry=>el('option',{value:entry.id,text:entry.id,selected:entry.id===item.target.anchorId})))));
  }
  if(info.output==='motion')advanced.append(field('Hareketli katman',el('select',{'aria-label':'Hareketli katman',disabled:Boolean(siteSource),onchange:event=>mutate(s=>{s.effects.find(entry=>entry.id===item.id).target.layerId=event.target.value;})},...object().motionLayers.map(id=>el('option',{value:id,text:id,selected:id===item.target.layerId})))));
  advanced.append(el('p',{class:'scene-help',text:`Hedef: ${object().name} → ${item.target.anchorId}. Kaydırma nesne boyutuna göredir; profiller hizalamayı değiştirmez.`}));
  for(const [key,label,min,max,step] of [['x','Kaydırma X',-5,5,.01],['y','Kaydırma Y',-5,5,.01]])advanced.append(numberInput(label,item.target.offset[key],value=>mutate(s=>{s.effects.find(entry=>entry.id===item.id).target.offset[key]=value;}),{id:`effect-offset-${key}`,min,max,step}));
  for(const [key,label,min,max,step] of [['scale','Ölçek',.01,10,.01],['depth','Efekt derinliği',-100,100,1]])advanced.append(numberInput(label,item.target[key],value=>mutate(s=>{s.effects.find(entry=>entry.id===item.id).target[key]=value;}),{min,max,step}));
  advanced.append(field('Efekt tohumu',el('input',{value:item.seed,maxlength:120,onchange:event=>mutate(s=>{s.effects.find(entry=>entry.id===item.id).seed=event.target.value;})})));
  for(const control of info.controls)advanced.append(numberInput(control.label,item.params[control.key],value=>mutate(s=>{s.effects.find(entry=>entry.id===item.id).params[control.key]=value;}),{min:control.min,max:control.max,step:control.step,'aria-label':control.label}));
  if(!siteSource)advanced.append(el('div',{class:'scene-button-row'},
    button('Kopyala',()=>mutate(s=>{const copy=structuredClone(item);copy.id=uniqueEffectId(copy.type);copy.seed=`${copy.seed}-copy`;s.effects.push(copy);effectId=copy.id;})),
    button('Sil',()=>mutate(s=>{s.effects=s.effects.filter(entry=>entry.id!==item.id);effectId=null;}),{class:'scene-danger'})));
}

function buildObject(item){
  const node=el('div',{
    id:`stage-object-${item.id}`,class:`scene-object ${item.id===objectId?'selected':''} ${item.visible?'':'is-hidden'}`,
    'data-scene-object':item.id,'data-scene-object-id':item.id,'data-object-id':item.id,'data-scene-id':scene.sceneId,
    role:'button',tabindex:0,'aria-label':`${item.name} nesnesi`,
    title:`${item.name} · ${item.id}`
  });
  Object.assign(node.style,{
    left:`${item.pose.x*100}%`,top:`${item.pose.y*100}%`,width:`${item.pose.width*100}%`,height:`${item.pose.height*100}%`,
    transform:`rotate(${item.pose.rotation}deg)`,zIndex:String(100+Math.round(item.pose.depth))
  });
  const artwork=previewObjects.get(item.id);
  if(artwork){
    const fixed=el('img',{src:artwork.image,alt:'',class:'scene-motion-fixed'});
    Object.assign(fixed.style,{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',filter:'brightness(.72) saturate(.72)'});node.append(fixed);
  }
  for(const id of item.motionLayers??[]){
    const layer=el('span',{'data-effect-layer':id,'aria-hidden':'true'});
    Object.assign(layer.style,{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'});
    const picture=artwork?.layers.find(entry=>entry.id===id);
    if(picture){const image=el('img',{src:picture.image,alt:''});const b=picture.box;Object.assign(image.style,{position:'absolute',left:`${b.x*100}%`,top:`${b.y*100}%`,width:`${b.width*100}%`,height:`${b.height*100}%`,filter:'brightness(.7) saturate(.7)'});layer.append(image);}
    else {const sample=el('span');Object.assign(sample.style,{position:'absolute',left:'49%',top:'10%',width:'2%',height:'50%',background:'#b68d4b',borderRadius:'50%'});layer.append(sample);}
    node.append(layer);
  }
  node.append(el('span',{class:'scene-object-label',text:item.name}));
  for(const point of item.anchors){
    const dot=el('span',{class:`scene-object-anchor ${point.id===anchorId?'is-selected':''}`,'data-anchor-id':point.id,'aria-hidden':'true'});
    dot.style.left=`${point.x*100}%`;dot.style.top=`${point.y*100}%`;node.append(dot);
  }
  node.addEventListener('click',()=>selectObject(item.id));
  node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectObject(item.id);}});
  return node;
}
function renderMarkers(){
  $('#scene-markers').replaceChildren();
  markerElements.clear();
  if(!scene)return;
  scene.effects.forEach((item,index)=>{
    const owner=scene.objects.find(entry=>entry.id===item.target.objectId);
    if(!owner)return;
    const point=effectScenePoint(owner,item);
    const marker=el('button',{type:'button',id:`marker-${item.id}`,class:`scene-marker ${item.id===effectId?'is-selected':''} ${item.enabled&&owner.visible?'':'is-off'}`,text:String(index+1),
      title:`${objectEffectRegistry[item.type].label} · ${owner.name} → ${item.target.anchorId}`,'aria-label':`${objectEffectRegistry[item.type].label} hedefini sürükle`});
    marker.dataset.effectId=item.id;
    Object.assign(marker.style,{left:`${point.x*100}%`,top:`${point.y*100}%`});
    marker.addEventListener('pointerdown',event=>beginDrag(event,item));
    marker.addEventListener('click',()=>selectEffect(item.id));
    marker.addEventListener('keydown',event=>{
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight'&&event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;
      event.preventDefault();
      const step=event.shiftKey?.05:.01;
      mutate(s=>{const target=s.effects.find(entry=>entry.id===item.id);target.target.offset.x=round(clamp(target.target.offset.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),-5,5));target.target.offset.y=round(clamp(target.target.offset.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0),-5,5));},`effect:${item.id}:offset`);
    });
    markerElements.set(item.id,marker);
    $('#scene-markers').append(marker);
  });
}
function renderStageSelection(){
  for(const [id,node] of objectElements)node.classList.toggle('selected',id===objectId);
  for(const [id,node] of markerElements)node.classList.toggle('is-selected',id===effectId);
}
function bindPreview(pulseId=null){
  previewHandle?.destroy();previewHandle=null;
  if(!scene)return;
  try{
    const selected={...scene,effects:scene.effects.filter(item=>objectEffectRegistry[item.type].trigger!=='pulse'||item.id===pulseId)};
    previewHandle=bindObjectScene(selected,id=>objectElements.get(id),{expectedSceneId:scene.sceneId,interactive:true});
    if(!playing)previewHandle.setPaused(true);
    previewHandle.setEnabled(showEffects);
  }catch(e){previewHandle=null;error(e);}
}
function renderStage(){
  previewHandle?.destroy();previewHandle=null;
  const host=$('#scene-objects');host.replaceChildren();objectElements.clear();
  if(!scene)return;
  for(const item of scene.objects){
    const node=buildObject(item);objectElements.set(item.id,node);host.append(node);
  }
  bindPreview();
  renderMarkers();
}
function draw(){
  if(!scene)return;
  const focusId=document.activeElement?.id;
  const scrolls=[...document.querySelectorAll('.scene-panel')].map(node=>[node,node.scrollTop]);
  if(!object())objectId=scene.objects[0]?.id??null;
  const owner=object();
  if(!owner)objectId=scene.objects[0]?.id??null;
  if(anchorId&&!anchor())anchorId=owner?.anchors[0]?.id??null;
  if(!anchorId)anchorId=owner?.anchors[0]?.id??null;
  if(effectId&&!effectsForObject().some(item=>item.id===effectId))effectId=null;
  if(!effectId)effectId=effectsForObject()[0]?.id??null;
  if(effect()&&anchorId!==effect().target.anchorId)anchorId=effect().target.anchorId;
  $('#scene-name').value=scene.name;
  $('#scene-id-line').textContent=`sceneId: ${scene.sceneId} · ${scene.viewport.width} × ${scene.viewport.height}`;
  $('#scene-seed').value=scene.seed;
  renderLists();
  renderObjectInspector();
  renderEffectInspector();
  renderStage();
  updateHistoryButtons();
  if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
  for(const [node,top] of scrolls)node.scrollTop=top;
}
function updateHistoryButtons(){
  $('#undo').disabled=!history.past.length;
  $('#redo').disabled=!history.future.length;
}
let drag=null;
function beginDrag(event,item){
  if(event.button!==undefined&&event.button!==0)return;
  event.preventDefault();event.stopPropagation();
  selectForDrag(item);
  const owner=object(),element=objectElements.get(owner.id),marker=markerElements.get(item.id),rect=element?.getBoundingClientRect();
  if(!rect)return;
  drag={id:item.id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
    offsetX:item.target.offset.x,offsetY:item.target.offset.y,
    width:Math.max(1,rect.width),height:Math.max(1,rect.height),before:structuredClone(scene),changed:false,marker};
  marker?.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove',moveDrag);
  window.addEventListener('pointerup',endDrag);
  window.addEventListener('pointercancel',endDrag);
}
function moveDrag(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  const x=round(clamp(drag.offsetX+(event.clientX-drag.startX)/drag.width,-5,5));
  const y=round(clamp(drag.offsetY+(event.clientY-drag.startY)/drag.height,-5,5));
  const current=effect();
  if(!current||(current.target.offset.x===x&&current.target.offset.y===y))return;
  const next=structuredClone(scene);
  const target=next.effects.find(entry=>entry.id===drag.id);
  target.target.offset={x,y};
  try{validateScene(next);}catch(e){error(e);return;}
  scene=next;drag.changed=true;
  const owner=next.objects.find(entry=>entry.target?.id===drag.id)??next.objects.find(entry=>entry.id===target.target.objectId);
  const point=effectScenePoint(owner,target);
  drag.marker.style.left=`${point.x*100}%`;drag.marker.style.top=`${point.y*100}%`;
  const ox=$('#effect-offset-x'),oy=$('#effect-offset-y');
  if(ox)ox.value=String(x);if(oy)oy.value=String(y);
  status(`Kaydırma: ${x.toFixed(2)} / ${y.toFixed(2)}`);
  if(!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=null;bindPreview();});
}
function endDrag(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  window.removeEventListener('pointermove',moveDrag);
  window.removeEventListener('pointerup',endDrag);
  window.removeEventListener('pointercancel',endDrag);
  if(drag.changed){history.record(drag.before);changed();status('Efekt hedef kaydırması güncellendi.');}
  drag=null;
  draw();
}
function install(next,message,{resetHistory=false}={}){
  validateScene(next);
  if(scene)history.record(scene);
  scene=next;
  if(resetHistory){history.past.length=0;history.future.length=0;}
  objectId=scene.objects[0]?.id??null;
  anchorId=scene.objects[0]?.anchors[0]?.id??null;
  effectId=scene.effects.find(item=>item.target.objectId===objectId)?.id??null;
  draw();
  status(message);
}
function installPreview(packet){
  const preview=packet.previewImage;
  previewObjects=new Map();
  for(const artwork of packet.previewObjects??[]){
    const owner=packet.scene.objects.find(o=>o.id===artwork.objectId);
    const validImage=value=>typeof value==='string'&&value.length<12*1024*1024&&/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(value);
    if(!owner||previewObjects.has(owner.id)||!validImage(artwork.image)||!Array.isArray(artwork.layers))throw Error('Geçersiz nesne görseli.');
    const ids=new Set();
    for(const layer of artwork.layers){
      const b=layer.box;
      if(!owner.motionLayers?.includes(layer.id)||ids.has(layer.id)||!validImage(layer.image)||!b||Object.keys(b).length!==4||!['x','y','width','height'].every(k=>Number.isFinite(b[k])&&b[k]>=0&&b[k]<=1)||b.x+b.width>1||b.y+b.height>1)throw Error('Geçersiz hareket görseli.');
      ids.add(layer.id);
    }
    previewObjects.set(owner.id,artwork);
  }
  if(preview!==undefined&&(typeof preview!=='string'||!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(preview)))throw new Error('Site önizleme görseli geçersiz.');
  siteSource=packet.siteSource===true;
  sourceScene=siteSource?structuredClone(packet.scene):null;
  $('#advanced-settings').open=false;
  const photo=$('#scene-photo');
  photo.onload=()=>{$('#scene-viewport').style.aspectRatio=String(photo.naturalWidth/photo.naturalHeight);fitStage();};
  if(!preview)$('#scene-viewport').style.aspectRatio='';
  if(preview)photo.src=preview;else photo.removeAttribute('src');
  photo.hidden=!preview||!showPhoto;
  $('#scene-viewport').classList.toggle('has-photo',Boolean(preview)&&showPhoto);
  $('#show-photo').disabled=!preview;
  $('#coordinate-help').textContent=siteSource?'Güncel oda fotoğrafı. Nesneyi seçin; turuncu hedefi sürükleyerek efekti hizalayın. Kitap/kamera/vefk yakınlaşması bu önizlemeye dahil değildir.':'Yerel sahne önizlemesi. Turuncu hedefi sürükleyerek yalnız efekt kaydırmasını değiştirin.';
}
function loadText(text,message,options){
  const next=importProject(text);
  if(!isObjectScene(next))throw new Error('Bu düzenleyici yalnız version 2 objectScene sahnelerini açar; v1 fotoğraf dosyası kabul edilmez.');
  install(next,message,options);
}
function travel(direction){
  if(!scene)return;
  const next=history[direction](scene);
  scene=validateScene(next);
  draw();
  status(direction==='undo'?'Geri alındı.':'Yinelendi.');
  changed();
}

for(const [type,info]of Object.entries(objectEffectRegistry)){
  $('#add-effect-type').append(el('option',{value:type,text:info.label}));
}
$('#add-effect').onclick=()=>{
  const owner=object(),point=anchor();
  if(siteSource||!owner||!point)return;
  const type=$('#add-effect-type').value;
  mutate(s=>{
    const id=uniqueEffectId(type);
    if(objectEffectRegistry[type].output==='motion'&&!owner.motionLayers?.length)throw Error('Nesnede önce hareketli katman kimliği tanımlayın.');
    s.effects.push({id,type,target:{kind:'sceneObject',objectId:owner.id,anchorId:point.id,...(objectEffectRegistry[type].output==='motion'?{layerId:owner.motionLayers[0]}:{}),offset:{x:0,y:0},scale:1,depth:0},enabled:true,seed:`${type}-${uid().slice(0,8)}`,params:defaultObjectParams(type)});
    effectId=id;
  });
};
$('#object-filter').onchange=event=>{objectFilter=event.target.value;renderLists();};
const panelTabs=[...document.querySelectorAll('[data-mobile-panel]')];
for(const tab of panelTabs){
  tab.onclick=()=>{
    document.body.dataset.panel=tab.dataset.mobilePanel;
    for(const item of panelTabs){item.setAttribute('aria-selected',String(item===tab));item.tabIndex=item===tab?0:-1;}
  };
  tab.onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const next=panelTabs[event.key==='Home'?0:event.key==='End'?panelTabs.length-1:(panelTabs.indexOf(tab)+1)%panelTabs.length];
    next.click();next.focus();
  };
}
$('#scene-name').onchange=event=>mutate(s=>{s.name=event.target.value;});
$('#scene-seed').onchange=event=>mutate(s=>{s.seed=event.target.value;});
$('#undo').onclick=()=>travel('undo');
$('#redo').onclick=()=>travel('redo');
$('#play').onclick=()=>{
  playing=!playing;
  previewHandle?.setPaused(!playing);
  $('#play').textContent=playing?'Ⅱ Duraklat':'▶ Oynat';
  $('#play').setAttribute('aria-pressed',String(playing));
  status(playing?'Önizleme oynatılıyor.':'Önizleme duraklatıldı; sahne değişiklikleri yine doğrulanır.');
};
$('#show-photo').onclick=()=>{
  showPhoto=!showPhoto;
  $('#scene-photo').hidden=!showPhoto;
  $('#scene-viewport').classList.toggle('has-photo',showPhoto);
  $('#show-photo').setAttribute('aria-pressed',String(showPhoto));
};
$('#show-guides').onclick=()=>{
  const hidden=$('#scene-viewport').classList.toggle('hide-guides');
  $('#show-guides').setAttribute('aria-pressed',String(!hidden));
};
$('#show-effects').onclick=()=>{
  showEffects=!showEffects;previewHandle?.setEnabled(showEffects);
  $('#show-effects').setAttribute('aria-pressed',String(showEffects));
};
function fitStage(){
  const well=document.querySelector('.scene-stage-well');
  const photo=$('#scene-photo');
  const ratio=!photo.hidden&&photo.naturalWidth?photo.naturalWidth/photo.naturalHeight:(scene?.viewport.width??1600)/(scene?.viewport.height??900);
  const width=Math.min(well.clientWidth,well.clientHeight*ratio);
  Object.assign($('#scene-viewport').style,{width:`${width}px`,height:`${width/ratio}px`});
}
new ResizeObserver(fitStage).observe(document.querySelector('.scene-stage-well'));
$('#export').onclick=()=>{
  try{
    if(!scene)throw new Error('Önce sahne yükleyin.');
    const text=exportProject(validateScene(scene));
    if(new TextEncoder().encode(text).length>MAX_FILE_BYTES)throw new Error('Dışa aktarım 25 MB sınırını aşıyor.');
    download(text,'birdesengor-study-v2.scene.json');
    status('V2 JSON indirildi.');
  }catch(e){error(e);}
};
$('#open-project').onclick=()=>$('#project-file').click();
$('#project-file').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>MAX_FILE_BYTES)throw new Error('Dosya 25 MB sınırını aşıyor.');
    loadText(await readFile(file),'V2 proje açıldı.');
  }catch(e){error(e);}finally{event.target.value='';}
};
$('#reset').onclick=async()=>{
  try{
    const response=await fetch('examples/birdesengor-v2.scene.json');
    if(!response.ok)throw new Error('Yerel V2 fikstürü okunamadı.');
    loadText(await response.text(),'Yerel V2 fikstürü yüklendi.');
  }catch(e){error(e);}
};
document.addEventListener('keydown',event=>{
  if(!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='z'||event.target.matches('input,select,textarea'))return;
  event.preventDefault();travel(event.shiftKey?'redo':'undo');
});
setInterval(()=>{
  const info=previewHandle?.inspect();
  const overlays=info?.overlays??[];
  const running=overlays.some(item=>item.running);
  const frames=overlays.reduce((sum,item)=>sum+item.frames,0);
  const pixels=overlays.reduce((sum,item)=>sum+item.pixelCount,0);
  $('#preview-status').textContent=!scene?'Sahne yok':info?.unresolved?.length?`Eksik nesne: ${info.unresolved.join(', ')}`:`${running?'Çalışıyor':'Duraklatıldı'} · ${frames} kare · ${Math.round(pixels/1000)}k piksel`;
},600);

if(embedded){
  document.body.classList.add('embedded');
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||!event.data||typeof event.data!=='object')return;
    if(event.data.type==='studio:hello'){notify('studio:ready');return;}
    if(event.data.type==='studio:load'){
      try{
        const next=importProject(JSON.stringify(event.data.scene));
        if(!isObjectScene(next))throw new Error('Bu düzenleyici yalnız version 2 objectScene sahnelerini açar.');
        installPreview(event.data);
        loadText(JSON.stringify(event.data.scene),'Sahne hazır.',{resetHistory:true});
        notify('studio:loaded',{requestId:event.data.requestId});
      }catch(e){error(e);notify('studio:error',{message:e.message||String(e),requestId:event.data.requestId});}
    }
    if(event.data.type==='studio:get'){
      try{validateScene(scene);notify('studio:data',{requestId:event.data.requestId,scene:structuredClone(scene)});}
      catch(e){notify('studio:error',{requestId:event.data.requestId,message:e.message||String(e)});}
    }
  });
  notify('studio:ready');
}else{
  (async()=>{
    try{
      const response=await fetch('examples/birdesengor-v2.scene.json');
      if(!response.ok)throw new Error('Yerel V2 fikstürü okunamadı.');
      loadText(await response.text(),'Yerel V2 fikstürü yüklendi. Yerel sözleşme önizlemesidir; gerçek V2 bağlantısı değildir.');
    }catch(e){error(e);}
  })();
}

// Small read-only surface for local browser smoke tests; never part of the JSON.
window.__sceneEditor={
  getScene:()=>scene?structuredClone(scene):null,
  inspect:()=>previewHandle?.inspect()??null,
  selectObject,
  selectEffect,
};

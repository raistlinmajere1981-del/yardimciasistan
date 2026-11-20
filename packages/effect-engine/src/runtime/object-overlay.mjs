import {bindMotionLayer} from './object-motion.mjs';
import {createInteractionProgress} from './interaction-progress.mjs';
import {ticker as sharedTicker} from './ticker.mjs';
import {seededRandom} from './random.mjs';
import {effectCanvasStyle,depthZIndex,sortByDepth} from './object-scene.mjs';
import {compileObjectScene} from './object-compile.mjs';

const hostPositions=new WeakMap();
function acquirePosition(host) {
  let entry=hostPositions.get(host);
  if(!entry){
    const position=host.style.position||'';
    const changed=getComputedStyle(host).position==='static';
    if(changed)host.style.position='relative';
    entry={count:0,position,changed};
    hostPositions.set(host,entry);
  }
  entry.count++;
  return()=>{
    if(--entry.count)return;
    if(entry.changed&&host.style.position==='relative')host.style.position=entry.position;
    hostPositions.delete(host);
  };
}

// A host element may declare its identity. Refuse a silent mismatch instead of
// drawing a candle effect over a camera element.
const OBJECT_ID_ATTRIBUTES=['sceneObject','objectId','sceneObjectId'];
function declaredObjectId(element){
  for(const key of OBJECT_ID_ATTRIBUTES){
    const value=element?.dataset?.[key];
    if(value!==undefined&&value!==null&&value!=='')return String(value);
  }
  return null;
}
function assertIdentity(element,objectId,sceneId){
  const declared=declaredObjectId(element);
  if(objectId!==undefined&&objectId!==null&&declared!==null&&declared!==objectId)
    throw new Error(`Object binding mismatch: expected “${objectId}”, element declares “${declared}”.`);
  const declaredScene=element?.dataset?.sceneId;
  if(sceneId&&declaredScene&&declaredScene!==sceneId)
    throw new Error(`Scene binding mismatch: expected “${sceneId}”, element declares “${declaredScene}”.`);
}
function hiddenByStyle(node,styles){
  if(node.hidden)return true;
  if(node.style?.display==='none')return true;
  if(node.style?.visibility==='hidden'||node.style?.visibility==='collapse')return true;
  if(!styles)return false;
  const style=styles(node);
  return style?.display==='none'||style?.visibility==='hidden'||style?.visibility==='collapse';
}
// CSS visibility can change on the object or any parent without IntersectionObserver
// reporting anything. Walk the connected chain and gate the ticker on real style.
function styleVisible(element){
  const styles=typeof globalThis.getComputedStyle==='function'?globalThis.getComputedStyle.bind(globalThis):null;
  let node=element;
  while(node&&node.nodeType===1){
    if(hiddenByStyle(node,styles))return false;
    node=node.parentElement;
  }
  return true;
}

// One overlay owns the canvases for one object. Each effect gets a descendant
// canvas positioned only with CSS percentages derived from its anchor, so parent
// movement/scale/rotation is inherited without per-frame layout reads.
export function createObjectOverlay(objectElement, config, options={}) {
  if(!objectElement||objectElement.nodeType!==1||typeof objectElement.appendChild!=='function') throw new TypeError('An object element is required');
  if(!config||!Array.isArray(config.effects)) throw new TypeError('Supply a compiled object scene');
  const documentRef=globalThis.document;
  if(!documentRef||typeof documentRef.createElement!=='function') throw new TypeError('Canvas overlay requires a DOM document');
  let objectId=options.objectId??objectElement.dataset?.objectId??objectElement.dataset?.sceneObject??objectElement.dataset?.sceneObjectId;
  if(objectId===undefined||objectId===null){
    const ids=[...new Set(config.effects.map(effect=>effect.objectId))];
    if(ids.length===1)objectId=ids[0];
    else if(ids.length>1)throw new TypeError('objectId is required when the compiled scene targets multiple objects');
  }
  if(options.expectedSceneId!==undefined&&config.sceneId!==options.expectedSceneId)
    throw new Error(`Scene binding mismatch: expected “${options.expectedSceneId}”, compiled scene is “${config.sceneId??''}”.`);
  assertIdentity(objectElement,objectId,config.sceneId);
  const selected=sortByDepth(config.effects.filter(effect=>effect.objectId===objectId));
  if(!selected.length){
    return {canvas:null,canvases:[],refresh(){},refreshVisibility(){},setPaused(){},setEnabled(){},renderAt(){},destroy(){},
      inspect:()=>({running:false,disposed:false,ready:false,visible:false,styleVisible:styleVisible(objectElement),reducedMotion:false,frames:0,elapsed:0,fps:0,dpr:1,pixelCount:0,objectId,effects:[]})};
  }
  const releasePosition=acquirePosition(objectElement);
  const ticker=options.ticker??sharedTicker;
  const policy={...(config.performance||{}),...(options.performance||{})};
  const media=typeof globalThis.matchMedia==='function'?globalThis.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false,addEventListener(){},removeEventListener(){}};
  const connection=globalThis.navigator?.connection;
  const constrained=connection?.saveData===true||(globalThis.navigator?.hardwareConcurrency>0&&globalThis.navigator.hardwareConcurrency<=4)||(globalThis.navigator?.deviceMemory>0&&globalThis.navigator.deviceMemory<=4);
  let fps=Math.min(60,Math.max(1,constrained?policy.lowPowerFps||18:policy.fps||24));
  let dprLimit=constrained?policy.lowPowerDpr||1:policy.maxDpr||1.5;
  let dpr=Math.min(globalThis.devicePixelRatio||1,dprLimit);
  const layers=[];
  try{
    selected.forEach((effect,index)=>{
      if(effect.output==='motion'){
        const motion=bindMotionLayer(objectElement,effect);
        try{
          const instance=effect.create({params:effect.params});
          layers.push({effect,motion,instance,width:1,height:1,pixelCount:0});
        }catch(error){motion.destroy();throw error;}
        return;
      }
      const canvas=documentRef.createElement('canvas');
      canvas.className='object-effect-overlay';
      canvas.setAttribute('aria-hidden','true');
      Object.assign(canvas.style,{
        position:'absolute',pointerEvents:'none',display:'none',
        ...effectCanvasStyle({anchor:effect.anchor,offset:effect.offset,width:effect.params.width,height:effect.params.height,placement:effect.placement}),
        zIndex:depthZIndex(effect.depth),
      });
      objectElement.appendChild(canvas);
      try{
        const ctx=canvas.getContext('2d',{alpha:true});
        if(!ctx)throw new Error('Canvas 2D unavailable');
        const instance=effect.create({random:seededRandom(`${config.seed??1}:${effect.seed??index}`),params:effect.params});
        const interaction=effect.type==='glow'&&['hover','click'].includes(effect.trigger)
          ?createInteractionProgress({trigger:effect.trigger,...effect.interaction}):null;
        if(interaction)instance.setProgress(0);
        layers.push({effect,canvas,ctx,instance,interaction,width:0,height:0,scale:1,pixelCount:0});
      }catch(error){
        canvas.remove?.();
        throw error;
      }
    });
  }catch(error){
    layers.forEach(layer=>{layer.instance?.destroy?.();layer.motion?.destroy();layer.canvas?.remove();});
    releasePosition();
    throw error;
  }
  let completed=false;
  let disposed=false,visible=false,pageActive=true,ready=false,unsubscribe=null,everConnected=objectElement.isConnected;
  let elapsed=0,frames=0,cost=0,totalCost=0,slowFrames=0,paused=false,cssVisible=styleVisible(objectElement);
  const removers=[];
  const listen=(target,event,callback)=>{target?.addEventListener?.(event,callback);removers.push(()=>target?.removeEventListener?.(event,callback));};
  function clearLayer(layer){
    if(layer.motion){layer.motion.reset();return;}
    layer.ctx.setTransform(1,0,0,1,0,0);
    layer.ctx.clearRect(0,0,layer.canvas.width,layer.canvas.height);
  }
  function clear(){for(const layer of layers)clearLayer(layer);}
  function stop(){
    unsubscribe?.();unsubscribe=null;
    for(const layer of layers)layer.canvas&&(layer.canvas.style.display='none');
    clear();
  }
  function sync(){
    const hasActiveLayer=layers.some(layer=>!layer.interaction||(
      options.interactive===true&&layer.interaction.state().active));
    const run=!completed&&!disposed&&!paused&&enabled&&ready&&visible&&pageActive&&!documentRef.hidden&&!media.matches&&cssVisible&&hasActiveLayer;
    if(!run){
      // Paused frames are repainted without advancing time; all other gates stop work.
      if(!completed&&paused&&ready&&visible&&enabled&&!disposed&&!media.matches&&pageActive&&!documentRef.hidden&&cssVisible){
        unsubscribe?.();unsubscribe=null;
        for(const layer of layers)layer.canvas&&(layer.canvas.style.display='block');
        draw(0);
      }else stop();
      return;
    }
    if(!unsubscribe){
      for(const layer of layers)layer.canvas&&(layer.canvas.style.display='block');
      unsubscribe=ticker.add(draw,fps);
    }
  }
  function refreshVisibility(){
    if(disposed)return;
    const next=styleVisible(objectElement);
    if(next===cssVisible)return;
    cssVisible=next;
    if(!cssVisible)stop();else sync();
  }
  function draw(dt){
    if(documentRef.hidden||media.matches||!pageActive||!enabled){sync();return;}
    if(!objectElement.isConnected){destroy();return;}
    if(!styleVisible(objectElement)){cssVisible=false;sync();return;}
    cssVisible=true;
    const start=globalThis.performance?.now?.()??Date.now();
    elapsed+=dt;
    for(const layer of layers){
      if(layer.motion){
        if(!layer.motion.connected()){destroy();return;}
        try{layer.instance.update(dt);layer.motion.apply(layer.instance.motion());}catch(error){destroy();throw error;}
        continue;
      }
      clearLayer(layer);
      if(!layer.width||!layer.height)continue;
      if(layer.interaction){
        const {progress}=layer.interaction.tick(dt);
        layer.instance.setProgress(progress);
        if(progress<=0)continue;
      }
      layer.ctx.setTransform(layer.scale,0,0,layer.scale,0,0);
      try{
        layer.instance.update(dt);
        layer.instance.render(layer.ctx,{elapsed,width:layer.width,height:layer.height,pixelScale:layer.scale,placement:layer.effect.placement});
      }catch(error){destroy();throw error;}
    }
    if(layers.every(layer=>layer.instance.isComplete?.()===true)){completed=true;stop();}
    frames++;
    cost=(globalThis.performance?.now?.()??Date.now())-start;
    totalCost+=cost;
    slowFrames=cost>6?slowFrames+1:Math.max(0,slowFrames-1);
    if(slowFrames>=30&&fps>15){fps=15;dprLimit=1;slowFrames=0;stop();resize();}
    if(layers.some(layer=>layer.interaction)&&!layers.some(layer=>!layer.interaction||(
      options.interactive===true&&layer.interaction.state().active)))sync();
  }
  function resize(){
    if(disposed)return;
    if(everConnected&&!objectElement.isConnected){destroy();return;}
    everConnected||=objectElement.isConnected;
    ready=false;
    const width=objectElement.clientWidth||0,height=objectElement.clientHeight||0;
    if(!width||!height){sync();return;}
    dpr=Math.min(globalThis.devicePixelRatio||1,dprLimit);
    const budget=Math.max(1,(policy.maxPixels||1200000)/Math.max(1,layers.length));
    for(const layer of layers){
      if(layer.motion){layer.width=width;layer.height=height;continue;}
      const cssWidth=width*layer.effect.params.width,cssHeight=height*layer.effect.params.height;
      if(!(cssWidth>0)||!(cssHeight>0)){layer.width=layer.height=0;layer.pixelCount=0;continue;}
      const scale=Math.max(.01,Math.min(dpr,Math.sqrt(budget/Math.max(1,cssWidth*cssHeight))));
      layer.width=cssWidth;layer.height=cssHeight;layer.scale=scale;
      layer.canvas.width=Math.max(1,Math.round(cssWidth*scale));
      layer.canvas.height=Math.max(1,Math.round(cssHeight*scale));
      layer.pixelCount=layer.canvas.width*layer.canvas.height;
    }
    ready=layers.every(layer=>layer.width>0&&layer.height>0);
    sync();
  }
  const IntersectionObserverRef=globalThis.IntersectionObserver;
  const observer=typeof IntersectionObserverRef==='function'?new IntersectionObserverRef(([entry])=>{
    if(everConnected&&!objectElement.isConnected){destroy();return;}
    visible=entry.isIntersecting;sync();
  }):null;
  if(observer)observer.observe(objectElement);else visible=true;
  const ResizeObserverRef=globalThis.ResizeObserver;
  const resizeObserver=typeof ResizeObserverRef==='function'?new ResizeObserverRef(resize):null;
  resizeObserver?.observe(objectElement);
  // Class/style/hidden changes can hide an object or a parent while
  // IntersectionObserver still reports it as intersecting.
  const MutationObserverRef=globalThis.MutationObserver;
  const mutationObserver=typeof MutationObserverRef==='function'?new MutationObserverRef(refreshVisibility):null;
  if(mutationObserver){
    const seen=new Set();
    for(let node=objectElement;node&&node.nodeType===1&&!seen.has(node);node=node.parentElement){
      seen.add(node);
      mutationObserver.observe(node,{attributes:true,attributeFilter:['class','style','hidden']});
    }
  }
  listen(globalThis.window,'resize',resize);
  listen(documentRef,'visibilitychange',()=>{if(documentRef.hidden)resetInteractive();sync();});
  const resetInteractive=()=>{
    for(const layer of layers)if(layer.interaction){layer.interaction.reset();layer.instance.setProgress(0);}
  };
  if(options.interactive===true&&layers.some(layer=>layer.interaction)){
    // The effect canvas can live in a non-interactive photographic host while
    // the user's real input remains on the existing button. Both are owned by
    // the same site interaction. No synthetic clicks or duplicate controls.
    const eventTarget=options.interactionTarget??objectElement;
    if(typeof eventTarget?.addEventListener!=='function')throw new Error('Interactive effect target is missing.');
    const target=(mode,action)=>{
      for(const layer of layers)if(layer.interaction&&layer.effect.trigger===mode)layer.interaction[action]();
      sync();
    };
    listen(eventTarget,'pointerenter',()=>target('hover','enter'));
    listen(eventTarget,'pointerleave',()=>target('hover','leave'));
    listen(eventTarget,'focusin',()=>target('hover','enter'));
    listen(eventTarget,'focusout',()=>target('hover','leave'));
    listen(eventTarget,'click',()=>target('click','click'));
  }
  listen(media,'change',()=>{if(media.matches)resetInteractive();sync();});
  listen(globalThis.window,'pagehide',()=>{pageActive=false;resetInteractive();sync();});
  listen(globalThis.window,'pageshow',()=>{pageActive=true;resize();});
  function destroy(){
    if(disposed)return;
    disposed=true;
    resetInteractive();
    stop();
    observer?.disconnect();resizeObserver?.disconnect();mutationObserver?.disconnect();
    removers.forEach(remove=>remove());
    for(const layer of layers){
      layer.instance.destroy?.();
      layer.motion?.destroy();
      layer.canvas?.remove?.();
      if(layer.canvas)layer.canvas.width=layer.canvas.height=1;
    }
    releasePosition();
  }
  let enabled=options.enabled!==false;
  try{resize();}catch(error){destroy();throw error;}
  return {
    canvas:layers.find(layer=>layer.canvas)?.canvas??null,
    canvases:layers.flatMap(layer=>layer.canvas?[layer.canvas]:[]),
    refresh:resize,
    refreshVisibility,
    destroy,
    setPaused(value){if(!disposed){paused=Boolean(value);sync();}},
    renderAt(seconds=0){
      if(!ready||disposed||media.matches)return;
      if(!Number.isFinite(seconds)||seconds<elapsed||seconds>60)throw new RangeError('renderAt requires elapsed ≤ seconds ≤ 60');
      paused=true;unsubscribe?.();unsubscribe=null;
      for(const layer of layers)layer.canvas&&(layer.canvas.style.display='block');
      while(seconds-elapsed>.000001)draw(Math.min(1/24,seconds-elapsed));
      if(!frames)draw(0);
    },
    setEnabled(value){if(!disposed){enabled=Boolean(value);if(!enabled)resetInteractive();sync();}},
    triggerEffect(effectId){
      if(disposed||!enabled)return false;
      const layer=layers.find(item=>item.effect.id===effectId&&item.effect.trigger==='click'&&item.interaction);
      if(!layer)return false;
      layer.interaction.click();sync();return true;
    },
    inspect(){return {running:Boolean(unsubscribe),disposed,ready,visible,styleVisible:cssVisible,reducedMotion:media.matches,frames,elapsed,fps,dpr,pixelCount:layers.reduce((sum,layer)=>sum+layer.pixelCount,0),objectId,paused,interactions:layers.filter(layer=>layer.interaction).map(layer=>({effectId:layer.effect.id,trigger:layer.effect.trigger,...layer.interaction.state()})),
      costMs:cost,avgCostMs:frames?totalCost/frames:0,effects:layers.map(layer=>layer.instance.inspect?.())};},
  };
}

// Bind every visible object that owns compiled effects. Missing DOM elements are
// reported instead of guessed, so the integrator can mount objects independently.
export function bindObjectScene(scene, resolveObject, options={}) {
  const compiled=scene?.effects?.every?.(effect=>typeof effect.create==='function')?scene:compileObjectScene(scene);
  if(options.expectedSceneId!==undefined&&compiled.sceneId!==options.expectedSceneId)
    throw new Error(`Scene binding mismatch: expected “${options.expectedSceneId}”, compiled scene is “${compiled.sceneId??''}”.`);
  const ids=[...new Set(compiled.effects.map(effect=>effect.objectId))];
  const overlays=new Map(), unresolved=[];
  try{for(const id of ids){
    const element=typeof resolveObject==='function'?resolveObject(id):resolveObject instanceof Map?resolveObject.get(id):resolveObject?.[id];
    if(!element){unresolved.push(id);continue;}
    assertIdentity(element,id,compiled.sceneId);
    overlays.set(id,createObjectOverlay(element,compiled,{...options,objectId:id}));
  }}catch(error){for(const overlay of overlays.values())overlay.destroy();throw error;}
  return {
    sceneId:compiled.sceneId,
    overlays,
    inspect:()=>({sceneId:compiled.sceneId,unresolved:[...unresolved],overlays:[...overlays].map(([objectId,overlay])=>({objectId,...overlay.inspect()}))}),
    setEnabled(value){for(const overlay of overlays.values())overlay.setEnabled(value);},
    setPaused(value){for(const overlay of overlays.values())overlay.setPaused(value);},
    triggerEffect(effectId){for(const overlay of overlays.values())if(overlay.triggerEffect(effectId))return true;return false;},
    refresh(){for(const overlay of overlays.values())overlay.refresh();},
    destroy(){for(const overlay of overlays.values())overlay.destroy();overlays.clear();},
  };
}

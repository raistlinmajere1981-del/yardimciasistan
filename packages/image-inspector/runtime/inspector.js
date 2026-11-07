/* Shared DOM, gestures, image jobs and resource lifecycle. Commerce remains with the caller. */
(function(root){
  'use strict';
  const base=new URL('.',document.currentScript.src),C=root.ImageInspectorCore;
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function mount(options){
    const t=options.translate||(value=>value);
    const session=new C.Session(options.mode),items=options.items.slice(0,2).map(p=>({...p,urls:p.urls.slice(0,12)}));
    if(!items[1])items.push({name:t('Benim parçam'),urls:[]});
    session.restore(options.state);session.layers[0].index=options.index??session.layers[0].index;
    const host=options.host,view=node('section',undefined,'ya-inspector');host.append(view);
    let closed=false,localRevision=0,stateTimer,thumbKey='',thumbnailJob=null;
    const thumbnailQueue=[],thumbnailSeen=new Set();
    const emitState=()=>{clearTimeout(stateTimer);stateTimer=setTimeout(()=>{if(!closed)options.onState?.(session.snapshot());},100);};
    const resources=[0,1].map(i=>({revision:0,controller:null,worker:null,blob:null,source:'',width:1,height:1,pendingTransform:options.state?.layers?.[i]?.transform}));
    const button=(label,action,text=label)=>{const b=node('button',t(text));b.type='button';b.setAttribute('aria-label',t(label));b.title=t(label);b.addEventListener('click',action);return b;};
    const header=node('header'),title=node('strong',options.title||items[0].name),counter=node('span',undefined,'ii-counter');
    const selectPhoto=step=>{const a=session.active,count=items[a].urls.length;if(count<2)return;const index=(session.layers[a].index+step+count)%count;resources[a].pendingTransform=null;session.photo(a,index);options.onSelect?.(index);load(a);update();};
    const previous=button('Önceki fotoğraf',()=>selectPhoto(-1),'‹'),next=button('Sonraki fotoğraf',()=>selectPhoto(1),'›');
    const closeButton=button('Kapat',()=>options.onClose?.(),'×');closeButton.className='ii-close';header.append(title,previous,counter,next,closeButton);view.append(header);
    const compareTools=node('div',undefined,'ii-row ii-compare');
    const split=button('Yan yana',()=>{session.record();session.layout='split';update();});
    const overlay=button('Üst üste',()=>{session.record();session.layout='overlay';update();});
    const together=button('Birlikte hareket',()=>{session.record();session.linked=!session.linked;update();});
    compareTools.append(split,overlay,together);view.append(compareTools);
    const stage=node('div',undefined,'ii-stage');view.append(stage);
    resources.map((resource,i)=>{
      const pane=node('div',undefined,'ii-pane');pane.tabIndex=0;pane.setAttribute('role','group');pane.setAttribute('aria-label',items[i].name);
      const canvas=node('canvas');canvas.width=canvas.height=1;canvas.hidden=true;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',items[i].name);
      const label=node('span',items[i].name,'ii-caption'),status=node('span',undefined,'ii-status');status.setAttribute('role','status');
      pane.append(canvas,label,status);stage.append(pane);Object.assign(resource,{pane,canvas,label,status});
      const points=new Map();let lastTap=0,lastTouch=0,lastWheel=0,gesture=false;
      const center=()=>{const a=[...points.values()];return {x:a.reduce((s,p)=>s+p.x,0)/a.length,y:a.reduce((s,p)=>s+p.y,0)/a.length};};
      const distance=()=>{const a=[...points.values()];return a.length===2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0;};
      const coordinates=e=>{const rect=pane.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top};};
      pane.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse'&&e.button!==0)return;
        if(e.pointerType==='touch')lastTouch=performance.now();
        if(session.layout!=='overlay')session.active=i;
        pane.focus({preventScroll:true});session.record();points.set(e.pointerId,coordinates(e));pane.setPointerCapture(e.pointerId);gesture=points.size>1;updateControls();
      });
      pane.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;
        const before=center(),d=distance(),old=points.get(e.pointerId),p=coordinates(e);points.set(e.pointerId,p);
        if(Math.hypot(p.x-old.x,p.y-old.y)>2)gesture=true;
        if(points.size===2&&d>0){const after=center();session.move('scale',distance()/d,before.x,before.y);session.move('pan',after.x-before.x,after.y-before.y);}
        else session.move('pan',p.x-old.x,p.y-old.y);paint();
      });
      const release=e=>{if(!points.has(e.pointerId))return;const p=coordinates(e);points.delete(e.pointerId);
        if(e.type==='pointerup'&&!gesture&&e.pointerType!=='mouse'){
          const now=performance.now();if(now-lastTap<300){session.move('scale',session.layers[session.active].transform.zoom>1?1/8:2,p.x,p.y);paint();lastTap=0;}else lastTap=now;
        }
        if(!points.size)gesture=false;
      };
      for(const type of ['pointerup','pointercancel','lostpointercapture'])pane.addEventListener(type,release);
      pane.addEventListener('dblclick',e=>{if(e.pointerType==='touch'||performance.now()-lastTouch<800)return;const p=coordinates(e);session.record();session.move('scale',session.layers[session.active].transform.zoom>1?1/8:2,p.x,p.y);paint();});
      pane.addEventListener('wheel',e=>{e.preventDefault();if(performance.now()-lastWheel>200)session.record();lastWheel=performance.now();if(session.layout!=='overlay')session.active=i;const p=coordinates(e);session.move('scale',Math.exp(-e.deltaY*.002),p.x,p.y);paint();},{passive:false});
      pane.addEventListener('keydown',e=>{
        const moves={ArrowLeft:[-30,0],ArrowRight:[30,0],ArrowUp:[0,-30],ArrowDown:[0,30]};
        if(moves[e.key]){e.preventDefault();session.record();session.move('pan',...moves[e.key]);paint();}
        if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.25);}
        if(e.key==='-'){e.preventDefault();zoom(.8);}
      });return pane;
    });
    const footer=node('footer');view.append(footer);
    const layers=node('div',undefined,'ii-row ii-layers'),layerButtons=items.map((p,i)=>button(p.name,()=>{session.active=i;update();}));layers.append(...layerButtons);footer.append(layers);
    const alphaLabel=node('label',t('Saydamlık'),'ii-alpha'),alpha=node('input');alpha.type='range';alpha.min='0';alpha.max='100';alpha.value=String(session.opacity*100);alpha.setAttribute('aria-label',t('Saydamlık'));
    alpha.addEventListener('pointerdown',()=>session.record());alpha.addEventListener('keydown',()=>session.record());
    alpha.addEventListener('input',()=>{session.opacity=Number(alpha.value)/100;paint();});alphaLabel.append(alpha);footer.append(alphaLabel);
    const filters=node('div',undefined,'ii-row ii-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label',t('Görüntüleme modu'));
    const filterButtons=Object.entries(C.modes).map(([mode,label])=>{const b=button(label,()=>{session.filter(session.active,mode);renderImage(session.active);updateControls();});filters.append(b);return [mode,b];});footer.append(filters);
    const tools=node('div',undefined,'ii-row ii-tools'),zoomLabel=node('output','1×');zoomLabel.setAttribute('aria-label',t('Yakınlaştırma'));
    const zoom=factor=>{session.record();session.move('scale',factor);paint();};
    const rotate=step=>{session.record();session.move('rotate',step);paint();};
    const reset=button('Görünümü sıfırla',()=>{session.record();session.move('reset');paint();},'Sığdır');
    const align=button('Hizalamayı sıfırla',()=>{session.align();update();},'Hizala');
    const undo=button('Geri al',()=>{if(session.undo()){for(let i=0;i<2;i++){resources[i].pendingTransform=session.layers[i].transform.snapshot();load(i);}update();}},'↶');
    tools.append(button('Uzaklaştır',()=>zoom(.8),'−'),zoomLabel,button('Yakınlaştır',()=>zoom(1.25),'+'),button('90° sola döndür',()=>rotate(-1),'↶ 90°'),button('90° sağa döndür',()=>rotate(1),'90° ↷'),reset,align,undo);footer.append(tools);
    const thumbs=node('div',undefined,'ii-thumbs');thumbs.setAttribute('role','group');thumbs.setAttribute('aria-label',t('Ürün fotoğrafları'));footer.append(thumbs);
    const personalTools=node('div',undefined,'ii-row ii-personal');
    const file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.hidden=true;
    const camera=node('input');camera.type='file';camera.accept=file.accept;camera.setAttribute('capture','environment');camera.hidden=true;
    for(const input of [file,camera])input.addEventListener('change',()=>{const f=input.files?.[0];if(f)void personal(f);input.value='';});
    personalTools.append(button('Fotoğrafımla karşılaştır',()=>options.choosePersonal?options.choosePersonal('gallery'):file.click(),'Fotoğraf seç'),button('Kamera ile karşılaştır',()=>options.choosePersonal?options.choosePersonal('camera'):camera.click(),'Kamera'));
    const back=button('Tek fotoğrafa dön',()=>{localRevision++;clear(1);items[1]={name:t('Benim parçam'),urls:[]};session.mode='inspect';session.active=0;session.linked=false;session.history.length=0;options.onPersonalClear?.();update();});
    personalTools.append(back,file,camera);footer.append(personalTools);
    const privacy=node('small',t('Fotoğrafınız yalnız bu cihazda işlenir.'),'ii-privacy');footer.append(privacy);
    const details=node('div',undefined,'ii-details');view.append(details);options.details?.(details);
    function updateControls(){
      const comparing=session.mode==='compare',stacked=comparing&&session.layout==='overlay';
      view.dataset.mode=session.mode;view.dataset.layout=session.layout;
      compareTools.hidden=layers.hidden=!comparing;back.hidden=!comparing||!items[1].personal;
      together.hidden=alphaLabel.hidden=align.hidden=!stacked;
      split.setAttribute('aria-pressed',String(!stacked));overlay.setAttribute('aria-pressed',String(stacked));together.setAttribute('aria-pressed',String(session.linked));
      layerButtons.forEach((b,i)=>{b.textContent=items[i].name;b.setAttribute('aria-label',items[i].name);b.setAttribute('aria-pressed',String(i===session.active));});
      resources.forEach((r,i)=>{r.pane.hidden=i===1&&!comparing;r.label.textContent=items[i].name;r.canvas.setAttribute('aria-label',items[i].name);r.pane.setAttribute('aria-label',items[i].name);r.pane.tabIndex=stacked&&i!==session.active?-1:0;r.pane.dataset.active=String(session.active===i);r.pane.style.pointerEvents=stacked&&i!==session.active?'none':'';r.pane.style.zIndex=stacked?(i===session.active?'2':'1'):'';});
      // Layer order remains product below reference even when the lower layer receives gestures.
      resources[0].pane.style.zIndex='';resources[1].pane.style.zIndex=stacked?'1':'';
      filterButtons.forEach(([m,b])=>b.setAttribute('aria-pressed',String(m===session.layers[session.active].mode)));
      alpha.value=String(session.opacity*100);undo.disabled=!session.history.length;
      zoomLabel.value=session.layers[session.active].transform.zoom.toFixed(2).replace(/\.00$/,'')+'×';
      const a=session.active,urls=items[a].urls,index=Math.min(session.layers[a].index,Math.max(0,urls.length-1));
      previous.hidden=next.hidden=urls.length<2;
      counter.textContent=urls.length?`${index+1} / ${urls.length}`:'';
      const key=a+':'+urls.join('|');
      if(thumbKey!==key){
        thumbKey=key;thumbs.replaceChildren();urls.forEach((url,i)=>{
          const b=button(`${i+1}. fotoğrafı göster`,()=>{resources[a].pendingTransform=null;session.photo(a,i);options.onSelect?.(i);load(a);update();},String(i+1));thumbs.append(b);
        });
      }
      [...thumbs.children].forEach((b,i)=>{
        b.setAttribute('aria-pressed',String(i===index));
        const image=items[a].previews?.[i];if(image&&b.dataset.preview!==image){const img=node('img');img.src=image;img.alt='';b.replaceChildren(img);b.dataset.preview=image;}else if(!image&&b.dataset.preview){b.replaceChildren(String(i+1));delete b.dataset.preview;}
      });
      if(resources[a].width>1)urls.forEach((url,i)=>{
        const key=a+':'+url;if(url==='personal'||items[a].previews?.[i]||thumbnailSeen.has(key))return;
        thumbnailSeen.add(key);thumbnailQueue.push({item:items[a],index:i,url:items[a].thumbUrls?.[i]||url});
      });thumbnailNext();
    }
    function paint(){
      const comparing=session.mode==='compare',stacked=comparing&&session.layout==='overlay';
      resources.forEach((r,i)=>{
        const t=session.layers[i].transform;t.size(r.pane.clientWidth,r.pane.clientHeight,r.width,r.height,stacked);
        if(r.pendingTransform&&!r.canvas.hidden){t.restore(r.pendingTransform);r.pendingTransform=null;}
        const scale=t.fit()*t.zoom;r.canvas.style.width=r.width*scale+'px';r.canvas.style.height=r.height*scale+'px';
        r.canvas.style.transform=`translate(-50%,-50%) translate(${t.x}px,${t.y}px) rotate(${t.rotation}deg)`;
        // A common stage keeps alpha independent from active gesture ownership.
        r.pane.style.opacity=stacked&&i===1?String(session.opacity):'1';
      });
      zoomLabel.value=session.layers[session.active].transform.zoom.toFixed(2).replace(/\.00$/,'')+'×';undo.disabled=!session.history.length;emitState();
    }
    function update(){updateControls();paint();}
    function stop(i){const r=resources[i];r.revision++;r.controller?.abort();r.controller=null;r.worker?.terminate();r.worker=null;r.pane.removeAttribute('aria-busy');}
    function clear(i){stop(i);const r=resources[i];r.blob=null;r.pendingTransform=null;r.source='';r.width=r.height=1;r.canvas.width=r.canvas.height=1;r.canvas.hidden=true;}
    function error(i,message){resources[i].status.textContent=t(message);resources[i].pane.removeAttribute('aria-busy');resources[i].canvas.hidden=true;}
    async function fetchBlob(url,signal){
      const parsed=new URL(url,location.href);
      if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Geçersiz görsel adresi.');
      if(parsed.origin!==location.origin&&parsed.protocol!=='https:')throw Error('Güvenli görsel adresi gerekli.');
      const response=await fetch(parsed,{signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
      if(!response.ok||Number(response.headers.get('content-length'))>C.limits.bytes)throw Error('Fotoğraf yüklenemedi.');
      const reader=response.body.getReader(),parts=[];let size=0;
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>C.limits.bytes){await reader.cancel();throw Error('Fotoğraf en fazla 30 MB olabilir.');}parts.push(part.value);}
      return new Blob(parts,{type:response.headers.get('content-type')||''});
    }
    function preview(data,width,height){
      const source=document.createElement('canvas');source.width=width;source.height=height;source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data),width,height),0,0);
      const small=document.createElement('canvas');small.width=small.height=64;small.getContext('2d').drawImage(source,0,0,64,64);const result=small.toDataURL('image/png');source.width=source.height=small.width=small.height=1;return result;
    }
    function thumbnailNext(){
      if(closed||thumbnailJob||!thumbnailQueue.length)return;
      const {item,index,url}=thumbnailQueue.shift(),controller=new AbortController(),job={controller,worker:null};thumbnailJob=job;
      const finish=()=>{job.worker?.terminate();if(thumbnailJob===job)thumbnailJob=null;thumbnailNext();};
      fetchBlob(url,controller.signal).then(blob=>{
        if(closed){finish();return;}
        const worker=new Worker(new URL('worker.js',base));job.worker=worker;
        worker.onmessage=({data})=>{
          if(!closed&&!data.error&&items.includes(item)){item.previews??=[];item.previews[index]=preview(data.pixels,data.width,data.height);updateControls();}
          finish();
        };
        worker.onerror=finish;worker.postMessage({blob,mode:'normal',edge:128});
      }).catch(finish);
    }
    async function load(i){
      const r=resources[i],index=session.layers[i].index,url=items[i].urls[index];
      if(closed)return;
      stop(i);const revision=r.revision;
      if(!url){clear(i);r.status.textContent=t(i?'Karşılaştırmak için fotoğraf seçin.':'Fotoğraf yok.');return;}
      if(r.source===url&&r.blob){renderImage(i);return;}
      r.blob=null;r.source=url;r.canvas.width=r.canvas.height=1;r.canvas.hidden=true;r.status.textContent=t('Fotoğraf açılıyor…');r.pane.setAttribute('aria-busy','true');
      const controller=new AbortController();r.controller=controller;
      try {
        const blob=await fetchBlob(url,controller.signal);
        if(closed||r.revision!==revision)return;
        r.blob=blob;renderImage(i);
      }catch(e){if(!closed&&r.revision===revision&&e.name!=='AbortError')error(i,'Fotoğraf açılamadı. Kaynak erişimini kontrol edin.');}
    }
    function renderImage(i){
      const r=resources[i];if(!r.blob){void load(i);return;}stop(i);const revision=r.revision;
      r.status.textContent=t('Hazırlanıyor…');r.pane.setAttribute('aria-busy','true');
      if(!root.Worker){error(i,'Bu tarayıcı güvenli fotoğraf işlemeyi desteklemiyor.');return;}
      const worker=new Worker(new URL('worker.js',base));r.worker=worker;
      worker.onmessage=({data})=>{
        if(closed||r.revision!==revision)return;
        worker.terminate();r.worker=null;r.pane.removeAttribute('aria-busy');
        if(data.error){error(i,data.error);return;}
        r.width=data.width;r.height=data.height;r.canvas.width=data.width;r.canvas.height=data.height;
        r.canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixels),data.width,data.height),0,0);
        r.canvas.hidden=false;r.status.textContent='';
        const thumb=document.createElement('canvas');thumb.width=64;thumb.height=64;thumb.getContext('2d').drawImage(r.canvas,0,0,64,64);
        items[i].previews??=[];items[i].previews[session.layers[i].index]=thumb.toDataURL('image/png');thumb.width=thumb.height=1;
        update();options.onState?.(session.snapshot());
      };
      worker.onerror=()=>{worker.terminate();if(!closed&&r.revision===revision){r.worker=null;error(i,'Fotoğraf işlenemedi. Daha küçük bir fotoğraf deneyin.');}};
      worker.postMessage({blob:r.blob,mode:session.layers[i].mode,edge:options.edge||1600});
    }
    async function personal(blob){
      const revision=++localRevision;
      try{
        if(!['image/jpeg','image/png','image/webp'].includes(blob.type)||blob.size<1||blob.size>C.limits.bytes)throw Error('JPEG, PNG veya WebP seçin (en fazla 30 MB).');
        if(closed||revision!==localRevision)return;
        clear(1);items[1]={name:t('Benim parçam'),urls:['personal'],personal:true};resources[1].blob=blob;resources[1].source='personal';
        session.photo(1,0);session.mode='compare';session.active=1;session.linked=false;renderImage(1);update();
      }catch(e){if(!closed&&revision===localRevision){session.mode='compare';update();error(1,e.message);}}
    }
    function personalSource(url){localRevision++;clear(1);items[1]={name:t('Benim parçam'),urls:[url],personal:true};session.photo(1,0);session.mode='compare';session.active=1;session.linked=false;void load(1);update();}
    view.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();options.onClose?.();return;}
      if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)&&!e.target.closest('.ii-pane')){e.preventDefault();selectPhoto(e.key==='ArrowRight'?1:-1);}
    });
    const observer=new ResizeObserver(paint);observer.observe(stage);update();load(0);if(session.mode==='compare')load(1);
    return {session,view,personal,personalSource,navigate:selectPhoto,snapshot:()=>session.snapshot(),destroy(){if(closed)return;closed=true;localRevision++;clearTimeout(stateTimer);thumbnailQueue.length=0;thumbnailJob?.controller.abort();thumbnailJob?.worker?.terminate();thumbnailJob=null;thumbnailSeen.clear();observer.disconnect();clear(0);clear(1);items.forEach(p=>{p.urls=[];p.previews=[];});session.history=[];view.remove();options=null;}};
  }
  function open(options){
    const opener=options.opener||document.activeElement,dialog=node('dialog',undefined,'ii-dialog');dialog.setAttribute('aria-label',options.title||'Fotoğraf inceleme');document.body.append(dialog);
    let instance;const close=()=>{if(dialog.open)dialog.close();cleanup();};
    const cleanup=()=>{if(!instance)return;instance.destroy();instance=null;dialog.remove();if(opener?.isConnected)opener.focus({preventScroll:true});options.onClose?.();};
    instance=mount({...options,host:dialog,onClose:close});dialog.addEventListener('keydown',e=>{if(e.target===dialog&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();instance?.navigate(e.key==='ArrowRight'?1:-1);}});dialog.addEventListener('close',cleanup,{once:true});dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.showModal();dialog.querySelector('.ii-close').focus();
    return {close,get session(){return instance?.session;}};
  }
  root.ImageInspector=Object.freeze({mount,open});
})(window);

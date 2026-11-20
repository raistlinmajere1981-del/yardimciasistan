import {previewScene} from './effect-actions.mjs';
import {createOverlay,compileScene} from '../runtime/index.mjs';
import {imageTransform,toPhoto,toScreen} from './geometry.mjs';

export function createPreview({host,image,stats,onError}) {
  let soloId=null;
  let overlay=null,scene=null,timer=null,playing=true,compare=false,fit='contain',version=0;
  async function loadPhoto(photo) {
    const probe=new Image();probe.src=photo.src;
    try {await probe.decode();} catch {throw new Error('Fotoğraf yüklenemedi. assets/ dosyasını kontrol edin veya fotoğrafı yeniden açın.');}
    if(probe.naturalWidth!==photo.width||probe.naturalHeight!==photo.height) throw new Error(`Fotoğraf boyutu JSON ile uyuşmuyor (${probe.naturalWidth} × ${probe.naturalHeight}).`);
    return photo.src;
  }
  function rebuild() {
    clearTimeout(timer);timer=null;
    if(!scene)return;
    try {
      const config=compileScene(previewScene(scene,soloId));
      overlay?.destroy();overlay=null;
      overlay=createOverlay(image,config,{host,enabled:!compare});
      if(!compare)overlay.renderAt(0);
      overlay.setPaused(!playing); version++;
    } catch(error){onError(error);}
  }
  function update(next,{immediate=false}={}) {
    scene=next;
    if(image.getAttribute('src')!==scene.photo.src) {
      overlay?.destroy();overlay=null;image.src=scene.photo.src;
    }
    image.alt=scene.photo.name;
    clearTimeout(timer);
    if(immediate)rebuild(); else timer=setTimeout(rebuild,130);
  }
  function mapping() {
    if(!scene)return null;
    const rect=image.getBoundingClientRect();
    return {rect,transform:imageTransform(rect,scene.photo,fit)};
  }
  image.addEventListener('load',rebuild);
  const statsTimer=setInterval(()=>{
    const info=overlay?.inspect();
    stats.textContent=info?.reducedMotion?'Azaltılmış hareket · statik fotoğraf':compare?'Efektler kapalı · karşılaştırma':!scene?.effects.length?'Efekt ekleyerek başlayın':`${info?.running?info.fps+' FPS hedef':'Duraklatıldı'} · ${info?.avgCostMs?.toFixed(2)??'0.00'} ms ort. · ${info?.pixelCount?Math.round(info.pixelCount/1000):0}k piksel`;
  },600);
  return {
    loadPhoto,update,rebuild,
    setSolo(id){soloId=id;rebuild();},
    setPlaying(value){playing=value;overlay?.setPaused(!value);},
    setCompare(value){compare=value;if(value)overlay?.setEnabled(false);else rebuild();},
    setFit(value){fit=value;image.style.objectFit=value;overlay?.refresh();},
    point(event){const m=mapping();return m?toPhoto(event.clientX,event.clientY,m.rect,m.transform,scene.photo):[0,0];},
    project(point){const m=mapping();return m?toScreen(point,m.transform):[0,0];},
    mapping,
    inspect:()=>({...overlay?.inspect(),revision:version,pending:Boolean(timer)}),
    renderAt(seconds){rebuild();overlay?.renderAt(seconds);playing=false;},
    destroy(){clearTimeout(timer);clearInterval(statsTimer);image.removeEventListener('load',rebuild);overlay?.destroy();},
  };
}

/* Canonical pixels and viewport rules. Loaded unchanged by browser, Worker and Android. */
(function (root) {
  'use strict';
  const modes = Object.freeze({normal:'Normal', detail:'Detay', code:'Kod', negative:'Negatif', edge:'Kenar'});
  const limits = Object.freeze({bytes:30*1024*1024, pixels:100000000, edge:2048});
  const clip = n => Math.round(Math.max(0,Math.min(255,n)));
  const luma = (p,i) => (p[i]*77+p[i+1]*150+p[i+2]*29)>>8;
  function apply(source,width,height,mode,cancelled=()=>false) {
    if (!modes[mode] || !Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || width*height>limits.edge**2 || source.length!==width*height*4) throw Error('Geçersiz fotoğraf.');
    const output = new Uint8ClampedArray(source.length);
    for(let y=0;y<height;y++) {
      if(cancelled()) throw Error('cancelled');
      for(let x=0;x<width;x++) {
        const i=(y*width+x)*4, left=(y*width+Math.max(0,x-1))*4, right=(y*width+Math.min(width-1,x+1))*4;
        const top=(Math.max(0,y-1)*width+x)*4,bottom=(Math.min(height-1,y+1)*width+x)*4;
        let gray;
        if(mode==='code') gray=clip((luma(source,i)-128)*1.75+128);
        if(mode==='edge') {
          const tl=(Math.max(0,y-1)*width+Math.max(0,x-1))*4,tr=(Math.max(0,y-1)*width+Math.min(width-1,x+1))*4;
          const bl=(Math.min(height-1,y+1)*width+Math.max(0,x-1))*4,br=(Math.min(height-1,y+1)*width+Math.min(width-1,x+1))*4;
          const gx=-luma(source,tl)+luma(source,tr)-2*luma(source,left)+2*luma(source,right)-luma(source,bl)+luma(source,br);
          const gy=-luma(source,tl)-2*luma(source,top)-luma(source,tr)+luma(source,bl)+2*luma(source,bottom)+luma(source,br);
          gray=clip(Math.hypot(gx,gy)*.75);
        }
        for(let c=0;c<3;c++) {
          let v=source[i+c];
          if(mode==='negative') v=255-v;
          if(mode==='code'||mode==='edge') v=gray;
          if(mode==='detail') {
            v=(1.8*v-.2*(source[left+c]+source[right+c]+source[top+c]+source[bottom+c])-128)*1.08+128;
            v=clip(v+18*(1-Math.max(0,Math.min(255,v))/255)**2);
          }
          output[i+c]=v;
        }
        output[i+3]=source[i+3];
      }
    }
    return output;
  }
  // Read raster dimensions BEFORE asking the decoder to allocate. SVG/GIF/AVIF are intentionally excluded.
  function dimensions(buffer) {
    const b=new Uint8Array(buffer),v=new DataView(buffer);
    let width=0,height=0,type='',orientation=1;
    const exif=(start,end)=>{
      if(start+8>end||end>b.length)return 1;
      const little=b[start]===0x49&&b[start+1]===0x49;
      if(!little&&!(b[start]===0x4d&&b[start+1]===0x4d))return 1;
      if(v.getUint16(start+2,little)!==42)return 1;
      const ifd=start+v.getUint32(start+4,little);if(ifd<start+8||ifd+2>end)return 1;
      const count=Math.min(256,v.getUint16(ifd,little));
      for(let i=0;i<count;i++){
        const entry=ifd+2+i*12;if(entry+12>end)return 1;
        if(v.getUint16(entry,little)===0x112&&v.getUint16(entry+2,little)===3&&v.getUint32(entry+4,little)===1){
          const value=v.getUint16(entry+8,little);return value>=1&&value<=8?value:1;
        }
      }
      return 1;
    };
    if(b.length>=24 && v.getUint32(0)===0x89504e47 && v.getUint32(4)===0x0d0a1a0a && v.getUint32(12)===0x49484452) {
      width=v.getUint32(16);height=v.getUint32(20);type='image/png';
      for(let i=8;i+12<=b.length;){const size=v.getUint32(i),end=i+8+size;if(end+4>b.length)break;if(v.getUint32(i+4)===0x65584966)orientation=exif(i+8,end);i=end+4;}
    } else if(b.length>=4 && b[0]===255 && b[1]===216) {
      for(let i=2;i+3<b.length;) {
        if(b[i++]!==255) continue;
        const marker=b[i++];if(marker===255){i--;continue;}
        if(marker===0xda||marker===0xd9)break;
        if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
        if(i+2>b.length)break;
        const size=v.getUint16(i);if(size<2||i+size>b.length)break;
        if(marker===0xe1&&size>=16&&v.getUint32(i+2)===0x45786966&&v.getUint16(i+6)===0)orientation=exif(i+8,i+size);
        if([0xc0,0xc1,0xc2].includes(marker)&&size>=8){height=v.getUint16(i+3);width=v.getUint16(i+5);type='image/jpeg';}
        i+=size;
      }
    } else if(b.length>=30 && v.getUint32(0)===0x52494646 && v.getUint32(8)===0x57454250) {
      const kind=v.getUint32(12);type='image/webp';
      if(kind===0x56503858){width=1+b[24]+(b[25]<<8)+(b[26]<<16);height=1+b[27]+(b[28]<<8)+(b[29]<<16);}
      if(kind===0x56503820&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a){width=v.getUint16(26,true)&0x3fff;height=v.getUint16(28,true)&0x3fff;}
      if(kind===0x5650384c&&b[20]===0x2f){const n=v.getUint32(21,true);width=1+(n&0x3fff);height=1+((n>>>14)&0x3fff);}
      for(let i=12;i+8<=b.length;){const size=v.getUint32(i+4,true),end=i+8+size;if(end>b.length)break;if(v.getUint32(i)===0x45584946){const start=i+8;orientation=exif(size>=6&&v.getUint32(start)===0x45786966?start+6:start,end);}i=end+(size%2);}
    }
    if(!width||!height||width*height>limits.pixels||width>65535||height>65535) throw Error('Desteklenmeyen, bozuk veya çok büyük fotoğraf.');
    return {width,height,type,orientation};
  }
  class Transform {
    constructor(){this.reset();this.size(1,1,1,1);}
    reset(){this.zoom=1;this.x=this.y=this.rotation=0;}
    size(w,h,iw,ih,alignment=false){this.width=Math.max(1,w);this.height=Math.max(1,h);this.iw=Math.max(1,iw);this.ih=Math.max(1,ih);this.alignment=alignment;this.clamp();}
    fit(){return Math.min(this.width/(this.rotation%180?this.ih:this.iw),this.height/(this.rotation%180?this.iw:this.ih));}
    clamp(){const w=(this.rotation%180?this.ih:this.iw)*this.fit()*this.zoom,h=(this.rotation%180?this.iw:this.ih)*this.fit()*this.zoom;
      const mx=this.alignment?this.width:Math.max(0,(w-this.width)/2),my=this.alignment?this.height:Math.max(0,(h-this.height)/2);
      this.x=Math.max(-mx,Math.min(mx,this.x));this.y=Math.max(-my,Math.min(my,this.y));}
    scale(factor,fx=this.width/2,fy=this.height/2){const next=Math.max(1,Math.min(8,this.zoom*factor)),ratio=next/this.zoom;
      this.x=(fx-this.width/2)-(fx-this.width/2-this.x)*ratio;this.y=(fy-this.height/2)-(fy-this.height/2-this.y)*ratio;this.zoom=next;this.clamp();}
    pan(dx,dy){this.x+=dx;this.y+=dy;this.clamp();}
    rotate(step=1){this.rotation=(this.rotation+step*90+360)%360;this.x=this.y=0;this.clamp();}
    snapshot(){return {zoom:this.zoom,x:this.x,y:this.y,rotation:this.rotation};}
    restore(s){if(!s)return;for(const k of ['zoom','x','y','rotation'])if(Number.isFinite(s[k]))this[k]=s[k];this.zoom=Math.max(1,Math.min(8,this.zoom));this.rotation=(Math.round(this.rotation/90)*90%360+360)%360;this.clamp();}
  }
  class Session {
    constructor(mode='inspect'){this.mode=mode;this.layout='split';this.active=0;this.linked=false;this.opacity=.5;this.layers=[0,1].map(()=>({mode:'normal',index:0,transform:new Transform()}));this.history=[];}
    record(){this.history.push(this.snapshot());if(this.history.length>30)this.history.shift();}
    snapshot(){return {mode:this.mode,layout:this.layout,active:this.active,linked:this.linked,opacity:this.opacity,layers:this.layers.map(l=>({mode:l.mode,index:l.index,transform:l.transform.snapshot()}))};}
    restore(s){if(!s)return;this.mode=s.mode==='compare'?'compare':'inspect';this.layout=s.layout==='overlay'?'overlay':'split';this.active=this.mode==='compare'&&s.active===1?1:0;this.linked=!!s.linked;this.opacity=Math.max(0,Math.min(1,Number(s.opacity)||0));s.layers?.slice(0,2).forEach((l,i)=>{this.layers[i].mode=modes[l.mode]?l.mode:'normal';this.layers[i].index=Math.max(0,Math.trunc(l.index)||0);this.layers[i].transform.restore(l.transform);});}
    undo(){const s=this.history.pop();if(s)this.restore(s);return !!s;}
    photo(layer,index){this.record();this.layers[layer].index=index;this.layers[layer].transform.reset();} // Keep filter; reset geometry for a different photo.
    filter(layer,mode){if(!modes[mode])throw Error('Unknown mode');this.record();this.layers[layer].mode=mode;} // Keep geometry.
    move(method,...args){for(const [i,l] of this.layers.entries())if(i===this.active||(this.mode==='compare'&&this.linked))l.transform[method](...args);}
    align(){this.record();this.layers.forEach(l=>l.transform.reset());this.opacity=.5;}
  }
  root.ImageInspectorCore=Object.freeze({modes,limits,apply,dimensions,Transform,Session});
})(globalThis);

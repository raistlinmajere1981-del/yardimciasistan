/* One disposable job. Terminating this worker cancels decode AND synchronous filtering. */
self.importScripts('core.js');
self.onmessage=async({data})=>{
  let bitmap, canvas;
  try {
    const {blob,mode,edge}=data,{dimensions,limits,apply}=self.ImageInspectorCore;
    if(!blob||blob.size<1||blob.size>limits.bytes)throw Error('Fotoğraf en fazla 30 MB olabilir.');
    const header=dimensions(await blob.arrayBuffer());
    const orientedWidth=header.orientation>=5?header.height:header.width,orientedHeight=header.orientation>=5?header.width:header.height;
    const ratio=Math.min(1,Math.max(64,Math.min(limits.edge,edge||1600))/Math.max(orientedWidth,orientedHeight));
    bitmap=await createImageBitmap(blob,{imageOrientation:'from-image',resizeWidth:Math.max(1,Math.round(orientedWidth*ratio)),resizeHeight:Math.max(1,Math.round(orientedHeight*ratio))});
    if(bitmap.width*bitmap.height>limits.edge**2)throw Error('Fotoğraf çok büyük.');
    canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    const output=mode==='normal'?pixels.data:apply(pixels.data,canvas.width,canvas.height,mode);
    self.postMessage({width:canvas.width,height:canvas.height,pixels:output.buffer},[output.buffer]);
  }catch(error){self.postMessage({error:error.message||'Fotoğraf açılamadı.'});}
  finally{bitmap?.close();if(canvas){canvas.width=canvas.height=1;}self.close();}
};

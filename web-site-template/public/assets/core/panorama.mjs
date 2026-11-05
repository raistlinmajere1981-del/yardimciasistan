// On-demand equirectangular panorama. No animation loop, network library or autoplay.
const messages = JSON.parse(document.getElementById('site-context')?.textContent || '{}').language?.messages || {};
for (const host of document.querySelectorAll('[data-panorama]')) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) continue; // The published image and original-file link remain usable.
  const shaders = [];
  let program, buffer, texture, observer, dialog, image, disposed = false;
  const events = new AbortController();
  let closeExpanded = () => {};
  const dispose = () => {
    if (disposed) return;
    const restoreFocus = dialog?.contains(document.activeElement) || document.activeElement === canvas
      || document.activeElement === host.querySelector('[data-panorama-expand]');
    disposed = true;
    if (image) image.onload = image.onerror = null;
    closeExpanded(); events.abort(); observer?.disconnect(); canvas.remove(); dialog?.remove();
    host.querySelector('img').hidden = false;
    host.querySelector('[data-panorama-expand]')?.remove();
    if (texture) gl.deleteTexture(texture);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    for (const item of shaders) gl.deleteShader(item);
    if (restoreFocus) host.closest('figure')?.querySelector('figcaption a')?.focus({preventScroll:true});
  };
  const shader = (type, source) => {
    const result = gl.createShader(type); shaders.push(result); gl.shaderSource(result, source); gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error('panorama_shader');
    return result;
  };
  try {
    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 uv;void main(){uv=p;gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision mediump float;varying vec2 uv;uniform sampler2D photo;uniform vec3 camera;uniform float aspect;uniform float halfView;
      void main(){vec3 d=normalize(vec3(uv.x*aspect*camera.z,uv.y*camera.z,1.));
      float cy=cos(camera.x),sy=sin(camera.x),cp=cos(camera.y),sp=sin(camera.y);
      d=vec3(d.x,d.y*cp+d.z*sp,-d.y*sp+d.z*cp);d=vec3(d.x*cy+d.z*sy,d.y,-d.x*sy+d.z*cy);
      float angle=atan(d.x,d.z);float x=halfView>0.5?angle/3.14159265+0.5:angle/6.2831853+0.5;
      if(x<0.||x>1.){gl_FragColor=vec4(0.06,0.15,0.2,1.);return;}
      gl_FragColor=texture2D(photo,vec2(x,0.5-asin(clamp(d.y,-1.,1.))/3.14159265));}`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('panorama_link');
    gl.useProgram(program);
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    image = new Image(); image.crossOrigin = 'anonymous';
    image.onerror = dispose;
    window.addEventListener('pagehide', dispose, {once:true, signal:events.signal});
    canvas.addEventListener('webglcontextlost', event => {event.preventDefault(); dispose();}, {once:true, signal:events.signal});
    image.onload = () => {
      if (disposed) return;
      image.onload = image.onerror = null;
      try {
        texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
        if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error('panorama_texture');
        let yaw=0, pitch=0, last=null;
        const half = host.dataset.panorama === 'panorama_180';
        let expanded = false;
        dialog = document.createElement('dialog');
        dialog.className = 'panorama-dialog';
        dialog.setAttribute('aria-label', host.dataset.label);
        const stage = document.createElement('div'); stage.className = 'panorama-stage';
        const expand = document.createElement('button'); expand.type = 'button';
        expand.dataset.panoramaExpand = ''; expand.className = 'panorama-expand';
        expand.textContent = messages['room.panorama.expand'];
        expand.setAttribute('aria-haspopup', 'dialog'); expand.setAttribute('aria-expanded', 'false');
        const close = document.createElement('button'); close.type = 'button';
        close.className = 'panorama-close'; close.textContent = messages['room.panorama.close'];
        stage.append(close); dialog.append(stage);
        const draw = () => {
          if (disposed) return;
          const area = expanded ? stage : host;
          canvas.width=Math.max(1, Math.round(area.clientWidth*Math.min(devicePixelRatio,2)));
          canvas.height=expanded ? Math.max(1, Math.round(canvas.clientHeight*Math.min(devicePixelRatio,2))) : Math.round(canvas.width*9/16);
          gl.viewport(0,0,canvas.width,canvas.height);
          gl.uniform3f(gl.getUniformLocation(program,'camera'),yaw,pitch,.7);
          gl.uniform1f(gl.getUniformLocation(program,'aspect'),canvas.width/canvas.height);
          gl.uniform1f(gl.getUniformLocation(program,'halfView'),half?1:0); gl.drawArrays(gl.TRIANGLES,0,6);
        };
        const move=(x,y)=>{yaw=half?Math.max(-Math.PI/2,Math.min(Math.PI/2,yaw+x)):yaw+x;pitch=Math.max(-1.2,Math.min(1.2,pitch+y));draw();};
        canvas.tabIndex=0; canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',host.dataset.label);
        host.querySelector('img').hidden=true; host.append(canvas); draw();
        closeExpanded = () => {
          if (!expanded) return;
          expanded = false; last = null;
          if (document.fullscreenElement === stage) void document.exitFullscreen().catch(() => {});
          host.append(canvas); dialog.close(); dialog.remove();
          expand.setAttribute('aria-expanded', 'false');
          delete dialog.dataset.nativeFullscreen;
          if (!disposed) {draw(); if (expand.isConnected) expand.focus({preventScroll:true});}
        };
        expand.addEventListener('click', () => {
          if (expanded || disposed) return;
          expanded = true; last = null; document.body.append(dialog); stage.append(canvas);
          dialog.showModal(); expand.setAttribute('aria-expanded', 'true'); draw(); close.focus();
          // Native fullscreen is progressive enhancement; the modal stays usable
          // if mobile, permissions or the browser reject fullscreen.
          try {
            const request = stage.requestFullscreen?.();
            request?.then(() => {if (!expanded && document.fullscreenElement === stage) void document.exitFullscreen().catch(() => {}); draw();}).catch(() => {});
          } catch { /* Accessible dialog fallback is already open. */ }
        }, {signal:events.signal});
        close.addEventListener('click', closeExpanded, {signal:events.signal});
        dialog.addEventListener('cancel', event => {event.preventDefault(); closeExpanded();}, {signal:events.signal});
        dialog.addEventListener('keydown', event => {
          if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); closeExpanded();}
          if (event.key === 'Tab') {
            event.preventDefault(); (document.activeElement === close ? canvas : close).focus();
          }
        }, {signal:events.signal});
        document.addEventListener('fullscreenchange', () => {
          if (document.fullscreenElement === stage) dialog.dataset.nativeFullscreen = '1';
          else if (dialog.dataset.nativeFullscreen) {delete dialog.dataset.nativeFullscreen; closeExpanded();}
        }, {signal:events.signal});
        if (messages['room.panorama.expand'] && messages['room.panorama.close']) host.append(expand);
        canvas.addEventListener('pointerdown',e=>{last=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
        canvas.addEventListener('pointermove',e=>{if(last){move((last[0]-e.clientX)*.006,(e.clientY-last[1])*.006);last=[e.clientX,e.clientY];}});
        canvas.addEventListener('pointerup',()=>{last=null;}); canvas.addEventListener('pointercancel',()=>{last=null;});
        canvas.addEventListener('keydown',e=>{const keys={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,.1],ArrowDown:[0,-.1]};if(keys[e.key]){e.preventDefault();move(...keys[e.key]);}});
        observer=new ResizeObserver(draw);observer.observe(host);observer.observe(stage);
      } catch { dispose(); }
    };
    image.src=host.dataset.src;
  } catch { dispose(); /* Static fallback remains. */ }
}

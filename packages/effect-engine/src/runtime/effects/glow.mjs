import {between} from '../random.mjs';

// Soft radial aura with a slow seeded pulse. The gradient is cached per canvas
// size so a steady overlay allocates no paint resources per frame.
export function createGlow({random, params}) {
  let enabled=params.enabled!==false, disposed=false, active=0, time=0,interactionProgress=1;
  const phase=random()*Math.PI*2;
  const drift=between(random,-1,1);
  let gradient=null, gradientKey='';
  function ensureGradient(ctx,width,height){
    const key=`${width}:${height}`;
    if(gradient&&key===gradientKey)return;
    gradientKey=key;
    const radius=Math.max(width,height)*.5;
    gradient=ctx.createRadialGradient(width*.5,height*.5,0,width*.5,height*.5,radius);
    gradient.addColorStop(0,'rgba(255,246,206,.92)');
    gradient.addColorStop(.22,'rgba(255,223,150,.58)');
    gradient.addColorStop(.58,'rgba(255,180,74,.2)');
    gradient.addColorStop(1,'rgba(255,150,40,0)');
  }
  return {
    setProgress(value){interactionProgress=Math.min(1,Math.max(0,Number(value)||0));},
    update(dt){
      if(!enabled||disposed)return;
      time=(time+Math.max(0,dt)*params.speed)%3600;
    },
    render(ctx,frame={}){
      active=0;
      if(!enabled||disposed||interactionProgress<=0)return;
      const width=frame.width??ctx.canvas?.width??1;
      const height=frame.height??ctx.canvas?.height??1;
      if(width<=0||height<=0)return;
      ensureGradient(ctx,width,height);
      const pulse=1+Math.sin(time*1.7+phase)*params.pulse*.35;
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=Math.min(1,params.opacity*Math.max(.25,pulse)*interactionProgress);
      ctx.translate(width*.5+Math.sin(time*.6+phase)*width*.012+drift*width*.01,height*.5);
      ctx.scale(pulse,pulse);
      ctx.translate(-width*.5,-height*.5);
      ctx.fillStyle=gradient;
      ctx.fillRect(0,0,width,height);
      ctx.restore();
      active=1;
    },
    inspect:()=>({type:'glow',enabled,disposed,active,time,phase,drift,interactionProgress}),
    destroy(){disposed=true;active=0;gradient=null;gradientKey='';},
  };
}

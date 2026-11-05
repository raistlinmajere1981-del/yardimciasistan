import {between} from '../random.mjs';

const OUTER='#e8681d', MIDDLE='#ffb43c', CORE='#fff2b0';

// A layered, coherent flame: seeded phases give a stable character, while all
// motion is a smooth function of shared ticker time. No per-frame allocation.
export function createFlame({random, params}) {
  let enabled=params.enabled!==false, disposed=false, active=0, time=0;
  const phases=[random()*Math.PI*2,random()*Math.PI*2,random()*Math.PI*2];
  const lean=between(random,-1,1);
  function shape(ctx,width,height,layer){
    const t=time+phases[layer];
    const base=height*.97;
    const baseWidth=width*(.36-layer*.06);
    const sway=Math.sin(t*2.1+phases[1])*width*.12*params.sway
      +Math.sin(t*3.7+phases[2])*width*.045*params.sway;
    const tipX=width*.5+sway+lean*width*.035;
    const tipY=height*(.06+layer*.11)+Math.sin(t*3.1+phases[layer])*height*.03;
    ctx.beginPath();
    ctx.moveTo(width*.5-baseWidth*.5,base);
    ctx.bezierCurveTo(width*.5-baseWidth*.62,height*.66,tipX-width*.17,height*.34,tipX,tipY);
    ctx.bezierCurveTo(tipX+width*.16,height*.33,width*.5+baseWidth*.62,height*.67,width*.5+baseWidth*.5,base);
    ctx.closePath();
  }
  return {
    update(dt){
      if(!enabled||disposed)return;
      time=(time+Math.max(0,dt)*params.speed)%3600;
    },
    render(ctx,frame={}){
      active=0;
      if(!enabled||disposed)return;
      const width=frame.width??ctx.canvas?.width??1;
      const height=frame.height??ctx.canvas?.height??1;
      if(width<=0||height<=0)return;
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      for(const [layer,color,alpha] of [[0,OUTER,.34],[1,MIDDLE,.42],[2,CORE,.72]]){
        ctx.globalAlpha=Math.min(1,params.opacity*alpha);
        ctx.fillStyle=color;
        shape(ctx,width,height,layer);
        ctx.fill();
      }
      ctx.restore();
      active=1;
    },
    inspect:()=>({type:'flame',enabled,disposed,active,time,phases:[...phases],lean}),
    destroy(){disposed=true;active=0;},
  };
}

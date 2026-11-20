// Finite reflection, clipped to a tapered blade. Seed affects tone only;
// position is a function of elapsed seconds, independent of frame count.
export function createMetalGlint({random,params}) {
  const tone=.94+random()*.06;
  let time=0,disposed=false,active=0;
  const complete=()=>time>=params.duration/params.speed;
  return {
    update(dt){if(!disposed)time+=Math.max(0,dt);},
    render(ctx,{width,height}){
      active=0;if(disposed||complete())return;
      const t=time*params.speed/params.duration;
      const half=width*params.bladeWidth/2;
      ctx.save();ctx.translate(width/2,height/2);ctx.rotate(params.angle*Math.PI/180);
      ctx.beginPath();ctx.moveTo(-half,-height*.46);ctx.lineTo(half,-height*.46);
      ctx.lineTo(half*.7,height*.25);ctx.lineTo(0,height*.48);ctx.lineTo(-half*.7,height*.25);ctx.closePath();ctx.clip();
      const y=(-.6+t*1.2)*height,band=params.band*height;
      const g=ctx.createLinearGradient(0,y-band/2,0,y+band/2);
      g.addColorStop(0,'rgba(255,237,201,0)');g.addColorStop(.45,'rgba(242,224,187,.3)');
      g.addColorStop(.52,'rgba(255,246,222,1)');g.addColorStop(1,'rgba(255,237,201,0)');
      ctx.globalAlpha=params.opacity*tone*Math.sin(Math.PI*t);ctx.fillStyle=g;
      ctx.fillRect(-width/2,-height/2,width,height);ctx.restore();active=1;
    },
    isComplete:complete,
    inspect:()=>({type:'metal-glint',time,active,disposed,complete:complete(),tone}),
    destroy(){disposed=true;active=0;},
  };
}

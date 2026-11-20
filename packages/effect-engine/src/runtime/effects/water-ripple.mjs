// Two low contrast crests inside an elliptical surface mask; no particles.
export function createWaterRipple({random,params}) {
  const tone=.94+random()*.06;
  let time=0,disposed=false,active=0;
  const complete=()=>time>=params.duration/params.speed;
  return {
    update(dt){if(!disposed)time+=Math.max(0,dt);},
    render(ctx,{width,height}){
      active=0;if(disposed||complete())return;
      const t=time*params.speed/params.duration;
      ctx.save();ctx.translate(width/2,height/2);ctx.rotate(params.angle*Math.PI/180);
      ctx.beginPath();ctx.ellipse(0,0,width*.49,height*.49,0,0,Math.PI*2);ctx.clip();
      for(let i=0;i<2;i++){
        const progress=(t-i*.16)/.84;if(progress<=0||progress>=1)continue;
        const radius=(.06+progress*.9)*params.spread;
        ctx.globalAlpha=params.opacity*tone*Math.sin(Math.PI*progress)*(1-progress*.55);
        ctx.lineWidth=Math.max(.5,Math.min(1,width*.004));ctx.strokeStyle='#d4c5a5';
        ctx.beginPath();ctx.ellipse(0,0,width*.5*radius,height*.5*radius,0,0,Math.PI*2);ctx.stroke();active++;
      }
      ctx.restore();
    },
    isComplete:complete,
    inspect:()=>({type:'water-ripple',time,active,disposed,complete:complete(),tone}),
    destroy(){disposed=true;active=0;},
  };
}

import {between} from '../random.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const PUFF_LAYERS=[[1.9,.14],[1.25,.24],[.72,.5]];

// Capped, deterministic smoke puffs. Particles live in normalized local space
// so an object resize never changes the simulation; all randomness happens at
// spawn. Transparency comes from layered low-alpha circles, not filters.
export function createSmoke({random, params}) {
  let enabled=params.enabled!==false, disposed=false, active=0, clock=0;
  const particles=[];
  function respawn(particle,initial=false){
    const life=between(random,2.4,5.2);
    particle.life=life;
    particle.age=initial?between(random,life*.05,life*.95):0;
    particle.x=clamp(.5+between(random,-.5,.5)*params.spread*.32,0,1);
    particle.y=between(random,.72,1);
    particle.rise=between(random,.35,.72);
    particle.drift=between(random,-.16,.16);
    particle.sway=between(random,.015,.06);
    particle.size=between(random,.025,.075)*(.6+params.spread*.8);
    particle.phase=random()*Math.PI*2;
    particle.strength=between(random,.55,1);
    return particle;
  }
  const count=Math.max(0,Math.min(300,Math.round(params.count)));
  for(let i=0;i<count;i++)particles.push(respawn({},true));
  function position(particle){
    const progress=particle.age/particle.life;
    return {
      x:clamp(particle.x+Math.sin(progress*Math.PI*2+particle.phase)*particle.sway+progress*particle.drift,0,1),
      y:clamp(particle.y-progress*particle.rise,0,1),
      alpha:Math.min(1,params.opacity*Math.sin(progress*Math.PI)**1.25*particle.strength),
      progress,
    };
  }
  return {
    update(dt){
      if(!enabled||disposed)return;
      const step=Math.max(0,dt)*params.speed;
      clock=(clock+step)%3600;
      for(const particle of particles){
        particle.age+=step;
        if(particle.age>=particle.life)respawn(particle);
      }
    },
    render(ctx,frame={}){
      active=0;
      if(!enabled||disposed)return;
      const width=frame.width??ctx.canvas?.width??1;
      const height=frame.height??ctx.canvas?.height??1;
      if(width<=0||height<=0)return;
      const unit=Math.min(width,height);
      ctx.save();
      for(const particle of particles){
        const progress=particle.age/particle.life;
        const x=clamp(particle.x+Math.sin(progress*Math.PI*2+particle.phase)*particle.sway+progress*particle.drift,0,1);
        const y=clamp(particle.y-progress*particle.rise,0,1);
        const alpha=Math.min(1,params.opacity*Math.sin(progress*Math.PI)**1.25*particle.strength);
        if(alpha<=.002)continue;
        const radius=unit*particle.size*(.65+progress*.9);
        const cx=x*width,cy=y*height;
        for(const [scale,share] of PUFF_LAYERS){
          ctx.globalAlpha=Math.min(1,alpha*share);
          ctx.fillStyle='#e9e5df';
          ctx.beginPath();
          ctx.arc(cx,cy,radius*scale,0,Math.PI*2);
          ctx.fill();
        }
        active++;
      }
      ctx.restore();
    },
    inspect:()=>({type:'smoke',enabled,disposed,active,clock,count:particles.length,
      particles:particles.map(particle=>{const {x,y,alpha,progress}=position(particle);
        return {x,y,alpha,size:particle.size,progress,age:particle.age,life:particle.life};})}),
    destroy(){disposed=true;active=0;particles.length=0;},
  };
}

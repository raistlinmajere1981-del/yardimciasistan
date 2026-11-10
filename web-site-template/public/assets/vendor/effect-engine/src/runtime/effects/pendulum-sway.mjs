// Time and angle belong to the canonical engine. The consumer owns the image.
export function createPendulumSway({params}) {
  let elapsed=0,disposed=false;
  const angle=()=>{
    if(disposed||elapsed>=params.duration)return 0;
    // A smooth terminal envelope also settles short/low-damping profiles at
    // exactly zero with zero velocity, independent of frequency and frame rate.
    const tail=Math.min(1,(params.duration-elapsed)/Math.min(.3,params.duration/3));
    const settle=tail*tail*(3-2*tail);
    return params.amplitude*Math.exp(-params.damping*elapsed)*Math.sin(2*Math.PI*params.frequency*elapsed)*settle;
  };
  return {
    update(dt){if(!disposed)elapsed=Math.min(params.duration,elapsed+Math.max(0,dt)*params.speed);},
    motion:()=>({angle:angle()}),
    isComplete:()=>disposed||elapsed>=params.duration,
    inspect:()=>({elapsed,angle:angle(),disposed}),
    destroy(){disposed=true;},
  };
}

// Reversible finite interaction envelope. The drawing engine controls the
// frames; callers only set the desired target (0 or 1).
export function createInteractionProgress({enterMs=240,leaveMs=190,trigger='hover'}={}) {
  if(!['hover','click'].includes(trigger))throw new TypeError('Unknown interaction trigger');
  if(!(enterMs>0&&leaveMs>0))throw new RangeError('Transition durations must be positive');
  let progress=0,target=0,clickCycle=false;
  const state=()=>({progress,target,active:progress>0||target>0,clickCycle});
  return {
    state,
    enter(){if(trigger!=='hover')return;clickCycle=false;target=1;},
    leave(){if(trigger!=='hover')return;clickCycle=false;target=0;},
    click(){if(trigger!=='click')return;clickCycle=true;target=1;},
    tick(dt=0){
      const duration=target?enterMs:leaveMs;
      const delta=Math.max(0,dt)*1000/duration;
      progress=Math.min(1,Math.max(0,progress+(target?delta:-delta)));
      if(trigger==='click'&&clickCycle&&target===1&&progress>=1)target=0;
      if(progress<=0&&target===0)clickCycle=false;
      return state();
    },
    reset(){progress=0;target=0;clickCycle=false;return state();},
  };
}

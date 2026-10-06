import { useEffect } from "react";
/** Global feedback projects durable failures; the calendar remains the management surface. */
export function useMarketingScheduleStatus(enabled:boolean,setStatusMessage:(message:string)=>void) {
  useEffect(()=>{
    const bridge=window.yardimciDesktop;
    if(!enabled || !bridge?.getMarketingSchedules)return;
    let live=true,version=0;const seen=new Set<string>();
    async function refresh() {
      const ticket=++version;
      try {
        const result=await bridge!.getMarketingSchedules();
        if(!live || ticket!==version || !result.ok)return;
        const failures=result.value.schedules.flatMap(d=>d.executions.filter(e=>e.status==="failed"));
        if(failures.some(e=>!seen.has(e.id)))setStatusMessage("Pazarlama planı çalışması başarısız. Ana Takvim’den son çalışma sonucunu kontrol edin.");
        for(const e of failures)seen.add(e.id);
      } catch { /* Session lock uses the normal unlock flow; do not replace global feedback. */ }
    }
    void refresh();const dispose=bridge.onMarketingSchedulesChanged?.(()=>{void refresh();});
    return()=>{live=false;dispose?.();};
  },[enabled,setStatusMessage]);
}

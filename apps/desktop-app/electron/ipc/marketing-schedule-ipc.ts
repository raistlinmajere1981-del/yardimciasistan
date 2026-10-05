import { ipcMain } from "electron";
import type { MarketingResult, MarketingScheduleInput } from "@yardimci-asistan/shared";
import type { MarketingScheduleService } from "../marketing/schedule-service";
import { MarketingError } from "../marketing/validation";
export function registerMarketingScheduleIpc(options:{service:MarketingScheduleService;assertUnlocked:()=>void}) {
  async function operation<T>(action:()=>T):Promise<MarketingResult<T>> {
    options.assertUnlocked();try {const value=action();options.assertUnlocked();return {ok:true,value};}
    catch(error){return {ok:false,code:error instanceof MarketingError?error.code:"operation_failed",message:error instanceof MarketingError?error.message:"Pazarlama planı işlemi tamamlanamadı."};}
  }
  ipcMain.handle("marketingSchedules:list",(_event,month?:string)=>operation(()=>options.service.snapshot(month)));
  ipcMain.handle("marketingSchedules:save",(_event,input:MarketingScheduleInput)=>operation(()=>options.service.save(input)));
  ipcMain.handle("marketingSchedules:transition",(_event,id:string,revision:number,action:"pause"|"resume"|"cancel")=>operation(()=>options.service.transition(id,revision,action)));
}

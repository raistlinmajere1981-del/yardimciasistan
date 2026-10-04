import { ipcMain } from "electron";
import type { MarketingResult, MarketingContentInput, MarketingPublicationInput, MarketingAiInput } from "@yardimci-asistan/shared";
import type { MarketingStudioService } from "../marketing/service";
import { MarketingError } from "../marketing/validation";
export function registerMarketingIpc(options:{service:MarketingStudioService;assertUnlocked:()=>void}) {
  async function operation<T>(action:()=>T|Promise<T>):Promise<MarketingResult<T>> {
    options.assertUnlocked();
    try {const value=await action();options.assertUnlocked();return {ok:true,value};}
    catch(error) {return {ok:false,code:error instanceof MarketingError?error.code:"operation_failed",message:error instanceof MarketingError?error.message:"Pazarlama işlemi tamamlanamadı."};}
  }
  const s=options.service;
  ipcMain.handle("marketing:channels",()=>operation(()=>s.channels()));
  ipcMain.handle("marketing:studio",()=>operation(()=>s.snapshot()));
  ipcMain.handle("marketing:saveContent",(_event,input:MarketingContentInput)=>operation(()=>s.saveContent(input)));
  ipcMain.handle("marketing:uploadAssets",()=>operation(()=>s.upload()));
  ipcMain.handle("marketing:manageAsset",(_event,id:string,action:"archive"|"delete",altText?:string)=>operation(()=>s.manageAsset(id,action,altText)));
  ipcMain.handle("marketing:generate",(_event,input:MarketingAiInput)=>operation(()=>s.generate(input)));
  ipcMain.handle("marketing:savePublication",(_event,input:MarketingPublicationInput)=>operation(()=>s.savePublication(input)));
  ipcMain.handle("marketing:publish",(_event,id:string,revision:number)=>operation(()=>s.publish(id,revision)));
  ipcMain.handle("marketing:unpublish",(_event,id:string,revision:number)=>operation(()=>s.unpublish(id,revision)));
  ipcMain.handle("marketing:testWebsite",()=>operation(()=>s.testWebsite()));
}

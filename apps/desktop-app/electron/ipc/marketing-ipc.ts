import type { MarketingShareService } from "../marketing/share-service";
import { MessagingCampaignError } from "../messaging-campaigns/validation";
import { ipcMain } from "electron";
import type { MarketingResult, MarketingContentInput, MarketingPublicationInput, MarketingAiInput, MarketingShareInput } from "@yardimci-asistan/shared";
import type { MarketingStudioService } from "../marketing/service";
import { MarketingError } from "../marketing/validation";
export function registerMarketingIpc(options:{service:MarketingStudioService;shares:MarketingShareService;assertUnlocked:()=>void}) {
  async function operation<T>(action:()=>T|Promise<T>):Promise<MarketingResult<T>> {
    options.assertUnlocked();
    try {const value=await action();options.assertUnlocked();return {ok:true,value};}
    catch(error) {return {ok:false,code:(error instanceof MarketingError || error instanceof MessagingCampaignError)?error.code:"operation_failed",message:(error instanceof MarketingError || error instanceof MessagingCampaignError)?error.message:"Pazarlama işlemi tamamlanamadı."};}
  }
  ipcMain.handle("marketing:share",(_event,id:string)=>operation(()=>options.shares.get(id)));
  ipcMain.handle("marketing:saveShare",(_event,input:MarketingShareInput)=>operation(()=>options.shares.save(input)));
  ipcMain.handle("marketing:submitShare",(_event,id:string,revision:number)=>operation(()=>options.shares.submit(id,revision)));
  const s=options.service;
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

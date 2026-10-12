import { ipcMain } from "electron";
import type { SmsConfigurationInput, MarketingResult } from "@yardimci-asistan/shared";
import type { SmsMessagingService } from "../business-messaging/sms-service";
import type { InstagramPublicationService } from "../marketing/instagram-publication-service";
import type { InstagramOAuthService } from "../marketing/instagram-oauth-service";
import { MarketingProviderError } from "../marketing/provider-http";
import { MarketingError } from "../marketing/validation";
export function registerMarketingProviderIpc(options: { sms: SmsMessagingService; instagram: InstagramPublicationService; instagramOAuth: InstagramOAuthService; assertUnlocked: () => void }) {
  ipcMain.handle("marketingProviders:smsConfiguration",()=>{options.assertUnlocked();return options.sms.getConfiguration();});
  ipcMain.handle("marketingProviders:instagramConfiguration",()=>{options.assertUnlocked();return options.instagram.getConfiguration();});
  ipcMain.handle("marketingProviders:testSms",async(_event,input?:SmsConfigurationInput)=>{options.assertUnlocked();const result=await options.sms.testConnection(input);options.assertUnlocked();return result;});
  ipcMain.handle("marketingProviders:testInstagram",async()=>{options.assertUnlocked();const result=await options.instagram.testConnection();options.assertUnlocked();return result;});
  ipcMain.handle("marketingProviders:beginInstagramOAuth",async()=>{options.assertUnlocked();const result=await options.instagramOAuth.begin();options.assertUnlocked();return result;});
  ipcMain.handle("marketingProviders:pollInstagramOAuth",async()=>{options.assertUnlocked();const result=await options.instagramOAuth.poll();options.assertUnlocked();return result;});
  ipcMain.handle("marketingProviders:disconnectInstagramOAuth",()=>{options.assertUnlocked();return options.instagramOAuth.disconnect();});
  ipcMain.handle("marketingProviders:setInstagramEnabled",(_event,enabled:boolean)=>{options.assertUnlocked();return options.instagramOAuth.setEnabled(enabled);});
  ipcMain.handle("marketingProviders:smsSenders",async(_event,input?:SmsConfigurationInput):Promise<MarketingResult<string[]>>=>{
    options.assertUnlocked();try{const value=await options.sms.listSenderIds(input);options.assertUnlocked();return {ok:true,value};}
    catch(error){return {ok:false,code:error instanceof MarketingProviderError||error instanceof MarketingError?error.code:"operation_failed",message:"SMS başlıkları okunamadı."};}
  });
}

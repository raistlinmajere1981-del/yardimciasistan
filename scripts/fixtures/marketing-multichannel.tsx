import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { MarketingPage } from '../../apps/desktop-app/src/pages/MarketingPage';
import { SmsSettingsSection, InstagramSettingsSection } from '../../apps/desktop-app/src/components/settings/MarketingChannelsSettingsSection';
import { toSetupForm } from '../../apps/desktop-app/src/app/setup-model';
import type { DesktopSetupData } from '../../apps/desktop-app/electron/database';
import '../../apps/desktop-app/src/styles/index.css';
const fixture=window as typeof window & {__d5Setup:DesktopSetupData;__d5Call:(method:string,args:unknown[])=>Promise<any>};
const call=(method:string,...args:unknown[])=>fixture.__d5Call(method,args);
window.yardimciDesktop={
  getMarketingStudio:()=>call('snapshot'),getMarketingChannels:()=>call('channels'),saveMarketingContent:input=>call('content',input),
  uploadMarketingAssets:()=>call('upload'),manageMarketingAsset:(...args)=>call('asset',...args),generateMarketingAi:input=>call('ai',input),
  saveMarketingPublication:input=>call('publication',input),publishMarketingPublication:(...args)=>call('publish',...args),unpublishMarketingPublication:(...args)=>call('unpublish',...args),
  getBusinessMessagingConfiguration:()=>call('whatsappConfiguration'),getSmsConfiguration:()=>call('smsConfiguration'),getInstagramConfiguration:()=>call('instagramConfiguration'),
  listBusinessMessagingTemplates:()=>call('templates'),listMessagingCampaigns:()=>call('campaigns'),listMessagingSegments:()=>call('segments'),
  createMessagingCampaign:input=>call('createCampaign',input),getMessagingCampaign:id=>call('campaign',id),previewMessagingSegment:(...args)=>call('previewSegment',...args),prepareMessagingCampaign:id=>call('prepareCampaign',id),
  startMessagingCampaign:id=>call('startCampaign',id),pauseMessagingCampaign:id=>call('pauseCampaign',id),resumeMessagingCampaign:id=>call('resumeCampaign',id),cancelMessagingCampaign:id=>call('cancelCampaign',id),
  onMessagingCampaignsChanged:()=>()=>{},testSmsConnection:input=>call('testSms',input),listSmsSenderIds:input=>call('smsSenders',input),testInstagramConnection:input=>call('testInstagram',input)
} as typeof window.yardimciDesktop;
function Fixture(){const [settings,setSettings]=useState(false),[form,setForm]=useState(()=>toSetupForm(fixture.__d5Setup));return <div style={{height:'1000px'}}>
  {settings?<><button onClick={()=>setSettings(false)}>Pazarlamaya dön</button><SmsSettingsSection draft={form.sms} busy={false} onChange={sms=>setForm({...form,sms})}/><InstagramSettingsSection draft={form.instagram} busy={false} onChange={instagram=>setForm({...form,instagram})}/></>:<MarketingPage enabled campaignsEnabled onSettings={()=>setSettings(true)}/>}</div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);

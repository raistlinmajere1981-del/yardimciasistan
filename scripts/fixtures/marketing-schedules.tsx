import { useState } from 'react';
import { useMarketingScheduleStatus } from '../../apps/desktop-app/src/app/use-marketing-schedule-status';
import { createRoot } from 'react-dom/client';
import { MarketingPage } from '../../apps/desktop-app/src/pages/MarketingPage';
import '../../apps/desktop-app/src/styles/index.css';
const fixture=window as typeof window & {__scheduleCall:(method:string,args:unknown[])=>Promise<any>};
const listeners=new Set<()=>void>();
Object.assign(fixture,{__notifyScheduleChanged:()=>{for(const listener of listeners)listener();}});
const call=(method:string,...args:unknown[])=>fixture.__scheduleCall(method,args);
window.yardimciDesktop={
  getMarketingStudio:()=>call('snapshot'),getMarketingChannels:()=>call('channels'),saveMarketingContent:input=>call('content',input),
  saveMarketingPublication:input=>call('publication',input),publishMarketingPublication:(...args)=>call('publish',...args),
  getMarketingSchedules:month=>call('schedules',month),saveMarketingSchedule:input=>call('saveSchedule',input),transitionMarketingSchedule:(...args)=>call('transitionSchedule',...args),onMarketingSchedulesChanged:listener=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
  getBusinessMessagingConfiguration:()=>call('whatsappConfiguration'),getSmsConfiguration:()=>call('smsConfiguration'),
  listBusinessMessagingTemplates:()=>call('templates'),listMessagingCampaigns:()=>call('campaigns'),listMessagingSegments:()=>call('segments'),
  getMessagingCampaign:id=>call('campaign',id),onMessagingCampaignsChanged:()=>()=>{}
} as typeof window.yardimciDesktop;
function Fixture(){const [message,setMessage]=useState('');useMarketingScheduleStatus(true,setMessage);return <div style={{height:'1000px'}}>{message && <p role="status" aria-label="Global plan durumu">{message}</p>}<MarketingPage enabled campaignsEnabled/></div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);

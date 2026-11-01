import { useCallback, useRef, useState } from 'react';
import type { DesktopPage } from '../../apps/desktop-app/src/app/navigation';
import type { PageLeaveGuard } from '../../apps/desktop-app/src/app/page-navigation-guard';
import { PageViewStateProvider } from '../../apps/desktop-app/src/app/page-view-state';
import { WebAvailabilityProvider } from '../../apps/desktop-app/src/app/web-availability';
import { createRoot } from 'react-dom/client';
import { MarketingPage } from '../../apps/desktop-app/src/pages/MarketingPage';
import { OperationCalendarPage } from '../../apps/desktop-app/src/pages/OperationCalendarPage';
import { useCalendarPageController } from '../../apps/desktop-app/src/components/calendar/calendar-page-state';
import '../../apps/desktop-app/src/styles/index.css';
// The test bridge deliberately returns heterogeneous fixture payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixture=window as typeof window & {__marketingCall:(method:string,args:unknown[])=>Promise<any>; __notifyScheduleChanged?:()=>void; __notifyCampaignChanged?:()=>void; __setMarketingWebAvailable?:(enabled:boolean)=>void};
const call=(method:string,...args:unknown[])=>fixture.__marketingCall(method,args);
const scheduleListeners=new Set<()=>void>(), campaignListeners=new Set<()=>void>();
fixture.__notifyScheduleChanged=()=>scheduleListeners.forEach(f=>f()); fixture.__notifyCampaignChanged=()=>campaignListeners.forEach(f=>f());
window.yardimciDesktop={getMarketingStudio:()=>call('snapshot'),getMarketingChannels:()=>call('channels'),saveMarketingContent:input=>call('content',input),
  getMarketingShare:id=>call('share',id),saveMarketingShare:input=>call('saveShare',input),submitMarketingShare:(...args)=>call('submitShare',...args),
  uploadMarketingAssets:()=>call('upload'),manageMarketingAsset:(...args)=>call('asset',...args),generateMarketingAi:input=>call('ai',input),
  saveMarketingPublication:input=>call('publication',input),publishMarketingPublication:(...args)=>call('publish',...args),unpublishMarketingPublication:(...args)=>call('unpublish',...args),
  getMarketingSchedules:month=>call('schedules',month),saveMarketingSchedule:input=>call('saveSchedule',input),transitionMarketingSchedule:(...args)=>call('transitionSchedule',...args),
  listMessagingSegments:()=>call('segments'),saveMessagingSegment:input=>call('saveSegment',input),previewMessagingSegment:(...args)=>call('previewSegment',...args),
  listBusinessMessagingTemplates:()=>call('templates'),getMessagingCampaign:id=>call('campaign',id),prepareMessagingCampaign:id=>call('prepareCampaign',id),startMessagingCampaign:id=>call('startCampaign',id),pauseMessagingCampaign:id=>call('pauseCampaign',id),resumeMessagingCampaign:id=>call('resumeCampaign',id),cancelMessagingCampaign:id=>call('cancelCampaign',id),
  onMessagingCampaignsChanged:listener=>{campaignListeners.add(listener);return()=>campaignListeners.delete(listener);}, onMarketingSchedulesChanged:listener=>{scheduleListeners.add(listener);return()=>scheduleListeners.delete(listener);},
  getMarketingAnalytics:range=>call('analytics',range),getMarketingPublicationAnalytics:id=>call('publicationAnalytics',id),getMarketingCampaignAnalytics:id=>call('campaignAnalytics',id),refreshMarketingPublicationMetrics:id=>call('refresh',id),
  testMarketingWebsiteConnection:()=>call('test')} as typeof window.yardimciDesktop;
// This fixture supplies only the fields consumed by its calendar scenario.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emptyDashboard={reservations:[],dailyTasks:[],rooms:[],tables:[]} as any;
function RouteFixture() {
  const [active, setActive]=useState('marketing'),[message,setMessage]=useState('');
  const calendar=useCalendarPageController();
  const guard=useRef<PageLeaveGuard | null>(null);
  const register=useCallback((next:PageLeaveGuard)=>{guard.current=next;return()=>{if(guard.current===next)guard.current=null;};},[]);
  const navigate=(page:DesktopPage)=>{const next=()=>setActive(page);if(!guard.current||guard.current(page,next))next();};
  return <><button onClick={()=>navigate("calendar")}>Fixture ana Takvim</button><button onClick={()=>navigate(active==='marketing'?'dashboard':'marketing')}>Fixture sayfa değiştir</button><p role="status" aria-label="Global mesaj">{message}</p>
    <div style={{height:'calc(100dvh - 72px)',display:'flex',flexDirection:'column'}}>{active==='marketing'?<MarketingPage enabled onMessage={setMessage} registerPageLeaveGuard={register} onCalendar={()=>navigate('calendar')}/>:active==='calendar'?<OperationCalendarPage controller={calendar} data={emptyDashboard} marketingEnabled accommodationReservationsEnabled={false} foodReservationsEnabled={false} tasksEnabled={false} onOpenReservation={()=>{}} onCompleteTask={()=>{}} onMessage={setMessage} registerPageLeaveGuard={register}/>:<p>Diğer sayfa</p>}</div>
  </>;
}
function MarketingWebFixture() {
  const [webAvailable, setWebAvailable] = useState(true);
  fixture.__setMarketingWebAvailable = setWebAvailable;
  return <WebAvailabilityProvider available={webAvailable}><RouteFixture /></WebAvailabilityProvider>;
}
createRoot(document.getElementById('root')!).render(<PageViewStateProvider><MarketingWebFixture /></PageViewStateProvider>);

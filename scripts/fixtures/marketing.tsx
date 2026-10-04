import { createRoot } from 'react-dom/client';
import { MarketingPage } from '../../apps/desktop-app/src/pages/MarketingPage';
import '../../apps/desktop-app/src/styles/index.css';
const fixture=window as typeof window & {__marketingCall:(method:string,args:unknown[])=>Promise<any>};
const call=(method:string,...args:unknown[])=>fixture.__marketingCall(method,args);
window.yardimciDesktop={getMarketingStudio:()=>call('snapshot'),getMarketingChannels:()=>call('channels'),saveMarketingContent:input=>call('content',input),
  uploadMarketingAssets:()=>call('upload'),manageMarketingAsset:(...args)=>call('asset',...args),generateMarketingAi:input=>call('ai',input),
  saveMarketingPublication:input=>call('publication',input),publishMarketingPublication:(...args)=>call('publish',...args),unpublishMarketingPublication:(...args)=>call('unpublish',...args),
  testMarketingWebsiteConnection:()=>call('test')} as typeof window.yardimciDesktop;
createRoot(document.getElementById('root')!).render(<div style={{height:'950px'}}><MarketingPage enabled campaignsEnabled={false}/></div>);

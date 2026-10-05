import { createRoot } from 'react-dom/client';
import { MarketingPage } from '../../apps/desktop-app/src/pages/MarketingPage';
import '../../apps/desktop-app/src/styles/index.css';
const fixture = window as typeof window & { __analyticsCall: (method: string, args: unknown[]) => Promise<any> };
const call = (method: string, ...args: unknown[]) => fixture.__analyticsCall(method, args);
window.yardimciDesktop = {
  getMarketingStudio: () => call('studio'), getMarketingSchedules: () => call('schedules'), onMarketingSchedulesChanged: () => () => {},
  getMarketingAnalytics: (...args) => call('analytics', ...args), getMarketingCampaignAnalytics: id => call('campaignAnalytics', id),
  getMarketingPublicationAnalytics: id => call('publicationAnalytics', id), refreshMarketingPublicationMetrics: id => call('refresh', id),
  getBusinessMessagingConfiguration: () => call('configuration'), getSmsConfiguration: () => call('smsConfiguration'),
  listMessagingCampaigns: () => call('campaigns'), listMessagingSegments: () => call('segments'), listBusinessMessagingTemplates: () => call('templates'),
  getMessagingCampaign: id => call('campaign', id), onMessagingCampaignsChanged: () => () => {}, onBusinessMessagingChanged: () => () => {}
} as typeof window.yardimciDesktop;
createRoot(document.getElementById('root')!).render(<div className="d7-fixture"><MarketingPage enabled campaignsEnabled/></div>);

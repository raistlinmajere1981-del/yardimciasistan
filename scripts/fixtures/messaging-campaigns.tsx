import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { MarketingChannelRegistry, MessagingCampaign } from '@yardimci-asistan/shared';
import { MarketingAudience } from '../../apps/desktop-app/src/components/marketing/MarketingAudience';
import { MarketingDeliveryWorkspace } from '../../apps/desktop-app/src/components/marketing/MarketingDeliveryWorkspace';
import { WorkspaceFrame } from '../../apps/desktop-app/src/components/workspace/WorkspaceFrame';
import { resultValue } from '../../apps/desktop-app/src/components/marketing/share-draft';
import { CustomerWorkspace } from '../../apps/desktop-app/src/components/customers/CustomerWorkspace';
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from '../../apps/desktop-app/src/components/workspace/WorkspaceNavigation';
import type { WorkspaceDefinition } from '../../apps/desktop-app/src/components/workspace/workspace-definition';
import type { CustomerWorkspaceIntent } from '../../apps/desktop-app/src/components/workspace/workspace-intent';
import type { DesktopDashboardData } from '../../apps/desktop-app/electron/database';
import '../../apps/desktop-app/src/styles/index.css';
const control = window as typeof window & { __campaignInitial: { dashboard: DesktopDashboardData; customerId: string }; __campaignCall: (method: string, args: unknown[]) => Promise<any> };
const call = (method: string, ...args: unknown[]) => control.__campaignCall(method, args);
window.yardimciDesktop = {
  getMarketingChannels: () => call('channels'),
  getBusinessMessagingConfiguration: () => call('configuration'), listBusinessMessagingTemplates: () => call('templates'),
  onBusinessMessagingChanged: (listener) => {
    window.addEventListener('fixture-provider-changed', listener);
    return () => window.removeEventListener('fixture-provider-changed', listener);
  },
  onMessagingCampaignsChanged: (listener) => {
    window.addEventListener('fixture-campaigns-changed', listener);
    return () => window.removeEventListener('fixture-campaigns-changed', listener);
  },
  getCustomerMessagingPreference: (...args) => call('preference', ...args), saveCustomerMessagingPreference: (input) => call('savePreference', input),
  listMessagingSegments: () => call('segments'), saveMessagingSegment: (input) => call('saveSegment', input),
  previewMessagingSegment: (...args) => call('previewSegment', ...args),
  listMessagingCampaigns: () => call('campaigns'), createMessagingCampaign: (input) => call('create', input),
  getMessagingCampaign: (id) => call('campaign', id), previewMessagingCampaign: (id) => call('preview', id),
  startMessagingCampaign: (id) => call('start', id), pauseMessagingCampaign: (id) => call('pause', id), resumeMessagingCampaign: (id) => call('resume', id),
  prepareMessagingCampaign: (id) => call('prepare', id), cancelMessagingCampaign: (id) => call('cancel', id)
} as typeof window.yardimciDesktop;
const definition: WorkspaceDefinition<CustomerWorkspaceIntent, DesktopDashboardData> = {
  entityType: 'customer', defaultPresentation: 'centered', render: (intent, data) => <CustomerWorkspace intent={intent} data={data}
    aiEnabled={false} whatsappEnabled={true} reservationsEnabled={false} staysEnabled={false} customerCreditEnabled={false}
    onWhatsApp={() => { void call('web'); }} onSave={async () => ({ ok: false, message: 'Unused' })}
    onAnalyzeIdentity={async () => ({ ok: false, message: 'Unused' })} onDelete={async () => undefined} />
};
function Launcher() {
  const navigation = useWorkspaceNavigation();
  const [audience, setAudience] = useState(false), [selected, setSelected] = useState(''), [audienceId, setAudienceId] = useState(''), [busy, setBusy] = useState(false);
  const [campaigns, setCampaigns] = useState<MessagingCampaign[]>([]), [channels, setChannels] = useState<MarketingChannelRegistry>([]);
  async function reload() {const [list, registry] = await Promise.all([call('campaigns'), call('channels')]); setCampaigns(resultValue(list)); setChannels(resultValue(registry));}
  useEffect(() => {void reload(); const listener = () => void reload(); window.addEventListener('fixture-campaigns-changed', listener); return () => window.removeEventListener('fixture-campaigns-changed', listener);}, []);
  return <><button onClick={() => navigation.openWorkspace({ entityType: 'customer', entityId: control.__campaignInitial.customerId, mode: 'main' })}>Müşteri tercihini aç</button>
    <button onClick={() => setAudience(true)}>Hedef kitleyi aç</button><button onClick={() => void reload()}>Durumu yenile</button>
    {campaigns.map(c => <article className="list-row" key={c.id}>{c.name}<button onClick={() => setSelected(c.id)}>Aç</button></article>)}
    {audience && <WorkspaceFrame presentation="centered" title="Hedef kitle" onClose={() => setAudience(false)} closeBlocked={busy}><MarketingAudience value={audienceId} channels={['whatsapp']} onChange={setAudienceId} onBusy={setBusy}/></WorkspaceFrame>}
    {selected && <MarketingDeliveryWorkspace id={selected} channels={channels} onClose={() => setSelected('')} onReload={reload}/>}
  </>;
}
function Fixture() {
  return <WorkspaceNavigationProvider page="marketing" definitions={[definition]}>
    <Launcher />
    <WorkspaceHost definition={definition} context={control.__campaignInitial.dashboard} />
  </WorkspaceNavigationProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);

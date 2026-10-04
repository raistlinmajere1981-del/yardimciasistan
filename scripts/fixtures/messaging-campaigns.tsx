import { createRoot } from 'react-dom/client';
import { CampaignsPage } from '../../apps/desktop-app/src/pages/CampaignsPage';
import { CustomerWorkspace } from '../../apps/desktop-app/src/components/customers/CustomerWorkspace';
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from '../../apps/desktop-app/src/components/workspace/WorkspaceNavigation';
import type { WorkspaceDefinition } from '../../apps/desktop-app/src/components/workspace/workspace-definition';
import type { CustomerWorkspaceIntent } from '../../apps/desktop-app/src/components/workspace/workspace-intent';
import type { DesktopDashboardData } from '../../apps/desktop-app/electron/database';
import '../../apps/desktop-app/src/styles/index.css';
const control = window as typeof window & { __campaignInitial: { dashboard: DesktopDashboardData; customerId: string }; __campaignCall: (method: string, args: unknown[]) => Promise<any> };
const call = (method: string, ...args: unknown[]) => control.__campaignCall(method, args);
window.yardimciDesktop = {
  getBusinessMessagingConfiguration: () => call('configuration'), listBusinessMessagingTemplates: () => call('templates'),
  onBusinessMessagingChanged: () => () => {},
  getCustomerMessagingPreference: (...args) => call('preference', ...args), saveCustomerMessagingPreference: (input) => call('savePreference', input),
  listMessagingSegments: () => call('segments'), saveMessagingSegment: (input) => call('saveSegment', input),
  previewMessagingSegment: (...args) => call('previewSegment', ...args),
  listMessagingCampaigns: () => call('campaigns'), createMessagingCampaign: (input) => call('create', input),
  getMessagingCampaign: (id) => call('campaign', id), previewMessagingCampaign: (id) => call('preview', id),
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
  return <button onClick={() => navigation.openWorkspace({ entityType: 'customer', entityId: control.__campaignInitial.customerId, mode: 'main' })}>Müşteri tercihini aç</button>;
}
function Fixture() {
  return <WorkspaceNavigationProvider page="campaigns" definitions={[definition]}>
    <Launcher /><div style={{ height: '900px' }}><CampaignsPage enabled /></div>
    <WorkspaceHost definition={definition} context={control.__campaignInitial.dashboard} />
  </WorkspaceNavigationProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);

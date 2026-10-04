import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DesktopDashboardData, DesktopSetupData } from '../../apps/desktop-app/electron/database';
import { createSetupInput, toSetupForm } from '../../apps/desktop-app/src/app/setup-model';
import { WhatsAppBusinessSettingsSection } from '../../apps/desktop-app/src/components/settings/WhatsAppBusinessSettingsSection';
import { CustomerWorkspace } from '../../apps/desktop-app/src/components/customers/CustomerWorkspace';
import { WorkspaceHost, WorkspaceNavigationProvider, useWorkspaceNavigation } from '../../apps/desktop-app/src/components/workspace/WorkspaceNavigation';
import type { WorkspaceDefinition } from '../../apps/desktop-app/src/components/workspace/workspace-definition';
import type { CustomerWorkspaceIntent } from '../../apps/desktop-app/src/components/workspace/workspace-intent';
import '../../apps/desktop-app/src/styles/index.css';
const control = window as typeof window & { __bmInitial: { setup: DesktopSetupData; dashboard: DesktopDashboardData }; __bmCall: (method: string, args: unknown[]) => Promise<any>; __bmNotify: () => void };
const listeners = new Set<() => void>();
control.__bmNotify = () => listeners.forEach((listener) => listener());
window.yardimciDesktop = {
  getBusinessMessagingConfiguration: () => control.__bmCall('configuration', []),
  testBusinessMessagingConnection: (input) => control.__bmCall('test', [input]),
  listBusinessMessagingTemplates: () => control.__bmCall('templates', []),
  prepareBusinessTemplateMessage: (input) => control.__bmCall('prepare', [input]),
  sendBusinessTemplateMessage: (id, parameters) => control.__bmCall('send', [id, parameters]),
  getBusinessMessage: (id) => control.__bmCall('message', [id]),
  onBusinessMessagingChanged: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }
} as typeof window.yardimciDesktop;
const definition: WorkspaceDefinition<CustomerWorkspaceIntent, DesktopDashboardData> = {
  entityType: 'customer', defaultPresentation: 'centered', render: (intent, data) => <CustomerWorkspace intent={intent} data={data}
    aiEnabled={false} whatsappEnabled={true} reservationsEnabled={false} staysEnabled={false} customerCreditEnabled={false}
    onWhatsApp={() => { void control.__bmCall('web', []); }} onSave={async () => ({ ok: false, message: 'Unused' })}
    onAnalyzeIdentity={async () => ({ ok: false, message: 'Unused' })} onDelete={async () => undefined} />
};
function CustomerLauncher() {
  const nav = useWorkspaceNavigation();
  return <button onClick={() => nav.openWorkspace({ entityType: 'customer', entityId: control.__bmInitial.dashboard.customers[0].id, mode: 'main' })}>Müşteriyi aç</button>;
}
function Fixture() {
  const [form, setForm] = useState(() => toSetupForm(control.__bmInitial.setup));
  const [saved, setSaved] = useState('');
  return <>
    <WhatsAppBusinessSettingsSection draft={form.whatsappCloud} busy={false} onChange={(whatsappCloud) => setForm({ ...form, whatsappCloud })} />
    <button onClick={async () => { const setup = await control.__bmCall('save', [createSetupInput(form)]); setForm(toSetupForm(setup)); setSaved('Ayarlar kaydedildi'); control.__bmNotify(); }}>Servisleri kaydet</button>
    <p role="status">{saved}</p>
    <WorkspaceNavigationProvider page="customerWork" definitions={[definition]}>
      <CustomerLauncher /><WorkspaceHost definition={definition} context={control.__bmInitial.dashboard} />
    </WorkspaceNavigationProvider>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);

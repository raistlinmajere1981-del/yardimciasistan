import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Settings2 } from 'lucide-react';
import type { SettingsOperationResult } from '../../app/settings-save';
import { reportAppStatus, type AppStatusState } from '../../app/runtime-state';
import { ActionButton } from '../ui/ActionButton';
import { FormDialog } from '../ui/FormDialog';
import { StatusBadge } from '../ui/StatusBadge';

import { SettingsUnsavedChangesDialog } from './SettingsUnsavedChangesDialog';

export interface ServiceSettingsOwner {
  dirty: boolean;
  busy?: boolean;
  savedEnabled?: boolean;
  save: () => SettingsOperationResult | Promise<SettingsOperationResult>;
  discard: () => void | Promise<void>;
}
export const ServiceSettingsContext = createContext<{
  active: string | null;
  open: (id: string | null) => void;
  owner: (id: string) => ServiceSettingsOwner;
} | null>(null);
type ServiceReadiness = 'Test edilmedi' | 'Test kullanılamıyor' | 'Kontrol ediliyor…' | 'Kullanılamıyor' | 'Hata' | 'Hazır';
interface ServiceSettingsCardProps {
  id: string;
  className?: string;
  title: string;
  status?: string;
  readiness?: ServiceReadiness;
  testMessage?: string;
  messageState?: AppStatusState;
  enabled: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  toggleLabel?: string;
  toggleAriaLabel?: string;
  toggleDisabled?: boolean;
  headerActions?: ReactNode;
  /** Only prerequisite verification required before the service can be enabled. */
  prerequisiteActions?: ReactNode;
  disabled?: boolean;
  saveDisabled?: boolean;
  onDialogClose?: () => void;
  children: ReactNode;
}

/** One compact projection and one modal boundary; persistence stays with each owner. */
export function ServiceSettingsCard({ id, title, status, readiness = 'Test edilmedi', testMessage, messageState, enabled, onEnabledChange, toggleLabel, toggleAriaLabel, toggleDisabled, headerActions, prerequisiteActions, disabled, saveDisabled = false, onDialogClose, className = '', children }: ServiceSettingsCardProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const host = useContext(ServiceSettingsContext);
  const [localOpen, setLocalOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const owner = host?.owner(id);
  const open = host ? host.active === id : localOpen;
  const busy = disabled || working || owner?.busy;
  useEffect(() => {
    if (testMessage) reportAppStatus(messageState ?? (readiness === 'Hata' || readiness === 'Kullanılamıyor' ? 'error' : readiness === 'Kontrol ediliyor…' ? 'loading' : 'success'), testMessage);
  }, [messageState, readiness, testMessage]);
  const close = () => { onDialogClose?.(); setConfirmClose(false); if (host) host.open(null); else setLocalOpen(false); };
  const requestClose = () => {
    if (busy) return;
    if (owner?.dirty) { setConfirmClose(true); return; }
    close();
  };
  async function save() {
    if (!owner || busy || saveDisabled) return;
    setWorking(true);
    try {
      const result = await owner.save();
      reportAppStatus(result.ok ? 'success' : 'error', result.message || (result.ok ? `${title} kaydedildi.` : 'Servis kaydedilemedi.'));
      if (result.ok) close();
      else setConfirmClose(false);
    } catch { setConfirmClose(false); reportAppStatus('error', 'Servis kaydedilemedi. Tekrar deneyin.'); }
    finally { setWorking(false); }
  }
  async function cancel() {
    if (busy) return;
    setWorking(true);
    try { await owner?.discard(); close(); }
    catch { setConfirmClose(false); reportAppStatus('error', 'Servis değişiklikleri geri alınamadı. Tekrar deneyin.'); }
    finally { setWorking(false); }
  }
  const preference = owner?.savedEnabled !== undefined && enabled !== owner.savedEnabled
    ? `${enabled ? 'Etkinleştirilecek' : 'Kapatılacak'} · Bekliyor` : `${enabled ? 'Etkin' : 'Kapalı'}${owner?.dirty ? ' · Bekliyor' : ''}`;
  const savedEnabled = owner?.savedEnabled ?? enabled;
  const indicatorLabel = `${title}: ${savedEnabled ? 'Etkin' : 'Kapalı'}${owner?.dirty ? ' · Bekliyor' : ''}`;
  return <>
    <div ref={node => { triggerRef.current = node?.querySelector<HTMLElement>("button") ?? null; }} id={id} tabIndex={-1} className="settings-service-row" role="group" aria-label={title}>
      <StatusBadge className="settings-service-indicator" role="img" aria-label={indicatorLabel} title={indicatorLabel}
        tone={owner?.dirty ? 'warning' : savedEnabled ? 'success' : 'neutral'}
        data-state={owner?.dirty ? 'pending' : savedEnabled ? 'active' : 'inactive'}>
        {owner?.dirty ? 'Bekliyor' : savedEnabled ? 'Etkin' : 'Kapalı'}
      </StatusBadge>
      <strong className="settings-service-name">{title}</strong>
      <ActionButton variant="accent" size="sm" className="settings-service-action"
        aria-label={`${title} ayarları`} title={`${title} ayarları`} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => host ? host.open(id) : setLocalOpen(true)} disabled={working}>
        <Settings2 size={16} aria-hidden="true" /><span>Ayarlar</span>
      </ActionButton>
    </div>
    {open && createPortal(<FormDialog title={title} dialogClassName={`settings-service-overlay settings-service-overlay--${id.replace(/^settings-/, "")}`} returnFocusRef={triggerRef} closeBlocked={Boolean(busy || confirmClose)} dismissOnBackdrop
      onClose={requestClose} onSubmit={event => { event.preventDefault(); void save(); }}
      overlay={confirmClose && <SettingsUnsavedChangesDialog open withinModal intent="close" categoryTitle={title} busy={Boolean(busy)}
        onSaveAndContinue={() => void save()} onDiscardAndContinue={() => void cancel()} onStay={() => setConfirmClose(false)} />}
      footer={<><ActionButton type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void cancel()}>İptal</ActionButton>
        <ActionButton type="submit" disabled={!owner || Boolean(busy) || saveDisabled}>Kaydet</ActionButton></>}>
      <div className={`settings-service-detail form-stack ${className}`}>
        <div className="settings-service-detail-status">
          <StatusBadge tone={owner?.dirty ? 'warning' : enabled ? 'success' : 'neutral'} aria-label="Etkinleştirme tercihi">{preference}</StatusBadge>
          <StatusBadge tone={readiness === 'Hazır' ? 'success' : readiness === 'Hata' || readiness === 'Kullanılamıyor' ? 'danger' : readiness === 'Kontrol ediliyor…' ? 'info' : 'neutral'} aria-label="Canlı kontrol durumu">{readiness}</StatusBadge>
        </div>
        {onEnabledChange && <label className="settings-service-toggle"><input type="checkbox" role="switch"
          aria-label={toggleAriaLabel ?? toggleLabel ?? `${title} servisi`} checked={enabled} disabled={Boolean(busy || toggleDisabled)}
          onChange={event => onEnabledChange(event.target.checked)} /><span>{toggleLabel ?? 'Servis etkin'}</span></label>}
        {status && <small>{status}</small>}
        {prerequisiteActions && <fieldset className="settings-resource-fields form-stack" disabled={Boolean(busy)}>
          <legend>Ön koşul doğrulaması</legend>
          {prerequisiteActions}
        </fieldset>}
        <fieldset className="settings-resource-fields form-stack" disabled={Boolean(busy || !enabled)}>
          <legend>Yapılandırma</legend>
          {headerActions}{children}
        </fieldset>
      </div>
    </FormDialog>, document.body)}
  </>;
}

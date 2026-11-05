import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  /** Keep feedback in the global status bar without repeating it inside this dialog. */
  showTestMessageInDialog?: boolean;
  messageState?: AppStatusState;
  enabled: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  toggleLabel?: string;
  toggleAriaLabel?: string;
  toggleDisabled?: boolean;
  /** External prerequisites block the launcher, including keyboard/search entry. */
  blockedReason?: string | undefined;
  headerActions?: ReactNode;
  /** Only prerequisite verification required before the service can be enabled. */
  prerequisiteActions?: ReactNode;
  prerequisiteLabel?: string;
  disabled?: boolean;
  saveDisabled?: boolean;
  /** Keep the test's cancel button interactive while the owner blocks Save/Close. */
  allowActionDuringTest?: boolean;
  onDialogClose?: () => void;
  children: ReactNode;
}

/** One compact projection and one modal boundary; persistence stays with each owner. */
export function ServiceSettingsCard({ id, title, status, readiness = 'Test edilmedi', testMessage, showTestMessageInDialog = true, messageState, enabled, onEnabledChange, toggleLabel, toggleAriaLabel, toggleDisabled, blockedReason, headerActions, prerequisiteActions, prerequisiteLabel = 'Ön koşul doğrulaması', disabled, saveDisabled = false, allowActionDuringTest = false, onDialogClose, className = '', children }: ServiceSettingsCardProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const host = useContext(ServiceSettingsContext);
  const [localOpen, setLocalOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const owner = host?.owner(id);
  const requestedOpen = host ? host.active === id : localOpen;
  // An already open editor can still discard or turn a service off if its
  // prerequisite changes. A blocked search entry must not open a new editor.
  const wasOpen = useRef(false);
  const open = requestedOpen && (!blockedReason || wasOpen.current);
  useEffect(() => { wasOpen.current = open; }, [open]);
  useEffect(() => {
    if (requestedOpen && !open) { if (host) host.open(null); else setLocalOpen(false); }
  }, [host, open, requestedOpen]);
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
  const indicatorLabel = `${title}: ${savedEnabled ? 'Etkin' : 'Kapalı'}${owner?.dirty ? ' · Bekliyor' : ''}${blockedReason ? ` · Kullanılamıyor: ${blockedReason}` : ''}`;
  return <>
    <ActionButton ref={node => { triggerRef.current = node; }} id={id} variant="secondary" className="settings-service-row"
      aria-label={`${title} ayarları`} aria-describedby={`${id}-state${blockedReason ? ` ${id}-prerequisite` : ''}`}
      aria-haspopup="dialog" aria-expanded={open} disabled={Boolean((busy || blockedReason) && !open)}
      onClick={() => { if (!busy && !blockedReason) { if (host) host.open(id); else setLocalOpen(true); } }}>
      <span id={`${id}-state`} className="settings-service-indicator" role="img" aria-label={indicatorLabel} title={indicatorLabel}
        data-state={blockedReason ? 'blocked' : savedEnabled ? 'active' : 'inactive'} />
      <span className="settings-service-copy"><strong className="settings-service-name">{title}</strong>
        {blockedReason && <small id={`${id}-prerequisite`} className="settings-service-prerequisite">{blockedReason}</small>}
      </span>
    </ActionButton>
    {open && createPortal(<FormDialog title={title} dialogClassName={`settings-service-overlay settings-service-overlay--${id.replace(/^settings-/, "")}`} returnFocusRef={triggerRef} closeBlocked={Boolean(busy || confirmClose)} dismissOnBackdrop
      onClose={requestClose} onSubmit={event => { event.preventDefault(); void save(); }}
      overlay={confirmClose && <SettingsUnsavedChangesDialog open withinModal intent="close" categoryTitle={title} busy={Boolean(busy)}
        onSaveAndContinue={() => void save()} onDiscardAndContinue={() => void cancel()} onStay={() => setConfirmClose(false)} />}
      footer={<><ActionButton type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void cancel()}>İptal</ActionButton>
        <ActionButton type="submit" disabled={!owner || Boolean(busy) || saveDisabled}>Kaydet</ActionButton></>}>
      <div className={`settings-service-detail form-stack ${className}`}>
        <div className="settings-service-feedback">
          <div className="settings-service-detail-status">
            <StatusBadge tone={owner?.dirty ? 'warning' : enabled ? 'success' : 'neutral'} aria-label="Etkinleştirme tercihi">{preference}</StatusBadge>
            <StatusBadge tone={readiness === 'Hazır' ? 'success' : readiness === 'Hata' || readiness === 'Kullanılamıyor' ? 'danger' : readiness === 'Kontrol ediliyor…' ? 'info' : 'neutral'} aria-label="Canlı kontrol durumu">{readiness}</StatusBadge>
          </div>
          {showTestMessageInDialog && testMessage && <div className="settings-service-feedback-result" role={readiness === 'Hata' || readiness === 'Kullanılamıyor' ? 'alert' : 'status'} aria-live="polite">{testMessage}</div>}
        </div>
        {onEnabledChange && <label className="settings-service-toggle"><input type="checkbox" role="switch"
          aria-label={toggleAriaLabel ?? toggleLabel ?? `${title} servisi`} checked={enabled} disabled={Boolean(busy || (!enabled && (toggleDisabled || blockedReason)))}
          onChange={event => { if (!event.target.checked || (!toggleDisabled && !blockedReason)) onEnabledChange(event.target.checked); }} /><span>{toggleLabel ?? 'Servis etkin'}</span></label>}
        {blockedReason && <small role="status">{blockedReason}</small>}
        {status && <small>{status}</small>}
        {prerequisiteActions && <fieldset className="settings-resource-fields form-stack" disabled={Boolean(busy)}>
          <legend>{prerequisiteLabel}</legend>
          {prerequisiteActions}
        </fieldset>}
        <fieldset className="settings-resource-fields form-stack" disabled={Boolean((busy && !allowActionDuringTest) || !enabled)}>
          <legend>Yapılandırma</legend>
          {headerActions}{children}
        </fieldset>
      </div>
    </FormDialog>, document.body)}
  </>;
}

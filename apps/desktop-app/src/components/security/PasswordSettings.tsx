import { useConfirmDialog } from "../ui/useConfirmDialog";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { KeyRound, RotateCcw, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import type { SettingsOperationResult } from "../../app/settings-save";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";

interface PasswordSettingsProps {
  configured: boolean;
  onConfiguredChange: (configured: boolean) => void;
}

export function usePasswordSettings({ configured, onConfiguredChange }: PasswordSettingsProps) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [webSecurityKey, setWebSecurityKey] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"save" | "remove" | "reset" | "">("");
  const [message, setMessage] = useState(
    configured ? "Açılışta ve kilit ekranında bu şifre istenir." : ""
  );
  const [messageTone, setMessageTone] = useState<"idle" | "error" | "success">("idle");
  const sectionRef = useRef<HTMLDivElement>(null);
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);

  const clearPasswordFields = useCallback(() => {
    setCurrentPassword("");
    setNewPassword("");
    setPasswordConfirmation("");
  }, []);

  const showError = useCallback((errorMessage: string) => {
    setMessage(errorMessage);
    setMessageTone("error");
  }, []);

  const hasPasswordDraft = Boolean(currentPassword || newPassword || passwordConfirmation);

  const validatePasswordDraft = useCallback(() => {
    if (busyAction) return "Şifre işlemi devam ediyor.";
    if (!hasPasswordDraft) return null;
    if (configured && !currentPassword) {
      const message = "Mevcut şifre gerekli.";
      showError(message);
      return message;
    }
    if (newPassword.length < 6) {
      const message = "Yeni şifre en az 6 karakter olmalı.";
      showError(message);
      return message;
    }
    if (newPassword !== passwordConfirmation) {
      const message = "Yeni şifreler birbiriyle eşleşmiyor.";
      showError(message);
      return message;
    }
    if (!window.yardimciDesktop?.updateAppPassword) {
      const message = "Şifre işlemleri hazır değil. Uygulamayı yeniden başlatın.";
      showError(message);
      return message;
    }
    return null;
  }, [busyAction, configured, currentPassword, hasPasswordDraft, newPassword, passwordConfirmation, showError]);

  const savePasswordDraft = useCallback(async (): Promise<SettingsOperationResult> => {
    const validationMessage = validatePasswordDraft();
    if (validationMessage) return { ok: false, message: validationMessage };
    if (!hasPasswordDraft) return { ok: true, changed: false };

    setBusyAction("save");
    setMessage("");
    setMessageTone("idle");
    const bridge = window.yardimciDesktop;
    if (!bridge?.updateAppPassword) {
      const message = "Şifre işlemleri hazır değil. Uygulamayı yeniden başlatın.";
      showError(message);
      setBusyAction("");
      return { ok: false, message };
    }
    let result;
    try {
      result = await bridge.updateAppPassword({
        currentPassword,
        newPassword
      });
    } catch {
      setBusyAction("");
      const message = "Uygulama şifresi kaydedilemedi. Uygulamayı yeniden başlatıp tekrar deneyin.";
      setMessage("");
      setMessageTone("idle");
      reportAppStatus("error", message);
      return { ok: false, message };
    }
    setBusyAction("");
    setMessage("");
    setMessageTone("idle");
    reportAppStatus(result.ok ? "success" : "error", result.message);
    if (result.ok) {
      onConfiguredChange(result.status.passwordConfigured);
      clearPasswordFields();
    }
    return result.ok
      ? { ok: true, changed: true, message: result.message }
      : { ok: false, message: result.message };
  }, [clearPasswordFields, currentPassword, hasPasswordDraft, newPassword, onConfiguredChange, showError, validatePasswordDraft]);

  async function removePassword() {
    if (busyAction || !configured) return;
    if (!currentPassword) {
      showError("Şifreyi kaldırmak için mevcut şifrenizi girin.");
      return;
    }
    if (!(await confirm({ title: "Uygulama şifresini kaldır", description: "Uygulama açılış şifresi kaldırılsın mı? Uygulama açılırken artık şifre sorulmayacak.", tone: "danger", confirmLabel: "Şifreyi Kaldır" }))) {
      return;
    }
    if (!window.yardimciDesktop?.updateAppPassword) {
      showError("Şifre işlemleri hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setBusyAction("remove");
    setMessage("");
    setMessageTone("idle");
    let result;
    try {
      result = await window.yardimciDesktop.updateAppPassword({
        currentPassword,
        newPassword: ""
      });
    } catch {
      setBusyAction("");
      const message = "Uygulama şifresi kaldırılamadı. Uygulamayı yeniden başlatıp tekrar deneyin.";
      setMessage("");
      setMessageTone("idle");
      reportAppStatus("error", message);
      return;
    }
    setBusyAction("");
    setMessage("");
    setMessageTone("idle");
    reportAppStatus(result.ok ? "success" : "error", result.message);
    if (result.ok) {
      onConfiguredChange(false);
      clearPasswordFields();
      setRecoveryOpen(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;
    if (!webSecurityKey.trim()) {
      showError("Web güvenlik anahtarını girin.");
      return;
    }
    if (!window.yardimciDesktop?.resetAppPassword) {
      showError("Şifre sıfırlama hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setBusyAction("reset");
    setMessage("");
    setMessageTone("idle");
    let result;
    try {
      result = await window.yardimciDesktop.resetAppPassword(webSecurityKey);
    } catch {
      setBusyAction("");
      const message = "Uygulama şifresi sıfırlanamadı. Uygulamayı yeniden başlatıp tekrar deneyin.";
      setMessage("");
      setMessageTone("idle");
      reportAppStatus("error", message);
      return;
    }
    setBusyAction("");
    setMessage("");
    setMessageTone("idle");
    reportAppStatus(result.ok ? "success" : "error", result.message);
    if (result.ok) {
      onConfiguredChange(false);
      clearPasswordFields();
      setWebSecurityKey("");
      setRecoveryOpen(false);
    } else {
      setWebSecurityKey("");
    }
  }

  return { confirmDialog, configured, currentPassword, setCurrentPassword, newPassword, setNewPassword, passwordConfirmation, setPasswordConfirmation, webSecurityKey, setWebSecurityKey, recoveryOpen, setRecoveryOpen, busyAction, message, messageTone, sectionRef, currentPasswordRef, newPasswordRef, hasPasswordDraft, savePasswordDraft, removePassword, resetPassword };
}

export function PasswordSettings({ controller }: { controller: ReturnType<typeof usePasswordSettings> }) {
  const { configured, currentPassword, setCurrentPassword, newPassword, setNewPassword, passwordConfirmation, setPasswordConfirmation, webSecurityKey, setWebSecurityKey, recoveryOpen, setRecoveryOpen, busyAction, message, messageTone, sectionRef, currentPasswordRef, newPasswordRef, hasPasswordDraft, savePasswordDraft, removePassword, resetPassword } = controller;
  return (
    <>
      {controller.confirmDialog}
      <div ref={sectionRef} id="settings-password" tabIndex={-1} className="settings-application-subsection settings-password-section settings-panel">
        <div className="settings-panel-header settings-password-title">
          <div>
            <h3>Uygulama Şifresi</h3>
            <p>Uygulamayı yerel erişime karşı kilitleyin.</p>
          </div>
          <span className={configured ? "password-status is-enabled" : "password-status"}>
            {configured ? <ShieldCheck size={16} aria-hidden="true" /> : <ShieldOff size={16} aria-hidden="true" />}
            {configured ? "Şifre açık" : "İsteğe bağlı"}
          </span>
        </div>
        <div className="settings-panel-body">
        <form className="password-settings-form" onSubmit={(event) => { event.preventDefault(); void savePasswordDraft(); }}>
          {configured && (
            <label className="form-field form-field--medium">
              Mevcut şifre
              <span className="field-control-group password-settings-input">
                <KeyRound size={16} aria-hidden="true" />
                <input
                  ref={currentPasswordRef}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Mevcut şifreniz"
                  disabled={Boolean(busyAction)}
                />
              </span>
            </label>
          )}
          <div className="form-grid password-settings-grid">
            <label className="form-field form-field--medium">
              {configured ? "Yeni şifre" : "Şifre belirleyin"}
              <input
                ref={newPasswordRef}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="En az 6 karakter"
                disabled={Boolean(busyAction)}
              />
            </label>
            <label className="form-field form-field--medium">
              Yeni şifre tekrar
              <input
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Şifreyi tekrar girin"
                disabled={Boolean(busyAction)}
              />
            </label>
          </div>
          <div className="form-actions">
            <ActionButton type="submit" disabled={!hasPasswordDraft || Boolean(busyAction)} busy={busyAction === "save"} busyLabel="Kaydediliyor…">Şifreyi Kaydet</ActionButton>
          </div>
          {configured && <div className="form-actions password-settings-actions">
              <ActionButton className="setup-secondary password-remove-button" variant="danger" type="button" onClick={() => void removePassword()} disabled={Boolean(busyAction)} busy={busyAction === "remove"} busyLabel={<><Trash2 size={16} aria-hidden="true" />Kaldırılıyor</>}>
                <Trash2 size={16} aria-hidden="true" />
                Şifreyi Kaldır
              </ActionButton>
          </div>}
        </form>

        {configured && (
          <div className="password-settings-recovery">
            <ActionButton
              variant="ghost"
              className="password-settings-link"
              type="button"
              aria-expanded={recoveryOpen}
              onClick={() => setRecoveryOpen((current) => !current)}
              disabled={Boolean(busyAction)}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Şifremi Unuttum
            </ActionButton>
            {recoveryOpen && (
              <form onSubmit={(event) => void resetPassword(event)}>
                <label className="form-field form-field--medium">
                  Web güvenlik anahtarı
                  <input
                    value={webSecurityKey}
                    onChange={(event) => setWebSecurityKey(event.target.value)}
                    type="password"
                    autoComplete="off"
                    placeholder="Web bağlantısındaki güvenlik anahtarı"
                    disabled={Boolean(busyAction)}
                  />
                </label>
                <ActionButton variant="secondary" type="submit" disabled={Boolean(busyAction)} busy={busyAction === "reset"} busyLabel="Kontrol ediliyor">
                  Şifreyi Sıfırla
                </ActionButton>
              </form>
            )}
          </div>
        )}

        {message && (
          <p className={`password-settings-message is-${messageTone}`} role={messageTone === "error" ? "alert" : "status"} aria-live="polite">
            {message}
          </p>
        )}
        </div>
      </div>
    </>
  );
}

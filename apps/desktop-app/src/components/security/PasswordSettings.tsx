import { useState, type FormEvent } from "react";
import { KeyRound, LockKeyhole, RotateCcw, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { DataMaintenanceSettings } from "../settings/DataMaintenanceSettings";

interface PasswordSettingsProps {
  configured: boolean;
  onConfiguredChange: (configured: boolean) => void;
}

export function PasswordSettings({ configured, onConfiguredChange }: PasswordSettingsProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [webSecurityKey, setWebSecurityKey] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"save" | "remove" | "reset" | "">("");
  const [message, setMessage] = useState(
    configured
      ? "Açılışta ve kilit ekranında bu şifre istenir."
      : "İsterseniz uygulamayı şifresiz kullanabilirsiniz."
  );
  const [messageTone, setMessageTone] = useState<"idle" | "error" | "success">("idle");

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;
    if (newPassword.length < 6) {
      showError("Yeni şifre en az 6 karakter olmalı.");
      return;
    }
    if (newPassword !== passwordConfirmation) {
      showError("Yeni şifreler birbiriyle eşleşmiyor.");
      return;
    }
    if (!window.yardimciDesktop?.updateAppPassword) {
      showError("Şifre işlemleri hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setBusyAction("save");
    setMessage("Uygulama şifresi güvenli biçimde kaydediliyor...");
    setMessageTone("idle");
    let result;
    try {
      result = await window.yardimciDesktop.updateAppPassword({
        currentPassword,
        newPassword
      });
    } catch {
      setBusyAction("");
      showError("Uygulama şifresi kaydedilemedi. Uygulamayı yeniden başlatıp tekrar deneyin.");
      return;
    }
    setBusyAction("");
    setMessage(result.message);
    setMessageTone(result.ok ? "success" : "error");
    if (result.ok) {
      onConfiguredChange(result.status.passwordConfigured);
      clearPasswordFields();
    }
  }

  async function removePassword() {
    if (busyAction || !configured) return;
    if (!currentPassword) {
      showError("Şifreyi kaldırmak için mevcut şifrenizi girin.");
      return;
    }
    if (!window.confirm("Uygulama açılış şifresi kaldırılsın mı? Uygulama açılırken artık şifre sorulmayacak.")) {
      return;
    }
    if (!window.yardimciDesktop?.updateAppPassword) {
      showError("Şifre işlemleri hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    setBusyAction("remove");
    setMessage("Uygulama şifresi kaldırılıyor...");
    setMessageTone("idle");
    let result;
    try {
      result = await window.yardimciDesktop.updateAppPassword({
        currentPassword,
        newPassword: ""
      });
    } catch {
      setBusyAction("");
      showError("Uygulama şifresi kaldırılamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
      return;
    }
    setBusyAction("");
    setMessage(result.message);
    setMessageTone(result.ok ? "success" : "error");
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
    setMessage("Web güvenlik anahtarı kontrol ediliyor...");
    setMessageTone("idle");
    let result;
    try {
      result = await window.yardimciDesktop.resetAppPassword(webSecurityKey);
    } catch {
      setBusyAction("");
      showError("Uygulama şifresi sıfırlanamadı. Uygulamayı yeniden başlatıp tekrar deneyin.");
      return;
    }
    setBusyAction("");
    setMessage(result.message);
    setMessageTone(result.ok ? "success" : "error");
    if (result.ok) {
      onConfiguredChange(false);
      clearPasswordFields();
      setWebSecurityKey("");
      setRecoveryOpen(false);
    } else {
      setWebSecurityKey("");
    }
  }

  function clearPasswordFields() {
    setCurrentPassword("");
    setNewPassword("");
    setPasswordConfirmation("");
  }

  function showError(errorMessage: string) {
    setMessage(errorMessage);
    setMessageTone("error");
  }

  return (
    <>
      <div className="setup-section settings-password-section">
        <div className="setup-section-title settings-password-title">
          <div>
            <p>Gizlilik</p>
            <h2>Uygulama Şifresi</h2>
          </div>
          <span className={configured ? "password-status is-enabled" : "password-status"}>
            {configured ? <ShieldCheck size={16} aria-hidden="true" /> : <ShieldOff size={16} aria-hidden="true" />}
            {configured ? "Şifre açık" : "İsteğe bağlı"}
          </span>
        </div>
        <p className="setup-section-description">
          Uygulama açılışını ve üst bardaki ekran kilidini korur. Şifreniz düz metin olarak saklanmaz.
        </p>

        <form className="password-settings-form" onSubmit={savePassword}>
          {configured && (
            <label>
              Mevcut şifre
              <span className="password-settings-input">
                <KeyRound size={16} aria-hidden="true" />
                <input
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
          <div className="password-settings-grid">
            <label>
              {configured ? "Yeni şifre" : "Şifre belirleyin"}
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="En az 6 karakter"
                disabled={Boolean(busyAction)}
              />
            </label>
            <label>
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
          <div className="password-settings-actions">
            <button className="setup-primary" type="submit" disabled={Boolean(busyAction)}>
              <LockKeyhole size={16} aria-hidden="true" />
              {busyAction === "save"
                ? "Kaydediliyor"
                : configured
                  ? "Şifreyi Değiştir"
                  : "Şifreyi Belirle"}
            </button>
            {configured && (
              <button className="setup-secondary password-remove-button" type="button" onClick={removePassword} disabled={Boolean(busyAction)}>
                <Trash2 size={16} aria-hidden="true" />
                {busyAction === "remove" ? "Kaldırılıyor" : "Şifreyi Kaldır"}
              </button>
            )}
          </div>
        </form>

        {configured && (
          <div className="password-settings-recovery">
            <button
              className="password-settings-link"
              type="button"
              aria-expanded={recoveryOpen}
              onClick={() => setRecoveryOpen((current) => !current)}
              disabled={Boolean(busyAction)}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Şifremi Unuttum
            </button>
            {recoveryOpen && (
              <form onSubmit={resetPassword}>
                <label>
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
                <button type="submit" disabled={Boolean(busyAction)}>
                  {busyAction === "reset" ? "Kontrol ediliyor" : "Şifreyi Sıfırla"}
                </button>
              </form>
            )}
          </div>
        )}

        <p className={`password-settings-message is-${messageTone}`} role="status" aria-live="polite">
          {message}
        </p>
      </div>
      <DataMaintenanceSettings />
    </>
  );
}

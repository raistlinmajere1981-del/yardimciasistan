import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, KeyRound, LockKeyhole, RotateCcw } from "lucide-react";
import type { AppLockActionResult } from "../../../electron/app-lock";

interface AppLockScreenProps {
  phase: "checking" | "locked" | "unlocking";
  passwordConfigured: boolean;
  notificationCount: number;
  onUnlock: (password: string) => Promise<AppLockActionResult>;
  onResetPassword: (webSecurityKey: string) => Promise<AppLockActionResult>;
}

export function AppLockScreen({
  phase,
  passwordConfigured,
  notificationCount,
  onUnlock,
  onResetPassword
}: AppLockScreenProps) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const recoveryKeyRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [webSecurityKey, setWebSecurityKey] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"unlock" | "reset" | "">("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"idle" | "error" | "success">("idle");

  useEffect(() => {
    if (phase === "locked" && passwordConfigured && !recoveryOpen) {
      passwordRef.current?.focus();
    }
  }, [passwordConfigured, phase, recoveryOpen]);

  useEffect(() => {
    if (recoveryOpen) {
      recoveryKeyRef.current?.focus();
    }
  }, [recoveryOpen]);

  async function submitUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase !== "locked" || busyAction) return;
    if (passwordConfigured && !password) {
      setMessage("Devam etmek için uygulama şifresini girin.");
      setMessageTone("error");
      passwordRef.current?.focus();
      return;
    }

    setBusyAction("unlock");
    setMessage(passwordConfigured ? "Şifre kontrol ediliyor..." : "Kilit açılıyor...");
    setMessageTone("idle");
    const result = await onUnlock(password);
    setMessage(result.message);
    setMessageTone(result.ok ? "success" : "error");
    setBusyAction("");
    if (!result.ok) {
      setPassword("");
      passwordRef.current?.focus();
    }
  }

  async function submitPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase !== "locked" || busyAction) return;
    if (!webSecurityKey.trim()) {
      setMessage("Web güvenlik anahtarını girin.");
      setMessageTone("error");
      recoveryKeyRef.current?.focus();
      return;
    }

    setBusyAction("reset");
    setMessage("Web güvenlik anahtarı kontrol ediliyor...");
    setMessageTone("idle");
    const result = await onResetPassword(webSecurityKey);
    setMessage(result.message);
    setMessageTone(result.ok ? "success" : "error");
    setBusyAction("");
    if (!result.ok) {
      setWebSecurityKey("");
      recoveryKeyRef.current?.focus();
    }
  }

  const visibleNotificationCount = Math.max(0, Math.trunc(notificationCount || 0));
  const screenClassName = [
    "app-lock-screen",
    phase === "unlocking" ? "is-unlocking" : "",
    phase === "checking" ? "is-checking" : ""
  ].filter(Boolean).join(" ");

  return (
    <main
      className={screenClassName}
      role={phase === "checking" ? undefined : "dialog"}
      aria-modal={phase === "checking" ? undefined : true}
      aria-label="Yardımcı Asistan kilit ekranı"
    >
      <div className="app-lock-ambient app-lock-ambient-one" aria-hidden="true" />
      <div className="app-lock-ambient app-lock-ambient-two" aria-hidden="true" />
      <section className="app-lock-card">
        <img
          className="app-lock-logo"
          src="./assets/yardimci-asistan-logo.png"
          alt="Yardımcı Asistan"
        />

        {phase === "checking" ? (
          <div className="app-lock-checking" role="status" aria-live="polite">
            <LockKeyhole size={24} aria-hidden="true" />
            <strong>Güvenli oturum hazırlanıyor</strong>
            <span>Lütfen kısa bir süre bekleyin.</span>
          </div>
        ) : (
          <>
            <div className="app-lock-title">
              <span className="app-lock-icon" aria-hidden="true"><LockKeyhole size={22} /></span>
              <div>
                <p>Ekran kilitli</p>
                <h1>Tekrar hoş geldiniz.</h1>
              </div>
            </div>

            <div className="app-lock-notification" aria-label={`${visibleNotificationCount} bildirim`}>
              <span aria-hidden="true"><Bell size={18} /></span>
              <div>
                <small>Bekleyen bildirim</small>
                <strong>{visibleNotificationCount > 99 ? "99+" : visibleNotificationCount}</strong>
              </div>
            </div>

            <form className="app-lock-form" onSubmit={submitUnlock}>
              {passwordConfigured && (
                <label>
                  Uygulama şifresi
                  <span className="app-lock-input">
                    <KeyRound size={17} aria-hidden="true" />
                    <input
                      ref={passwordRef}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      autoComplete="current-password"
                      placeholder="Şifrenizi girin"
                      disabled={Boolean(busyAction) || phase === "unlocking"}
                    />
                  </span>
                </label>
              )}
              {!passwordConfigured && (
                <p className="app-lock-no-password">Bu bilgisayarda açılış şifresi belirlenmemiş. Kilidi tek dokunuşla açabilirsiniz.</p>
              )}
              <button
                className="app-lock-primary"
                type="submit"
                disabled={Boolean(busyAction) || phase === "unlocking"}
              >
                <LockKeyhole size={17} aria-hidden="true" />
                {busyAction === "unlock" || phase === "unlocking" ? "Kilit açılıyor" : "Kilidi Aç"}
              </button>
            </form>

            {passwordConfigured && (
              <div className="app-lock-recovery">
                <button
                  className="app-lock-link"
                  type="button"
                  aria-expanded={recoveryOpen}
                  onClick={() => {
                    setRecoveryOpen((current) => !current);
                    setMessage("");
                    setMessageTone("idle");
                  }}
                  disabled={Boolean(busyAction) || phase === "unlocking"}
                >
                  Şifremi Unuttum
                </button>

                {recoveryOpen && (
                  <form className="app-lock-recovery-form" onSubmit={submitPasswordReset}>
                    <div className="app-lock-recovery-title">
                      <RotateCcw size={18} aria-hidden="true" />
                      <div>
                        <strong>Şifreyi sıfırla</strong>
                        <span>Web bağlantısı için kullandığınız güvenlik anahtarını girin.</span>
                      </div>
                    </div>
                    <label>
                      Web güvenlik anahtarı
                      <input
                        ref={recoveryKeyRef}
                        value={webSecurityKey}
                        onChange={(event) => setWebSecurityKey(event.target.value)}
                        type="password"
                        autoComplete="off"
                        placeholder="Web güvenlik anahtarı"
                        disabled={Boolean(busyAction) || phase === "unlocking"}
                      />
                    </label>
                    <button type="submit" disabled={Boolean(busyAction) || phase === "unlocking"}>
                      {busyAction === "reset" ? "Anahtar kontrol ediliyor" : "Şifreyi Sıfırla ve Aç"}
                    </button>
                    <small>Doğrulama başarılı olursa uygulama şifresi kaldırılır. Ayarlar’dan yeni bir şifre belirleyebilirsiniz.</small>
                  </form>
                )}
              </div>
            )}

            <p className={`app-lock-message is-${messageTone}`} role="status" aria-live="polite">
              {message || "Yardımcı Asistan verileriniz bu ekranın arkasında görünmez."}
            </p>
          </>
        )}
      </section>
    </main>
  );
}

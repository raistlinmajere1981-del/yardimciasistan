import { useEffect, useState } from "react";
import type { AppLockActionResult, AppLockStatus } from "../../electron/app-lock";
import type { AppAccessPhase } from "./runtime-state";

interface UseAppLockOptions {
  passwordConfigured: boolean;
  getNotificationCount: () => number;
  onPasswordConfiguredChange: (configured: boolean) => void;
}

const initialStatus: AppLockStatus = {
  locked: false,
  passwordConfigured: false,
  notificationCount: 0
};

export function useAppLock({
  passwordConfigured,
  getNotificationCount,
  onPasswordConfiguredChange
}: UseAppLockOptions) {
  const [phase, setPhase] = useState<AppAccessPhase>("checking");
  const [status, setStatus] = useState<AppLockStatus>(initialStatus);

  useEffect(() => {
    let active = true;
    const bridge = window.yardimciDesktop;
    if (!bridge || typeof bridge.getAppLockStatus !== "function") {
      setPhase("unlocked");
      return () => {
        active = false;
      };
    }

    void bridge.getAppLockStatus()
      .then((nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        setPhase(nextStatus.locked ? "locked" : "unlocked");
      })
      .catch(() => {
        if (!active) return;
        setStatus({
          locked: true,
          passwordConfigured: true,
          notificationCount: 0
        });
        setPhase("locked");
      });

    return () => {
      active = false;
    };
  }, []);

  async function lockApp() {
    const bridge = window.yardimciDesktop;
    let result: AppLockActionResult;
    try {
      result = bridge && typeof bridge.lockApp === "function"
        ? await bridge.lockApp()
        : {
            ok: true,
            message: "Uygulama kilitlendi.",
            status: {
              locked: true,
              passwordConfigured,
              notificationCount: getNotificationCount()
            }
          };
    } catch {
      return false;
    }

    if (!result.ok) {
      return false;
    }

    setStatus({
      ...result.status,
      notificationCount: Math.max(result.status.notificationCount, getNotificationCount())
    });
    setPhase("locked");
    return true;
  }

  async function unlockApp(password: string): Promise<AppLockActionResult> {
    const bridge = window.yardimciDesktop;
    let result: AppLockActionResult;
    try {
      result = bridge && typeof bridge.unlockApp === "function"
        ? await bridge.unlockApp(password)
        : {
            ok: true,
            message: "Kilit açıldı.",
            status: {
              locked: false,
              passwordConfigured: status.passwordConfigured,
              notificationCount: status.notificationCount
            }
          };
    } catch {
      result = {
        ok: false,
        message: "Kilit açılamadı. Uygulamayı yeniden başlatıp tekrar deneyin.",
        status
      };
    }

    setStatus(result.status);
    if (result.ok) {
      setPhase("unlocking");
      window.setTimeout(() => setPhase("unlocked"), 170);
    }
    return result;
  }

  async function resetAppPassword(webSecurityKey: string): Promise<AppLockActionResult> {
    const bridge = window.yardimciDesktop;
    let result: AppLockActionResult;
    try {
      result = bridge && typeof bridge.resetAppPassword === "function"
        ? await bridge.resetAppPassword(webSecurityKey)
        : {
            ok: false,
            message: "Şifre sıfırlama hazır değil. Uygulamayı yeniden başlatın.",
            status
          };
    } catch {
      result = {
        ok: false,
        message: "Şifre sıfırlanamadı. Uygulamayı yeniden başlatıp tekrar deneyin.",
        status
      };
    }

    setStatus(result.status);
    if (result.ok) {
      onPasswordConfiguredChange(false);
      setPhase("unlocking");
      window.setTimeout(() => setPhase("unlocked"), 170);
    }
    return result;
  }

  function setPasswordConfigured(configured: boolean) {
    onPasswordConfiguredChange(configured);
    setStatus((current) => ({ ...current, passwordConfigured: configured }));
  }

  return {
    phase,
    status,
    lockApp,
    unlockApp,
    resetAppPassword,
    setPasswordConfigured
  };
}

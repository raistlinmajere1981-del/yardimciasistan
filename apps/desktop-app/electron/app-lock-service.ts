import type { DesktopDatabase } from "./database";
import type { AutomaticSyncStatus } from "./sync-coordinator";
import {
  createAppPasswordVerifier,
  secureTextEqual,
  validateAppPassword,
  verifyAppPassword,
  type AppLockActionResult,
  type AppLockStatus,
  type UpdateAppPasswordInput
} from "./app-lock";
import { getWebSyncConfig } from "./sync-config";

const APP_LOCK_FAILURE_LIMIT = 5;
const APP_LOCK_RETRY_DELAY_MS = 30_000;

export interface DesktopAppLockServiceOptions {
  database: DesktopDatabase;
  getSyncStatus: () => AutomaticSyncStatus | undefined;
  onUnlocked: () => void;
  onLocked?: () => void;
}

export class DesktopAppLockService {
  private readonly database: DesktopDatabase;
  private readonly getSyncStatus: () => AutomaticSyncStatus | undefined;
  private readonly onUnlocked: () => void;
  private readonly onLocked: () => void;
  private locked: boolean;
  private failureCount = 0;
  private blockedUntil = 0;

  constructor(options: DesktopAppLockServiceOptions) {
    this.database = options.database;
    this.getSyncStatus = options.getSyncStatus;
    this.onUnlocked = options.onUnlocked;
    this.onLocked = options.onLocked ?? (() => undefined);
    this.locked = Boolean(this.database.getAppLockPasswordVerifier());
  }

  isLocked(): boolean {
    return this.locked;
  }

  assertUnlocked(): void {
    if (this.locked) {
      throw new Error("Uygulama kilitli. Devam etmek için kilidi açın.");
    }
  }

  getStatus(): AppLockStatus {
    const syncStatus = this.getSyncStatus();
    const syncProblemCount = syncStatus?.enabled && syncStatus.consecutiveFailures > 0 && syncStatus.lastError ? 1 : 0;
    return {
      locked: this.locked,
      passwordConfigured: Boolean(this.database.getAppLockPasswordVerifier()),
      notificationCount: this.database.getAppLockNotificationCount() + syncProblemCount
    };
  }

  lock(): AppLockActionResult {
    this.locked = true;
    this.onLocked();
    return {
      ok: true,
      message: "Uygulama kilitlendi.",
      status: this.getStatus()
    };
  }

  async unlock(passwordValue: unknown): Promise<AppLockActionResult> {
    const retryAfterSeconds = this.getRetryAfterSeconds();
    if (retryAfterSeconds > 0) {
      return this.failureResult(
        `Çok fazla deneme yapıldı. ${retryAfterSeconds} saniye sonra tekrar deneyin.`,
        retryAfterSeconds
      );
    }

    const verifier = this.database.getAppLockPasswordVerifier();
    if (!verifier) {
      this.resetFailures();
      this.locked = false;
      this.onUnlocked();
      return {
        ok: true,
        message: "Kilit açıldı.",
        status: this.getStatus()
      };
    }

    const password = typeof passwordValue === "string" ? passwordValue : "";
    if (!await verifyAppPassword(password, verifier)) {
      const nextRetryAfterSeconds = this.recordFailure();
      return this.failureResult(
        nextRetryAfterSeconds > 0
          ? `Şifre doğru değil. ${nextRetryAfterSeconds} saniye sonra tekrar deneyin.`
          : "Şifre doğru değil.",
        nextRetryAfterSeconds
      );
    }

    this.resetFailures();
    this.locked = false;
    this.onUnlocked();
    return {
      ok: true,
      message: "Kilit açıldı.",
      status: this.getStatus()
    };
  }

  async updatePassword(inputValue: unknown): Promise<AppLockActionResult> {
    if (this.locked) {
      return this.failureResult("Şifreyi değiştirmek için önce uygulama kilidini açın.");
    }

    const input = toAppPasswordUpdateInput(inputValue);
    if (!input) {
      return this.failureResult("Şifre bilgileri okunamadı.");
    }

    const retryAfterSeconds = this.getRetryAfterSeconds();
    if (retryAfterSeconds > 0) {
      return this.failureResult(
        `Çok fazla deneme yapıldı. ${retryAfterSeconds} saniye sonra tekrar deneyin.`,
        retryAfterSeconds
      );
    }

    const currentVerifier = this.database.getAppLockPasswordVerifier();
    if (currentVerifier && !await verifyAppPassword(input.currentPassword, currentVerifier)) {
      const nextRetryAfterSeconds = this.recordFailure();
      return this.failureResult(
        nextRetryAfterSeconds > 0
          ? `Mevcut şifre doğru değil. ${nextRetryAfterSeconds} saniye sonra tekrar deneyin.`
          : "Mevcut şifre doğru değil.",
        nextRetryAfterSeconds
      );
    }

    if (!input.newPassword) {
      this.database.setAppLockPasswordVerifier("");
      this.resetFailures();
      return {
        ok: true,
        message: "Uygulama açılış şifresi kaldırıldı.",
        status: this.getStatus()
      };
    }

    const validationMessage = validateAppPassword(input.newPassword);
    if (validationMessage) {
      return this.failureResult(validationMessage);
    }

    try {
      const verifier = await createAppPasswordVerifier(input.newPassword);
      this.database.setAppLockPasswordVerifier(verifier);
      this.resetFailures();
      return {
        ok: true,
        message: currentVerifier
          ? "Uygulama açılış şifresi değiştirildi."
          : "Uygulama açılış şifresi belirlendi.",
        status: this.getStatus()
      };
    } catch {
      return this.failureResult("Uygulama şifresi güvenli biçimde kaydedilemedi.");
    }
  }

  resetWithWebSecurityKey(webSecurityKeyValue: unknown): AppLockActionResult {
    const retryAfterSeconds = this.getRetryAfterSeconds();
    if (retryAfterSeconds > 0) {
      return this.failureResult(
        `Çok fazla deneme yapıldı. ${retryAfterSeconds} saniye sonra tekrar deneyin.`,
        retryAfterSeconds
      );
    }

    const suppliedKey = typeof webSecurityKeyValue === "string" ? webSecurityKeyValue.trim() : "";
    const expectedKey = getWebSyncConfig(this.database.getSetupData()).syncSecret.trim();
    if (
      !suppliedKey
      || suppliedKey.length > 4096
      || !expectedKey
      || !secureTextEqual(suppliedKey, expectedKey)
    ) {
      const nextRetryAfterSeconds = this.recordFailure();
      return this.failureResult(
        nextRetryAfterSeconds > 0
          ? `Web güvenlik anahtarı doğru değil. ${nextRetryAfterSeconds} saniye sonra tekrar deneyin.`
          : "Web güvenlik anahtarı doğru değil.",
        nextRetryAfterSeconds
      );
    }

    this.database.setAppLockPasswordVerifier("");
    this.resetFailures();
    this.locked = false;
    this.onUnlocked();
    return {
      ok: true,
      message: "Uygulama şifresi sıfırlandı ve kilit açıldı.",
      status: this.getStatus()
    };
  }

  private failureResult(message: string, retryAfterSeconds = 0): AppLockActionResult {
    return {
      ok: false,
      message,
      status: this.getStatus(),
      ...(retryAfterSeconds > 0 ? { retryAfterSeconds } : {})
    };
  }

  private getRetryAfterSeconds(): number {
    if (this.blockedUntil <= Date.now()) {
      this.blockedUntil = 0;
      return 0;
    }
    return Math.max(1, Math.ceil((this.blockedUntil - Date.now()) / 1000));
  }

  private recordFailure(): number {
    this.failureCount += 1;
    if (this.failureCount < APP_LOCK_FAILURE_LIMIT) {
      return 0;
    }

    this.failureCount = 0;
    this.blockedUntil = Date.now() + APP_LOCK_RETRY_DELAY_MS;
    return this.getRetryAfterSeconds();
  }

  private resetFailures(): void {
    this.failureCount = 0;
    this.blockedUntil = 0;
  }
}

function toAppPasswordUpdateInput(value: unknown): UpdateAppPasswordInput | null {
  const record = toUnknownRecord(value);
  if (!record) {
    return null;
  }
  return {
    currentPassword: typeof record.currentPassword === "string" ? record.currentPassword : "",
    newPassword: typeof record.newPassword === "string" ? record.newPassword : ""
  };
}

function toUnknownRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

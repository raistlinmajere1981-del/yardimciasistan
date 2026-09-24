import type { BirthdayDeliveryAdapter, BirthdayDeliveryAdapterHooks, BirthdayDeliveryAdapterInput, BirthdayDeliveryAdapterResult } from "./birthday-delivery-service.js";
import { WhatsAppWebviewDriver } from "./whatsapp-webview-driver.js";

export class WhatsAppDeliveryLock {
  private automaticOwner = "";
  private userBusy = false;
  private sequence = 0;

  setUserBusy(busy: boolean) {
    this.userBusy = busy;
    if (busy) this.automaticOwner = "";
  }

  isUserBusy(): boolean {
    return this.userBusy;
  }

  tryAcquireAutomatic(): string | null {
    if (this.userBusy || this.automaticOwner) return null;
    this.sequence += 1;
    this.automaticOwner = `birthday-automatic-${this.sequence}`;
    return this.automaticOwner;
  }

  canContinue(owner: string): boolean {
    return this.automaticOwner === owner && !this.userBusy;
  }

  release(owner: string) {
    if (this.automaticOwner === owner) this.automaticOwner = "";
  }
}

export class WhatsAppDeliveryAdapter implements BirthdayDeliveryAdapter {
  constructor(
    private readonly driver: WhatsAppWebviewDriver,
    private readonly lock: WhatsAppDeliveryLock
  ) {}

  isAvailable(): boolean {
    return this.driver.isAvailable();
  }

  async send(input: BirthdayDeliveryAdapterInput, hooks: BirthdayDeliveryAdapterHooks): Promise<BirthdayDeliveryAdapterResult> {
    const owner = this.lock.tryAcquireAutomatic();
    if (!owner) {
      return { ok: false, kind: "waiting", retryable: true, message: "WhatsApp şu anda kullanıcı tarafından kullanılıyor; otomatik gönderim bekliyor." };
    }

    const run = this.driver.send(input, {
      onPrepared: hooks.onPrepared,
      canContinue: () => this.lock.canContinue(owner),
      beforeSend: () => {
        if (!this.lock.canContinue(owner)) {
          return { ok: false as const, kind: "waiting" as const, message: "WhatsApp kullanıcı akışı başladı; otomatik gönderim iptal edilip yeniden denenecek." };
        }
        return hooks.beforeSend();
      }
    });
    this.activeAutomaticRun = run;

    try {
      return await run;
    } finally {
      if (this.activeAutomaticRun === run) this.activeAutomaticRun = null;
      this.lock.release(owner);
    }
  }

  async takeoverUserControl(): Promise<{ ok: boolean; message: string }> {
    this.lock.setUserBusy(true);
    const active = this.activeAutomaticRun;
    if (active) {
      try {
        await active;
      } catch {
        // The automatic delivery service records its own failure. User takeover continues.
      }
    }
    return this.driver.prepareForUserControl();
  }
}

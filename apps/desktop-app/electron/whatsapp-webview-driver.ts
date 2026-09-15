import { webContents, type WebContents } from "electron";
import {
  createWhatsAppFillMessageScript,
  createWhatsAppInspectionScript,
  createWhatsAppSendScript,
  createWhatsAppWebUrl,
  type WhatsAppDomResult
} from "@yardimci-asistan/whatsapp-bridge";
import type { BirthdayDeliveryAdapterHooks, BirthdayDeliveryAdapterInput, BirthdayDeliveryAdapterResult } from "./birthday-delivery-service.js";

const DRIVER_TIMEOUT_MS = 15_000;
const DRIVER_POLL_MS = 350;

export class WhatsAppWebviewDriver {
  private guest: WebContents | null = null;

  attach(webContentsId: number): boolean {
    const candidate = webContents.fromId(webContentsId);
    if (!candidate || candidate.isDestroyed() || candidate.getType() !== "webview") return false;
    this.detach();
    this.guest = candidate;
    candidate.once("destroyed", () => {
      if (this.guest === candidate) this.guest = null;
    });
    return true;
  }

  detach(webContentsId?: number) {
    if (!this.guest) return;
    if (webContentsId !== undefined && this.guest.id !== webContentsId) return;
    this.guest = null;
  }

  isAvailable(): boolean {
    return Boolean(this.guest && !this.guest.isDestroyed());
  }

  async send(input: BirthdayDeliveryAdapterInput, hooks: BirthdayDeliveryAdapterHooks): Promise<BirthdayDeliveryAdapterResult> {
    const guest = this.guest;
    if (!guest || guest.isDestroyed()) {
      return { ok: false, kind: "waiting", retryable: true, message: "WhatsApp webview bekleniyor." };
    }

    const targetUrl = createWhatsAppWebUrl(input.normalizedPhone, input.message);
    if (!targetUrl) {
      return { ok: false, kind: "failed", retryable: false, message: "WhatsApp hedef telefonu oluşturulamadı." };
    }

    try {
      await guest.loadURL(targetUrl);
    } catch {
      return { ok: false, kind: "waiting", retryable: true, message: "WhatsApp Web sayfası yüklenemedi; sonraki değerlendirmede yeniden denenecek." };
    }

    const inspection = await this.waitForInspection(guest, input.message, input.normalizedPhone);
    if (!inspection.ok) return inspection.result;

    let ready = inspection.dom;
    if (ready.code === "message_mismatch") {
      const filled = await this.executeResult(guest, createWhatsAppFillMessageScript(input.message));
      if (!filled.ok) {
        return { ok: false, kind: "failed", retryable: true, message: filled.message };
      }
      const afterFill = await this.waitForInspection(guest, input.message, input.normalizedPhone, 3_000);
      if (!afterFill.ok) return afterFill.result;
      ready = afterFill.dom;
    }

    hooks.onPrepared();
    const beforeSend = hooks.beforeSend();
    if (!beforeSend.ok) {
      return { ok: false, kind: beforeSend.kind, retryable: beforeSend.kind === "waiting", message: beforeSend.message };
    }

    const sent = await this.executeResult(
      guest,
      createWhatsAppSendScript(input.message, ready.chatTitle ?? "", input.normalizedPhone)
    );
    if (sent.ok) {
      return { ok: true, message: sent.message };
    }
    return {
      ok: false,
      kind: "failed",
      retryable: sent.code !== "target_changed" && sent.code !== "approval_changed",
      message: sent.message
    };
  }

  private async waitForInspection(
    guest: WebContents,
    message: string,
    phone: string,
    timeoutMs = DRIVER_TIMEOUT_MS
  ): Promise<{ ok: true; dom: WhatsAppDomResult } | { ok: false; result: BirthdayDeliveryAdapterResult }> {
    const deadline = Date.now() + timeoutMs;
    let last: WhatsAppDomResult = {
      ok: false,
      code: "page_not_ready",
      message: "WhatsApp Web henüz hazır değil."
    };
    while (Date.now() < deadline) {
      if (guest.isDestroyed()) {
        return { ok: false, result: { ok: false, kind: "waiting", retryable: true, message: "WhatsApp webview kapandı." } };
      }
      const result = await this.executeResult(guest, createWhatsAppInspectionScript(message, phone));
      last = result;
      if (result.ok) return { ok: true, dom: result };
      if (result.code === "message_mismatch") return { ok: true, dom: result };
      if (result.code === "login_required") {
        return { ok: false, result: { ok: false, kind: "waiting", retryable: true, message: "WhatsApp oturumu açık değil; doğum günü mesajları bekliyor." } };
      }
      await delay(DRIVER_POLL_MS);
    }

    if (last.code === "target_not_verified") {
      return { ok: false, result: { ok: false, kind: "failed", retryable: false, message: "Hedef WhatsApp sohbeti güvenle doğrulanamadı." } };
    }
    return { ok: false, result: { ok: false, kind: "failed", retryable: true, message: `WhatsApp Web zaman aşımına uğradı: ${last.message}` } };
  }

  private async executeResult(guest: WebContents, script: string): Promise<WhatsAppDomResult> {
    try {
      const value = await guest.executeJavaScript(script, true);
      if (!value || typeof value !== "object") {
        return { ok: false, code: "invalid_result", message: "WhatsApp Web driver geçerli sonuç alamadı." };
      }
      const result = value as Partial<WhatsAppDomResult>;
      return {
        ok: result.ok === true,
        code: String(result.code ?? "unknown"),
        message: String(result.message ?? "WhatsApp Web işlemi tamamlanamadı."),
        chatTitle: typeof result.chatTitle === "string" ? result.chatTitle : "",
        composerText: typeof result.composerText === "string" ? result.composerText : "",
        targetVerified: result.targetVerified === true
      };
    } catch {
      return { ok: false, code: "execute_failed", message: "WhatsApp Web driver sayfa scriptini çalıştıramadı." };
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

import type { DesktopDatabase } from "./database.js";
import type { DesktopAutomaticBirthdayClaim, DesktopBirthdayCandidate } from "./birthday-service.js";

export interface BirthdayDeliveryAdapterInput extends DesktopAutomaticBirthdayClaim {}

export interface BirthdayDeliveryAdapterHooks {
  onPrepared: () => void;
  beforeSend: () => { ok: true } | { ok: false; kind: "waiting" | "skipped"; message: string };
}

export type BirthdayDeliveryAdapterResult =
  | { ok: true; message: string }
  | { ok: false; kind: "waiting" | "failed" | "skipped"; retryable: boolean; message: string };

export interface BirthdayDeliveryAdapter {
  isAvailable(): boolean;
  send(input: BirthdayDeliveryAdapterInput, hooks: BirthdayDeliveryAdapterHooks): Promise<BirthdayDeliveryAdapterResult>;
}

export type BirthdayDeliveryRunResult =
  | { status: "sent"; customerId: string; message: string }
  | { status: "waiting"; customerId: string; message: string }
  | { status: "failed"; customerId: string; message: string }
  | { status: "skipped"; customerId: string; message: string }
  | { status: "ignored"; customerId: string; message: string };

export class BirthdayDeliveryService {
  constructor(
    private readonly database: Pick<
      DesktopDatabase,
      | "getAutomaticBirthdayCandidates"
      | "claimAutomaticBirthdayDelivery"
      | "revalidateAutomaticBirthdayDelivery"
      | "markBirthdayDeliveryPrepared"
      | "markBirthdayDeliverySent"
      | "markBirthdayDeliveryFailed"
      | "markBirthdayDeliveryWaiting"
      | "markBirthdayDeliverySkipped"
    >,
    private readonly adapter: BirthdayDeliveryAdapter
  ) {}

  async deliver(customerId: string, fallbackCandidate?: DesktopBirthdayCandidate, now = new Date()): Promise<BirthdayDeliveryRunResult> {
    if (!this.adapter.isAvailable()) {
      const candidate = fallbackCandidate ?? this.database.getAutomaticBirthdayCandidates(now).find((item) => item.customerId === customerId);
      if (candidate) {
        this.database.markBirthdayDeliveryWaiting(
          candidate.customerId,
          Number(candidate.birthdayDate.slice(0, 4)),
          candidate.birthdayDate,
          "automatic",
          candidate.message,
          "WhatsApp webview bekleniyor; oturum açıldığında yeniden denenecek.",
          now
        );
      }
      return { status: "waiting", customerId, message: "WhatsApp webview bekleniyor." };
    }

    const claim = this.database.claimAutomaticBirthdayDelivery(customerId, now);
    if (!claim.ok) {
      return { status: "ignored", customerId, message: claim.message };
    }

    const candidate = claim.candidate;
    let prepared = false;
    const hooks: BirthdayDeliveryAdapterHooks = {
      onPrepared: () => {
        prepared = true;
        this.database.markBirthdayDeliveryPrepared(candidate.customerId, candidate.birthdayYear, candidate.message, now);
      },
      beforeSend: () => {
        const current = this.database.revalidateAutomaticBirthdayDelivery(
          candidate.customerId,
          candidate.message,
          candidate.normalizedPhone,
          now
        );
        return current.ok
          ? current
          : { ok: false as const, kind: current.code === "excluded" || current.code === "already_sent" ? "skipped" as const : "waiting" as const, message: current.message };
      }
    };

    let result: BirthdayDeliveryAdapterResult;
    try {
      result = await this.adapter.send(candidate, hooks);
    } catch (error) {
      result = {
        ok: false,
        kind: "failed",
        retryable: true,
        message: error instanceof Error ? error.message : "WhatsApp otomatik gönderimi beklenmeyen bir hatayla durdu."
      };
    }

    if (result.ok) {
      if (!prepared) {
        this.database.markBirthdayDeliveryPrepared(candidate.customerId, candidate.birthdayYear, candidate.message, now);
      }
      const sent = this.database.markBirthdayDeliverySent(candidate.customerId, candidate.birthdayYear, now);
      return sent?.status === "sent"
        ? { status: "sent", customerId, message: result.message }
        : { status: "failed", customerId, message: "Gönderim sonucu kaydedilemedi; sent kaydı yazılmadı." };
    }

    if (result.kind === "skipped") {
      this.database.markBirthdayDeliverySkipped(candidate.customerId, candidate.birthdayYear, result.message, now);
      return { status: "skipped", customerId, message: result.message };
    }
    if (result.kind === "waiting") {
      this.database.markBirthdayDeliveryWaiting(
        candidate.customerId,
        candidate.birthdayYear,
        candidate.birthdayDate,
        candidate.mode,
        candidate.message,
        result.message,
        now
      );
      return { status: "waiting", customerId, message: result.message };
    }

    this.database.markBirthdayDeliveryFailed(
      candidate.customerId,
      candidate.birthdayYear,
      result.message,
      result.retryable,
      now
    );
    return { status: "failed", customerId, message: result.message };
  }
}

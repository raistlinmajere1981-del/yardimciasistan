import { getLocalIsoDate } from "@yardimci-asistan/shared";
import type { DesktopBirthdayCandidate } from "./birthday-service.js";
import { BirthdayDeliveryService } from "./birthday-delivery-service.js";

export interface BirthdaySchedulerStore {
  getAutomaticBirthdayCandidates(now?: Date): DesktopBirthdayCandidate[];
}

export interface BirthdaySchedulerOptions {
  database: BirthdaySchedulerStore;
  deliveryService: BirthdayDeliveryService;
  isWhatsAppEnabled: () => boolean;
  onDashboardChanged?: () => void;
  now?: () => Date;
  intervalMs?: number;
  interMessageDelayMs?: number;
}

export interface BirthdaySchedulerStatus {
  running: boolean;
  evaluating: boolean;
  lastEvaluationAt: string;
  lastEvaluationKey: string;
  lastResult: "idle" | "waiting" | "sent" | "failed" | "skipped";
  message: string;
}

export class BirthdayScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = true;
  private lastEvaluationKey = "";
  private status: BirthdaySchedulerStatus = {
    running: false,
    evaluating: false,
    lastEvaluationAt: "",
    lastEvaluationKey: "",
    lastResult: "idle",
    message: "Otomatik doğum günü scheduler hazır."
  };

  constructor(private readonly options: BirthdaySchedulerOptions) {}

  start() {
    this.stop();
    this.stopped = false;
    const intervalMs = Math.max(30_000, this.options.intervalMs ?? 60_000);
    this.timer = setInterval(() => {
      void this.evaluate();
    }, intervalMs);
    void this.evaluate(true);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = { ...this.status, running: false, evaluating: false, message: "Otomatik doğum günü scheduler durduruldu." };
  }

  evaluateNow() {
    return this.evaluate(true);
  }

  getStatus(): BirthdaySchedulerStatus {
    return { ...this.status, running: !this.stopped, evaluating: Boolean(this.inFlight) };
  }

  private evaluate(force = false): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.inFlight) return this.inFlight;

    const run = this.evaluateSequential(force).finally(() => {
      this.inFlight = null;
      this.status = { ...this.status, evaluating: false };
    });
    this.inFlight = run;
    return run;
  }

  private async evaluateSequential(force: boolean) {
    const now = this.options.now?.() ?? new Date();
    const minuteKey = `${getLocalIsoDate(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (!force && minuteKey === this.lastEvaluationKey) return;
    this.lastEvaluationKey = minuteKey;
    this.status = {
      ...this.status,
      running: true,
      evaluating: true,
      lastEvaluationAt: now.toISOString(),
      lastEvaluationKey: minuteKey,
      lastResult: "idle",
      message: "Doğum günü adayları değerlendiriliyor."
    };

    if (!this.options.isWhatsAppEnabled()) {
      this.status = { ...this.status, lastResult: "waiting", message: "WhatsApp etkin değil; otomatik doğum günü gönderimi bekliyor." };
      return;
    }

    const candidates = this.options.database.getAutomaticBirthdayCandidates(now);
    if (candidates.length === 0) {
      this.status = { ...this.status, lastResult: "waiting", message: "Bu scheduler değerlendirmesinde gönderilecek doğum günü mesajı yok." };
      return;
    }

    for (const candidate of candidates) {
      if (this.stopped) break;
      const result = await this.options.deliveryService.deliver(candidate.customerId, candidate, this.options.now?.() ?? new Date());
      this.status = {
        ...this.status,
        lastResult: result.status === "ignored" ? "waiting" : result.status,
        message: result.message
      };
      this.options.onDashboardChanged?.();
      if (result.status === "sent" && !this.stopped) {
        await delay(this.options.interMessageDelayMs ?? 350);
      }
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}

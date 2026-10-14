import { desktopLog } from "./desktop-logger.js";

/** Local domain worker: independent of Hosting availability/automatic publication settings. */
export class KbsDeliveryRequestProcessor {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = true;

  constructor(private readonly options: {
    processRequests: (available: () => boolean) => Promise<number>;
    available: () => boolean;
    onChanged: () => void;
  }) {}

  start() {
    this.stopped = false;
    if (!this.timer) this.timer = setInterval(() => this.wake(), 15_000);
    this.timer.unref();
    this.wake();
  }

  wake() {
    if (this.stopped || this.inFlight || !this.options.available()) return;
    this.inFlight = this.options.processRequests(() => !this.stopped && this.options.available())
      .then(count => { if (count > 0) this.options.onChanged(); })
      .catch(() => { desktopLog.warn({ scope: "kbs", event: "kbs.request.processing.failed", message: "Kalıcı KBS gönderim isteği sonraki yerel taramayı bekliyor." }); })
      .finally(() => { this.inFlight = null; });
  }

  async stopAndDrain() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.inFlight) await this.inFlight;
  }
}

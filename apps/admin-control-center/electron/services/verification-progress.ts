import type { VerificationCheckProgress } from "../../shared/contracts";

const START = /^▶\s*\[(\d+)\/(\d+)\]\s*\[([^\]]+)\]/;
const FINISH = /^([✓✗])\s*\[(\d+)\/(\d+)\]\s*(.+?)\s*\((\d+)\s*ms\)\s*$/;
const SKIP = /^-\s*\[(\d+)\/(\d+)\]\s*\[([^\]]+)\]\s*(.+?)\s*·\s*(.+)$/;
const PLAN = /^Plan:\s*(\d+)\s+benzersiz kontrol/;
const ANSI = /\u001b\[[0-9;]*m/g;
const MAX_CHECK_OUTPUT = 180_000;

export class VerificationProgressTracker {
  private checks = new Map<string, VerificationCheckProgress>();
  private outputs = new Map<string, string>();
  private activeId: string | null = null;
  private total = 0;

  reset() {
    this.checks.clear();
    this.outputs.clear();
    this.activeId = null;
    this.total = 0;
  }

  feed(line: string) {
    const normalized = line.replace(ANSI, "").trim();
    const plan = normalized.match(PLAN);
    if (plan) this.total = Number(plan[1]);

    const start = normalized.match(START);
    if (start && start[3]) {
      const index = start[1];
      const total = start[2];
      const id = start[3];
      this.total = Number(total);
      this.activeId = id;
      this.checks.set(id, { id, index: Number(index), status: "running", durationMs: null, reason: "" });
    }

    // Include both command output and completion line in the owning check log.
    if (this.activeId) {
      const previous = this.outputs.get(this.activeId) ?? "";
      const next = previous + line + "\n";
      this.outputs.set(this.activeId, next.length > MAX_CHECK_OUTPUT
        ? "[Çıktının ilk kısmı uzunluk sınırı nedeniyle atlandı]\n" + next.slice(-(MAX_CHECK_OUTPUT - 90))
        : next);
    }

    const finish = normalized.match(FINISH);
    if (finish && this.activeId) {
      const [, symbol, , , , duration] = finish;
      const current = this.checks.get(this.activeId);
      if (current) this.checks.set(current.id, { ...current, status: symbol === "✓" ? "passed" : "failed", durationMs: Number(duration) });
      this.activeId = null;
      return;
    }

    const skip = normalized.match(SKIP);
    if (skip && skip[3]) {
      const index = skip[1];
      const total = skip[2];
      const id = skip[3];
      const label = skip[4];
      const reason = skip[5];
      this.total = Number(total);
      this.checks.set(id, {
        id, index: Number(index), status: "skipped", durationMs: 0, reason: `${label} · ${reason}`
      });
      this.outputs.set(id, normalized + "\n");
    }
  }

  finishInterrupted(cancelled: boolean) {
    if (!this.activeId) return;
    const current = this.checks.get(this.activeId);
    if (current) {
      this.checks.set(current.id, {
        ...current,
        status: cancelled ? "skipped" : "failed",
        reason: cancelled ? "Koşu iptal edildi" : "Doğrulama süreci tamamlanmadan kapandı"
      });
    }
    this.activeId = null;
  }

  get snapshot() {
    return { total: this.total, checks: [...this.checks.values()].sort((a, b) => a.index - b.index) };
  }

  getOutput(id: string) {
    return this.outputs.get(id) ?? "";
  }
}

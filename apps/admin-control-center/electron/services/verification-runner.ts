import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import type { VerificationRunRequest, VerificationRunState } from "../../shared/contracts";

const MAX_TAIL_LINES = 220;
const SAFE_VALUE = /^[a-zA-Z0-9:_-]+$/;

type Listener = (state: VerificationRunState) => void;

export class VerificationRunner {
  private child: ChildProcess | null = null;
  private listeners = new Set<Listener>();
  private cancelled = false;
  private state: VerificationRunState = {
    running: false,
    selectionLabel: "",
    startedAt: null,
    finishedAt: null,
    result: "idle",
    exitCode: null,
    outputTail: []
  };

  constructor(private readonly repoRoot: string) {}

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): VerificationRunState {
    return {
      ...this.state,
      outputTail: [...this.state.outputTail]
    };
  }

  start(request: VerificationRunRequest) {
    if (this.child) {
      return { accepted: false, message: "Başka bir doğrulama zaten çalışıyor." };
    }

    if (!request || !["preset", "domain", "check"].includes(request.mode)) {
      return { accepted: false, message: "Geçersiz doğrulama seçimi." };
    }

    const value = String(request.value ?? "").trim();
    if (!value || !SAFE_VALUE.test(value)) {
      return { accepted: false, message: "Doğrulama değeri güvenli biçimde değil." };
    }

    const flag = request.mode === "preset"
      ? "--preset"
      : request.mode === "domain"
        ? "--domain"
        : "--check";
    const args = [join(this.repoRoot, "scripts", "verify.mjs"), flag, value];
    if (request.includeManual === true) args.push("--include-manual");

    const selectionLabel = `${request.mode}=${value}`;
    this.cancelled = false;
    this.state = {
      running: true,
      selectionLabel,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: "running",
      exitCode: null,
      outputTail: []
    };
    this.emit();

    const child = spawn(process.execPath, args, {
      cwd: this.repoRoot,
      env: process.env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.child = child;

    child.stdout?.on("data", (chunk) => this.appendOutput(chunk.toString()));
    child.stderr?.on("data", (chunk) => this.appendOutput(chunk.toString()));

    child.on("error", (error) => {
      this.appendOutput(`Çalıştırma hatası: ${error.message}`);
    });

    child.on("close", (code) => {
      this.child = null;
      this.state = {
        ...this.state,
        running: false,
        finishedAt: new Date().toISOString(),
        result: this.cancelled ? "cancelled" : code === 0 ? "passed" : "failed",
        exitCode: typeof code === "number" ? code : null
      };
      this.emit();
    });

    return { accepted: true, message: `${selectionLabel} doğrulaması başlatıldı.` };
  }

  cancel() {
    const child = this.child;
    if (!child || !child.pid) return false;

    this.cancelled = true;
    this.appendOutput("İptal istendi…");

    try {
      if (process.platform === "win32") {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          shell: false,
          stdio: "ignore"
        });
        killer.unref();
      } else {
        process.kill(-child.pid, "SIGTERM");
        setTimeout(() => {
          if (this.child?.pid === child.pid) {
            try {
              process.kill(-child.pid!, "SIGKILL");
            } catch {
              // Process group already exited.
            }
          }
        }, 3000).unref();
      }
      return true;
    } catch {
      try {
        child.kill("SIGTERM");
        return true;
      } catch {
        return false;
      }
    }
  }

  private appendOutput(value: string) {
    const lines = value
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean);

    if (!lines.length) return;

    this.state = {
      ...this.state,
      outputTail: [...this.state.outputTail, ...lines].slice(-MAX_TAIL_LINES)
    };
    this.emit();
  }

  private emit() {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}

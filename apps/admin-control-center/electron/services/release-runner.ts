import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";
import type { ReleaseOperationRequest, ReleaseOperationState } from "../../shared/contracts";

const MAX_TAIL_LINES = 260;

type Listener = (state: ReleaseOperationState) => void;

type Step = {
  label: string;
  command: string;
  args: string[];
};

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function stepsFor(action: ReleaseOperationRequest["action"]): Step[] {
  if (action === "package") {
    return [
      {
        label: "Desktop + Android release paketleri",
        command: npmCommand(),
        args: ["run", "pack:desktop:all"]
      },
      {
        label: "Web modülü paketi",
        command: npmCommand(),
        args: ["run", "pack:web-module"]
      }
    ];
  }

  if (action === "preview") {
    return [{
      label: "Landing + kurulum dosyaları dry-run",
      command: npmCommand(),
      args: ["run", "deploy:landing", "--", "--dry-run", "--with-downloads"]
    }];
  }

  return [{
    label: "Landing + kurulum dosyaları yayını",
    command: npmCommand(),
    args: ["run", "deploy:landing", "--", "--yes", "--with-downloads"]
  }];
}

export class ReleaseRunner {
  private child: ChildProcess | null = null;
  private listeners = new Set<Listener>();
  private cancelled = false;
  private state: ReleaseOperationState = {
    running: false,
    action: "",
    stage: "",
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

  getState(): ReleaseOperationState {
    return { ...this.state, outputTail: [...this.state.outputTail] };
  }

  start(request: ReleaseOperationRequest) {
    if (this.state.running || this.child) {
      return { accepted: false, message: "Başka bir release işlemi zaten çalışıyor." };
    }

    const action = request?.action;
    if (!["package", "preview", "publish"].includes(action)) {
      return { accepted: false, message: "Geçersiz release işlemi." };
    }

    const steps = stepsFor(action);
    this.cancelled = false;
    this.state = {
      running: true,
      action,
      stage: steps[0]?.label ?? "",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: "running",
      exitCode: null,
      outputTail: []
    };
    this.emit();
    void this.runSteps(steps);

    const labels = {
      package: "Release paketleri oluşturuluyor.",
      preview: "Yayın farkı kontrol ediliyor.",
      publish: "Kurulum dosyaları ve update feed yayınlanıyor."
    } as const;

    return { accepted: true, message: labels[action] };
  }

  cancel() {
    const child = this.child;
    if (!this.state.running || !child?.pid) return false;

    this.cancelled = true;
    this.appendOutput("İptal istendi…");
    this.killChild(child);
    return true;
  }

  private async runSteps(steps: Step[]) {
    let exitCode = 0;

    for (const step of steps) {
      if (this.cancelled) break;
      this.state = { ...this.state, stage: step.label };
      this.appendOutput(`\n== ${step.label} ==`);
      exitCode = await this.runStep(step);
      if (exitCode !== 0) break;
    }

    this.child = null;
    this.state = {
      ...this.state,
      running: false,
      finishedAt: new Date().toISOString(),
      result: this.cancelled ? "cancelled" : exitCode === 0 ? "passed" : "failed",
      exitCode: this.cancelled ? null : exitCode
    };
    this.emit();
  }

  private runStep(step: Step) {
    return new Promise<number>((resolve) => {
      const child = spawn(step.command, step.args, {
        cwd: this.repoRoot,
        env: process.env,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"]
      });

      this.child = child;
      child.stdout?.on("data", (chunk) => this.appendOutput(chunk.toString()));
      child.stderr?.on("data", (chunk) => this.appendOutput(chunk.toString()));
      child.on("error", (error) => this.appendOutput(`Çalıştırma hatası: ${error.message}`));
      child.on("close", (code) => {
        if (this.child === child) this.child = null;
        resolve(typeof code === "number" ? code : 1);
      });
    });
  }

  private killChild(child: ChildProcess) {
    try {
      if (!child.pid) return;
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
              // Process already exited.
            }
          }
        }, 3000).unref();
      }
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        // Process already exited.
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

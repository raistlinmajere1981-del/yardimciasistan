import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import type {
  VerificationHistoryItem,
  VerificationRunRequest,
  VerificationRunState
} from "../../shared/contracts";

const MAX_TAIL_LINES = 220;
const SAFE_VALUE = /^[a-zA-Z0-9:_-]+$/;

type Listener = (state: VerificationRunState) => void;

type GitContext = {
  branch: string;
  head: string;
  dirtyCount: number;
};

function historyDir(repoRoot: string) {
  return join(repoRoot, "artifacts", "admin-control-center", "verification-history");
}

function git(repoRoot: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000,
    shell: false
  });
  return {
    ok: result.status === 0,
    out: String(result.stdout ?? "").trim()
  };
}

function readGitContext(repoRoot: string): GitContext {
  const branch = git(repoRoot, ["branch", "--show-current"]);
  const head = git(repoRoot, ["rev-parse", "--short", "HEAD"]);
  const dirty = git(repoRoot, ["status", "--porcelain=v1"]);

  return {
    branch: branch.ok && branch.out ? branch.out : "(detached)",
    head: head.ok && head.out ? head.out : "?",
    dirtyCount: dirty.ok && dirty.out ? dirty.out.split("\n").filter(Boolean).length : 0
  };
}

function historyId(startedAt: string) {
  return startedAt.replaceAll(":", "-").replaceAll(".", "-");
}

export function listVerificationHistory(
  repoRoot: string,
  limit = 30
): VerificationHistoryItem[] {
  const dir = historyDir(repoRoot);
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 30)))
      .flatMap((name) => {
        try {
          const value = JSON.parse(readFileSync(join(dir, name), "utf8")) as VerificationHistoryItem;
          return value?.id && value?.startedAt ? [value] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

export class VerificationRunner {
  private child: ChildProcess | null = null;
  private listeners = new Set<Listener>();
  private cancelled = false;
  private gitContext: GitContext | null = null;
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
    this.gitContext = readGitContext(this.repoRoot);
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

    const nodeExecutable = process.env.npm_node_execpath?.trim()
      || (process.platform === "win32" ? "node.exe" : "node");
    const child = spawn(nodeExecutable, args, {
      cwd: this.repoRoot,
      env: process.env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.child = child;
    this.appendOutput(`Node: ${nodeExecutable}`);
    this.appendOutput(
      `Git: ${this.gitContext.branch} · ${this.gitContext.head}${this.gitContext.dirtyCount ? ` · ${this.gitContext.dirtyCount} değişiklik` : " · temiz"}`
    );

    child.stdout?.on("data", (chunk: Buffer) => this.appendOutput(chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => this.appendOutput(chunk.toString()));

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
      this.writeHistory();
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

  private writeHistory() {
    const startedAt = this.state.startedAt;
    const finishedAt = this.state.finishedAt;
    const context = this.gitContext;
    const result = this.state.result;

    if (
      !startedAt
      || !finishedAt
      || !context
      || !["passed", "failed", "cancelled"].includes(result)
    ) {
      return;
    }

    const item: VerificationHistoryItem = {
      id: historyId(startedAt),
      selectionLabel: this.state.selectionLabel,
      startedAt,
      finishedAt,
      result: result as VerificationHistoryItem["result"],
      branch: context.branch,
      head: context.head,
      dirtyCount: context.dirtyCount
    };

    try {
      const dir = historyDir(this.repoRoot);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${item.id}.json`), JSON.stringify(item, null, 2) + "\n");
    } catch {
      // History failure must not change the verification result.
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

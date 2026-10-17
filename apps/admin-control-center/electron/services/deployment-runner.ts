import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";
import type {
  DeploymentRunRequest,
  DeploymentRunState,
  DeploymentTargetSnapshot
} from "../../shared/contracts";

const MAX_TAIL_LINES = 260;

type Listener = (state: DeploymentRunState) => void;

type CommandStep = {
  label: string;
  command: string;
  args: string[];
  cwd: string;
};

type InstallationRecord = {
  externalRepo?: {
    env?: string;
    defaultSibling?: string;
  };
};

type InstallationRegistry = {
  installations?: Record<string, InstallationRecord>;
};

type TargetDefinition = {
  id: string;
  installationId: string;
  title: string;
  description: string;
  confirmText: string;
  impact: string[];
  preflight: (repoRoot: string) => CommandStep[];
  deploy: (repoRoot: string) => CommandStep[];
  availability: (repoRoot: string) => { available: boolean; note: string };
};

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function readRegistry(repoRoot: string): InstallationRegistry {
  return JSON.parse(
    readFileSync(join(repoRoot, "config", "installations.json"), "utf8")
  ) as InstallationRegistry;
}

function resolveBlackSeaRoot(repoRoot: string) {
  const registry = readRegistry(repoRoot);
  const config = registry.installations?.blacksea?.externalRepo;
  const fromEnv = config?.env ? process.env[config.env]?.trim() : "";
  if (fromEnv) return resolve(fromEnv);

  const sibling = config?.defaultSibling?.trim();
  return sibling ? resolve(repoRoot, "..", sibling) : "";
}

function rootScriptExists(repoRoot: string, path: string) {
  return existsSync(join(repoRoot, path));
}

function blackSeaAvailability(repoRoot: string) {
  const root = resolveBlackSeaRoot(repoRoot);
  if (!root) return { available: false, note: "BlackSea repo yolu tanımlı değil." };
  if (!existsSync(root)) return { available: false, note: `Repo bulunamadı: ${root}` };
  if (!existsSync(join(root, "scripts", "deploy-natro-ftp.sh"))) {
    return { available: false, note: "BlackSea deploy scripti bulunamadı." };
  }
  return { available: true, note: root };
}

const TARGETS: TargetDefinition[] = [
  {
    id: "ya-web",
    installationId: "ya",
    title: "Yardımcı Asistan web modülü",
    description: "Alwaysdata üzerindeki web modülünü mevcut canonical deploy scriptiyle yayınlar.",
    confirmText: "Canlı web modülü güncellenecek. Önce yedek alınır ve deploy sonrası canlı kontrol yapılır.",
    impact: [
      "data/, firma config, knowledge/, assets/, media/ ve .env korunur.",
      "Yeni paket canlı web modülüne alınır.",
      "Deploy sonrası HTTP kontrolleri çalışır."
    ],
    preflight: (repoRoot) => [{
      label: "YA deploy dry-run",
      command: npmCommand(),
      args: ["run", "deploy:web", "--", "--dry-run"],
      cwd: repoRoot
    }],
    deploy: (repoRoot) => [{
      label: "YA deploy",
      command: npmCommand(),
      args: ["run", "deploy:web", "--", "--yes"],
      cwd: repoRoot
    }],
    availability: (repoRoot) => ({
      available: rootScriptExists(repoRoot, "scripts/deploy-web.sh"),
      note: rootScriptExists(repoRoot, "scripts/deploy-web.sh")
        ? "Canonical deploy scripti hazır."
        : "scripts/deploy-web.sh bulunamadı."
    })
  },
  {
    id: "market-pilot",
    installationId: "market-pilot",
    title: "Tekel Market · Pilot 2",
    description: "Ayrı Alwaysdata hesabına market sayfasını ve web modülünü yayınlar.",
    confirmText: "Yalnız Market Pilot Alwaysdata hesabı güncellenecek. İlk kurulumda yeni anahtar üretilir; sonraki yayınlarda veri korunur.",
    impact: [
      "Yardımcı Asistan ana demo ve BlackSea sitesi değişmez.",
      "Market ana sayfası ve marketin web modülü güncellenir.",
      "İlk bağlantı anahtarı yalnız yerel artifacts dizininde saklanır."
    ],
    preflight: (repoRoot) => [{
      label: "Market Pilot SSH ve yayın ön kontrolü",
      command: npmCommand(),
      args: ["run", "deploy:market-pilot", "--", "--dry-run"],
      cwd: repoRoot
    }],
    deploy: (repoRoot) => [{
      label: "Market Pilot site ve modül yayını",
      command: npmCommand(),
      args: ["run", "deploy:market-pilot", "--", "--yes"],
      cwd: repoRoot
    }],
    availability: (repoRoot) => ({
      available: rootScriptExists(repoRoot, "scripts/deploy-market-pilot.sh"),
      note: rootScriptExists(repoRoot, "scripts/deploy-market-pilot.sh")
        ? "Ayrı tenant deploy scripti hazır. SSH bağlantısı ön kontrolde sınanır."
        : "scripts/deploy-market-pilot.sh bulunamadı."
    })
  },
  {
    id: "support-endpoint",
    installationId: "support",
    title: "Merkezi Destek endpoint'i",
    description: "Support upload endpoint kodunu Alwaysdata üzerinde günceller.",
    confirmText: "Merkezi destek endpoint'i canlıda güncellenecek.",
    impact: [
      "Yalnız support endpoint kodu güncellenir.",
      "Private support-reports dizini korunur.",
      "Deploy sonrası endpoint HTTP kontrolü yapılır."
    ],
    preflight: (repoRoot) => [{
      label: "Support deploy dry-run",
      command: npmCommand(),
      args: ["run", "deploy:support", "--", "--dry-run"],
      cwd: repoRoot
    }],
    deploy: (repoRoot) => [{
      label: "Support deploy",
      command: npmCommand(),
      args: ["run", "deploy:support", "--", "--yes"],
      cwd: repoRoot
    }],
    availability: (repoRoot) => ({
      available: rootScriptExists(repoRoot, "scripts/deploy-support.sh"),
      note: rootScriptExists(repoRoot, "scripts/deploy-support.sh")
        ? "Canonical deploy scripti hazır."
        : "scripts/deploy-support.sh bulunamadı."
    })
  },
  {
    id: "landing",
    installationId: "landing",
    title: "Yardımcı Asistan landing",
    description: "Ana landing sayfasını canlı www köküne yayınlar; web modülüne dokunmaz.",
    confirmText: "Canlı landing güncellenecek. Web modülü dizini korunur.",
    impact: [
      "Landing root sayfaları ve ortak public assetler güncellenir.",
      "www/yardimci-asistan/** alanına yazılmaz.",
      "Backup + atomic deploy + HTTP smoke uygulanır."
    ],
    preflight: (repoRoot) => [{
      label: "Landing deploy dry-run",
      command: npmCommand(),
      args: ["run", "deploy:landing", "--", "--dry-run"],
      cwd: repoRoot
    }],
    deploy: (repoRoot) => [{
      label: "Landing deploy",
      command: npmCommand(),
      args: ["run", "deploy:landing", "--", "--yes"],
      cwd: repoRoot
    }],
    availability: (repoRoot) => ({
      available: rootScriptExists(repoRoot, "test-site/landing/scripts/deploy.mjs"),
      note: rootScriptExists(repoRoot, "test-site/landing/scripts/deploy.mjs")
        ? "Canonical deploy scripti hazır."
        : "Landing deploy scripti bulunamadı."
    })
  },
  {
    id: "blacksea",
    installationId: "blacksea",
    title: "BlackSea Pansiyon",
    description: "Harici BlackSea repo akışını kontrol, paket, FTP deploy ve canlı doğrulama sırasıyla çalıştırır.",
    confirmText: "BlackSea canlı site güncellenecek. Runtime dosyaları update akışında korunur.",
    impact: [
      "Önce lokal check + readiness çalışır.",
      "Update paketi hazırlanır ve Natro FTP ile yayınlanır.",
      "Son adımda canlı site verify-live ile doğrulanır."
    ],
    preflight: (repoRoot) => {
      const cwd = resolveBlackSeaRoot(repoRoot);
      return [
        { label: "BlackSea check", command: "bash", args: ["./scripts/check.sh"], cwd },
        { label: "BlackSea readiness", command: "bash", args: ["./scripts/readiness.sh"], cwd }
      ];
    },
    deploy: (repoRoot) => {
      const cwd = resolveBlackSeaRoot(repoRoot);
      return [
        { label: "BlackSea check", command: "bash", args: ["./scripts/check.sh"], cwd },
        { label: "BlackSea readiness", command: "bash", args: ["./scripts/readiness.sh"], cwd },
        { label: "BlackSea update paketi", command: "bash", args: ["./scripts/prepare-natro-release.sh", "update"], cwd },
        { label: "BlackSea Natro deploy", command: "bash", args: ["./scripts/deploy-natro-ftp.sh", "update"], cwd },
        { label: "BlackSea canlı doğrulama", command: "bash", args: ["./scripts/verify-live.sh"], cwd }
      ];
    },
    availability: blackSeaAvailability
  }
];

export function getDeploymentTargets(repoRoot: string): DeploymentTargetSnapshot[] {
  return TARGETS.map((target) => {
    const availability = target.availability(repoRoot);
    return {
      id: target.id,
      installationId: target.installationId,
      title: target.title,
      description: target.description,
      confirmText: target.confirmText,
      impact: target.impact,
      available: availability.available,
      availabilityNote: availability.note
    };
  });
}

function targetById(id: string) {
  return TARGETS.find((target) => target.id === id) ?? null;
}

export class DeploymentRunner {
  private child: ChildProcess | null = null;
  private listeners = new Set<Listener>();
  private cancelled = false;
  private state: DeploymentRunState = {
    running: false,
    targetId: "",
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

  getState(): DeploymentRunState {
    return {
      ...this.state,
      outputTail: [...this.state.outputTail]
    };
  }

  start(request: DeploymentRunRequest) {
    if (this.state.running || this.child) {
      return { accepted: false, message: "Başka bir deploy işlemi zaten çalışıyor." };
    }

    const target = targetById(String(request?.targetId ?? ""));
    if (!target) return { accepted: false, message: "Geçersiz deploy hedefi." };
    if (request.action !== "preflight" && request.action !== "deploy") {
      return { accepted: false, message: "Geçersiz deploy işlemi." };
    }

    const availability = target.availability(this.repoRoot);
    if (!availability.available) return { accepted: false, message: availability.note };

    const steps = request.action === "preflight"
      ? target.preflight(this.repoRoot)
      : target.deploy(this.repoRoot);

    this.cancelled = false;
    this.state = {
      running: true,
      targetId: target.id,
      action: request.action,
      stage: steps[0]?.label ?? "",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: "running",
      exitCode: null,
      outputTail: []
    };
    this.emit();

    void this.runSteps(steps);
    return {
      accepted: true,
      message: request.action === "preflight"
        ? `${target.title} ön kontrolü başlatıldı.`
        : `${target.title} deploy işlemi başlatıldı.`
    };
  }

  cancel() {
    const child = this.child;
    if (!this.state.running || !child?.pid) return false;

    this.cancelled = true;
    this.appendOutput("İptal istendi…");
    this.killChild(child);
    return true;
  }

  private async runSteps(steps: CommandStep[]) {
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

  private runStep(step: CommandStep) {
    return new Promise<number>((resolve) => {
      const child = spawn(step.command, step.args, {
        cwd: step.cwd,
        env: process.env,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"]
      });

      this.child = child;

      child.stdout?.on("data", (chunk: Buffer) => this.appendOutput(chunk.toString()));
      child.stderr?.on("data", (chunk: Buffer) => this.appendOutput(chunk.toString()));

      child.on("error", (error) => {
        this.appendOutput(`Çalıştırma hatası: ${error.message}`);
      });

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

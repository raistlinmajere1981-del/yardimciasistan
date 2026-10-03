import { spawn } from "node:child_process";
import process from "node:process";
import type { DependencyUpdateItem, DependencyUpdateReport } from "../../shared/contracts";

type OutdatedRecord = {
  current?: string;
  wanted?: string;
  latest?: string;
  dependent?: string;
  location?: string;
  type?: string;
  homepage?: string;
};

function commandName() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function majorOf(version: string) {
  const match = version.match(/^(?:v)?(\d+)/);
  return match ? Number(match[1]) : null;
}

function isMajorUpdate(current: string, latest: string) {
  const currentMajor = majorOf(current);
  const latestMajor = majorOf(latest);
  return currentMajor !== null && latestMajor !== null && latestMajor > currentMajor;
}

function runNpm(args: string[], cwd: string, timeoutMs = 60000) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(commandName(), args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: error.message });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function checkDependencyUpdates(repoRoot: string): Promise<DependencyUpdateReport> {
  const checkedAt = new Date().toISOString();
  const versionResult = await runNpm(["--version"], repoRoot, 10000);
  const packageManager = versionResult.code === 0 && versionResult.stdout.trim()
    ? `npm ${versionResult.stdout.trim()}`
    : "npm";

  const result = await runNpm(
    ["outdated", "--json", "--long", "--workspaces", "--include-workspace-root"],
    repoRoot
  );

  const raw = result.stdout.trim();

  if (result.code !== 0 && result.code !== 1 && !raw) {
    return {
      checkedAt,
      status: "error",
      nodeVersion: process.version,
      packageManager,
      count: 0,
      majorCount: 0,
      message: result.stderr.trim() || "Kütüphane sürümleri npm registry üzerinden kontrol edilemedi.",
      items: []
    };
  }

  let parsed: Record<string, OutdatedRecord> = {};

  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, OutdatedRecord>;
    } catch {
      return {
        checkedAt,
        status: "error",
        nodeVersion: process.version,
        packageManager,
        count: 0,
        majorCount: 0,
        message: "npm outdated çıktısı okunamadı.",
        items: []
      };
    }
  }

  const items: DependencyUpdateItem[] = Object.entries(parsed)
    .map(([name, value]) => {
      const current = String(value.current ?? "—");
      const wanted = String(value.wanted ?? "—");
      const latest = String(value.latest ?? "—");

      return {
        name,
        current,
        wanted,
        latest,
        dependent: String(value.dependent ?? ""),
        location: String(value.location ?? ""),
        type: String(value.type ?? ""),
        homepage: typeof value.homepage === "string" && value.homepage.trim()
          ? value.homepage.trim()
          : null,
        majorUpdate: isMajorUpdate(current, latest)
      };
    })
    .sort((a, b) => Number(b.majorUpdate) - Number(a.majorUpdate) || a.name.localeCompare(b.name, "en"));

  const majorCount = items.filter((item) => item.majorUpdate).length;

  return {
    checkedAt,
    status: items.length ? "updates" : "current",
    nodeVersion: process.version,
    packageManager,
    count: items.length,
    majorCount,
    message: items.length
      ? `${items.length} kütüphane için daha yeni sürüm bulundu.`
      : "npm workspace kütüphaneleri güncel görünüyor.",
    items
  };
}

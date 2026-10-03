import { spawn } from "node:child_process";
import process from "node:process";
import type { DependencyUpdateItem, DependencyUpdateReport } from "../../shared/contracts";

type OutdatedRecord = {
  name?: unknown;
  current?: unknown;
  wanted?: unknown;
  latest?: unknown;
  dependent?: unknown;
  dependedBy?: unknown;
  depended_by?: unknown;
  location?: unknown;
  type?: unknown;
  homepage?: unknown;
};

type NormalizedRecord = {
  name: string;
  record: OutdatedRecord;
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

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function looksLikeOutdatedRecord(value: unknown): value is OutdatedRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return "current" in record || "wanted" in record || "latest" in record;
}

function collectRecords(name: string, value: unknown): NormalizedRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRecords(name, item));
  }

  if (!value || typeof value !== "object") return [];

  if (looksLikeOutdatedRecord(value)) {
    const explicitName = textValue(value.name);
    return [{ name: explicitName || name, record: value }];
  }

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([nestedName, nestedValue]) => collectRecords(nestedName || name, nestedValue));
}

function dependencyOwner(record: OutdatedRecord) {
  return textValue(record.dependent)
    || textValue(record.dependedBy)
    || textValue(record.depended_by);
}

function normalizeItems(parsed: unknown): DependencyUpdateItem[] {
  if (!parsed || typeof parsed !== "object") return [];

  const records = Object.entries(parsed as Record<string, unknown>)
    .flatMap(([name, value]) => collectRecords(name, value));

  const rawItems = records.map(({ name, record }) => {
    const current = textValue(record.current);
    const wanted = textValue(record.wanted);
    const latest = textValue(record.latest);

    return {
      name,
      current: current || "—",
      wanted: wanted || "—",
      latest: latest || "—",
      dependent: dependencyOwner(record),
      location: textValue(record.location),
      type: textValue(record.type),
      homepage: textValue(record.homepage) || null,
      majorUpdate: Boolean(current && latest && isMajorUpdate(current, latest))
    } satisfies DependencyUpdateItem;
  });

  const grouped = new Map<string, DependencyUpdateItem>();

  for (const item of rawItems) {
    const key = [item.name, item.current, item.wanted, item.latest, item.type, item.homepage ?? ""].join("\u0000");
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, item);
      continue;
    }

    const dependents = new Set(
      [existing.dependent, item.dependent]
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean)
    );

    const locations = new Set(
      [existing.location, item.location]
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean)
    );

    existing.dependent = [...dependents].join(", ");
    existing.location = [...locations].join(", ");
  }

  return [...grouped.values()]
    .sort((a, b) => Number(b.majorUpdate) - Number(a.majorUpdate) || a.name.localeCompare(b.name, "en"));
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

  let parsed: unknown = {};

  if (raw) {
    try {
      parsed = JSON.parse(raw) as unknown;
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

  const items = normalizeItems(parsed);
  const rawHadEntries = Boolean(
    parsed && typeof parsed === "object" && Object.keys(parsed as Record<string, unknown>).length
  );

  if (rawHadEntries && !items.length) {
    return {
      checkedAt,
      status: "error",
      nodeVersion: process.version,
      packageManager,
      count: 0,
      majorCount: 0,
      message: "npm outdated veri biçimi tanınmadı; yanlış güncelleme bilgisi gösterilmedi.",
      items: []
    };
  }

  const invalidItems = items.filter((item) =>
    item.current === "—" && item.wanted === "—" && item.latest === "—"
  );

  if (invalidItems.length === items.length && items.length > 0) {
    return {
      checkedAt,
      status: "error",
      nodeVersion: process.version,
      packageManager,
      count: 0,
      majorCount: 0,
      message: "npm outdated sürüm alanları okunamadı; sonuç güvenilir olmadığı için liste gösterilmedi.",
      items: []
    };
  }

  const usableItems = items.filter((item) =>
    item.current !== "—" || item.wanted !== "—" || item.latest !== "—"
  );
  const majorCount = usableItems.filter((item) => item.majorUpdate).length;

  return {
    checkedAt,
    status: usableItems.length ? "updates" : "current",
    nodeVersion: process.version,
    packageManager,
    count: usableItems.length,
    majorCount,
    message: usableItems.length
      ? `${usableItems.length} kütüphane için daha yeni sürüm bulundu.`
      : "npm workspace kütüphaneleri güncel görünüyor.",
    items: usableItems
  };
}

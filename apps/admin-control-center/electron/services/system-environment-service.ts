import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import type {
  AndroidDeviceSnapshot,
  CredentialStatus,
  SystemCredentialSnapshot,
  SystemEnvironmentSnapshot,
  SystemToolSnapshot
} from "../../shared/contracts";

type Registry = {
  installations?: Record<string, {
    title?: string;
    credentialRef?: string;
    externalRepo?: {
      env?: string;
      defaultSibling?: string;
    };
  }>;
};

type Credentials = {
  credentials?: Record<string, Record<string, unknown>>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 6000,
    shell: false
  });

  return {
    ok: result.status === 0 && !result.error,
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim()
  };
}

function firstLine(value: string) {
  return value.split(/\r?\n/).find(Boolean)?.trim() ?? "";
}

function tool(id: string, label: string, command: string, args: string[]): SystemToolSnapshot {
  const result = run(command, args);
  return {
    id,
    label,
    available: result.ok,
    detail: result.ok
      ? firstLine(result.stdout || result.stderr) || "Hazır"
      : firstLine(result.stderr || result.stdout) || "Bulunamadı"
  };
}

function credentialStatus(record: Record<string, unknown> | undefined): CredentialStatus {
  if (!record) return "unconfigured";
  return Object.values(record).some((value) => String(value ?? "").trim())
    ? "configured"
    : "unconfigured";
}

function getCredentialSnapshots(repoRoot: string, registry: Registry): SystemCredentialSnapshot[] {
  const credentialPath = join(repoRoot, "config", "credentials.local.json");
  let local: Credentials = {};

  if (existsSync(credentialPath)) {
    try {
      local = readJson<Credentials>(credentialPath);
    } catch {
      local = {};
    }
  }

  const refs = new Map<string, string[]>();

  for (const [id, installation] of Object.entries(registry.installations ?? {})) {
    const ref = String(installation.credentialRef ?? "").trim();
    if (!ref) continue;
    const usedBy = refs.get(ref) ?? [];
    usedBy.push(String(installation.title ?? id));
    refs.set(ref, usedBy);
  }

  return [...refs.entries()].map(([ref, usedBy]) => ({
    ref,
    status: existsSync(credentialPath)
      ? credentialStatus(local.credentials?.[ref])
      : "unconfigured",
    usedBy
  }));
}

function resolveBlackSeaRoot(repoRoot: string, registry: Registry) {
  const external = registry.installations?.blacksea?.externalRepo;
  const envName = String(external?.env ?? "").trim();
  const envPath = envName ? process.env[envName]?.trim() : "";
  if (envPath) return resolve(envPath);

  const sibling = String(external?.defaultSibling ?? "").trim();
  return sibling ? resolve(repoRoot, "..", sibling) : null;
}

function getAndroidDevices(adbAvailable: boolean): AndroidDeviceSnapshot[] {
  if (!adbAvailable) return [];
  const result = run("adb", ["devices", "-l"]);
  if (!result.ok) return [];

  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const serial = parts.shift() ?? "";
      const state = parts.shift() ?? "";
      const fields = Object.fromEntries(
        parts
          .map((part) => part.split(":", 2))
          .filter((pair) => pair.length === 2)
      ) as Record<string, string>;
      return {
        serial,
        state,
        model: fields.model ?? "",
        device: fields.device ?? ""
      };
    });
}

export function getSystemEnvironment(repoRoot: string): SystemEnvironmentSnapshot {
  const registry = readJson<Registry>(join(repoRoot, "config", "installations.json"));
  const tools = [
    tool("git", "Git", "git", ["--version"]),
    tool("node", "Node", process.execPath, ["--version"]),
    tool("npm", "npm", process.platform === "win32" ? "npm.cmd" : "npm", ["--version"]),
    tool("php", "PHP", "php", ["--version"]),
    tool("ssh", "SSH", "ssh", ["-V"]),
    tool("rsync", "rsync", "rsync", ["--version"]),
    tool("adb", "ADB", "adb", ["version"])
  ];

  const blackSeaRoot = resolveBlackSeaRoot(repoRoot, registry);

  return {
    checkedAt: new Date().toISOString(),
    repoRoot,
    blackSeaRoot: blackSeaRoot && existsSync(blackSeaRoot) ? blackSeaRoot : blackSeaRoot,
    tools,
    credentials: getCredentialSnapshots(repoRoot, registry),
    androidDevices: getAndroidDevices(tools.find((item) => item.id === "adb")?.available === true)
  };
}

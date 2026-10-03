import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type {
  CredentialStatus,
  InstallationSnapshot,
  OverviewSnapshot,
  ProductSnapshot,
  RepoSnapshot,
  StatusKind
} from "../../shared/contracts";

type InstallationRecord = {
  id?: string;
  title?: string;
  kind?: string;
  siteUrl?: string;
  publicUrl?: string;
  webModuleUrl?: string;
  versionEndpoint?: string;
  credentialRef?: string;
};

type InstallationRegistry = {
  installations?: Record<string, InstallationRecord>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function runGit(repoRoot: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000
  });

  return {
    ok: result.status === 0,
    out: String(result.stdout ?? "").trim()
  };
}

function getRepoSnapshot(repoRoot: string): RepoSnapshot {
  const branch = runGit(repoRoot, ["branch", "--show-current"]);
  const head = runGit(repoRoot, ["rev-parse", "--short", "HEAD"]);
  const dirty = runGit(repoRoot, ["status", "--porcelain=v1"]);
  const upstream = runGit(repoRoot, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]);

  let ahead: number | null = null;
  let behind: number | null = null;

  if (upstream.ok && upstream.out) {
    const [behindRaw, aheadRaw] = upstream.out.split(/\s+/).map(Number);
    if (Number.isFinite(aheadRaw) && Number.isFinite(behindRaw)) {
      ahead = aheadRaw;
      behind = behindRaw;
    }
  }

  return {
    branch: branch.ok && branch.out ? branch.out : "(detached)",
    head: head.ok && head.out ? head.out : "?",
    dirtyCount: dirty.ok && dirty.out ? dirty.out.split("\n").filter(Boolean).length : 0,
    ahead,
    behind
  };
}

function getProductSnapshot(repoRoot: string): ProductSnapshot {
  const value = readJson<Partial<ProductSnapshot>>(join(repoRoot, "product-version.json"));

  return {
    version: String(value.version ?? "?"),
    androidVersionCode: Number(value.androidVersionCode ?? 0),
    webModuleVersion: String(value.webModuleVersion ?? "?")
  };
}

function getCredentialStatus(repoRoot: string, credentialRef: string | null): CredentialStatus {
  if (!credentialRef) return "unconfigured";

  const path = join(repoRoot, "config", "credentials.local.json");
  if (!existsSync(path)) return "unconfigured";

  try {
    const value = readJson<{ credentials?: Record<string, Record<string, unknown>> }>(path);
    const record = value.credentials?.[credentialRef];

    if (!record || typeof record !== "object") return "unconfigured";

    const hasValue = Object.values(record).some((item) => String(item ?? "").trim().length > 0);
    return hasValue ? "configured" : "unconfigured";
  } catch {
    return "unreadable";
  }
}

async function getLiveWebVersion(
  endpoint: string | null,
  expectedVersion: string | null
): Promise<{ version: string | null; status: StatusKind; note: string }> {
  if (!endpoint) {
    return {
      version: null,
      status: "unknown",
      note: "Bu kurulum için sürüm endpoint'i tanımlı değil."
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        version: null,
        status: "error",
        note: `Sürüm endpoint'i HTTP ${response.status} döndürdü.`
      };
    }

    const payload = await response.json() as {
      ok?: boolean;
      web_module_version?: string;
      product_version?: string;
    };

    const version = String(payload.web_module_version ?? "").trim() || null;

    if (!version) {
      return {
        version: null,
        status: "error",
        note: "Canlı sürüm yanıtı geçerli değil."
      };
    }

    if (expectedVersion && version !== expectedVersion) {
      return {
        version,
        status: "warning",
        note: `Canlı web ${version}; beklenen ${expectedVersion}.`
      };
    }

    return {
      version,
      status: "ready",
      note: "Canlı web sürümü beklenen sürümle uyumlu."
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return {
      version: null,
      status: "error",
      note: `Canlı sürüm okunamadı: ${reason}`
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getInstallations(
  repoRoot: string,
  product: ProductSnapshot
): Promise<InstallationSnapshot[]> {
  const registry = readJson<InstallationRegistry>(join(repoRoot, "config", "installations.json"));
  const entries = Object.entries(registry.installations ?? {});

  return Promise.all(entries.map(async ([key, record]) => {
    const credentialRef = record.credentialRef?.trim() || null;
    const endpoint = record.versionEndpoint?.trim() || null;
    const expectedWebVersion = endpoint ? product.webModuleVersion : null;
    const live = await getLiveWebVersion(endpoint, expectedWebVersion);

    return {
      id: record.id?.trim() || key,
      title: record.title?.trim() || key,
      kind: record.kind?.trim() || "unknown",
      siteUrl: record.siteUrl?.trim() || record.publicUrl?.trim() || null,
      webModuleUrl: record.webModuleUrl?.trim() || null,
      versionEndpoint: endpoint,
      credentialRef,
      credentialStatus: getCredentialStatus(repoRoot, credentialRef),
      expectedWebVersion,
      liveWebVersion: live.version,
      status: live.status,
      statusNote: live.note
    };
  }));
}

export async function getOverviewSnapshot(repoRoot: string): Promise<OverviewSnapshot> {
  const product = getProductSnapshot(repoRoot);
  const installations = await getInstallations(repoRoot, product);

  return {
    generatedAt: new Date().toISOString(),
    repo: getRepoSnapshot(repoRoot),
    product,
    installations,
    counts: {
      installations: installations.length,
      healthy: installations.filter((item) => item.status === "ready").length,
      drift: installations.filter((item) => item.status === "warning").length,
      errors: installations.filter((item) => item.status === "error").length
    }
  };
}

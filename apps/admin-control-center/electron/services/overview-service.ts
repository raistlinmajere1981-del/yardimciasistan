import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type {
  CredentialStatus,
  HealthCheckSnapshot,
  InstallationSnapshot,
  OverviewSnapshot,
  ProductSnapshot,
  RepoSnapshot,
  StatusKind
} from "../../shared/contracts";

type DeployRecord = {
  type?: string;
  host?: string;
  remoteRoot?: string;
  storageRoot?: string;
};

type InstallationRecord = {
  id?: string;
  title?: string;
  kind?: string;
  siteUrl?: string;
  publicUrl?: string;
  webModuleUrl?: string;
  versionEndpoint?: string;
  credentialRef?: string;
  deploy?: DeployRecord;
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

async function probeUrl(url: string | null): Promise<HealthCheckSnapshot> {
  if (!url) {
    return {
      id: "site",
      label: "Site erişimi",
      status: "unconfigured",
      detail: "Site adresi tanımlı değil.",
      durationMs: null
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal
    });

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        id: "site",
        label: "Site erişimi",
        status: "error",
        detail: `HTTP ${response.status}`,
        durationMs
      };
    }

    return {
      id: "site",
      label: "Site erişimi",
      status: "ready",
      detail: `HTTP ${response.status}`,
      durationMs
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      id: "site",
      label: "Site erişimi",
      status: "error",
      detail: `Erişilemedi: ${reason}`,
      durationMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getLiveWebVersion(
  endpoint: string | null,
  expectedVersion: string | null
): Promise<{
  version: string | null;
  check: HealthCheckSnapshot;
}> {
  if (!endpoint) {
    return {
      version: null,
      check: {
        id: "version",
        label: "Canlı web sürümü",
        status: "unconfigured",
        detail: "Bu kurulum tipi için sürüm endpoint'i tanımlı değil.",
        durationMs: null
      }
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        version: null,
        check: {
          id: "version",
          label: "Canlı web sürümü",
          status: "error",
          detail: `HTTP ${response.status}`,
          durationMs
        }
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
        check: {
          id: "version",
          label: "Canlı web sürümü",
          status: "error",
          detail: "Sürüm yanıtı geçerli değil.",
          durationMs
        }
      };
    }

    if (expectedVersion && version !== expectedVersion) {
      return {
        version,
        check: {
          id: "version",
          label: "Canlı web sürümü",
          status: "warning",
          detail: `Canlı ${version} · beklenen ${expectedVersion}`,
          durationMs
        }
      };
    }

    return {
      version,
      check: {
        id: "version",
        label: "Canlı web sürümü",
        status: "ready",
        detail: expectedVersion ? `v${version} · beklenen sürümle uyumlu` : `v${version}`,
        durationMs
      }
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return {
      version: null,
      check: {
        id: "version",
        label: "Canlı web sürümü",
        status: "error",
        detail: `Okunamadı: ${reason}`,
        durationMs: Date.now() - startedAt
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

function credentialCheck(status: CredentialStatus, credentialRef: string | null): HealthCheckSnapshot {
  if (!credentialRef) {
    return {
      id: "credential",
      label: "Credential kaydı",
      status: "unconfigured",
      detail: "Credential referansı yok.",
      durationMs: null
    };
  }

  if (status === "configured") {
    return {
      id: "credential",
      label: "Credential kaydı",
      status: "ready",
      detail: `${credentialRef} · lokal kayıt mevcut`,
      durationMs: null
    };
  }

  if (status === "unreadable") {
    return {
      id: "credential",
      label: "Credential kaydı",
      status: "error",
      detail: `${credentialRef} · lokal kayıt okunamadı`,
      durationMs: null
    };
  }

  return {
    id: "credential",
    label: "Credential kaydı",
    status: "unconfigured",
    detail: `${credentialRef} · lokal kayıt yok`,
    durationMs: null
  };
}

function deriveInstallationStatus(
  siteCheck: HealthCheckSnapshot,
  versionCheck: HealthCheckSnapshot
): { status: StatusKind; note: string } {
  const operational = [siteCheck, versionCheck].filter((check) => check.status !== "unconfigured");

  const error = operational.find((check) => check.status === "error");
  if (error) return { status: "error", note: `${error.label}: ${error.detail}` };

  const warning = operational.find((check) => check.status === "warning");
  if (warning) return { status: "warning", note: `${warning.label}: ${warning.detail}` };

  if (operational.some((check) => check.status === "ready")) {
    return { status: "ready", note: "Temel canlı kontroller sağlıklı." };
  }

  return {
    status: "unconfigured",
    note: "Bu kurulum için henüz canlı health kontrolü yapılandırılmamış."
  };
}

async function getInstallations(
  repoRoot: string,
  product: ProductSnapshot
): Promise<InstallationSnapshot[]> {
  const registry = readJson<InstallationRegistry>(join(repoRoot, "config", "installations.json"));
  const entries = Object.entries(registry.installations ?? {});

  return Promise.all(entries.map(async ([key, record]) => {
    const credentialRef = record.credentialRef?.trim() || null;
    const credentialStatus = getCredentialStatus(repoRoot, credentialRef);
    const endpoint = record.versionEndpoint?.trim() || null;
    const siteUrl = record.siteUrl?.trim() || record.publicUrl?.trim() || null;
    const expectedWebVersion = endpoint ? product.webModuleVersion : null;

    const [siteCheck, live] = await Promise.all([
      probeUrl(siteUrl),
      getLiveWebVersion(endpoint, expectedWebVersion)
    ]);

    const state = deriveInstallationStatus(siteCheck, live.check);

    return {
      id: record.id?.trim() || key,
      title: record.title?.trim() || key,
      kind: record.kind?.trim() || "unknown",
      siteUrl,
      webModuleUrl: record.webModuleUrl?.trim() || null,
      versionEndpoint: endpoint,
      credentialRef,
      credentialStatus,
      expectedWebVersion,
      liveWebVersion: live.version,
      deployType: record.deploy?.type?.trim() || null,
      deployHost: record.deploy?.host?.trim() || null,
      deployTarget: record.deploy?.remoteRoot?.trim() || record.deploy?.storageRoot?.trim() || null,
      status: state.status,
      statusNote: state.note,
      healthChecks: [
        siteCheck,
        live.check,
        credentialCheck(credentialStatus, credentialRef)
      ]
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

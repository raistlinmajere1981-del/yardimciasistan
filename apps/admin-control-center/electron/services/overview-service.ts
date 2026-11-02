import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type {
  CredentialStatus,
  HealthCheckSnapshot,
  InstallationSnapshot,
  OverviewSnapshot,
  ProductSnapshot,
  ReleaseChannelSnapshot,
  RepoSnapshot,
  StatusKind,
  VerificationReportSnapshot,
  VerificationResultSnapshot,
  VerificationSnapshot
} from "../../shared/contracts";

type DeployRecord = {
  type?: string;
  host?: string;
  remoteRoot?: string;
  storageRoot?: string;
};

type ReleaseRecord = {
  desktopManifests?: Record<string, string>;
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
  release?: ReleaseRecord;
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
    if (behindRaw !== undefined && aheadRaw !== undefined && Number.isFinite(aheadRaw) && Number.isFinite(behindRaw)) {
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

// A cold Electron startup can race DNS/TLS initialization, especially for
// externally hosted sites. Retry transport failures once; HTTP responses and
// malformed payloads remain real errors and are never silently treated as OK.
async function fetchHealthEndpoint(url: string, accept: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      return await fetch(url, {
        method: "GET",
        headers: { Accept: accept },
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal
      });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

export async function probeUrl(url: string | null): Promise<HealthCheckSnapshot> {
  if (!url) {
    return {
      id: "site",
      label: "Site erişimi",
      status: "unconfigured",
      detail: "Site adresi tanımlı değil.",
      durationMs: null
    };
  }

  const startedAt = Date.now();

  try {
    const response = await fetchHealthEndpoint(url, "text/html,application/json;q=0.9,*/*;q=0.8");

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
  }
}

export async function getLiveWebVersion(
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
        status: "unknown",
        detail: "Bu kurulum için sürüm endpoint'i tanımlı değil; kontrol uygulanmıyor.",
        durationMs: null
      }
    };
  }

  const startedAt = Date.now();

  try {
    const response = await fetchHealthEndpoint(endpoint, "application/json");

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
  }
}

function credentialCheck(status: CredentialStatus, credentialRef: string | null): HealthCheckSnapshot {
  if (!credentialRef) {
    return {
      id: "credential",
      label: "Yerel credential kaydı",
      status: "unconfigured",
      detail: "Credential referansı yok.",
      durationMs: null
    };
  }

  if (status === "configured") {
    return {
      id: "credential",
      label: "Yerel credential kaydı",
      status: "ready",
      detail: `${credentialRef} · lokal kayıt mevcut`,
      durationMs: null
    };
  }

  if (status === "unreadable") {
    return {
      id: "credential",
      label: "Yerel credential kaydı",
      status: "error",
      detail: `${credentialRef} · lokal kayıt okunamadı`,
      durationMs: null
    };
  }

  return {
    id: "credential",
    label: "Yerel credential kaydı",
    status: "unconfigured",
    detail: `${credentialRef} · lokal kayıt yok`,
    durationMs: null
  };
}

function deriveInstallationStatus(
  siteCheck: HealthCheckSnapshot,
  versionCheck: HealthCheckSnapshot
): { status: StatusKind; note: string } {
  if (siteCheck.status === "error") {
    return { status: "error", note: `${siteCheck.label}: ${siteCheck.detail}` };
  }

  if (versionCheck.status === "error") {
    return {
      status: siteCheck.status === "ready" ? "warning" : "error",
      note: `${versionCheck.label}: ${versionCheck.detail}`
    };
  }

  if (versionCheck.status === "warning") {
    return { status: "warning", note: `${versionCheck.label}: ${versionCheck.detail}` };
  }

  if (siteCheck.status === "ready" || versionCheck.status === "ready") {
    return { status: "ready", note: "Temel canlı kontroller sağlıklı." };
  }

  return {
    status: "unconfigured",
    note: "Bu kurulum için henüz canlı health kontrolü yapılandırılmamış."
  };
}

async function getInstallations(
  repoRoot: string,
  product: ProductSnapshot,
  registry: InstallationRegistry
): Promise<InstallationSnapshot[]> {
  const entries = Object.entries(registry.installations ?? {});
  const siteChecks = new Map<string, Promise<HealthCheckSnapshot>>();

  function getSharedSiteCheck(url: string | null) {
    if (!url) return probeUrl(null);

    let check = siteChecks.get(url);
    if (!check) {
      check = probeUrl(url);
      siteChecks.set(url, check);
    }
    return check;
  }

  return Promise.all(entries.map(async ([key, record]) => {
    const credentialRef = record.credentialRef?.trim() || null;
    const credentialStatus = getCredentialStatus(repoRoot, credentialRef);
    const endpoint = record.versionEndpoint?.trim() || null;
    const siteUrl = record.siteUrl?.trim() || record.publicUrl?.trim() || null;
    const expectedWebVersion = endpoint ? product.webModuleVersion : null;

    const [siteCheck, live] = await Promise.all([
      getSharedSiteCheck(siteUrl),
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
        ...(record.deploy?.type === "ssh-rsync" && credentialStatus !== "unreadable"
          ? []
          : [credentialCheck(credentialStatus, credentialRef)])
      ]
    };
  }));
}

function releaseLabel(id: string) {
  if (id === "winX64") return "Windows x64";
  if (id === "winX86") return "Windows x86";
  return id;
}

async function getReleaseChannel(
  id: string,
  manifestUrl: string,
  expectedVersion: string
): Promise<ReleaseChannelSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  const startedAt = Date.now();

  try {
    const response = await fetch(manifestUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        id,
        label: releaseLabel(id),
        manifestUrl,
        liveVersion: null,
        status: "error",
        detail: `Manifest HTTP ${response.status}`,
        durationMs
      };
    }

    const payload = await response.json() as { appVersion?: string };
    const liveVersion = String(payload.appVersion ?? "").trim() || null;

    if (!liveVersion) {
      return {
        id,
        label: releaseLabel(id),
        manifestUrl,
        liveVersion: null,
        status: "error",
        detail: "Manifest içinde appVersion bulunamadı.",
        durationMs
      };
    }

    if (liveVersion !== expectedVersion) {
      return {
        id,
        label: releaseLabel(id),
        manifestUrl,
        liveVersion,
        status: "warning",
        detail: `Yayında ${liveVersion} · kaynak ${expectedVersion}`,
        durationMs
      };
    }

    return {
      id,
      label: releaseLabel(id),
      manifestUrl,
      liveVersion,
      status: "ready",
      detail: `v${liveVersion} yayında`,
      durationMs
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      id,
      label: releaseLabel(id),
      manifestUrl,
      liveVersion: null,
      status: "error",
      detail: `Manifest okunamadı: ${reason}`,
      durationMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getDesktopRelease(
  registry: InstallationRegistry,
  expectedVersion: string
): Promise<ReleaseChannelSnapshot[]> {
  const landing = registry.installations?.landing;
  const manifests = landing?.release?.desktopManifests ?? {};
  const entries = Object.entries(manifests)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0);

  return Promise.all(entries.map(([id, url]) => getReleaseChannel(id, url.trim(), expectedVersion)));
}

type VerificationRegistryAdapter = {
  presets?: string[];
  domains?: string[];
  plans?: Record<string, string[]>;
  checks?: Array<{
    id?: string;
    label?: string;
    phase?: number;
    presets?: string[];
    domains?: string[];
    requires?: string[];
    manual?: boolean;
    platforms?: string[] | null;
  }>;
};

type VerificationReportFile = {
  started_at?: string;
  finished_at?: string;
  result?: string;
  selection?: {
    preset?: string | null;
    domain?: string | null;
    check_id?: string | null;
    include_manual?: boolean;
  };
  checks?: Array<{
    id?: string;
    label?: string;
    status?: string;
    duration_ms?: number;
    exit_code?: number | null;
    reason?: string;
  }>;
};

function verificationSelectionLabel(report: VerificationReportFile) {
  if (report.selection?.preset) return `preset=${report.selection.preset}`;
  if (report.selection?.domain) return `domain=${report.selection.domain}`;
  if (report.selection?.check_id) return `check=${report.selection.check_id}`;
  return "Bilinmiyor";
}

function emptyVerificationReport(): VerificationReportSnapshot {
  return {
    available: false,
    startedAt: null,
    finishedAt: null,
    result: "unknown",
    selectionLabel: "Henüz rapor yok",
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    ageMs: null,
    checks: []
  };
}

function getVerificationSnapshot(repoRoot: string): VerificationSnapshot {
  const adapterPath = join(repoRoot, "apps", "admin-control-center", "scripts", "read-verification-registry.mjs");
  const out = spawnSync(process.execPath, [adapterPath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000,
    shell: false
  });

  let adapter: VerificationRegistryAdapter = {};
  if (out.status === 0 && String(out.stdout ?? "").trim()) {
    try {
      adapter = JSON.parse(String(out.stdout)) as VerificationRegistryAdapter;
    } catch {
      adapter = {};
    }
  }

  let latest = emptyVerificationReport();
  const latestPath = join(repoRoot, "artifacts", "verify", "latest.json");

  if (existsSync(latestPath)) {
    try {
      const report = readJson<VerificationReportFile>(latestPath);
      const checks = Array.isArray(report.checks) ? report.checks : [];
      const normalizedChecks: VerificationResultSnapshot[] = checks.map((item) => ({
        id: String(item.id ?? ""),
        label: String(item.label ?? item.id ?? "Kontrol"),
        status: item.status === "passed" || item.status === "failed" || item.status === "skipped"
          ? item.status
          : "skipped",
        durationMs: Number(item.duration_ms ?? 0),
        exitCode: typeof item.exit_code === "number" ? item.exit_code : null,
        reason: String(item.reason ?? "")
      }));

      const startedAt = typeof report.started_at === "string" ? report.started_at : null;
      const startedTimestamp = startedAt ? Date.parse(startedAt) : NaN;

      latest = {
        available: true,
        startedAt,
        finishedAt: typeof report.finished_at === "string" && report.finished_at ? report.finished_at : null,
        result: report.result === "passed" || report.result === "failed" || report.result === "running"
          ? report.result
          : "unknown",
        selectionLabel: verificationSelectionLabel(report),
        passed: normalizedChecks.filter((item) => item.status === "passed").length,
        failed: normalizedChecks.filter((item) => item.status === "failed").length,
        skipped: normalizedChecks.filter((item) => item.status === "skipped").length,
        total: normalizedChecks.length,
        ageMs: Number.isFinite(startedTimestamp) ? Math.max(0, Date.now() - startedTimestamp) : null,
        checks: normalizedChecks
      };
    } catch {
      latest = emptyVerificationReport();
    }
  }

  const plans = adapter.plans ?? {};

  return {
    presets: Array.isArray(adapter.presets) ? adapter.presets : [],
    domains: Array.isArray(adapter.domains) ? adapter.domains : [],
    planCounts: Object.fromEntries(
      Object.entries(plans).map(([preset, checks]) => [preset, Array.isArray(checks) ? checks.length : 0])
    ),
    plans: Object.fromEntries(
      Object.entries(plans).map(([preset, checks]) => [
        preset,
        Array.isArray(checks) ? checks.map(String) : []
      ])
    ),
    checks: (Array.isArray(adapter.checks) ? adapter.checks : []).map((item) => ({
      id: String(item.id ?? ""),
      label: String(item.label ?? item.id ?? "Kontrol"),
      phase: Number(item.phase ?? 0),
      presets: Array.isArray(item.presets) ? item.presets.map(String) : [],
      domains: Array.isArray(item.domains) ? item.domains.map(String) : [],
      requires: Array.isArray(item.requires) ? item.requires.map(String) : [],
      manual: item.manual === true,
      platforms: Array.isArray(item.platforms) ? item.platforms.map(String) : null
    })),
    latest
  };
}

export async function getOverviewSnapshot(repoRoot: string): Promise<OverviewSnapshot> {
  const product = getProductSnapshot(repoRoot);
  const registry = readJson<InstallationRegistry>(join(repoRoot, "config", "installations.json"));

  const [installations, desktopRelease] = await Promise.all([
    getInstallations(repoRoot, product, registry),
    getDesktopRelease(registry, product.version)
  ]);
  const verification = getVerificationSnapshot(repoRoot);

  return {
    generatedAt: new Date().toISOString(),
    repo: getRepoSnapshot(repoRoot),
    product,
    installations,
    release: {
      expectedVersion: product.version,
      desktop: desktopRelease
    },
    verification,
    counts: {
      installations: installations.length,
      healthy: installations.filter((item) => item.status === "ready").length,
      drift: installations.filter((item) => item.status === "warning").length,
      errors: installations.filter((item) => item.status === "error").length
    }
  };
}
